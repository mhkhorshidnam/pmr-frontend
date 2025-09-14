// SCRIPT_VERSION v19 — robust JSON parsing + professional_interview rendering

// ---------- Config ----------
const API_URL = "https://pmrecruitment.darkube.app/webhook/recruit/analyze-text";

// ---------- Helpers ----------
function setProgress(percent) {
  const wrap = document.getElementById("upload-progress-container");
  const fill = document.getElementById("upload-progress-fill");
  const text = document.getElementById("upload-progress-text");
  if (!wrap || !fill || !text) return;
  wrap.classList.remove("hidden");
  fill.style.width = percent + "%";
  text.textContent = percent + "%";
}

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => (
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[s]
  ));
}

// Markdown -> HTML + force bold for metric names
function boldifyMetrics(text){
  if (!text) return "";
  let out = String(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
  const map = {
    "تجربه":"تجربه",
    "دستاوردها":"دستاوردها",
    "تحصیلات":"تحصیلات",
    "مهارت‌ها":"مهارت‌ها",
    "حوزه/صنعت":"حوزه/صنعت",
    "مدیریت تیم":"مدیریت تیم",
    "experience":"تجربه",
    "achievements":"دستاوردها",
    "education":"تحصیلات",
    "skills":"مهارت‌ها",
    "industry_experience":"حوزه/صنعت",
    "team_management":"مدیریت تیم",
  };
  for (const [k, fa] of Object.entries(map)) {
    const re = new RegExp(`\\b${k}\\b`,"gi");
    out = out.replace(re, `<strong>${fa}</strong>`);
  }
  return out;
}

function tryParseJson(x){
  if (x && typeof x === "object") return x;
  if (typeof x === "string") {
    let s = x.trim();
    s = s.replace(/^```json/i,"").replace(/^```/,"").replace(/```$/,"")
         .replace(/^"""json/i,"").replace(/^"""/,"").replace(/"""$/,"");
    try { return JSON.parse(s); } catch { /* ignore */ }
  }
  return null;
}

function toNumberLike(v){
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : null; }
  if (typeof v === "object") {
    const cand = v.score ?? v.value ?? v.point ?? v.points ?? v.val;
    if (cand != null) return toNumberLike(cand);
  }
  return null;
}
const pick = (obj, keys) => keys.find(k => obj && Object.prototype.hasOwnProperty.call(obj,k));
const toStringArray = arr => Array.isArray(arr) ? arr.map(x=>String(x)).filter(Boolean) : [];

// ---------- Metric labels ----------
const METRIC_LABELS = {
  experience: "تجربه",
  achievements: "دستاوردها",
  education: "تحصیلات",
  skills: "مهارت‌ها",
  industry_experience: "حوزه/صنعت",
  team_management: "مدیریت تیم",
};

// ---------- Normalizers ----------
function normalizeResume(raw){
  if (raw?.message?.content && typeof raw.message.content === "string") {
    const parsed = tryParseJson(raw.message.content);
    if (parsed) raw = parsed;
  }
  const data = tryParseJson(raw) || (raw ?? {});

  const out = {};
  out.recommended_role = data.recommended_role ?? data.role ?? data.suggested_role;
  out.total_score = toNumberLike(data.total_score ?? data.overall_score ?? data.score);

  const suitKey = pick(data,["suitability","role_suitability","fit"]);
  const suit = suitKey ? (data[suitKey] ?? {}) : {};
  out.suitability = {
    APM: suit.APM ?? suit.apm ?? suit["APM_fit"],
    PM:  suit.PM  ?? suit.pm  ?? suit["PM_fit"],
    SPM: suit.SPM ?? suit.spm ?? suit["SPM_fit"],
  };

  let criteriaScores = data.criteria_scores;
  if (!criteriaScores && Array.isArray(data.criteria)) {
    criteriaScores = {};
    for (const c of data.criteria) {
      if (!c?.id) continue;
      criteriaScores[c.id] = toNumberLike(c.score);
    }
  }
  const getScore = (id) => {
    if (criteriaScores && criteriaScores[id] != null) return toNumberLike(criteriaScores[id]);
    if (data && data[id] != null) return toNumberLike(data[id]);
    return null;
  };
  out.criteria_scores = {
    experience:          getScore("experience"),
    achievements:        getScore("achievements"),
    education:           getScore("education"),
    skills:              getScore("skills"),
    industry_experience: getScore("industry_experience"),
    team_management:     getScore("team_management"),
  };

  const redKey   = pick(data,["red_flags","redflags","concerns","risks"]);
  const bonusKey = pick(data,["bonus_points","bonus","pluses","advantages"]);
  out.red_flags    = toStringArray(data[redKey]);
  out.bonus_points = toStringArray(data[bonusKey]);

  out.strengths_text  = data.strengths_text ?? data.strengthsText ?? null;
  out.weaknesses_text = data.weaknesses_text ?? data.weaknessesText ?? null;

  return out;
}

function normalizeScenario(raw){
  if (raw?.message?.content && typeof raw.message.content === "string") {
    const parsed = tryParseJson(raw.message.content);
    if (parsed) raw = parsed;
  }
  const data = tryParseJson(raw) || (raw ?? {});

  const simple = {
    selected_problem: data.selected_problem ?? data.problem ?? "",
    competencies_needing_deeper_evaluation: toStringArray(
      data.competencies_needing_deeper_evaluation ?? data.competencies ?? []),
    questions: toStringArray(data.questions ?? [])
  };

  let prof = null;
  if (data.professional_interview) {
    const p = data.professional_interview;
    prof = {
      challenge: p.challenge || "",
      target_competencies: toStringArray(p.target_competencies || []),
      guidance: {
        positive_signals: toStringArray(p.guidance?.positive_signals || []),
        negative_signals: toStringArray(p.guidance?.negative_signals || []),
      },
      deep_dive_questions: toStringArray(p.deep_dive_questions || []),
    };
  }
  return { simple, professional: prof };
}

// ---------- Enrichment ----------
function buildStrengthsParagraphs(scores){
  const arr = Object.entries(scores).filter(([,v]) => typeof v === "number").sort((a,b)=> b[1]-a[1]);
  const strong = arr.filter(([,v]) => v >= 4).slice(0,3);
  const ok     = arr.filter(([,v]) => v === 3).slice(0,2);
  if (!strong.length && !ok.length) return "";
  const parts = [];
  if (strong.length){
    const labels = strong.map(([k])=>`<strong>${METRIC_LABELS[k]||k}</strong>`).join("، ");
    parts.push(`در شاخص‌های ${labels} شواهد محکمی از توانمندی دیده می‌شود که نشان‌دهنده تجربه عملی و کاربرد مهارت‌هاست.`);
  }
  if (ok.length){
    const labels = ok.map(([k])=>`<strong>${METRIC_LABELS[k]||k}</strong>`).join(" و ");
    parts.push(`همچنین در ${labels} عملکرد قابل قبولی ثبت شده و با نمونه‌های سنجش‌پذیر می‌تواند به نقطه قوت برجسته تبدیل شود.`);
  }
  return parts.join(" ");
}
function buildWeaknessesParagraphs(scores){
  const arr = Object.entries(scores).filter(([,v]) => typeof v === "number").sort((a,b)=> a[1]-b[1]);
  const weak = arr.filter(([,v]) => v <= 2).slice(0,3);
  if (!weak.length) return "";
  const labels = weak.map(([k])=>`<strong>${METRIC_LABELS[k]||k}</strong>`).join("، ");
  const notes  = weak.map(([,v])=>{
    if (v===0) return "شواهد کافی ذکر نشده است";
    if (v===1) return "نیازمند تقویت فوری است";
    return "بهبود هدفمند توصیه می‌شود";
  });
  return `در شاخص‌های ${labels} شواهد کافی یا کیفیت لازم کمتر مشاهده شد؛ ${notes.join("، ")}. تمرکز بر ارائه نمونه‌های مشخص و قابل سنجش می‌تواند ارزیابی را بهبود دهد.`;
}
function sentencesFromBonus(bonusArr){
  if (!bonusArr?.length) {
    return "در حال حاضر نکات مثبت ویژه‌ای در رزومه دیده نشد؛ افزودن دستاوردهای کمی و نمونه‌های سنجش‌پذیر می‌تواند تصویر دقیق‌تری از ارزش افزوده ارائه کند.";
  }
  return bonusArr.map(x => `• ${escapeHtml(x)}.`).join(" ");
}

// ---------- Role chips ----------
function renderRoleChips(suitability, recommended) {
  const roles = ["APM","PM","SPM"];
  const color = r => r===recommended ? "#0ea5e9" : "#e5e7eb";
  const text  = r => r===recommended ? "#fff"   : "#111827";
  return `
    <div style="display:flex; gap:8px; flex-wrap:wrap; direction:rtl;">
      ${roles.map(r=>`
        <span style="
          background:${color(r)}; color:${text(r)};
          padding:6px 10px; border-radius:999px; font-size:12px;
          box-shadow:0 2px 8px rgba(0,0,0,.08); border:1px solid rgba(0,0,0,.05);">
          ${r===recommended ? "نقش پیشنهادی: " : ""}${r}
        </span>
      `).join("")}
    </div>
  `;
}

// ---------- Renderers ----------
function renderResumeAnalysis(res){
  const json = normalizeResume(res);
  const scores = json.criteria_scores || {};
  const suit = json.suitability || {};
  const red = json.red_flags || [];
  const bonus = json.bonus_points || [];

  let strengthsTxt = (json.strengths_text || "").trim();
  if (strengthsTxt.length < 120) strengthsTxt = strengthsTxt ? strengthsTxt + "\n\n" + buildStrengthsParagraphs(scores) : buildStrengthsParagraphs(scores);
  let weaknessesTxt = (json.weaknesses_text || "").trim();
  if (weaknessesTxt.length < 120) weaknessesTxt = weaknessesTxt ? weaknessesTxt + "\n\n" + buildWeaknessesParagraphs(scores) : buildWeaknessesParagraphs(scores);

  const strengthsHtml = strengthsTxt ? `<div class="para-block">${boldifyMetrics(escapeHtml(strengthsTxt)).replace(/\n{2,}/g,"</p><p class='para-block'>").replace(/\n/g,"<br>")}</div>` : "—";
  const weaknessesHtml = weaknessesTxt ? `<div class="para-block">${boldifyMetrics(escapeHtml(weaknessesTxt)).replace(/\n{2,}/g,"</p><p class='para-block'>").replace(/\n/g,"<br>")}</div>` : "—";

  const bonusText = sentencesFromBonus(bonus);

  const tableStyles = `display:flex; justify-content:center; margin:10px 0 16px;`;
  const prettyTable = `
    <table style="
      direction:rtl; border-collapse:separate; border-spacing:0; text-align:center;
      min-width:520px; max-width:640px; width:92%;
      border-radius:12px; overflow:hidden; box-shadow:0 4px 14px rgba(0,0,0,.08);
      font-size:14px;
    ">
      <thead>
        <tr style="background:#f3f6fb; color:#1f2a44;">
          <th style="padding:10px 12px; border-bottom:1px solid #e8eef6;">معیار</th>
          <th style="padding:10px 12px; border-bottom:1px solid #e8eef6;">امتیاز (0–5)</th>
        </tr>
      </thead>
      <tbody>
        ${[
          ["experience","تجربه"],
          ["achievements","دستاوردها"],
          ["education","تحصیلات"],
          ["skills","مهارت‌ها"],
          ["industry_experience","حوزه/صنعت"],
          ["team_management","مدیریت تیم"],
        ].map(([k,fa],i)=>`
          <tr style="background:${i%2? "#fafcff":"#ffffff"}">
            <td style="padding:9px 12px; border-bottom:1px solid #eef3fa;">${fa}</td>
            <td style="padding:9px 12px; border-bottom:1px solid #eef3fa; font-variant-numeric:tabular-nums;">
              ${scores[k] ?? "-"}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  const chips = renderRoleChips(suit, (json.recommended_role || "").toUpperCase());

  return `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 8px 0; direction:rtl;">
      <div><b>امتیاز کل:</b> ${json.total_score ?? "-"}</div>
      ${chips}
    </div>

    <div style="${tableStyles}">
      ${prettyTable}
    </div>

    <h4 style="margin:12px 0 6px; direction:rtl; text-align:right">نقاط قوت (توصیفی)</h4>
    <div style="direction:rtl; text-align:right">${strengthsHtml}</div>

    <h4 style="margin:12px 0 6px; direction:rtl; text-align:right">نقاط قابل‌بهبود (توصیفی)</h4>
    <div style="direction:rtl; text-align:right">${weaknessesHtml}</div>

    <p style="margin-top:10px; direction:rtl; text-align:right"><b>موضوعات منفی قابل توجه:</b> ${red.length ? red.map(escapeHtml).map(s=>`• ${s}.`).join(" ") : "نکات منفی قابل توجهی دیده نشد."}</p>
    <p style="direction:rtl; text-align:right"><b>نکات مثبت:</b> ${bonusText}</p>
  `;
}

function renderProfessionalInterview(block){
  if (!block) return "";
  const challenge = block.challenge ? `<p style="direction:rtl; text-align:right">${boldifyMetrics(escapeHtml(block.challenge))}</p>` : "";
  const comps = (block.target_competencies || []).map(escapeHtml).join("، ");
  const pos = (block.guidance?.positive_signals || []).map(s=>`<li>${escapeHtml(s)}</li>`).join("");
  const neg = (block.guidance?.negative_signals || []).map(s=>`<li>${escapeHtml(s)}</li>`).join("");
  const deep = (block.deep_dive_questions || []).map(q=>`<li>${escapeHtml(q)}</li>`).join("");

  return `
    <div style="direction:rtl; text-align:right; border:1px solid #eef3fa; border-radius:12px; padding:12px; box-shadow:0 4px 14px rgba(0,0,0,.05); margin-top:12px;">
      <h4 style="margin:0 0 8px 0;">چالش تخصصی</h4>
      ${challenge}
      ${comps ? `<p style="margin:10px 0 6px 0;"><b>شاخص‌های هدف:</b> ${comps}</p>` : ""}

      <div style="display:flex; gap:24px; flex-wrap:wrap; margin-top:6px;">
        <div style="min-width:260px; flex:1;">
          <b>سیگنال‌های مثبت:</b>
          ${pos ? `<ul style="margin:6px 0 0 0; padding-inline-start:20px;">${pos}</ul>` : "<p style='margin:6px 0 0 0'>—</p>"}
        </div>
        <div style="min-width:260px; flex:1;">
          <b>سیگنال‌های منفی:</b>
          ${neg ? `<ul style="margin:6px 0 0 0; padding-inline-start:20px;">${neg}</ul>` : "<p style='margin:6px 0 0 0'>—</p>"}
        </div>
      </div>

      <div style="margin-top:10px;">
        <b>سؤالات عمیق‌تر:</b>
        ${deep ? `<ol style="margin:6px 0 0 0; padding-inline-start:20px;">${deep}</ol>` : "<p style='margin:6px 0 0 0'>—</p>"}
      </div>
    </div>
  `;
}

function renderInterviewScenario(scn){
  const { simple, professional } = normalizeScenario(scn);
  if (professional) return renderProfessionalInterview(professional);

  const probs = simple.selected_problem
    ? `<p style="direction:rtl; text-align:right"><b>مسئله انتخاب‌شده:</b> ${escapeHtml(simple.selected_problem)}</p>`
    : "";
  const comps = simple.competencies_needing_deeper_evaluation || [];
  const questions = simple.questions || [];

  return `
    ${probs}
    ${comps.length ? `<p style="direction:rtl; text-align:right"><b>شایستگی‌های نیازمند بررسی عمیق:</b> ${comps.map(escapeHtml).join("، ")}</p>` : ""}
    ${questions.length ? `<div style="direction:rtl; text-align:right">
      <b>سؤالات پیشنهادی:</b>
      <ol>${questions.map(q=>`<li>${escapeHtml(q)}</li>`).join("")}</ol>
    </div>` : ""}
  `;
}

// ---------- PDF -> Text ----------
async function extractTextFromPdf(file) {
  if (!file) return "";
  const arrayBuffer = await file.arrayBuffer();
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  }
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => item.str).join(" ") + "\n";
  }
  return fullText.trim();
}

// ---------- Form Submit ----------
document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  setProgress(0);
  const analysisBox = document.getElementById("resume-analysis");
  const scenarioBox = document.getElementById("interview-scenario");
  analysisBox.innerHTML = "";
  scenarioBox.innerHTML = "";

  const candidateName = document.getElementById("candidate-name")?.value?.trim();
  const resumeFile = document.getElementById("resume-file")?.files?.[0];
  const interviewFile = document.getElementById("interview-file")?.files?.[0];

  if (!candidateName || !resumeFile || !interviewFile) {
    alert("لطفاً همه فیلدها را پر کنید.");
    return;
  }

  try {
    setProgress(5);
    const resume_text = await extractTextFromPdf(resumeFile);
    setProgress(40);
    const interview_text = await extractTextFromPdf(interviewFile);
    setProgress(70);

    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_name: candidateName, resume_text, interview_text }),
    });

    const rawText = await resp.text(); // ← robust: read as text first
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} – ${rawText?.slice(0,800)}`);
    }
    if (!rawText || !rawText.trim()) {
      throw new Error("پاسخ سرور خالی بود (بدون بدنه). مطمئن شوید Respond to Webhook JSON برمی‌گرداند.");
    }

    let payload = tryParseJson(rawText);
    if (!payload) {
      throw new Error(`پاسخ JSON معتبر نبود:\n${rawText.slice(0,1200)}`);
    }

    // n8n shapes
    if (Array.isArray(payload) && payload.length === 1) payload = payload[0];
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload,"json")) {
      payload = payload.json;
    }
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload,"object Object")) {
      payload = payload["object Object"];
    }

    const r = payload.resume_analysis || payload.analysis || payload.resume;
    const s = payload.interview_scenario || payload.professional_interview || payload.scenario;

    analysisBox.innerHTML = renderResumeAnalysis(r);
    scenarioBox.innerHTML = renderInterviewScenario(s);

    setProgress(100);
  } catch (err) {
    console.error(err);
    const msg = (err && err.message) ? err.message : String(err);
    const safe = escapeHtml(msg);
    document.getElementById("resume-analysis").innerHTML =
      `<div class="code-fallback"><pre>${safe}</pre></div>`;
    document.getElementById("interview-scenario").innerHTML = "";
    setProgress(0);
  }
});
