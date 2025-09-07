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
    // پاک‌سازی کد-فنس‌ها و تگ‌ها
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

// ---------- Renderers ----------
function renderResumeAnalysis(res){
  const json = tryParseJson(res) || (res ?? {});
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return `<div class="code-fallback"><pre>${escapeHtml(JSON.stringify(res ?? {}, null, 2))}</pre></div>`;
  }
  const scores = json.criteria_scores || {};
  const suit = json.suitability || {};
  const red = Array.isArray(json.red_flags) ? json.red_flags : [];
  const bonus = Array.isArray(json.bonus_points) ? json.bonus_points : [];

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
  const json = tryParseJson(scn) || (scn ?? {});
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return `<div class="code-fallback"><pre>${escapeHtml(JSON.stringify(scn ?? {}, null, 2))}</pre></div>`;
  }
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
