// آدرس وب‌هوک n8n روی Darkube
const API_URL = "https://pmrecruitment.darkube.app/webhook/recruit/analyze-text";

// گرفتن متن از PDF با pdf.js
async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textContent = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    const pageText = text.items.map(item => item.str).join(" ");
    textContent += pageText + "\n";
  }
  return textContent;
}

// آپدیت نوار پیشرفت
function updateProgress(percent) {
  const fill = document.getElementById("upload-progress-fill");
  const text = document.getElementById("upload-progress-text");
  fill.style.width = percent + "%";
  text.textContent = percent + "%";
}

// هندل کردن فرم
document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const candidateName = document.getElementById("candidate-name").value.trim();
  const resumeFile = document.getElementById("resume-file").files[0];
  const interviewFile = document.getElementById("interview-file").files[0];

  if (!candidateName || !resumeFile || !interviewFile) {
    alert("لطفاً همه فیلدها را پر کنید.");
    return;
  }

  try {
    document.getElementById("upload-progress-container").classList.remove("hidden");
    updateProgress(10);

    const resumeText = await extractTextFromPDF(resumeFile);
    updateProgress(40);
    const interviewText = await extractTextFromPDF(interviewFile);
    updateProgress(70);

    const body = {
      candidate_name: candidateName,
      resume_text: resumeText,
      interview_text: interviewText
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error("خطا در ارتباط با سرور n8n");

    const data = await response.json();
    updateProgress(100);

    document.getElementById("resume-analysis").innerText =
      JSON.stringify(data.resume_analysis, null, 2);

    document.getElementById("interview-scenario").innerText =
      JSON.stringify(data.interview_scenario, null, 2);

    const successMsg = document.getElementById("upload-success");
    successMsg.classList.remove("hidden");
    successMsg.classList.add("show");
    setTimeout(() => successMsg.classList.remove("show"), 3000);

    document.getElementById("success-sound").play();

  } catch (error) {
    console.error(error);
    alert("خطایی رخ داد: " + error.message);
  } finally {
    setTimeout(() => {
      updateProgress(0);
      document.getElementById("upload-progress-container").classList.add("hidden");
    }, 3000);
  }
});
