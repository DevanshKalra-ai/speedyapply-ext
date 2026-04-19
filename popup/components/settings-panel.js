// SpeedyApply — settings-panel.js
// Settings tab rendering and logic

async function renderSettingsTab(container) {
  const settings = await getSettings();
  const apiKey = await getApiKey();
  const maskedKey = apiKey ? '••••••••' + apiKey.slice(-4) : '';

  container.innerHTML = `
    <div class="settings-section">
      <h3>Gemini API Key</h3>
      <div class="api-key-row">
        <input type="password" id="api-key-input" placeholder="AIza..." value="${maskedKey}" autocomplete="off" />
        <button class="btn btn-secondary" id="save-api-key">Save</button>
      </div>
      <div class="api-status" id="api-status"></div>
      <div style="margin-top:8px">
        <button class="btn btn-secondary" id="test-api-key" ${!apiKey ? 'disabled' : ''}>Test API Key</button>
      </div>
      <div style="margin-top:6px;font-size:11px;color:#6B7280">Your key is stored locally and never sent to our servers. Used only for AI-generated responses.</div>
    </div>

    <div class="settings-section">
      <h3>Autofill Settings</h3>
      ${buildToggleRow('autofillEnabled', 'Enable Autofill', 'Automatically detect and fill job application forms', settings.autofillEnabled)}
      ${buildToggleRow('aiEnabled', 'AI Suggestions', 'Show AI-generated answer suggestions for open-text questions', settings.aiEnabled)}
    </div>

    <div class="settings-section">
      <h3>Data</h3>
      <button class="btn btn-danger btn-full" id="clear-data">Clear All Data</button>
      <div style="margin-top:6px;font-size:11px;color:#6B7280;text-align:center">This will delete your profile, tracker history, and settings.</div>
    </div>

    <div style="text-align:center;margin-top:16px;font-size:11px;color:#9CA3AF">
      SpeedyApply v1.0.0
    </div>
  `;

  // API Key save
  const keyInput = container.querySelector('#api-key-input');
  const statusEl = container.querySelector('#api-status');

  container.querySelector('#save-api-key').addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key || key.startsWith('•')) return showToast('Enter a new API key to save', 'error');
    await chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', payload: { key } });
    keyInput.value = '••••••••' + key.slice(-4);
    container.querySelector('#test-api-key').disabled = false;
    showToast('API key saved', 'success');
  });

  // Test API Key
  container.querySelector('#test-api-key').addEventListener('click', async () => {
    statusEl.textContent = 'Testing...';
    statusEl.className = 'api-status';
    const resp = await chrome.runtime.sendMessage({ type: 'GET_API_KEY' });
    const result = await chrome.runtime.sendMessage({ type: 'TEST_API_KEY', payload: { key: resp.key } });
    if (result.valid) {
      statusEl.textContent = 'API key is valid';
      statusEl.className = 'api-status valid';
    } else {
      statusEl.textContent = 'Invalid API key — check and try again';
      statusEl.className = 'api-status invalid';
    }
  });

  // Toggles
  container.querySelectorAll('.toggle input').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const current = await getSettings();
      current[toggle.name] = toggle.checked;
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: current });
      showToast('Settings saved');
    });
  });

  // Clear data
  container.querySelector('#clear-data').addEventListener('click', async () => {
    if (!confirm('Delete all your data? This cannot be undone.')) return;
    await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' });
    showToast('All data cleared');
    // Re-render settings (will show blank)
    setTimeout(() => renderSettingsTab(container), 500);
  });
}

function buildToggleRow(name, label, description, checked) {
  return `
    <div class="toggle-row">
      <div>
        <div class="toggle-label">${label}</div>
        <div class="toggle-desc">${description}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" name="${name}" ${checked ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;
}
