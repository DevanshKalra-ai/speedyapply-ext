// SpeedyApply — sidebar.js
// Injects and manages the floating sidebar using Shadow DOM

let sidebarHost = null;
let shadowRoot = null;
let isMinimized = false;
let isLogged = false;

function injectSidebar(portal, jobContext) {
  if (sidebarHost) return; // already injected

  sidebarHost = document.createElement('div');
  sidebarHost.id = 'speedyapply-sidebar';
  // Position the host element directly — don't rely on :host CSS loading
  sidebarHost.style.cssText = 'position:fixed;top:80px;right:16px;z-index:2147483647;';
  shadowRoot = sidebarHost.attachShadow({ mode: 'open' });

  // Inline CSS directly — avoids async <link> loading issues in Shadow DOM
  const style = document.createElement('style');
  style.textContent = getSidebarCSS();
  shadowRoot.appendChild(style);

  // Build panel HTML
  const panel = document.createElement('div');
  panel.className = 'sa-panel';
  panel.innerHTML = buildSidebarHTML(portal, jobContext);
  shadowRoot.appendChild(panel);

  document.body.appendChild(sidebarHost);
  bindSidebarEvents(portal, jobContext);
}

function buildSidebarHTML(portal, ctx) {
  const portalName = (PORTALS[portal]?.name) || 'Job Site';
  return `
    <div class="sa-minimized-badge">⚡</div>
    <div class="sa-header">
      <div class="sa-header-left">
        <span class="sa-logo">⚡ SpeedyApply</span>
        <span class="sa-portal-badge">${portalName}</span>
      </div>
      <div class="sa-header-actions">
        <button class="sa-icon-btn" id="sa-minimize" title="Minimize">−</button>
        <button class="sa-icon-btn" id="sa-close" title="Close">×</button>
      </div>
    </div>
    <div class="sa-content">
      <button class="sa-fill-btn" id="sa-fill-btn">
        ⚡ Autofill Now
      </button>
      <div class="sa-status" id="sa-status"></div>
      <div class="sa-ai-section" id="sa-ai-section">
        <div class="sa-ai-title">AI Suggestions</div>
        <div id="sa-ai-cards"></div>
      </div>
      <button class="sa-log-btn" id="sa-log-btn">+ Log Application</button>
    </div>
  `;
}

function bindSidebarEvents(portal, jobContext) {
  const panel = shadowRoot.querySelector('.sa-panel');

  // Minimize
  shadowRoot.querySelector('#sa-minimize').addEventListener('click', () => {
    isMinimized = true;
    panel.classList.add('minimized');
  });

  // Expand when minimized badge is clicked
  panel.addEventListener('click', e => {
    if (isMinimized && e.target === panel) {
      isMinimized = false;
      panel.classList.remove('minimized');
    }
  });
  shadowRoot.querySelector('.sa-minimized-badge').addEventListener('click', () => {
    isMinimized = false;
    panel.classList.remove('minimized');
  });

  // Close
  shadowRoot.querySelector('#sa-close').addEventListener('click', () => {
    sidebarHost.remove();
    sidebarHost = null;
    shadowRoot = null;
  });

  // Autofill button
  shadowRoot.querySelector('#sa-fill-btn').addEventListener('click', () => {
    triggerFill(portal, jobContext);
  });

  // Log application
  shadowRoot.querySelector('#sa-log-btn').addEventListener('click', () => {
    if (isLogged) return;
    logApplication(portal, jobContext);
  });
}

async function triggerFill(portal, jobContext) {
  const fillBtn = shadowRoot.querySelector('#sa-fill-btn');
  const statusEl = shadowRoot.querySelector('#sa-status');

  fillBtn.disabled = true;
  fillBtn.innerHTML = `<span class="sa-spinner"></span> Filling...`;
  setStatus('filling', 'Detecting form fields...');
  resetFillLog();

  try {
    const [profileResp, resumeResp] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_PROFILE' }),
      chrome.runtime.sendMessage({ type: 'GET_RESUME' }),
    ]);
    const profile = profileResp.profile;
    const resume = resumeResp?.resume || null;

    if (!profile) {
      setStatus('error', 'No profile found — please fill your profile first.');
      fillBtn.disabled = false;
      fillBtn.innerHTML = '⚡ Autofill Now';
      return;
    }

    // Upload resume to any file input found on the page
    if (resume) uploadResumeToFileInputs(resume);

    let results;
    switch (portal) {
      case 'greenhouse':      results = await fillGreenhouse(profile); break;
      case 'ashby':           results = await fillAshby(profile); break;
      case 'lever':           results = await fillLever(profile); break;
      case 'workable':        results = await fillWorkable(profile); break;
      case 'smartrecruiters': results = await fillSmartRecruiters(profile); break;
      case 'breezy':          results = await fillBreezy(profile); break;
      case 'jobvite':         results = await fillJobvite(profile); break;
      case 'personio':        results = await fillPersonio(profile); break;
      case 'recruitee':       results = await fillRecruitee(profile); break;
      default:                results = await fillGeneric(profile); break;
    }

    if (results.error) {
      setStatus('error', results.error);
    } else if (results.filled === 0) {
      setStatus('partial', 'No fields detected on this page. Try scrolling to the form.');
    } else {
      setStatus('done', `Done — ${results.filled} field${results.filled !== 1 ? 's' : ''} filled.`);
      // AI dropdown fill + open-text scan after successful fill
      await runAiDropdownFill(jobContext);
      showFillLog();
      await runAiScan(jobContext);
    }
  } catch (err) {
    console.error('[SpeedyApply] Fill error:', err);
    setStatus('error', `Error: ${err.message}`);
  }

  fillBtn.disabled = false;
  fillBtn.innerHTML = '⚡ Autofill Now';
}

function showFillLog() {
  const log = window.__speedyFillLog || [];
  if (!log.length) return;

  // Console output for debugging
  console.group('[SpeedyApply] Fields filled');
  console.table(log.map(e => ({ Field: e.label, Value: e.value, Source: e.source })));
  console.groupEnd();

  // Sidebar collapsible list
  const existing = shadowRoot.querySelector('#sa-fill-log');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = 'sa-fill-log';
  wrap.className = 'sa-fill-log';

  const toggle = document.createElement('button');
  toggle.className = 'sa-fill-log-toggle';
  toggle.innerHTML = `<span>&#9656;</span> ${log.length} field${log.length !== 1 ? 's' : ''} filled — see details`;
  wrap.appendChild(toggle);

  const list = document.createElement('div');
  list.className = 'sa-fill-log-list';
  list.style.display = 'none';
  log.forEach(({ label, value, source }) => {
    const row = document.createElement('div');
    row.className = 'sa-fill-log-row';
    const src = source === 'ai' ? ' <span class="sa-fill-log-ai">AI</span>' : '';
    row.innerHTML = `<span class="sa-fill-log-label">${escHtml(label)}</span>${src}<span class="sa-fill-log-value">${escHtml(value)}</span>`;
    list.appendChild(row);
  });
  wrap.appendChild(list);

  toggle.addEventListener('click', () => {
    const open = list.style.display !== 'none';
    list.style.display = open ? 'none' : 'block';
    toggle.querySelector('span').innerHTML = open ? '&#9656;' : '&#9662;';
  });

  shadowRoot.querySelector('.sa-content').appendChild(wrap);
}

function setStatus(type, message) {
  const statusEl = shadowRoot.querySelector('#sa-status');
  statusEl.className = `sa-status show ${type}`;
  statusEl.textContent = message;
}

// Placeholder values that mean "nothing selected yet"
const DROPDOWN_PLACEHOLDERS = new Set([
  '', 'select', 'select...', 'select one', 'choose', 'choose one',
  'please select', 'please choose', '-- select --', '- select -',
  'none', 'n/a', '0', '-1',
]);

function isDropdownEmpty(sel) {
  const val = (sel.value || '').toLowerCase().trim();
  if (DROPDOWN_PLACEHOLDERS.has(val)) return true;
  // Also treat it as empty if the selected option text looks like a placeholder
  const selectedText = (sel.options[sel.selectedIndex]?.text || '').toLowerCase().trim();
  return DROPDOWN_PLACEHOLDERS.has(selectedText) || selectedText.startsWith('select') || selectedText.startsWith('choose') || selectedText.startsWith('--');
}

// Upload stored resume to all file inputs on the page using the DataTransfer API.
// Works on Ashby, Greenhouse, Lever, and any portal using a native <input type="file">.
function uploadResumeToFileInputs(resume) {
  if (!resume?.base64 || !resume?.name) return;

  // Deep query covers SmartRecruiters OneClick (shadow DOM) + standard inputs.
  const inputs = typeof deepQuerySelectorAll === 'function'
    ? deepQuerySelectorAll('input[type="file"]')
    : [...document.querySelectorAll('input[type="file"]')];
  if (!inputs.length) return;

  // Convert base64 → Blob → File
  const byteChars = atob(resume.base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: resume.mimeType || 'application/pdf' });
  const file = new File([blob], resume.name, { type: resume.mimeType || 'application/pdf' });

  inputs.forEach(input => {
    // Skip inputs that already have a file
    if (input.files && input.files.length > 0) return;
    // Skip non-resume file inputs (avatar, cover image, etc.)
    const accept = input.accept || '';
    const id = (input.id + ' ' + input.name).toLowerCase();
    const isResumeInput = /resume|cv|document|upload/i.test(id)
      || accept.includes('pdf')
      || accept.includes('.doc')
      || input.id === '_systemfield_resume';
    if (!isResumeInput && accept && !accept.includes('*')) return;

    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
  });
}

async function runAiDropdownFill(jobContext) {
  const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (!settings?.settings?.aiEnabled) return;

  // Labels that belong to standard profile fields — never send to AI
  const PROFILE_FIELD_RE = /first.?name|last.?name|full.?name|^name$|email|phone|mobile|telephone|linkedin|github|portfolio|personal.?site|website|current.?company|employer|organization|job.?title|current.?title|position|address|street|city|state|province|zip|postal|country|salary|compensation|google.?drive|dropbox|resume.*link|resume.*url|attach.*link/i;

  const dropdowns = [];

  // Native <select> elements
  document.querySelectorAll('select').forEach(sel => {
    if (!isVisible(sel) || sel.disabled || !isDropdownEmpty(sel)) return;
    const label = getLabelText(sel);
    if (!label) return;
    if (PROFILE_FIELD_RE.test(label)) return; // already handled by profile autofill
    const options = Array.from(sel.options)
      .map(o => o.text.trim())
      .filter(t => t && !DROPDOWN_PLACEHOLDERS.has(t.toLowerCase()) && t !== '-');
    if (options.length < 2) return;
    dropdowns.push({ label, options, el: sel, type: 'select' });
  });

  // Custom dropdowns (role=combobox / aria-haspopup) — only true option-pickers, not text inputs
  document.querySelectorAll('[role="combobox"][aria-haspopup="listbox"], [role="listbox"]').forEach(trigger => {
    if (!isVisible(trigger) || trigger.disabled) return;
    if (trigger.tagName === 'INPUT' || trigger.tagName === 'TEXTAREA') return; // skip text inputs with combobox role
    const current = (trigger.getAttribute('aria-label') || trigger.textContent || '').trim().toLowerCase();
    if (current && !DROPDOWN_PLACEHOLDERS.has(current) && !current.startsWith('select') && !current.startsWith('choose')) return;
    const label = getLabelText(trigger);
    if (!label || PROFILE_FIELD_RE.test(label)) return;
    const listboxId = trigger.getAttribute('aria-owns') || trigger.getAttribute('aria-controls');
    const listbox = listboxId ? document.getElementById(listboxId) : null;
    const options = listbox
      ? Array.from(listbox.querySelectorAll('[role="option"]')).map(o => o.textContent.trim()).filter(Boolean)
      : [];
    if (options.length < 2) return; // need real options to send to AI
    dropdowns.push({ label, options, el: trigger, type: 'custom' });
  });

  // Radio button groups — collect unanswered groups not covered by profile rules
  const radioGroupsSeen = new Set();
  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    const name = radio.getAttribute('name');
    if (!name || radioGroupsSeen.has(name)) return;
    radioGroupsSeen.add(name);

    // Collect all radios in this group
    const group = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`));
    if (group.some(r => r.checked)) return; // already answered
    if (!group.every(r => isVisible(r))) return; // hidden group

    const groupLabel = getRadioGroupLabel(group[0], document);
    if (!groupLabel || PROFILE_FIELD_RE.test(groupLabel)) return;
    // Skip EEO/diversity survey labels that should come from profile
    if (/\bgender\b|disability|veteran|military|ethnicit|age|communit/i.test(groupLabel)) return;

    const options = group.map(r => getRadioOptionLabel(r, document)).filter(Boolean);
    if (options.length < 2) return;

    dropdowns.push({ label: groupLabel, options, radios: group, type: 'radio' });
  });

  if (!dropdowns.length) return;

  const payload = dropdowns.map(d => ({ label: d.label, options: d.options }));
  const resp = await chrome.runtime.sendMessage({
    type: 'FILL_DROPDOWNS_AI',
    payload: { dropdowns: payload, fieldContext: jobContext },
  });

  if (!resp?.selections || resp.error) return;

  let filled = 0;
  for (const { label, el, type, radios } of dropdowns) {
    const chosen = resp.selections[label];
    if (!chosen) continue;

    window.__speedyAIFilling = true;
    if (type === 'select') {
      if (setSelectValue(el, chosen)) filled++;
    } else if (type === 'radio') {
      const chosenLower = chosen.toLowerCase();
      const target = radios.find(r => {
        const optLabel = getRadioOptionLabel(r, document).toLowerCase();
        return optLabel === chosenLower || optLabel.startsWith(chosenLower) || chosenLower.startsWith(optLabel);
      });
      if (target && !target.checked) {
        target.focus();
        target.click();
        target.checked = true;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        appendFillLog(label, chosen, 'ai');
        filled++;
      }
    } else {
      const ok = await fillCustomDropdown(el, chosen);
      if (ok) {
        filled++;
        appendFillLog(label, chosen, 'ai');
      }
    }
    window.__speedyAIFilling = false;
  }

  if (filled > 0) {
    const statusEl = shadowRoot.querySelector('#sa-status');
    const current = statusEl?.textContent || '';
    setStatus('done', current + ` +${filled} AI dropdown${filled !== 1 ? 's' : ''} filled.`);
  }
}

async function runAiScan(jobContext) {
  const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (!settings?.settings?.aiEnabled) return;

  const questions = detectOpenTextQuestions();
  if (!questions.length) return;

  const aiSection = shadowRoot.querySelector('#sa-ai-section');
  const aiCards = shadowRoot.querySelector('#sa-ai-cards');
  aiSection.classList.add('show');
  aiCards.innerHTML = '';

  // Create all cards immediately with "Generating..." spinners,
  // then fire all API requests in parallel — page is never blocked waiting for AI.
  const cardList = questions.slice(0, 5).map(q => {
    const card = document.createElement('div');
    card.className = 'sa-ai-card';
    card.innerHTML = `
      <div class="sa-ai-question">${escHtml(q.labelText)}</div>
      <div class="sa-ai-loading"><span class="sa-spinner"></span> Generating...</div>
    `;
    aiCards.appendChild(card);
    return { q, card };
  });

  // Fire all requests in parallel — each resolves independently
  cardList.forEach(({ q, card }) => {
    chrome.runtime.sendMessage({
      type: 'GENERATE_AI_RESPONSE',
      payload: { question: q.labelText, fieldContext: jobContext },
    }).then(resp => {
      if (resp?.error || !resp?.answer) {
        const isKeyMissing = resp?.error && /key|api|config/i.test(resp.error);
        card.innerHTML = `
          <div class="sa-ai-question">${escHtml(q.labelText)}</div>
          <div style="font-size:11px;color:#EF4444;padding:4px 0">
            ${isKeyMissing ? 'Add a Gemini API key in Settings to get AI suggestions.' : escHtml(resp?.error || 'No response received.')}
          </div>`;
        if (isKeyMissing) { aiSection.classList.remove('show'); aiCards.innerHTML = ''; }
        return;
      }

      const answer = resp.answer.trim();
      if (!answer) {
        card.innerHTML = `<div class="sa-ai-question">${escHtml(q.labelText)}</div><div style="font-size:11px;color:#9CA3AF">No answer generated. Try Regenerate.</div>`;
        return;
      }

      card.innerHTML = `
        <div class="sa-ai-question">${escHtml(q.labelText)}</div>
        <div class="sa-ai-answer">${escHtml(answer)}</div>
        <div class="sa-ai-actions">
          <button class="sa-ai-btn sa-ai-btn-accept">Accept</button>
          <button class="sa-ai-btn sa-ai-btn-regen">Regenerate</button>
        </div>
      `;

      card.querySelector('.sa-ai-btn-accept').addEventListener('click', () => {
        if (q.el && answer) {
          triggerNativeInput(q.el, answer);
          card.innerHTML = `<div class="sa-ai-question">${escHtml(q.labelText)}</div><div style="font-size:12px;color:#10B981;font-weight:600">Applied ✓</div>`;
        }
      });

      card.querySelector('.sa-ai-btn-regen').addEventListener('click', () => {
        card.querySelector('.sa-ai-actions').outerHTML = `<div class="sa-ai-loading"><span class="sa-spinner"></span> Regenerating...</div>`;
        chrome.runtime.sendMessage({
          type: 'GENERATE_AI_RESPONSE',
          payload: { question: q.labelText, fieldContext: jobContext },
        }).then(r2 => {
          const loadingEl = card.querySelector('.sa-ai-loading');
          const newAnswer = r2?.answer ? r2.answer.trim() : '';
          if (!newAnswer) {
            if (loadingEl) {
              loadingEl.outerHTML = `<div style="font-size:11px;color:#EF4444;padding:4px 0">${escHtml(r2?.error || 'No answer generated. Try again.')}</div>`;
            }
            return;
          }
          const answerEl = card.querySelector('.sa-ai-answer');
          if (answerEl) answerEl.textContent = newAnswer;
          if (loadingEl) {
            loadingEl.outerHTML = `
              <div class="sa-ai-actions">
                <button class="sa-ai-btn sa-ai-btn-accept">Accept</button>
                <button class="sa-ai-btn sa-ai-btn-regen">Regenerate</button>
              </div>`;
            card.querySelector('.sa-ai-btn-accept').addEventListener('click', () => {
              if (q.el && newAnswer) {
                triggerNativeInput(q.el, newAnswer);
                card.innerHTML = `<div class="sa-ai-question">${escHtml(q.labelText)}</div><div style="font-size:12px;color:#10B981;font-weight:600">Applied ✓</div>`;
              }
            });
          }
        }).catch(() => {
          const loadingEl = card.querySelector('.sa-ai-loading');
          if (loadingEl) loadingEl.textContent = 'Regenerate failed.';
        });
      });

    }).catch(err => {
      card.innerHTML = `
        <div class="sa-ai-question">${escHtml(q.labelText)}</div>
        <div style="font-size:11px;color:#EF4444">Error: ${escHtml(err.message)}</div>
      `;
    });
  });
}

async function logApplication(portal, jobContext) {
  const logBtn = shadowRoot.querySelector('#sa-log-btn');
  const entry = {
    company: jobContext.company || extractCompanyFromPage(),
    role: jobContext.jobTitle,
    url: window.location.href,
    portal,
    source: 'manual',
  };
  await chrome.runtime.sendMessage({ type: 'LOG_APPLICATION', payload: entry });
  isLogged = true;
  logBtn.textContent = 'Logged';
  logBtn.classList.add('logged');
}

function extractCompanyFromPage() {
  const title = document.title.split(/[-|–]/).pop()?.trim() || '';
  return title;
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function getSidebarCSS() {
  return `
:host {
  all: initial;
  position: fixed;
  top: 80px;
  right: 16px;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.sa-panel {
  width: 300px;
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.08);
  overflow: hidden;
  transition: all 0.2s ease;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.sa-panel.minimized {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  cursor: pointer;
  overflow: hidden;
  border: none;
  box-shadow: 0 4px 12px rgba(79,70,229,0.4);
}

.sa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #4F46E5;
  color: white;
}
.sa-header-left { display: flex; align-items: center; gap: 8px; }
.sa-logo { font-size: 13px; font-weight: 700; }
.sa-portal-badge {
  font-size: 10px;
  background: rgba(255,255,255,0.2);
  padding: 2px 6px;
  border-radius: 99px;
}
.sa-header-actions { display: flex; gap: 4px; }
.sa-icon-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.8);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s;
}
.sa-icon-btn:hover { color: white; background: rgba(255,255,255,0.15); }

.sa-minimized-badge {
  display: none;
  width: 48px;
  height: 48px;
  background: #4F46E5;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  font-size: 20px;
}
.sa-panel.minimized .sa-minimized-badge { display: flex; }
.sa-panel.minimized .sa-header { display: none; }
.sa-panel.minimized .sa-content { display: none; }

.sa-content { padding: 12px; }

.sa-fill-btn {
  width: 100%;
  padding: 10px;
  background: #4F46E5;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.sa-fill-btn:hover { background: #4338CA; }
.sa-fill-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.sa-status {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  display: none;
}
.sa-status.show { display: block; }
.sa-status.filling { background: #EEF2FF; color: #4F46E5; }
.sa-status.done { background: #D1FAE5; color: #065F46; }
.sa-status.error { background: #FEE2E2; color: #991B1B; }
.sa-status.partial { background: #FEF3C7; color: #92400E; }

.sa-ai-section { margin-top: 12px; display: none; }
.sa-ai-section.show { display: block; }
.sa-ai-title {
  font-size: 11px;
  font-weight: 700;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.sa-ai-card {
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}
.sa-ai-question {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sa-ai-answer { font-size: 12px; color: #4B5563; line-height: 1.5; margin-bottom: 8px; }
.sa-ai-loading { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6B7280; }
.sa-ai-actions { display: flex; gap: 6px; }
.sa-ai-btn {
  flex: 1;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;
}
.sa-ai-btn:hover { opacity: 0.85; }
.sa-ai-btn-accept { background: #10B981; color: white; }
.sa-ai-btn-regen { background: #EEF2FF; color: #4F46E5; }

.sa-log-btn {
  width: 100%;
  margin-top: 10px;
  padding: 7px;
  background: none;
  color: #6B7280;
  border: 1px dashed #D1D5DB;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.sa-log-btn:hover { border-color: #4F46E5; color: #4F46E5; background: #EEF2FF; }
.sa-log-btn.logged { border-style: solid; border-color: #10B981; color: #065F46; background: #D1FAE5; cursor: default; }

.sa-fill-log { margin-top: 10px; border-top: 1px solid #E5E7EB; padding-top: 8px; }
.sa-fill-log-toggle {
  width: 100%; background: none; border: none; text-align: left;
  font-size: 11px; color: #6B7280; cursor: pointer; padding: 2px 0;
  display: flex; align-items: center; gap: 4px;
}
.sa-fill-log-toggle:hover { color: #4F46E5; }
.sa-fill-log-list {
  margin-top: 6px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  padding: 2px 0;
}
.sa-fill-log-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid #F3F4F6;
}
.sa-fill-log-row:last-child { border-bottom: none; }
.sa-fill-log-label { font-size: 11px; font-weight: 600; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sa-fill-log-value { font-size: 11px; color: #6B7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px; }
.sa-fill-log-ai { font-size: 9px; background: #EEF2FF; color: #4F46E5; border-radius: 3px; padding: 1px 5px; font-weight: 700; white-space: nowrap; }

@keyframes spin { to { transform: rotate(360deg); } }
.sa-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(79,70,229,0.3);
  border-top-color: #4F46E5;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
  `;
}

// Expose for use by content-main
function markApplicationLogged() {
  if (!shadowRoot) return;
  isLogged = true;
  const logBtn = shadowRoot.querySelector('#sa-log-btn');
  if (logBtn) { logBtn.textContent = 'Logged'; logBtn.classList.add('logged'); }
}
