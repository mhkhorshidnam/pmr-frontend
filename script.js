// ---------- Config ----------
const API_URL = "https://pmrecruitment.darkube.app/webhook/recruit/analyze-text";

// ---------- Helpers ----------
function updateProgress(percent) {
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

const pick = (obj, keys) => keys.find(k => obj && Object.prototype.hasOwnProperty.call(obj, k));

// ---------- Normalizers ----------
function normalizeResume(raw){
  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};

  // total_score / overall_score
  out.total_score = data.total_score ?? data.overall_score ?? data.score ?? null;

  // suitability
  const suitKey = pick(data, ["suitability","role_suitability","fit"]);
  out.suitability = data[suitKey] || {};

  // scores container can be under different names
  const scoresKey = pick(data, [
    "criteria_scores","scores","criteria","criteriaScore","criteria_score","score_breakdown"
  ]);
  const scores = (scoresKey && data[scoresKey]) ? data[scoresKey] : {};

  // map multiple possible aliases per criterion
  const getScore = (aliases) => {
    for (const a of aliases) {
      if (scores && scores[a] != null) return scores[a];
      if (data && data[a] != null) return data[a]; // sometimes flat
    }
    return null;
  };

  out.criteria_scores = {
    experience: getScore(["experience","work_experience","exp"]),
    achievements: getScore(["achievements","accomplishments","impact"]),
    education: getScore(["education","degree","education_score"]),
    skills: getScore(["skills","skillset","abilities"]),
    industry_experience: getScore(["industry_experience","domain","industry"]),
    team_management: getScore(["team_management","leadership","people_management","team"])
  };

  // arrays
  const redKey = pick(data, ["red_flags","redflags","concerns","risks"]);
  const bonusKey = pick(data, ["bonus_points","bonus","strengths","pluses"]);
  out.red_flags = Array.isArray(data[redKey]) ? data[redKey] : [];
  out.bonus_points = Array.isArray(data[bonusKey]) ? data[bonusKey] : [];

  return out;
}

function normalizeScenario(raw){
  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};

  // selected_problem: may be string or object {title, description}
  const sp = data.selected_problem ?? data.problem ?? data.case ?? null;
  if (sp && typeof sp === "object") {
    out.selected_problem = sp.title || sp.name || sp.problem || JSON.stringify(sp);
  } else {
    out.selected_problem = sp;
  }

  // competencies
  const compKey = pick(data, [
    "competencies_needing_deeper_evaluation",
    "competencies",
    "focus_competencies",
    "skills_to_probe"
  ]);
  const comps = data[compKey];
  out.competencies_needing_deeper_evaluation = Array.isArray(comps) ? comps : [];

  // questions may be array of strings OR array of {question: "..."}
  let qs = data.questions ?? data.deep_dive_questions ?? data.interview_questions ?? [];
  if (Array.isArray(qs)) {
    qs = qs.map(q => (typeof q === "string" ? q : (q?.question ?? JSON.stringify(q))));
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
  const red = Array.isArray(json.red_flags) ? json.red_flags : [];
  const bonus = Array.isArray(json.bonus_points) ? json.bonus_points : [];

  return `
    <ul style="margin:0 0 6px 0; padding-inline-start:18px; direction:rtl; text-align:right">
      <li><b>امتیاز کل:</b> ${json.total_score ?? "-"}</li>
      <li><b>سازگاری نقش‌ها:</b> 
        APM: <b>${suit.APM ?? suit.apm ?? "-"}</b> | 
        PM: <b>${suit.PM ?? suit.pm ?? "-"}</b> | 
        SPM: <b>${suit.SPM ?? suit.spm ?? "-"}</b>
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
  const comps = Array.isArray(json.competencies_needing_deeper_evaluation) ? json.competencies_needing_deeper_evaluation : [];
  const questions = Array.isArray(json.questions) ? json.questions : [];

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

  const candidateName = document.getElementById("candidate-name").value.trim();
  const resumeFile = document.getElementById("resume-file").files[0];
  const interviewFile = document.getElementById("interview-file").files[0];
  const analysisBox = document.getElementById("resume-analysis");
  const scenarioBox = document.getElementById("interview-scenario");

  if (!candidateName || !resumeFile || !interviewFile) {
    alert("لطفاً همه فیلدها را پر کنید.");
    return;
  }

  try {
    updateProgress(5);

    const resume_text = await extractTextFromPdf(resumeFile);
    updateProgress(40);
    const interview_text = await extractTextFromPdf(interviewFile);
    updateProgress(70);

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
    updateProgress(100);

    // n8n ممکن است آیتم را به‌صورت { json: {...} } برگرداند
    const payload = data?.json ?? data ?? {};
    const r = payload.resume_analysis;
    const s = payload.interview_scenario;

    analysisBox.innerHTML = renderResumeAnalysis(r);
    scenarioBox.innerHTML = renderInterviewScenario(s);

  } catch (err) {
    console.error(err);
    analysisBox.innerHTML = `<div class="code-fallback"><pre>${escapeHtml(String(err))}</pre></div>`;
    scenarioBox.innerHTML = "";
  } finally {
    setTimeout(() => updateProgress(0), 1200);
  }
});
