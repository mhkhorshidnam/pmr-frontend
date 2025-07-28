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
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 10;
      const pdfRenderArea = document.getElementById('pdf-render-area');

      // پاک کردن محتوای قبلی و اضافه کردن محتوای جدید
      pdfRenderArea.innerHTML = '';
      const tempTitleDiv = document.createElement('div');
      tempTitleDiv.style.cssText = `
          text-align: right;
          direction: rtl;
          font-family: 'Vazirmatn', sans-serif;
          font-weight: 700;
          font-size: 1.4rem;
          margin-bottom: 10mm;
      `;
      tempTitleDiv.innerHTML = titleElement.innerHTML; // استفاده از innerHTML برای حفظ هرگونه تگ در عنوان (مثلاً bold)
      pdfRenderArea.appendChild(tempTitleDiv);

      const tempContentDiv = document.createElement('div');
      tempContentDiv.style.cssText = `
          direction: rtl;
          text-align: right;
          font-family: 'Vazirmatn', sans-serif;
          font-size: 0.9rem;
          line-height: 1.25;
      `;
      tempContentDiv.innerHTML = elementToPrint.innerHTML;
      pdfRenderArea.appendChild(tempContentDiv);

      // اضافه کردن استایل‌های ضروری Markdown به دیو پنهان
      const markdownStyles = document.createElement('style');
      markdownStyles.innerHTML = `
        body { font-family: 'Vazirmatn', sans-serif; direction: rtl; text-align: right; }
        h1, h2, h3, h4, h5, h6 { font-family: 'Vazirmatn', sans-serif; font-weight: 700; line-height: 1.2; margin-top: 0.8rem; margin-bottom: 0.4rem; color: #2C3E50; }
        p { font-family: 'Vazirmatn', sans-serif; line-height: 1.25; margin-bottom: 0.4rem; }
        ul, ol { padding-right: 1.2rem; margin-bottom: 0.4rem; }
        li { margin-bottom: 0.2rem; line-height: 1.25; }
        strong { font-weight: 700; }
      `;
      pdfRenderArea.appendChild(markdownStyles); // اضافه کردن استایل به pdfRenderArea

      const canvas = await html2canvas(pdfRenderArea, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        foreignObjectRendering: true
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190;
      const pageHeight = pdf.internal.pageSize.height;
      const imgHeight = canvas.height * imgWidth / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight; // اصلاح: از موقعیت اولیه عکس کم نمی‌کنیم

      while (heightLeft >= 0) {
        position = -pageHeight + heightLeft; // اصلاح: محاسبه موقعیت برای صفحات بعدی
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${titleElement.innerText.replace(/\s+/g, '-')}.pdf`);

      pdfRenderArea.innerHTML = ''; // پاک کردن محتوای دیو پنهان پس از استفاده

      this.disabled = false;
      this.innerText = 'دانلود PDF';
    }
  });
});