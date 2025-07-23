document.getElementById("upload-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const resumeFile = document.getElementById("resume").files[0];
  const formFile = document.getElementById("form").files[0];

  const formData = new FormData();
  formData.append("name", name);
  if (resumeFile) formData.append("resume", resumeFile);
  if (formFile) formData.append("form", formFile);

  const webhookUrl = "https://pmrecruitment.darkube.app/webhook/upload-files";

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: formData
  });

  const result = await response.json();

  document.getElementById("resume-analysis").innerText =
    result.resume_analysis || "نتیجه‌ای برای تحلیل رزومه یافت نشد.";
  document.getElementById("form-analysis").innerText =
    result.form_analysis || "فرم بررسی نشد.";
});
