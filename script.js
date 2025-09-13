// ---------- Version ----------
console.log("SCRIPT_VERSION", "v9");

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
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[s]
  ));
}

function tryParseJson(x){
  if (x && typeof x === "object") return x;
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return null;
  try { return JSON.parse(s); } catch { return null; }
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

function toNumberLike(v){
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ---------- Normalizers ----------
function normalizeResume(raw){
  // اگر پاسخ OpenAI داخل message.content رشته JSON باشد
  if (raw?.message?.content && typeof raw.message.content === "string") {
    const parsed = tryParseJson(raw.message.content);
    if (parsed) raw = parsed;
  }
  const data = tryParseJson(raw) || (raw ?? {});
  const out = {};

  out.recommended_role = data.recommended_role ?? data.role ?? "";

  out.total_score = toNumberLike(data.total_score ?? data.overall_score ?? data.score);

  const suitKey = pick(data, ["suitability","role_suitability","fit"]);
  const suit = (suitKey && data[suitKey]) ? data[suitKey] : {};
  out.suitability = {
    APM: suit.APM ?? suit.apm ?? suit["APM_fit"] ?? suit.apmSuitability,
    PM:  suit.PM  ?? suit.pm  ?? suit["PM_fit"]  ?? suit.pmSuitability,
    SPM: suit.SPM ?? suit.spm ?? suit["SPM_fit"] ?? suit.spmSuitability,
  };

  // criteria_scores (نقشه) و criteria_details (برای قوت/ضعف)
  let criteriaScores = data.criteria_scores;
  const criteriaDetails = {};

  // اگر معیارها به صورت آرایه آمده باشد
  if (Array.isArray(data.criteria)) {
    criteriaScores = criteriaScores || {};
    for (const c of data.criteria) {
      const id = c?.id;
      if (!id) continue;
      const sc = (c.score != null) ? c.score :
                 (c.value != null) ? c.value :
                 (c.points != null) ? c.points : null;
      criteriaScores[id] = toNumberLike(sc);
      criteriaDetails[id] = {
        strengths: toStringArray(c.strengths),
        weaknesses: toStringArray(c.weaknesses)
      };
    }
  }

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

  out.criteria_details = criteriaDetails;

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

// ---------- Deep search for nested payload ----------
function findResult(obj, path = []) {
  if (!obj || typeof obj !== "object") return null;
  const hasResume = Object.prototype.hasOwnProperty.call(obj, "resume_analysis");
  const hasScenario = Object.prototype.hasOwnProperty.call(obj, "interview_scenario");
  if (hasResume || hasScenario) {
    window.lastFoundPath = path.join(".");
    return obj;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const found = findResult(v, path.concat(k));
    if (found) return found;
  }
  return null;
}

// ---------- Renderers ----------
function renderResumeAnalysis(res){
  const json = normalizeResume(res);
  const scores = json.criteria_scores || {};
  const details = json.criteria_details || {};
  const suit = json.suitability || {};
  const red = json.red_flags || [];
  const bonus = json.bonus_points || [];

  // بخش عنوان/جمع‌بندی
  let html = `
    <ul style="margin:0 0 6px 0; padding-inline-start:18px; direction:rtl; text-align:right">
      <li><b>نقش پیشنهادی:</b> ${escapeHtml(json.recommended_role || "—")}</li>
      <li><b>امتیاز کل:</b> ${json.total_score ?? "—"}</li>
      <li><b>سازگاری نقش‌ها:</b> 
        APM: <b>${suit.APM ?? "—"}</b> | 
        PM: <b>${suit.PM ?? "—"}</b> | 
        SPM: <b>${suit.SPM ?? "—"}</b>
      </li>
    </ul>
  `;

  // جدول امتیاز معیارها
  html += `
    <table>
      <thead><tr><th>معیار</th><th>امتیاز (۰–۵)</th></tr></thead>
      <tbody>
        <tr><td>تجربه</td><td>${scores.experience ?? "—"}</td></tr>
        <tr><td>دستاوردها</td><td>${scores.achievements ?? "—"}</td></tr>
        <tr><td>تحصیلات</td><td>${scores.education ?? "—"}</td></tr>
        <tr><td>مهارت‌ها</td><td>${scores.skills ?? "—"}</td></tr>
        <tr><td>حوزه/صنعت</td><td>${scores.industry_experience ?? "—"}</td></tr>
        <tr><td>مدیریت تیم</td><td>${scores.team_management ?? "—"}</td></tr>
      </tbody>
    </table>
  `;

  // قوت‌ها/ضعف‌ها زیر هر معیار (اگر باشد)
  function renderSW(id, titleFa){
    const d = details[id];
    if (!d || (!d.strengths?.length && !d.weaknesses?.length)) return "";
    const strengths = (d.strengths || []).map(escapeHtml).join("، ");
    const weaknesses = (d.weaknesses || []).map(escapeHtml).join("، ");
    return `
      <div style="direction:rtl; text-align:right; margin:6px 0 0 0">
        <b>${titleFa}:</b>
        ${strengths ? `<div style="margin-top:2px">✅ <b>قوت‌ها:</b> ${strengths}</div>` : ""}
        ${weaknesses ? `<div style="margin-top:2px">⚠️ <b>نقاط قابل‌بهبود:</b> ${weaknesses}</div>` : ""}
      </div>
    `;
  }
  html += renderSW("experience", "تجربه");
  html += renderSW("achievements", "دستاوردها");
  html += renderSW("education", "تحصیلات");
  html += renderSW("skills", "مهارت‌ها");
  html += renderSW("industry_experience", "حوزه/صنعت");
  html += renderSW("team_management", "مدیریت تیم");

  // نکات کلی
  html += `
    <p style="margin-top:8px; direction:rtl; text-align:right"><b>ریسک‌ها/پرچم قرمز:</b> ${red.length ? red.map(escapeHtml).join("، ") : "—"}</p>
    <p style="direction:rtl; text-align:right"><b>امتیازات مثبت:</b> ${bonus.length ? bonus.map(escapeHtml).join("، ") : "—"}</p>
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

  try {
    const candidateName = document.getElementById("candidate-name").value.trim();
    const resumeFile = document.getElementById("resume-file").files[0];
    const interviewFile = document.getElementById("interview-file").files[0];

    setProgress(10);

    const [resume_text, interview_text] = await Promise.all([
      extractTextFromPdf(resumeFile),
      interviewFile ? extractTextFromPdf(interviewFile) : Promise.resolve("")
    ]);

    setProgress(40);

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

    // ممکن است بدنه رشته باشد
    let payload = data?.json ?? data;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch {}
    }

    // ذخیره برای دیباگ
    window.lastPayload = payload;

    // پیدا کردن شیء شامل کلیدهای هدف در هر عمق
    const found = findResult(payload) || payload;
    window.lastFoundPath = window.lastFoundPath || "(root)";
    console.log("Response from n8n (path =", window.lastFoundPath, "):", found);

    // اگر هنوز کلیدها نبود، کل JSON را خام نمایش ده
    if (!found.resume_analysis && !found.interview_scenario) {
      analysisBox.innerHTML = `<div class="code-fallback"><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></div>`;
      scenarioBox.innerHTML = "";
      setProgress(100);
      return;
    }

    const r = found.resume_analysis || {};
    const s = found.interview_scenario || {};

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
