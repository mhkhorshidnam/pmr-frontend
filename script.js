// script.js - Final Version
console.log("SCRIPT_VERSION v10");

// گرفتن المنت‌ها
const form = document.querySelector("form");
const resultBox = document.getElementById("result");

// آدرس API
const API_URL = "https://pmrecruitment.darkube.app/webhook/recruit/analyze-text";

// تابع برای محاسبه سازگاری نقش‌ها بر اساس امتیاز کل
function suitabilityFromScore(total) {
  const s = {
    APM: "نامناسب",
    PM: "نامناسب",
    SPM: "نامناسب"
  };

  // APM
  if (total >= 0 && total <= 7) s.APM = "نامناسب";
  else if (total >= 8 && total <= 13) s.APM = "قابل بررسی";
  else if (total >= 14 && total <= 30) s.APM = "مناسب";

  // PM
  if (total >= 0 && total <= 12) s.PM = "نامناسب";
  else if (total >= 13 && total <= 18) s.PM = "قابل بررسی";
  else if (total >= 19 && total <= 30) s.PM = "مناسب";

  // SPM
  if (total >= 0 && total <= 15) s.SPM = "نامناسب";
  else if (total >= 16 && total <= 23) s.SPM = "قابل بررسی";
  else if (total >= 24 && total <= 30) s.SPM = "مناسب";

  return s;
}

// نقش پیشنهادی بر اساس همان جدول
function coerceRecommendedRole(_rec, _suitIgnored, total) {
  const derived = suitabilityFromScore(total);
  const rank = { "نامناسب": 0, "قابل بررسی": 1, "مناسب": 2 };

  // اولویت بالا به پایین
  const highToLow = ["SPM", "PM", "APM"];

  // 1) اگر نقشی "مناسب" بود → بالاترین نقش مناسب
  for (const r of highToLow) {
    if (derived[r] === "مناسب") return r;
  }

  // 2) اگر نقشی "قابل بررسی" بود → بالاترین نقش قابل بررسی
  for (const r of highToLow) {
    if (derived[r] === "قابل بررسی") return r;
  }

  // 3) اگر همه نامناسب → APM
  return "APM";
}

// رندر کردن خروجی در صفحه
function renderResult(payload) {
  if (!payload || typeof payload !== "object") {
    resultBox.innerHTML = "<p>خطا در پردازش داده</p>";
    return;
  }

  const ra = payload.resume_analysis;
  if (!ra) {
    resultBox.innerHTML = "<p>خروجی ناقص است</p>";
    return;
  }

  const total = ra.total_score || 0;
  const suitability = suitabilityFromScore(total);
  const recommended = coerceRecommendedRole(ra.recommended_role, suitability, total);

  // نمایش کلی
  let html = `
    <h3>خلاصه ارزیابی جامع رزومه</h3>
    <p><b>نقش پیشنهادی:</b> ${recommended}</p>
    <p><b>امتیاز کل:</b> ${total}/30</p>
    <p><b>سازگاری نقش‌ها:</b> 
      APM: ${suitability.APM} |
      PM: ${suitability.PM} |
      SPM: ${suitability.SPM}
    </p>
    <table>
      <tr><th>معیار</th><th>امتیاز (0-5)</th></tr>
  `;

  (ra.criteria || []).forEach(c => {
    html += `<tr><td>${c.id}</td><td>${c.score}</td></tr>`;
  });

  html += `</table>`;

  // نقاط قوت
  const strengths = (ra.criteria || [])
    .flatMap(c => c.strengths || []);
  if (strengths.length > 0) {
    html += `<h4>نقاط قوت</h4><ul>`;
    strengths.forEach(s => html += `<li>✅ ${s}</li>`);
    html += `</ul>`;
  }

  // نقاط قابل بهبود
  const weaknesses = (ra.criteria || [])
    .flatMap(c => c.weaknesses || []);
  if (weaknesses.length > 0) {
    html += `<h4>نقاط قابل‌بهبود</h4><ul>`;
    weaknesses.forEach(w => html += `<li>⚠️ ${w}</li>`);
    html += `</ul>`;
  }

  // نکات مثبت
  if ((ra.bonus_points || []).length > 0) {
    html += `<h4>نکات مثبت:</h4><ul>`;
    ra.bonus_points.forEach(b => html += `<li>🌟 ${b}</li>`);
    html += `</ul>`;
  }

  // هشدارها
  if ((ra.red_flags || []).length > 0) {
    html += `<h4>هشدارها:</h4><ul>`;
    ra.red_flags.forEach(r => html += `<li>🚨 ${r}</li>`);
    html += `</ul>`;
  }

  resultBox.innerHTML = html;
}

// هندل ارسال فرم
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const candidateName = document.getElementById("candidateName").value;
  const resumeFile = document.getElementById("resumeFile").files[0];
  const interviewFile = document.getElementById("interviewFile").files[0];

  const formData = new FormData();
  formData.append("candidate_name", candidateName);
  if (resumeFile) formData.append("resume", resumeFile);
  if (interviewFile) formData.append("interview", interviewFile);

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    if (!resp.ok) throw new Error("HTTP error " + resp.status);
    const data = await resp.json();
    console.log("Response from n8n:", data);
    renderResult(data);
  } catch (err) {
    console.error("Fetch error:", err);
    resultBox.innerHTML = `<p style="color:red">خطا در ارتباط با سرور</p>`;
  }
});
