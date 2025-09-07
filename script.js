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

// عددسازی ایمن (وقتی مقدار داخل آبجکت یا رشته است)
function toNumberLike(v){
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object") {
    // رایج‌ترین الگوها: {score:4} یا {value:4} یا {point:4}
    const cand = v.score ?? v.value ?? v.point ?? v.points ?? v.val;
    if (cand != null) return toNumberLike(cand);
  }
  return null;
}

const pick = (obj, keys) => keys.find(k => obj && Object.prototype.hasOwnProperty.call(obj, k));

// اگر آرایه‌ای از آبجکت‌ها/رشته‌هاست، به آرایه‌ی رشته تبدیل شود
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
  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};

  // total_score / overall_score
  out.total_score = toNumberLike(data.total_score ?? data.overall_score ?? data.score);

  // suitability
  const suitKey = pick(data, ["suitability","role_suitability","fit"]);
  const suit = (suitKey && data[suitKey]) ? data[suitKey] : {};
  out.suitability = {
    APM: suit.APM ?? suit.apm ?? suit.ApM ?? suit.apm_fit ?? suit["APM_fit"] ?? suit.apmSuitability,
    PM:  suit.PM  ?? suit.pm  ?? suit.Pm  ?? suit.pm_fit  ?? suit["PM_fit"]  ?? suit.pmSuitability,
    SPM: suit.SPM ?? suit.spm ?? suit.SpM ?? suit.spm_fit ?? suit["SPM_fit"] ?? suit.spmSuitability,
  };

  // scores container
  const scoresKey = pick(data, [
    "criteria_scores","scores","criteria","criteriaScore","criteria_score","score_breakdown"
  ]);
  const scores = (scoresKey && data[scoresKey]) ? data[scoresKey] : {};

  // helper: چند نام محتمل + استخراج عدد از آبجکت/رشته
  const getScore = (aliases) => {
    for (const a of aliases) {
      if (scores && scores[a] != null) {
        const n = toNumberLike(scores[a]);
        if (n != null) return n;
      }
      if (data && data[a] != null) {
        const n = toNumberLike(data[a]);
        if (n != null) return n;
      }
    }
    return null;
  };

  out.criteria_scores = {
    experience:         getScore(["experience","work_experience","exp"]),
    achievements:       getScore(["achievements","accomplishments","impact"]),
    education:          getScore(["education","degree","education_score"]),
    skills:             getScore(["skills","skillset","abilities"]),
    industry_experience:getScore(["industry_experience","domain","industry"]),
    team_management:    getScore(["team_management","leadership","people_management","team"]),
  };

  // arrays
  const redKey   = pick(data, ["red_flags","redflags","concerns","risks"]);
  const bonusKey = pick(data, ["bonus_points","bonus","strengths","pluses","advantages"]);
  out.red_flags     = toStringArray(data[redKey]);
  out.bonus_points  = toStringArray(data[bonusKey]);

  return out;
}

function normalizeScenario(raw){
  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};

  // selected_problem: string یا آبجکت
  const sp = data.selected_problem ?? data.problem ?? data.case ?? null;
  if (sp && typeof sp === "object") {
    out.selected_problem = sp.title ?? sp.name ?? sp.problem ?? sp.summary ?? JSON.stringify(sp);
  } else {
    out.selected_problem = sp ?? "";
  }

  // competencies
  const compKey = pick(data, [
    "competencies_needing_deeper_evaluation",
    "competencies",
    "focus_competencies",
    "skills_to_probe"
  ]);
  out.competencies_needing_deeper_evaluation = toStringArray(data[compKey]);

  // سوالات
  let qs = data.questions ?? data.deep_dive_questions ?? data.interview_questions ?? [];
  if (Array.isArray(qs)) {
    qs = qs.map(q => {
      if (typeof q === "string") return q;
      if (q && typeof q === "object") return q.question ?? q.text ?? q.title ?? JSON.stringify(q);
      return String(q ?? "");
    });
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

  // شروع هر ارسال: پیشرفت 0 و پاک‌سازی خروجی قبلی
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

    // n8n ممکن است آیتم را به‌صورت { json: {...} } برگرداند
    const payload = data?.json ?? data ?? {};
    const r = payload.resume_analysis;
    const s = payload.interview_scenario;

    analysisBox.innerHTML = renderResumeAnalysis(r);
    scenarioBox.innerHTML = renderInterviewScenario(s);

    // موفق: روی 100% بماند تا ارسال بعدی
    setProgress(100);

  } catch (err) {
    console.error(err);
    analysisBox.innerHTML = `<div class="code-fallback"><pre>${escapeHtml(String(err))}</pre></div>`;
    scenarioBox.innerHTML = "";
    // خطا: پیشرفت را صفر کن
    setProgress(0);
  }
});
