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
    { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[s]
  ));
}

function tryParseJson(x){
  if (x && typeof x === "object" && !Array.isArray(x)) return x;
  if (typeof x === "string") {
    let s = x.trim();
    s = s.replace(/^```json/i, "")
         .replace(/^```/, "")
         .replace(/```$/, "")
         .replace(/^"""json/i, "")
         .replace(/^"""/, "")
         .replace(/"""$/, "");
    try { return JSON.parse(s); } catch { /* ignore */ }
  }
  return null;
}

function toNumberLike(v){
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object") {
    const cand = v.score ?? v.value ?? v.point ?? v.points ?? v.val;
    if (cand != null) return toNumberLike(cand);
  }
  return null;
}

const pick = (obj, keys) => keys.find(k => obj && Object.prototype.hasOwnProperty.call(obj, k));
function toStringArray(arr){
  if (!Array.isArray(arr)) return [];
  return arr.map(it => {
    if (typeof it === "string") return it;
    if (typeof it === "number") return String(it);
    if (it && typeof it === "object") {
      return it.title ?? it.name ?? it.label ?? it.text ?? it.reason ?? JSON.stringify(it);
    }
    return String(it ?? "");
  }).filter(Boolean);
}

// ---------- Normalizers ----------
function normalizeResume(raw){
  // اگر خروجی داخل message.content مانده باشد
  if (raw?.message?.content && typeof raw.message.content === "string") {
    const parsed = tryParseJson(raw.message.content);
    if (parsed) raw = parsed;
  }

  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};

  // total_score
  out.total_score = toNumberLike(data.total_score ?? data.overall_score ?? data.score);

  // suitability
  const suitKey = pick(data, ["suitability","role_suitability","fit"]);
  const suit = (suitKey && data[suitKey]) ? data[suitKey] : {};
  out.suitability = {
    APM: suit.APM ?? suit.apm ?? suit["APM_fit"] ?? suit.apmSuitability,
    PM:  suit.PM  ?? suit.pm  ?? suit["PM_fit"]  ?? suit.pmSuitability,
    SPM: suit.SPM ?? suit.spm ?? suit["SPM_fit"] ?? suit.spmSuitability,
  };

  // ---- مهم: criteria به صورت آرایه ----
  // اگر criteria_scores نبود ولی criteria آرایه بود، به آبجکت تبدیل می‌کنیم
  let criteriaScores = data.criteria_scores;
  if (!criteriaScores && Array.isArray(data.criteria)) {
    criteriaScores = {};
    for (const c of data.criteria) {
      const id = c?.id;
      if (!id) continue;
      criteriaScores[id] = toNumberLike(c?.score);
    }
  }

  // اگر هنوز چیزی نداریم، لااقل کلیدها را بسازیم
  const stdKeys = [
    "experience","achievements","education","skills","industry_experience","team_management"
  ];
  const getScore = (id) => {
    if (criteriaScores && criteriaScores[id] != null) return toNumberLike(criteriaScores[id]);
    if (data && data[id] != null) return toNumberLike(data[id]); // گاهی تخت
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

  // آرایه‌ها
  const redKey   = pick(data, ["red_flags","redflags","concerns","risks"]);
  const bonusKey = pick(data, ["bonus_points","bonus","strengths","pluses","advantages"]);
  out.red_flags     = toStringArray(data[redKey]);
  out.bonus_points  = toStringArray(data[bonusKey]);

  return out;
}

function normalizeScenario(raw){
  if (raw?.message?.content && typeof raw.message.content === "string") {
    const parsed = tryParseJson(raw.message.content);
    if (parsed) raw = parsed;
  }
  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};

  const sp = data.selected_problem ?? data.problem ?? data.case ?? null;
  if (sp && typeof sp === "object") {
    out.selected_problem = sp.title ?? sp.name ?? sp.problem ?? sp.summary ?? JSON.stringify(sp);
  } else {
    out.selected_problem = sp ?? "";
  }

  const compKey = pick(data, [
    "competencies_needing_deeper_evaluation","competencies","focus_competencies","skills_to_probe"
  ]);
  out.competencies_needing_deeper_evaluation = toStringArray(data[compKey]);

  let qs = data.questions ?? data.deep_dive_questions ?? data.interview_questions ?? [];
  if (Array.isArray(qs)) {
    qs = qs.map(q => (typeof q === "string" ? q : (q?.question ?? q?.text ?? q?.title ?? JSON.stringify(q))));
  } else {
    qs = [];
  }
  out.questions = qs;

  return out;
}

// ---------- Renderers ----------
function renderResumeAnalysis(res){
  const json = normalizeResume(res);
  const scores = json.criteria_scores || {};
  const suit = json.suitability || {};
  const red = json.red_flags || [];
  const bonus = json.bonus_points || [];

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
      <thead><tr><th>معیار</th><th>امتیاز (۰–۵)</th></tr></thead>
      <tbody>
        <tr><td>تجربه</td><td>${scores.experience ?? "-"}</td></tr>
        <tr><td>دستاوردها</td><td>${scores.achievements ?? "-"}</td></tr>
        <tr><td>تحصیلات</td><td>${scores.education ?? "-"}</td></tr>
        <tr><td>مهارت‌ها</td><td>${scores.skills ?? "-"}</td></tr>
        <tr><td>حوزه/صنعت</td><td>${scores.industry_experience ?? "-"}</td></tr>
        <tr><td>مدیریت تیم</td><td>${scores.team_management ?? "-"}</td></tr>
      </tbody>
    </table>

    <p style="margin-top:8px; direction:rtl; text-align:right"><b>نقاط قابل‌بهبود:</b> ${red.length ? red.map(escapeHtml).join("، ") : "—"}</p>
    <p style="direction:rtl; text-align:right"><b>امتیازات مثبت:</b> ${bonus.length ? bonus.map(escapeHtml).join("، ") : "—"}</p>
  `;
}

function renderInterviewScenario(scn){
  const json = normalizeScenario(scn);
  const probs = json.selected_problem ? `<p style="direction:rtl; text-align:right"><b>مسئله انتخاب‌شده:</b> ${escapeHtml(json.selected_problem)}</p>` : "";
  const comps = json.competencies_needing_deeper_evaluation || [];
  const questions = json.questions || [];

  return `
    ${probs}
    ${comps.length ? `<p style="direction:rtl; text-align:right"><b>شایستگی‌های نیازمند ارزیابی عمیق:</b> ${comps.map(escapeHtml).join("، ")}</p>` : ""}
    ${questions.length ? `
      <ol style="margin-top:8px; padding-inline-start:18px; direction:rtl; text-align:right">
        ${questions.map(q => `<li>${escapeHtml(q)}</li>`).join("")}
      </ol>` : ""}
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

  const candidateName = document.getElementById("candidate-name").value.trim();
  const resumeFile = document.getElementById("resume-file").files[0];
  const interviewFile = document.getElementById("interview-file").files[0];

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
    const data = await resp.json();

    // n8n ممکن است به صورت { json: {...} } بدهد
    const payload = data?.json ?? data ?? {};
    const r = payload.resume_analysis || payload.resume || payload.analysis;
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
