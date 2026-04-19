// SpeedyApply — popup.js
// Tab routing and popup initialization

let currentTab = 'profile';

document.addEventListener('DOMContentLoaded', async () => {
  // Restore last active tab
  const stored = await chrome.storage.local.get('speedyapply_active_tab');
  const lastTab = stored.speedyapply_active_tab || 'profile';
  switchTab(lastTab);

  // Wire tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
});

async function switchTab(tabName) {
  currentTab = tabName;
  await chrome.storage.local.set({ speedyapply_active_tab: tabName });

  // Update tab button states
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const container = document.getElementById('view-container');
  container.innerHTML = '';

  switch (tabName) {
    case 'profile':
      await renderProfileTab(container);
      break;
    case 'tracker':
      await renderTrackerTab(container);
      break;
    case 'settings':
      await renderSettingsTab(container);
      break;
  }
}

// ---- Toast ----
let toastTimer;
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.add('hidden'); }, 2800);
}
