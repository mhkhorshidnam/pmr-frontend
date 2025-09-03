document.getElementById("upload-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  console.log("Form submission initiated.");

  const progressBarContainer = document.getElementById("upload-progress-container");
  const submitButton = document.querySelector("#upload-form button[type='submit']");
  const analysisBox = document.getElementById("resume-analysis");
  const scenarioBox = document.getElementById("interview-scenario");

  progressBarContainer.classList.remove("hidden");
  submitButton.disabled = true;
  analysisBox.innerHTML = "در حال پردازش...";
  scenarioBox.innerHTML = "";

  const candidateName = document.getElementById("candidate-name").value;
  const resumeFile = document.getElementById("resume-file").files[0];
  const interviewFile = document.getElementById("interview-file").files[0];

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

  try {
    const resume_text = await extractTextFromPdf(resumeFile);
    const interview_text = await extractTextFromPdf(interviewFile);

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

    progressBarContainer.classList.add("hidden");
    submitButton.disabled = false;

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`خطای سرور: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("Parsed JSON result:", result);
    
    const finalData = result.json;

    analysisBox.innerHTML = marked.parse(finalData.resume_analysis || "نتیجه‌ای برای تحلیل رزومه یافت نشد.");
    scenarioBox.innerHTML = marked.parse(finalData.interview_scenario || "سناریوی مصاحبه‌ای یافت نشد.");

  } catch (error) {
    console.error("خطا در ارسال یا پردازش درخواست:", error);
    submitButton.disabled = false;
    progressBarContainer.classList.add("hidden");
    analysisBox.innerHTML = "خطا در ارتباط با سرور. لطفاً کنسول مرورگر را برای جزئیات چک کنید.";
    scenarioBox.innerHTML = "";
  }
});