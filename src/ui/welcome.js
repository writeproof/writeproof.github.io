// Welcome panel for first-time visitors

export function initWelcome() {
  const welcomeBackdrop = document.getElementById('welcome-backdrop');

  function openWelcome() {
    welcomeBackdrop.style.display = 'flex';
  }

  function closeWelcome() {
    welcomeBackdrop.style.display = 'none';
    localStorage.setItem('writeproof_welcomed', '1');
  }

  document.getElementById('btn-info').addEventListener('click', openWelcome);
  document.getElementById('btn-start-writing').addEventListener('click', closeWelcome);

  welcomeBackdrop.addEventListener('click', (e) => {
    if (e.target === welcomeBackdrop) closeWelcome();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && welcomeBackdrop.style.display !== 'none') {
      closeWelcome();
    }
  });

  // Show on first visit
  if (!localStorage.getItem('writeproof_welcomed')) {
    openWelcome();
  }
}
