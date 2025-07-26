document.getElementById("upload-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  console.log("Form submission initiated."); // خط اضافه شده برای عیب‌یابی

  const candidateName = document.getElementById("candidate-name").value;
  const resumeFile = document.getElementById("resume-file").files[0];
  const interviewFile = document.getElementById("interview-file").files[0];

  const formData = new FormData();
  formData.append("candidate_name", candidateName);

  // تابع کمکی برای استخراج متن از PDF
  async function extractTextFromPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    }

    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText.trim();
    } catch (error) {
      console.error("خطا در استخراج متن از PDF:", error);
      return "";
    }
  }

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
  
  formData.append("resume_text", resumeText);
  formData.append("interview_text", interviewText);

  const webhookUrl = "https://pmrecruitment.darkube.app/webhook/upload-files";

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      body: formData,
      cache: 'no-store'
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const responseText = await response.text();
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

    const dataToDisplay = Array.isArray(result) && result.length > 0 ? result[0] : result;

    document.getElementById("resume-analysis").innerText =
      dataToDisplay.resume_analysis || "نتیجه‌ای برای تحلیل رزومه یافت نشد.";
    document.getElementById("interview-scenario").innerText =
      dataToDisplay.interview_scenario || "سناریوی مصاحبه‌ای یافت نشد.";

    const successMessage = document.getElementById("upload-success");
    successMessage.classList.remove("hidden");
    successMessage.classList.add("show");
    document.getElementById("success-sound").play();
    setTimeout(() => {
      successMessage.classList.remove("show");
      successMessage.classList.add("hidden");
    }, 3000);

  } catch (error) {
    console.error("خطا در ارسال یا دریافت اطلاعات:", error);
    document.getElementById("resume-analysis").innerText = "خطا در برقراری ارتباط با سرور یا پردازش اطلاعات.";
    document.getElementById("interview-scenario").innerText = "";
  }
});