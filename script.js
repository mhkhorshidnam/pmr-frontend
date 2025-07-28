document.getElementById("upload-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  console.log("Form submission initiated.");

  // عناصر نوار پیشرفت
  const progressBarContainer = document.getElementById("upload-progress-container");
  const progressBarFill = document.getElementById("upload-progress-fill");
  const progressBarText = document.getElementById("upload-progress-text");
  const submitButton = document.querySelector("#upload-form button[type='submit']");

  // بازنشانی و نمایش نوار پیشرفت
  progressBarFill.style.width = '0%';
  progressBarText.innerText = '0%';
  progressBarContainer.classList.remove("hidden");
  submitButton.disabled = true; // غیرفعال کردن دکمه ارسال

  // پاک کردن نتایج قبلی
  document.getElementById("resume-analysis").innerHTML = ""; // تغییر به innerHTML
  document.getElementById("interview-scenario").innerHTML = ""; // تغییر به innerHTML


  const candidateName = document.getElementById("candidate-name").value;
  const resumeFile = document.getElementById("resume-file").files[0];
  const interviewFile = document.getElementById("interview-file").files[0]; // تصحیح اینجا

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

  // استفاده از XMLHttpRequest برای ردیابی پیشرفت آپلود
  const xhr = new XMLHttpRequest();

  xhr.open("POST", webhookUrl);
  xhr.setRequestHeader('Cache-Control', 'no-store'); // برای جلوگیری از کش شدن

  // ردیابی پیشرفت آپلود
  xhr.upload.onprogress = function(event) {
    if (event.lengthComputable) {
      const percentComplete = (event.loaded / event.total) * 100;
      progressBarFill.style.width = percentComplete.toFixed(0) + '%';
      progressBarText.innerText = percentComplete.toFixed(0) + '%';
    }
  };

  xhr.onload = async function() {
    submitButton.disabled = false; // فعال کردن دکمه ارسال
    if (xhr.status >= 200 && xhr.status < 300) {
      // درخواست موفقیت آمیز بود
      progressBarContainer.classList.add("hidden"); // مخفی کردن نوار پیشرفت
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

        const dataToDisplay = Array.isArray(result) && result.length > 0 ? result[0] : result;

        // نمایش نتایج تحلیل با تبدیل Markdown به HTML
        document.getElementById("resume-analysis").innerHTML =
          marked.parse(dataToDisplay.resume_analysis) || "نتیجه‌ای برای تحلیل رزومه یافت نشد.";
        document.getElementById("interview-scenario").innerHTML =
          marked.parse(dataToDisplay.interview_scenario) || "سناریوی مصاحبه‌ای یافت نشد.";

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
        document.getElementById("resume-analysis").innerHTML = "خطا در پردازش پاسخ از سرور."; // تغییر به innerHTML
        document.getElementById("interview-scenario").innerHTML = ""; // تغییر به innerHTML
      }
    } else {
      // خطا در درخواست HTTP
      console.error("خطا در درخواست HTTP:", xhr.status, xhr.statusText, xhr.responseText);
      progressBarContainer.classList.add("hidden"); // مخفی کردن نوار پیشرفت
      document.getElementById("resume-analysis").innerHTML = "خطا در برقراری ارتباط با سرور: " + xhr.status; // تغییر به innerHTML
      document.getElementById("interview-scenario").innerHTML = ""; // تغییر به innerHTML
    }
  };

  xhr.onerror = function() {
    submitButton.disabled = false; // فعال کردن دکمه ارسال
    progressBarContainer.classList.add("hidden"); // مخفی کردن نوار پیشرفت
    console.error("خطای شبکه یا CORS رخ داد.");
    document.getElementById("resume-analysis").innerHTML = "خطای شبکه یا CORS رخ داد. لطفا دوباره تلاش کنید."; // تغییر به innerHTML
    document.getElementById("interview-scenario").innerHTML = ""; // تغییر به innerHTML
  };

  xhr.send(formData); // ارسال درخواست
});

document.querySelectorAll(".download-button").forEach(button => {
  button.addEventListener("click", async function() {
    const targetId = this.dataset.target;
    const elementToPrint = document.getElementById(targetId);
    const titleText = this.previousElementSibling.innerText; // عنوان h3 قبل از دکمه

    if (elementToPrint) {
      // دکمه دانلود را موقتاً غیرفعال کنید
      this.disabled = true;
      this.innerText = 'در حال ساخت PDF...';

      // استفاده از window.jsPDF (به دلیل بارگذاری umd.min.js)
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4'); // 'p' برای پرتره، 'mm' واحد، 'a4' سایز
      const margin = 10; // حاشیه از هر طرف به میلی‌متر

      // آماده‌سازی برای رندرینگ HTML به Canvas
      const canvas = await html2canvas(elementToPrint, {
        scale: 2, // برای کیفیت بهتر
        useCORS: true, // اگر تصاویر خارجی دارید، مفید است
        logging: false // غیرفعال کردن لاگ‌های html2canvas
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190; // عرض تصویر در PDF (با توجه به حاشیه 10mm از هر طرف برای A4 که 210mm است)
      const pageHeight = pdf.internal.pageSize.height;
      const imgHeight = canvas.height * imgWidth / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // اضافه کردن عنوان به PDF (اختیاری)
      pdf.setFontSize(16);
      pdf.text(titleText, pdf.internal.pageSize.getWidth() / 2, margin + 5, { align: "center" });
      position += 15; // فاصله برای عنوان

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - position;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${titleText.replace(/\s+/g, '-')}.pdf`); // ذخیره با نام مناسب
    }
    // دکمه دانلود را دوباره فعال کنید
    this.disabled = false;
    this.innerText = 'دانلود PDF';
  });
});