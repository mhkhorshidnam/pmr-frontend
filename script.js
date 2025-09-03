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

  const formData = new FormData();
  formData.append("candidate_name", candidateName);

  // This function is no longer needed as n8n will handle text extraction
  // formData.append("resume_pdf", resumeFile);
  // formData.append("initial_interview_pdf", interviewFile);

  // The webhook URL is corrected to match your final n8n workflow
  const webhookUrl = "https://pnrecruitment.darkube.app/webhook/recruit/analyze-dual"; //  <--  THIS LINE IS CORRECTED

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

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (jsonError) {
            console.error("خطا در تبدیل پاسخ به JSON:", jsonError);
            console.error("پاسخ دریافتی که باعث خطا شد:", responseText);
            throw new Error("پاسخ دریافتی JSON معتبر نیست.");
        }

        console.log("Parsed JSON result:", result);

        // Accessing the nested analysis result from the 'Code' node's output
        const analysisData = result.analysis_result || {};

        document.getElementById("resume-analysis").innerHTML =
          marked.parse(analysisData.resume_analysis || "نتیجه‌ای برای تحلیل رزومه یافت نشد.");
        document.getElementById("interview-scenario").innerHTML = 
          marked.parse(analysisData.interview_scenario || "سناریوی مصاحبه‌ای یافت نشد.");

        const successMessage = document.getElementById("upload-success");
        successMessage.classList.remove("hidden");
        successMessage.classList.add("show");
        document.getElementById("success-sound").play();
        setTimeout(() => {
          successMessage.classList.remove("show");
          successMessage.classList.add("hidden");
        }, 3000);

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

  // Sending the form data with the actual files
  const finalFormData = new FormData(document.getElementById("upload-form"));
  xhr.send(finalFormData);
});