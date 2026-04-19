// SpeedyApply — utils.js
// Shared helper utilities

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sanitizeText(str) {
  if (!str) return '';
  return String(str).trim();
}

// Format a date string YYYY-MM or YYYY to a display string
function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 2) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
  }
  return parts[0];
}

// Get label text associated with a form element
// Checks every common pattern — returns lowercase string
function getLabelText(el) {
  // 1. aria-label (most explicit)
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim().toLowerCase();

  // 2. aria-labelledby — can reference multiple IDs
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy.split(' ')
      .map(id => document.getElementById(id)?.textContent?.trim() || '')
      .join(' ').trim();
    if (text) return text.toLowerCase();
  }

  // 3. <label for="id">
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent.trim().toLowerCase();
  }

  // 4. Closest wrapping <label>
  const closestLabel = el.closest('label');
  if (closestLabel) return closestLabel.textContent.trim().toLowerCase();

  // 5. title attribute
  const title = el.getAttribute('title');
  if (title?.trim()) return title.trim().toLowerCase();

  // 6. data-label / data-placeholder (common in custom component libraries)
  const dataLabel = el.getAttribute('data-label') || el.getAttribute('data-placeholder');
  if (dataLabel?.trim()) return dataLabel.trim().toLowerCase();

  // 7. Previous sibling element (div/span/label/p before input)
  const prev = el.previousElementSibling;
  if (prev && !['INPUT','SELECT','TEXTAREA','BUTTON'].includes(prev.tagName)) {
    const t = prev.textContent.trim();
    if (t && t.length < 120) return t.toLowerCase();
  }

  // 8. Parent's first non-input child text (React pattern: <div><span>Label</span><input/></div>)
  // Only use if parent has very few children (tight wrapper), to avoid grabbing unrelated text
  const parent = el.parentElement;
  if (parent && parent.children.length <= 4) {
    const labelChild = Array.from(parent.children).find(c =>
      c !== el &&
      ['SPAN','LABEL','LEGEND'].includes(c.tagName) &&
      c.textContent.trim().length < 80 &&
      !c.querySelector('input,select,textarea')
    );
    if (labelChild) return labelChild.textContent.trim().toLowerCase();
  }

  // 9. placeholder as last resort
  if (el.placeholder) return el.placeholder.toLowerCase();

  return '';
}

// Global fill log — reset before each fill pass, read by sidebar after
function resetFillLog() { window.__speedyFillLog = []; }
function appendFillLog(label, value, source) {
  if (!window.__speedyFillLog) window.__speedyFillLog = [];
  window.__speedyFillLog.push({
    label: (label || 'unknown').replace(/[*:]/g, '').trim().slice(0, 60),
    value: String(value || '').slice(0, 80),
    source: source || 'direct',
  });
}

// Dispatch native input and change events (required for React / Vue forms)
// Event sequence matches what a real user typing produces:
//   focus → focusin → beforeinput → [set value] → input → change
// NOTE: No blur — dispatching blur causes React to re-render and can clear
//       controlled inputs before the value is committed.
function triggerNativeInput(element, value) {
  if (!element || value === undefined || value === null || value === '') return;
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  );
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  );

  // 1. Focus (Formik / RHF track focus state)
  element.focus();
  element.dispatchEvent(new FocusEvent('focus',   { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

  // 2. beforeinput — React 18 uses this for reconciliation
  element.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true, cancelable: true,
    inputType: 'insertText', data: value,
  }));

  // 3. Set native value (bypasses React's synthetic onChange guard)
  // Only use the prototype setter on actual INPUT/TEXTAREA elements — calling it
  // on a div/span throws "Illegal invocation".
  if (element.tagName === 'TEXTAREA') {
    if (nativeTextareaSetter?.set) nativeTextareaSetter.set.call(element, value);
    else element.value = value;
  } else if (element.tagName === 'INPUT') {
    if (nativeSetter?.set) nativeSetter.set.call(element, value);
    else element.value = value;
  } else {
    // contenteditable or other custom element — set directly
    element.value = value;
  }

  // 4. input + change — React 17/18 reconciles state here
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true, cancelable: true,
    inputType: 'insertText', data: value,
  }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  appendFillLog(getLabelText(element) || element.name || element.id, value, 'field');
}

// Country/state abbreviation → full name map for select matching
const SELECT_EXPANSIONS = {
  'US': 'United States', 'USA': 'United States', 'CA': 'Canada', 'GB': 'United Kingdom',
  'UK': 'United Kingdom', 'AU': 'Australia', 'IN': 'India', 'DE': 'Germany',
  'FR': 'France', 'NL': 'Netherlands', 'SG': 'Singapore', 'IE': 'Ireland',
  'NZ': 'New Zealand', 'MX': 'Mexico', 'BR': 'Brazil', 'JP': 'Japan',
};

// Set a <select> element's value and fire events
function setSelectValue(selectEl, value) {
  if (!value) return false;
  const options = Array.from(selectEl.options);
  const v = value.toLowerCase().trim();

  // Also try expanded form (e.g. "US" → "United States")
  const expanded = (SELECT_EXPANSIONS[value.toUpperCase()] || '').toLowerCase();

  const match = options.find(o => {
    const ov = o.value.toLowerCase().trim();
    const ot = o.text.toLowerCase().trim();
    return ov === v || ot === v ||
           (expanded && (ov === expanded || ot === expanded)) ||
           ot.includes(v) || (expanded && ot.includes(expanded)) ||
           v.includes(ot);   // e.g. value="United States of America", option="United States"
  });

  if (match) {
    selectEl.value = match.value;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    const source = window.__speedyAIFilling ? 'ai' : 'select';
    appendFillLog(getLabelText(selectEl) || selectEl.name || selectEl.id, match.text, source);
    return true;
  }
  return false;
}

// Fill a custom (non-native) dropdown — clicks to open, finds matching option, clicks it
// Works for role="listbox", aria-haspopup, and common React dropdown patterns
async function fillCustomDropdown(triggerEl, value) {
  if (!value) return false;

  // Click to open the dropdown
  triggerEl.click();
  triggerEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  triggerEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

  // Wait for options to render
  await new Promise(r => setTimeout(r, 200));

  const valueLower = value.toLowerCase();

  // Look for an open listbox/menu in the document
  const optionSelectors = [
    '[role="option"]',
    '[role="listbox"] li',
    '[role="menu"] [role="menuitem"]',
    '[data-automation-id*="option"]',
    '[class*="option"]:not(select):not(input)',
    '[class*="dropdown-item"]',
    '[class*="menu-item"]',
    'li[data-value]',
  ];

  for (const sel of optionSelectors) {
    const options = Array.from(document.querySelectorAll(sel));
    if (!options.length) continue;

    const match = options.find(o => {
      const text = o.textContent.trim().toLowerCase();
      return text === valueLower || text.includes(valueLower) || valueLower.includes(text);
    });

    if (match) {
      match.click();
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    }
  }

  // No match found — close the dropdown by pressing Escape
  triggerEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return false;
}

// Compute today's date as ISO string
function today() {
  return new Date().toISOString();
}

// Calculate age in years from a YYYY-MM-DD date of birth string
function getAgeFromDOB(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth)) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

// Given an age and an array of option label strings, return the best matching label.
// Handles patterns like "Under 30", "18-24", "30-39", "60 or older", "65+", "over 18", etc.
function matchAgeToOption(age, optionLabels) {
  if (age === null) return null;

  for (const label of optionLabels) {
    const t = label.toLowerCase().trim();

    // "over 18" / "at least 18" / "18 or older" / "eighteen" / "legal age" — yes/no style
    if (/over\s*18|at\s*least\s*18|18\s*(or\s*older|or\s*above|\+)|eighteen|legal\s*(working\s*)?age|old\s*enough/i.test(t)) {
      return age >= 18 ? label : null;
    }

    // "under N" or "below N" or "less than N"
    const underM = t.match(/(?:under|below|less\s+than)\s*(\d+)/);
    if (underM && age < parseInt(underM[1])) return label;

    // "N or older" / "N+" / "N and over" / "N and above" / "over N"
    const olderM = t.match(/(\d+)\s*(?:or\s+older|or\s+above|and\s+over|and\s+above|\+)|(?:over|above)\s*(\d+)/);
    if (olderM) {
      const threshold = parseInt(olderM[1] || olderM[2]);
      if (age >= threshold) return label;
    }

    // "N-M" or "N to M" range
    const rangeM = t.match(/(\d+)\s*[-–to]+\s*(\d+)/);
    if (rangeM && age >= parseInt(rangeM[1]) && age <= parseInt(rangeM[2])) return label;
  }
  return null;
}
