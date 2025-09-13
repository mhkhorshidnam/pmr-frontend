// ---------- Version ----------
console.log("SCRIPT_VERSION", "v14");

// ---------- Config ----------
const API_URL = "https://pmrecruitment.darkube.app/webhook/recruit/analyze-text";

// ---------- Small utils ----------
function $(id) { return document.getElementById(id); }
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[s]
  ));
}
function setProgress(percent) {
  const wrap = $("upload-progress-container");
  const fill = $("upload-progress-fill");
  const text = $("upload-progress-text");
  if (!wrap || !fill || !text) return;
  wrap.classList.remove("hidden");
  fill.style.width = percent + "%";
  text.textContent = percent + "%";
}

// ---------- Suitability & Role (score-based) ----------
const suitabilityDict = {
  "not suitable": { fa: "نامناسب", hint: "فاقد حداقل‌های ورود/شواهد کافی نیست" },
  "borderline":   { fa: "قابل بررسی", hint: "برخی شایستگی‌ها/پایه‌های لازم وجود دارد" },
  "suitable":     { fa: "مناسب", hint: "تجربه و شایستگی کافی" },
  "strong":       { fa: "مناسب", hint: "هم‌خوان با سطح استراتژیک" },
};

function suitabilityFromScore(total) {
  const t = Number(total);
  const s = (role) => {
    if (isNaN(t)) return "not suitable";
    if (role === "APM") {
      if (t <= 7)  return "not suitable";
      if (t <= 12) return "borderline";
      return "suitable";
    }
    if (role === "PM") {
      if (t <= 12) return "not suitable";
      if (t <= 18) return "borderline";
      return "suitable";
    }
    // SPM
    if (t <= 18) return "not suitable";
    if (t <= 23) return "borderline";
    return "suitable";
  };
  return { APM: s("APM"), PM: s("PM"), SPM: s("SPM") };
}

function coerceRecommendedRole(_rec, _suitIgnored, total){
  const derived = suitabilityFromScore(total);
  const order = ["SPM","PM","APM"]; // سطح بالاتر اول
  for (const r of order) if (derived[r] === "suitable" || derived[r] === "strong") return r; // مناسب
  for (const r of order) if (derived[r] === "borderline") return r;                             // قابل بررسی
  return "APM"; // اگر همه نامناسب
}

function formatSuitabilityLine(suitability, recommendedRole){
  const roles = ["APM", "PM", "SPM"];
  const parts = roles.map(r => {
    const key = String(suitability?.[r] ?? "").toLowerCase();
    const m = suitabilityDict[key] || { fa: "-", hint: "" };
    const name = (r === recommendedRole) ? `<b>${r}</b>` : r;
    const hint = m.hint ? ` — ${escapeHtml(m.hint)}` : "";
    return `${name}: ${escapeHtml(m.fa)}${hint}`;
  });
  return parts.join(" | ");
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

// ---------- Normalizers ----------
function tryParseJson(x){
  if (!x) return null;
  if (typeof x === "object") return x;
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function normalizeResume(raw){
  if (raw?.message?.content && typeof raw.message.content === "string") {
    const parsed = tryParseJson(raw.message.content);
    if (parsed) raw = parsed;
  }
  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};
  out.recommended_role = data.recommended_role ?? data.role ?? "";
  out.total_score = typeof data.total_score === "number" ? data.total_score :
                    typeof data.overall_score === "number" ? data.overall_score : null;

  const scores = {};
  const details = {};
  if (Array.isArray(data.criteria)) {
    for (const c of data.criteria) {
      if (!c?.id) continue;
      scores[c.id] = (typeof c.score === "number") ? c.score : null;
      details[c.id] = {
        strengths: Array.isArray(c.strengths) ? c.strengths : [],
        weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses : [],
      };
    }
  }
  out.criteria_scores = {
    experience: scores.experience ?? null,
    achievements: scores.achievements ?? null,
    education: scores.education ?? null,
    skills: scores.skills ?? null,
    industry_experience: scores.industry_experience ?? null,
    team_management: scores.team_management ?? null,
  };
  out.criteria_details = details;
  out.red_flags = Array.isArray(data.red_flags) ? data.red_flags : [];
  out.bonus_points = Array.isArray(data.bonus_points) ? data.bonus_points : [];
  return out;
}

function normalizeScenario(raw){
  if (raw?.message?.content && typeof raw.message.content === "string") {
    const parsed = tryParseJson(raw.message.content);
    if (parsed) raw = parsed;
  }
  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};
  out.selected_problem = data.selected_problem ?? data.problem ?? "";
  out.competencies_needing_deeper_evaluation =
    Array.isArray(data.competencies_needing_deeper_evaluation) ? data.competencies_needing_deeper_evaluation : [];
  out.questions = Array.isArray(data.questions) ? data.questions.map(q => (typeof q === "string" ? q : (q?.text ?? q?.title ?? ""))) : [];
  return out;
}

// ---------- Labels / order for criteria ----------
const CRITERIA_ORDER = [
  "experience",
  "achievements",
  "education",
  "skills",
  "industry_experience",
  "team_management",
];

const CRITERIA_LABELS_FA = {
  experience: "تجربه",
  achievements: "دستاوردها",
  education: "تحصیلات",
  skills: "مهارت‌ها",
  industry_experience: "حوزه/صنعت",
  team_management: "مدیریت تیم",
};

// Helper: build descriptive list per criterion (max 3)
function buildDescriptiveSection(detailsMap, key, icon) {
  const items = detailsMap?.[key]?.[icon === "✅" ? "strengths" : "weaknesses"] || [];
  const limited = items.slice(0, 3); // حداکثر ۳ جمله
  if (!limited.length) return "";
  const label = CRITERIA_LABELS_FA[key] || key;
  // نام شاخص بولد
  return `
    <div style="margin: 6px 0; direction:rtl; text-align:right">
      <div><b>${escapeHtml(label)}</b></div>
      <ul style="margin:4px 0 8px 0; padding-inline-start:22px;">
        ${limited.map(x => `<li>${icon} ${escapeHtml(x)}</li>`).join("")}
      </ul>
    </div>
  `;
}

// ---------- Renderer ----------
function renderResumeAnalysis(res){
  const json = normalizeResume(res);
  const scores = json.criteria_scores || {};
  const details = json.criteria_details || {};
  const derivedSuit = suitabilityFromScore(json.total_score);
  const recommendedRole = coerceRecommendedRole(json.recommended_role, derivedSuit, json.total_score);
  const totalStr = (json.total_score != null) ? `${json.total_score}/30` : "-/30";

  // خلاصه بالا
  let html = `
    <div style="direction:rtl; text-align:right">
      <div><b>نقش پیشنهادی:</b> <b>${escapeHtml(recommendedRole || "—")}</b></div>
      <div><b>امتیاز کل:</b> ${escapeHtml(totalStr)}</div>
      <div><b>سازگاری نقش‌ها:</b> ${formatSuitabilityLine(derivedSuit, recommendedRole)}</div>
    </div>
  `;

  // جدول امتیاز معیارها — تیتر با اعداد انگلیسی (0–5)
  html += `
    <table>
      <thead><tr><th>معیار</th><th>امتیاز (0–5)</th></tr></thead>
      <tbody>
        <tr><td>${CRITERIA_LABELS_FA.experience}</td><td>${scores.experience ?? "—"}</td></tr>
        <tr><td>${CRITERIA_LABELS_FA.achievements}</td><td>${scores.achievements ?? "—"}</td></tr>
        <tr><td>${CRITERIA_LABELS_FA.education}</td><td>${scores.education ?? "—"}</td></tr>
        <tr><td>${CRITERIA_LABELS_FA.skills}</td><td>${scores.skills ?? "—"}</td></tr>
        <tr><td>${CRITERIA_LABELS_FA.industry_experience}</td><td>${scores.industry_experience ?? "—"}</td></tr>
        <tr><td>${CRITERIA_LABELS_FA.team_management}</td><td>${scores.team_management ?? "—"}</td></tr>
      </tbody>
    </table>
  `;

  // بخش «نقاط قوت» به‌صورت توصیفی و تفکیک‌شده بر اساس شاخص‌ها
  let strengthsSections = "";
  for (const key of CRITERIA_ORDER) {
    strengthsSections += buildDescriptiveSection(details, key, "✅");
  }
  html += `
    <h4 style="direction:rtl; text-align:right; margin:10px 0 6px 0">نقاط قوت</h4>
    ${strengthsSections || "<p style='direction:rtl; text-align:right'>—</p>"}
  `;

  // بخش «نقاط قابل‌بهبود» به‌صورت توصیفی و تفکیک‌شده بر اساس شاخص‌ها
  let weaknessesSections = "";
  for (const key of CRITERIA_ORDER) {
    weaknessesSections += buildDescriptiveSection(details, key, "⚠️");
  }
  html += `
    <h4 style="direction:rtl; text-align:right; margin:10px 0 6px 0">نقاط قابل‌بهبود</h4>
    ${weaknessesSections || "<p style='direction:rtl; text-align:right'>—</p>"}
  `;

  // نکات مثبت
  const bonus = json.bonus_points || [];
  html += `
    <p style="margin-top:8px; direction:rtl; text-align:right"><b>نکات مثبت:</b> ${
      bonus.length ? bonus.map(escapeHtml).join("، ") : "نکات مثبت ویژه‌ای در رزومه دیده نشد"
    }</p>
  `;

  // موضوعات منفی قابل توجه (قبلاً: هشدارها)
  const negatives = json.red_flags || [];
  html += `
    <p style="direction:rtl; text-align:right"><b>موضوعات منفی قابل توجه:</b> ${
      negatives.length ? negatives.map(escapeHtml).join("، ") : "نکات منفی قابل توجهی دیده نشد"
    }</p>
  `;

  return html;
}

function renderInterviewScenario(scn){
  const json = normalizeScenario(scn);
  const probs = json.selected_problem ? `<p style="direction:rtl; text-align:right"><b>مسئله انتخاب‌شده:</b> ${escapeHtml(json.selected_problem)}</p>` : "";
  const comps = json.competencies_needing_deeper_evaluation || [];
  const questions = json.questions || [];

  return `
    ${probs}
    ${comps.length ? `<p style="direction:rtl; text-align:right"><b>شایستگی‌های نیازمند ارزیابی عمیق:</b> ${comps.map(escapeHtml).join("، ")}</p>` : ""}
    ${questions.length ? 
      `<div style="direction:rtl; text-align:right"><b>سوالات عمیق پیشنهادی:</b><ol>${questions.map(q => `<li>${escapeHtml(q)}</li>`).join("")}</ol></div>` 
      : "<p style='direction:rtl; text-align:right'>—</p>"
    }
  `;
}

// ---------- Robust find ----------
function deepFindResult(obj){
  if (!obj || typeof obj !== "object") return null;
  if ("resume_analysis" in obj || "interview_scenario" in obj) return obj;
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const f = deepFindResult(it);
      if (f) return f;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    const f = deepFindResult(obj[k]);
    if (f) return f;
  }
  return null;
}

// ---------- Form Submit ----------
document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  setProgress(0);
  const analysisBox = $("resume-analysis");
  const scenarioBox = $("interview-scenario");
  analysisBox.innerHTML = "";
  scenarioBox.innerHTML = "";

  const candidateNameEl = $("candidate-name") || $("candidateName");
  const resumeInput     = $("resume-file")    || $("resumeFile");
  const interviewInput  = $("interview-file") || $("interviewFile");

  try {
    const candidateName = (candidateNameEl?.value || "").trim();
    const resumeFile    = resumeInput?.files?.[0] || null;
    const interviewFile = interviewInput?.files?.[0] || null;

    setProgress(10);

    const [resume_text, interview_text] = await Promise.all([
      extractTextFromPdf(resumeFile),
      interviewFile ? extractTextFromPdf(interviewFile) : Promise.resolve("")
    ]);

    console.log("text lengths:", { resume_len: resume_text.length, interview_len: interview_text.length });

    setProgress(40);

    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_name: candidateName, resume_text, interview_text }),
    });

    const raw = await resp.text();
    console.log("RAW response (first 1200 chars):", raw.slice(0, 1200));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${raw}`);

    let payload = tryParseJson(raw);
    if (!payload) {
      analysisBox.innerHTML = `<div class="code-fallback"><pre>${escapeHtml(raw)}</pre></div>`;
      scenarioBox.innerHTML = "";
      setProgress(100);
      return;
    }

    if (payload && typeof payload === "object" && "json" in payload && payload.json) {
      payload = payload.json;
    }
    if (payload && typeof payload === "object" && payload["object Object"]) {
      payload = payload["object Object"];
    }

    const found = deepFindResult(payload) || payload;
    console.log("FOUND path payload:", found);

    if (!found.resume_analysis && !found.interview_scenario) {
      analysisBox.innerHTML = `<div class="code-fallback"><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></div>`;
      scenarioBox.innerHTML = "";
      setProgress(100);
      return;
    }

    analysisBox.innerHTML = renderResumeAnalysis(found.resume_analysis || {});
    scenarioBox.innerHTML  = renderInterviewScenario(found.interview_scenario || {});
    setProgress(100);

  } catch (err) {
    console.error(err);
    $("resume-analysis").innerHTML = `<div class="code-fallback"><pre>${escapeHtml(String(err))}</pre></div>`;
    $("interview-scenario").innerHTML = "";
    setProgress(0);
  }
});
