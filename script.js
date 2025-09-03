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

  async function extractTextFromPdf(file) {
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

  try {
    const resume_text = resumeFile ? await extractTextFromPdf(resumeFile) : "";
    const interview_text = interviewFile ? await extractTextFromPdf(interviewFile) : "";

    const dataToSend = {
      candidate_name: candidateName,
      resume_text: resume_text,
      interview_text: interview_text
    };

    const webhookUrl = "https://pmrecruitment.darkube.app/webhook/recruit/analyze-dual";
    
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
    });

    submitButton.disabled = false;
    progressBarContainer.classList.add("hidden");

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("Parsed JSON result:", result);
    
    const finalData = result[0].json; // Adjust based on n8n's final structure

    document.getElementById("resume-analysis").innerHTML = marked.parse(finalData.resume_analysis || "نتیجه‌ای برای تحلیل رزومه یافت نشد.");
    document.getElementById("interview-scenario").innerHTML = marked.parse(finalData.interview_scenario || "سناریوی مصاحبه‌ای یافت نشد.");

    const successMessage = document.getElementById("upload-success");
    successMessage.classList.remove("hidden");
    successMessage.classList.add("show");
    document.getElementById("success-sound").play();
    setTimeout(() => {
        successMessage.classList.remove("show");
        successMessage.classList.add("hidden");
    }, 3000);

  } catch (error) {
    console.error("خطا در ارسال یا پردازش درخواست:", error);
    submitButton.disabled = false;
    progressBarContainer.classList.add("hidden");
    document.getElementById("resume-analysis").innerHTML = "خطا در ارتباط با سرور: " + error.message;
  }
});