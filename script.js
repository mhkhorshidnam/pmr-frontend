document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nameInput = document.getElementById('candidate-name');
  const resumeInput = document.getElementById('resume-file');
  const formInput = document.getElementById('interview-file');

  const resumeBox = document.getElementById('resume-analysis');
  const interviewBox = document.getElementById('interview-analysis');
  const scenarioBox = document.getElementById('interview-scenario');

  const successMessage = document.getElementById('upload-success');
  const successSound = document.getElementById('success-sound');

  if (!nameInput.value || !resumeInput.files[0] || !formInput.files[0]) {
    alert('لطفاً نام متقاضی، رزومه و فرم را وارد کنید.');
    return;
  }

  const formData = new FormData();
  formData.append('candidate_name', nameInput.value);
  formData.append('resume', resumeInput.files[0]);
  formData.append('form', formInput.files[0]);

  resumeBox.textContent = 'در حال تحلیل رزومه...';
  interviewBox.textContent = 'در حال بررسی فرم ارزیابی...';
  scenarioBox.textContent = 'در حال ساخت سناریو...';

  try {
    const response = await fetch('http://localhost:5678/webhook/resume-upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`خطا: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    resumeBox.textContent = result.resume_analysis?.response || 'نتیجه‌ای برای تحلیل رزومه یافت نشد.';
    interviewBox.textContent = 'فرم بررسی شد.';
    scenarioBox.textContent = result.interview_scenario?.response || 'سناریویی دریافت نشد.';

    // Show success message with animation and sound
    successMessage.classList.remove('hidden');
    successMessage.classList.add('show');
    successSound.play();

    setTimeout(() => {
      successMessage.classList.remove('show');
    }, 3000);

  } catch (error) {
    resumeBox.textContent = '';
    interviewBox.textContent = '';
    scenarioBox.textContent = `خطا: ${error.message}`;
  }
});