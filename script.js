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
    // مهم: workerSrc را برای pdf.js تنظیم کنید.
    // این مسیر ممکن است بسته به نسخه pdf.js شما و محل آن تغییر کند.
    // معمولا یک فایل pdf.worker.min.js در کنار pdf.min.js وجود دارد.
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    }

    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        // اطمینان از اینکه خطوط به درستی جدا شوند
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText.trim(); // حذف فضای اضافی در ابتدا و انتها
    } catch (error) {
      console.error("خطا در استخراج متن از PDF:", error);
      return ""; // در صورت خطا، رشته خالی برگردانده شود
    }
  }

  let resumeText = "";
  let interviewText = "";

  // استخراج متن از رزومه (اگر فایل PDF باشد)
  if (resumeFile) {
    if (resumeFile.type === 'application/pdf') {
      resumeText = await extractTextFromPdf(resumeFile);
    } else {
      // اگر فایل تصویر یا فرمت دیگری است، در این مرحله متنی استخراج نمی‌شود.
      // باید راهکاری برای OCR در سمت کلاینت یا سرور در نظر بگیرید.
      // فعلاً فرض می کنیم فقط PDF است یا متن خالی ارسال می شود.
      console.warn("فایل رزومه PDF نیست. متن استخراج نخواهد شد.");
      resumeText = "فایل رزومه قابل پردازش نیست (فقط PDF پشتیبانی می شود).";
    }
  }

  // استخراج متن از فرم مصاحبه (اگر فایل PDF باشد)
  if (interviewFile) {
    if (interviewFile.type === 'application/pdf') {
      interviewText = await extractTextFromPdf(interviewFile);
    } else {
      console.warn("فایل فرم مصاحبه PDF نیست. متن استخراج نخواهد شد.");
      interviewText = "فایل فرم مصاحبه قابل پردازش نیست (فقط PDF پشتیبانی می شود).";
    }
  }
  
  // اضافه کردن متن استخراج شده به FormData با کلیدهای مورد انتظار n8n
  formData.append("resume_text", resumeText);
  formData.append("interview_text", interviewText); // اضافه کردن متن مصاحبه

  const webhookUrl = "https://pmrecruitment.darkube.app/webhook/upload-files";

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    document.getElementById("resume-analysis").innerText =
      result.resume_analysis || "نتیجه‌ای برای تحلیل رزومه یافت نشد.";
    // خط زیر حذف شده است (تحلیل فرم مصاحبه اولیه)
    document.getElementById("interview-scenario").innerText =
      result.interview_scenario || "سناریوی مصاحبه‌ای یافت نشد.";

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
    document.getElementById("interview-scenario").innerText = ""; // پاک کردن برای نمایش خطا
  }
});