document.getElementById('upload-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const candidateName = document.getElementById('candidate-name').value;
  const resumeFile = document.getElementById('resume-file').files[0];
  const interviewFile = document.getElementById('interview-file').files[0];

  if (!candidateName || !resumeFile || !interviewFile) {
    alert("لطفاً همه‌ی فیلدها را پر کنید.");
    return;
  }

  const formData = new FormData();
  formData.append('candidate_name', candidateName);
  formData.append('resume_file', resumeFile);
  formData.append('interview_file', interviewFile);

  try {
    const response = await fetch('http://localhost:5678/webhook/resume-upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`خطا: ${response.statusText}`);
    }

    const result = await response.json();

    document.getElementById('resume-analysis').textContent = result.resume_analysis || "نتیجه‌ای دریافت نشد.";
    document.getElementById('interview-analysis').textContent = result.interview_analysis || "نتیجه‌ای دریافت نشد.";
    document.getElementById('interview-scenario').textContent = result.interview_scenario || "نتیجه‌ای دریافت نشد.";
  } catch (error) {
    alert(`خطا در برقراری ارتباط با n8n: ${error}`);
  }
});
