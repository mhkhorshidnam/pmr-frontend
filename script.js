// SCRIPT_VERSION v15 — strengths/weaknesses as paragraphs

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

function boldifyMetrics(text){
  if (!text) return "";
  const map = {
    "تجربه":"تجربه",
    "دستاوردها":"دستاوردها",
    "تحصیلات":"تحصیلات",
    "مهارت‌ها":"مهارت‌ها",
    "حوزه/صنعت":"حوزه/صنعت",
    "مدیریت تیم":"مدیریت تیم",
    // احتمال بازگشت انگلیسی
    "experience":"تجربه",
    "achievements":"دستاوردها",
    "education":"تحصیلات",
    "skills":"مهارت‌ها",
    "industry_experience":"حوزه/صنعت",
    "team_management":"مدیریت تیم",
  };
  let out = String(text);
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

// ---------- Normalizers ----------
function normalizeResume(raw){
  // n8n OpenAI node -> message.content
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

  // scores
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

  // lists
  const redKey   = pick(data,["red_flags","redflags","concerns","risks"]);
  const bonusKey = pick(data,["bonus_points","bonus","pluses","advantages"]);
  out.red_flags    = toStringArray(data[redKey]);
  out.bonus_points = toStringArray(data[bonusKey]);

  // NEW: descriptive paragraphs
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
  return {
    selected_problem: data.selected_problem ?? data.problem ?? "",
    competencies_needing_deeper_evaluation: toStringArray(
      data.competencies_needing_deeper_evaluation ?? data.competencies ?? []),
    questions: toStringArray(data.questions ?? [])
  };
}

// ---------- Renderers ----------
function renderResumeAnalysis(res){
  const json = normalizeResume(res);
  const scores = json.criteria_scores || {};
  const suit = json.suitability || {};
  const red = json.red_flags || [];
  const bonus = json.bonus_points || [];

  // paragraphs (fallback to dash)
  const strengthsHtml = json.strengths_text
    ? `<div class="para-block">${boldifyMetrics(escapeHtml(json.strengths_text)).replace(/\n{2,}/g,"</p><p class='para-block'>").replace(/\n/g,"<br>")}</div>`
    : "—";
  const weaknessesHtml = json.weaknesses_text
    ? `<div class="para-block">${boldifyMetrics(escapeHtml(json.weaknesses_text)).replace(/\n{2,}/g,"</p><p class='para-block'>").replace(/\n/g,"<br>")}</div>`
    : "—";

  return `
    <ul style="margin:0 0 6px 0; padding-inline-start:18px; direction:rtl; text-align:right">
      <li><b>امتیاز کل:</b> ${json.total_score ?? "-"}</li>
      <li><b>سازگاری نقش‌ها:</b> 
        APM: <b>${suit.APM ?? "-"}</b> | 
        PM: <b>${suit.PM ?? "-"}</b> | 
        SPM: <b>${suit.SPM ?? "-"}</b>
      </li>
    </ul>

    <table>
      <thead><tr><th>معیار</th><th>امتیاز (0–5)</th></tr></thead>
      <tbody>
        <tr><td>تجربه</td><td>${scores.experience ?? "-"}</td></tr>
        <tr><td>دستاوردها</td><td>${scores.achievements ?? "-"}</td></tr>
        <tr><td>تحصیلات</td><td>${scores.education ?? "-"}</td></tr>
        <tr><td>مهارت‌ها</td><td>${scores.skills ?? "-"}</td></tr>
        <tr><td>حوزه/صنعت</td><td>${scores.industry_experience ?? "-"}</td></tr>
        <tr><td>مدیریت تیم</td><td>${scores.team_management ?? "-"}</td></tr>
      </tbody>
    </table>

    <h4 style="margin:12px 0 6px; direction:rtl; text-align:right">نقاط قوت (توصیفی)</h4>
    <div style="direction:rtl; text-align:right">${strengthsHtml}</div>

    <h4 style="margin:12px 0 6px; direction:rtl; text-align:right">نقاط قابل‌بهبود (توصیفی)</h4>
    <div style="direction:rtl; text-align:right">${weaknessesHtml}</div>

    <p style="margin-top:8px; direction:rtl; text-align:right"><b>موضوعات منفی قابل توجه:</b> ${red.length ? red.map(escapeHtml).join("، ") : "نکات منفی قابل توجهی دیده نشد"}</p>
    <p style="direction:rtl; text-align:right"><b>نکات مثبت:</b> ${bonus.length ? bonus.map(escapeHtml).join("، ") : "نکات مثبت ویژه‌ای در رزومه دیده نشد"}</p>
  `;
}

function renderInterviewScenario(scn){
  const json = normalizeScenario(scn);
  const probs = json.selected_problem
    ? `<p style="direction:rtl; text-align:right"><b>مسئله انتخاب‌شده:</b> ${escapeHtml(json.selected_problem)}</p>`
    : "";
  const comps = json.competencies_needing_deeper_evaluation || [];
  const questions = json.questions || [];

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

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`خطای سرور ${resp.status}: ${errText}`);
    }
    const raw = await resp.json();

    // n8n شکل‌های مختلف
    let payload = raw;
    if (Array.isArray(payload) && payload.length === 1) payload = payload[0];
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload,"json")) {
      payload = payload.json;
    }
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload,"object Object")) {
      payload = payload["object Object"];
    }

    const r = payload.resume_analysis || payload.analysis || payload.resume;
    const s = payload.interview_scenario || payload.scenario;

    analysisBox.innerHTML = renderResumeAnalysis(r);
    scenarioBox.innerHTML = renderInterviewScenario(s);

    setProgress(100);
  } catch (err) {
    console.error(err);
    analysisBox.innerHTML = `<div class="code-fallback"><pre>${escapeHtml(String(err))}</pre></div>`;
    scenarioBox.innerHTML = "";
    setProgress(0);
  }
});
