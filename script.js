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

        const dataToDisplay = Array.isArray(result) && result.length > 0 ? result[0] : result;

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

document.querySelectorAll(".download-button").forEach(button => {
  button.addEventListener("click", async function() {
    const targetId = this.dataset.target;
    const elementToPrint = document.getElementById(targetId);
    const titleElement = this.previousElementSibling;

    if (elementToPrint && titleElement) {
      this.disabled = true;
      this.innerText = 'در حال ساخت PDF...';

      const { jsPDF } = window.jspdf;
      // تنظیم ابعاد PDF برای A4 استاندارد (210x297 mm)
      const pdf = new jsPDF('p', 'mm', 'a4'); 
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10; // حاشیه 10 میلی‌متر از هر طرف در PDF نهایی

      const pdfRenderArea = document.getElementById('pdf-render-area');

      // کپی کردن محتوا و استایل‌ها به یک دیو موقت
      pdfRenderArea.innerHTML = ''; // پاک کردن محتوای قبلی

      // ایجاد یک کانتینر موقت برای رندرینگ دقیق‌تر توسط html2canvas
      const tempContentContainer = document.createElement('div');
      tempContentContainer.style.cssText = `
          width: ${pdfWidth - (2 * margin)}mm; /* عرض محتوا در PDF */
          padding: 0; /* padding توسط margin مدیریت می‌شود */
          box-sizing: border-box;
          direction: rtl;
          text-align: right;
          font-family: 'Vazirmatn', sans-serif !important;
          font-size: 0.9rem; /* فونت سایز پایه برای محتوا */
          line-height: 1.25;
          background-color: white; /* پس زمینه سفید برای رندر */
      `;

      // اضافه کردن عنوان به کانتینر موقت
      const tempTitleDiv = document.createElement('h3');
      tempTitleDiv.style.cssText = `
          text-align: right;
          direction: rtl;
          font-family: 'Vazirmatn', sans-serif !important;
          font-weight: 700;
          font-size: 1.4rem; /* سایز عنوان در PDF */
          margin-bottom: 5mm; /* فاصله بعد از عنوان */
          margin-top: 5mm; /* فاصله قبل از عنوان */
      `;
      tempTitleDiv.innerHTML = titleElement.innerHTML;
      tempContentContainer.appendChild(tempTitleDiv);

      // اضافه کردن محتوای اصلی (result-box) به کانتینر موقت
      const tempResultBoxContent = document.createElement('div');
      tempResultBoxContent.style.cssText = `
          direction: rtl;
          text-align: right;
          font-family: 'Vazirmatn', sans-serif !important;
          font-size: 0.9rem;
          line-height: 1.25;
      `;
      tempResultBoxContent.innerHTML = elementToPrint.innerHTML;
      tempContentContainer.appendChild(tempResultBoxContent);

      // اضافه کردن استایل‌های Markdown به کانتینر موقت
      const markdownStyles = document.createElement('style');
      markdownStyles.innerHTML = `
        body { font-family: 'Vazirmatn', sans-serif !important; direction: rtl; text-align: right; }
        h1, h2, h3, h4, h5, h6 { font-family: 'Vazirmatn', sans-serif !important; font-weight: 700; line-height: 1.2; margin-top: 0.8rem; margin-bottom: 0.4rem; color: #2C3E50; text-align: right; }
        p { font-family: 'Vazirmatn', sans-serif !important; line-height: 1.25; margin-bottom: 0.4rem; text-align: right; }
        ul, ol { padding-right: 1.5rem; margin-left: 0; margin-bottom: 0.4rem; list-style-position: inside; text-align: right; }
        li { margin-bottom: 0.2rem; line-height: 1.25; text-align: right; }
        strong { font-family: 'Vazirmatn', sans-serif !important; font-weight: 700; font-size: 0.95rem; display: inline; } /* سایز فونت بولد عادی */
        em { font-family: 'Vazirmatn', sans-serif !important; font-weight: 700; }
        /* اطمینان از شکست کلمات طولانی برای محتوای داخل PDF */
        .result-box pre, .result-box code {
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
        }
      `;
      tempContentContainer.appendChild(markdownStyles);

      pdfRenderArea.appendChild(tempContentContainer); // اضافه کردن کانتینر موقت به pdfRenderArea

      // تأخیر کوچک برای اطمینان از اعمال کامل استایل‌ها قبل از رندر به canvas
      await new Promise(resolve => setTimeout(resolve, 300)); // افزایش تأخیر برای اطمینان بیشتر

      // رندر کردن pdfRenderArea به Canvas
      const canvas = await html2canvas(pdfRenderArea, {
        scale: 2, // برای کیفیت بهتر
        useCORS: true,
        logging: true, // فعال کردن لاگ برای دیباگ
        allowTaint: true,
        foreignObjectRendering: true // برای رندرینگ بهتر HTML پیچیده
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pdfWidth - (2 * margin); // عرض تصویر در PDF
      const imgHeight = canvas.height * imgWidth / canvas.width;

      let heightLeft = imgHeight;
      let position = margin; // شروع از margin بالا

      // اضافه کردن اولین صفحه
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - position); // از ارتفاع باقی مانده صفحه فعلی کم کن

      // اضافه کردن صفحات بعدی در صورت نیاز
      while (heightLeft > 0) {
        position = - (imgHeight - (pdfHeight - margin - heightLeft)); // محاسبه موقعیت برای برش تصویر
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight; // از ارتفاع کل باقی مانده، ارتفاع یک صفحه را کم کن
      }

      pdf.save(`${titleElement.innerText.replace(/\s+/g, '-')}.pdf`);

      pdfRenderArea.innerHTML = ''; // پاک کردن محتوای دیو پنهان

      this.disabled = false;
      this.innerText = 'دانلود PDF';
    }
  });
});