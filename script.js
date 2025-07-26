document.getElementById("upload-form").addEventListener("submit", async function (e) {
  e.preventDefault();

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
      cache: 'no-store' // اضافه کردن این خط برای جلوگیری از کش شدن
    });

    if (!response.ok) {
        // اگر پاسخ HTTP موفقیت‌آمیز نبود، خطا را پرتاب کن
        const errorText = await response.text(); // سعی کن متن خطا را بخوانی
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    // قبل از تلاش برای تبدیل به JSON، محتوای خام پاسخ را بررسی کنید
    const responseText = await response.text();
    console.log("Raw response text from webhook:", responseText);

    let result;
    try {
        result = JSON.parse(responseText); // سعی کنید متن را به JSON تبدیل کنید
    } catch (jsonError) {
        console.error("خطا در تبدیل پاسخ به JSON:", jsonError);
        console.error("پاسخ دریافتی که باعث خطا شد:", responseText);
        throw new Error("پاسخ دریافتی JSON معتبر نیست.");
    }

    console.log("Parsed JSON result:", result);

    // بررسی کنید که آیا result یک آرایه است و اگر هست، اولین آیتم آن را انتخاب کنید
    const dataToDisplay = Array.isArray(result) && result.length > 0 ? result[0] : result;

    document.getElementById("resume-analysis").innerText =
      dataToDisplay.resume_analysis || "نتیجه‌ای برای تحلیل رزومه یافت نشد.";
    document.getElementById("interview-scenario").innerText =
      dataToDisplay.interview_scenario || "سناریوی مصاحبه‌ای یافت نشد.";

    // نمایش پیام موفقیت و پخش صدا
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