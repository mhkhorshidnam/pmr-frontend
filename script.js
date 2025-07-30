document.getElementById("upload-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  console.log("Form submission initiated.");

  const progressBarContainer = document.getElementById("upload-progress-container");
  const progressBarFill = document.getElementById("upload-progress-fill");
  const progressBarText = document.getElementById("upload-progress-text");
  const submitButton = document.querySelector("#upload-form button[type='submit']");

  progressBarFill.style.width = '0%';
  progressBarText.innerText = '0%';
  progressBarContainer.classList.remove("hidden");
  submitButton.disabled = true;

  document.getElementById("resume-analysis").innerHTML = "";
  document.getElementById("interview-scenario").innerHTML = "";

  const candidateName = document.getElementById("candidate-name").value;
  const resumeFile = document.getElementById("resume-file").files[0];
  const interviewFile = document.getElementById("interview-file").files[0];

  let resumeText = "";
  let interviewText = "";

  if (resumeFile) {
    if (resumeFile.type === 'application/pdf') {
      resumeText = await extractTextFromPdf(resumeFile);
    } else {
      console.warn("فایل رزومه PDF نیست. متن استخراج نخواهد شد.");
      resumeText = "فایل رزومه قابل پردازش نیست (فقط PDF پشتیبانی می شود).";
    }
  }

  if (interviewFile) {
    if (interviewFile.type === 'application/pdf') {
      interviewText = await extractTextFromPdf(interviewFile);
    } else {
      console.warn("فایل فرم مصاحبه PDF نیست. متن استخراج نخواهد شد.");
      interviewText = "فایل فرم مصاحبه قابل پردازش نیست (فقط PDF پشتیبانی می شود).";
    }
  }

  const formData = new FormData();
  formData.append("resume_text", resumeText);
  formData.append("interview_text", interviewText);
  formData.append("candidate_name", candidateName);

  const webhookUrl = "https://pmrecruitment.darkube.app/webhook/upload-files";

  const xhr = new XMLHttpRequest();

  xhr.open("POST", webhookUrl);
  xhr.setRequestHeader('Cache-Control', 'no-store');

  xhr.upload.onprogress = function(event) {
    if (event.lengthComputable) {
      const percentComplete = (event.loaded / event.total) * 100;
      progressBarFill.style.width = percentComplete.toFixed(0) + '%';
      progressBarText.innerText = percentComplete.toFixed(0) + '%';
    }
  };

  xhr.onload = async function() {
    submitButton.disabled = false;
    if (xhr.status >= 200 && xhr.status < 300) {
      progressBarContainer.classList.add("hidden");
      progressBarFill.style.width = '100%';
      progressBarText.innerText = '100%';

      try {
        const responseText = xhr.responseText;
        console.log("Raw response text from webhook:", responseText);
      } catch (error) {
        console.error("خطا در پردازش پاسخ:", error);
        document.getElementById("resume-analysis").innerHTML = "خطا در پردازش پاسخ از سرور.";
        document.getElementById("interview-scenario").innerHTML = "";
      }
    } else {
      console.error("خطا در درخواست HTTP:", xhr.status, xhr.statusText, xhr.responseText);
      progressBarContainer.classList.add("hidden");
      document.getElementById("resume-analysis").innerHTML = "خطا در برقراری ارتباط با سرور: " + xhr.status;
      document.getElementById("interview-scenario").innerHTML = "";
    }
  };

  xhr.onerror = function() {
    submitButton.disabled = false;
    progressBarContainer.classList.add("hidden");
    console.error("خطای شبکه یا CORS رخ داد.");
    document.getElementById("resume-analysis").innerHTML = "خطای شبکه یا CORS رخ داد. لطفا دوباره تلاش کنید.";
    document.getElementById("interview-scenario").innerHTML = "";
  };

  xhr.send(formData);
});