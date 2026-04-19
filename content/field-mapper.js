// SpeedyApply — field-mapper.js
// Confidence-scored generic field → profile mapper

// Score a single element against a semantic field definition.
// Returns 0-1 confidence score.
function scoreElement(el, fieldDef) {
  let score = 0;
  const label      = getLabelText(el).toLowerCase();
  const name       = (el.getAttribute('name') || '').toLowerCase();
  const id         = (el.getAttribute('id') || '').toLowerCase();
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
  const dataAuto   = (el.getAttribute('data-automation-id') || '').toLowerCase();
  const dataField  = (el.getAttribute('data-field-id') || '').toLowerCase();
  const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
  const inputType  = (el.getAttribute('type') || '').toLowerCase();
  const className  = (el.getAttribute('class') || '').toLowerCase();

  // Input type — very reliable for email/phone
  if (fieldDef.inputTypes?.includes(inputType)) score = Math.max(score, 0.97);

  // autocomplete
  if (fieldDef.autocomplete?.some(ac => autocomplete === ac)) score = Math.max(score, 0.95);

  // data-automation-id
  if (fieldDef.dataAutomation?.some(da => dataAuto.includes(da.toLowerCase()))) score = Math.max(score, 0.90);

  // data-field-id (Ashby)
  if (fieldDef.dataAutomation?.some(da => dataField.includes(da.toLowerCase()))) score = Math.max(score, 0.88);

  // name attribute — exact
  if (fieldDef.names?.some(n => name === n.toLowerCase())) score = Math.max(score, 0.88);

  // name attribute — partial (e.g. "applicant[first_name]" contains "first_name")
  if (fieldDef.names?.some(n => name.includes(n.toLowerCase()))) score = Math.max(score, 0.80);

  // id attribute — exact
  if (fieldDef.names?.some(n => id === n.toLowerCase())) score = Math.max(score, 0.85);

  // id attribute — partial
  if (fieldDef.names?.some(n => id.includes(n.toLowerCase()))) score = Math.max(score, 0.75);

  // label text — exact word match
  if (fieldDef.ariaLabels?.some(al => {
    const a = al.toLowerCase();
    return label === a || label.startsWith(a) || new RegExp(`\\b${a}\\b`).test(label);
  })) score = Math.max(score, 0.85);

  // label text — partial
  if (fieldDef.ariaLabels?.some(al => label.includes(al.toLowerCase()))) score = Math.max(score, 0.78);

  // placeholder
  if (fieldDef.placeholders?.some(ph => placeholder.includes(ph.toLowerCase()))) score = Math.max(score, 0.65);

  // class name hints
  if (fieldDef.classHints?.some(h => className.includes(h.toLowerCase()))) score = Math.max(score, 0.70);

  return score;
}

// Find the best matching element for a field in the current document
// Returns { el, score } or null
function findFieldElement(fieldName, minConfidence = 0.65) {
  const fieldDef = FIELD_SELECTORS[fieldName];
  if (!fieldDef) return null;

  const candidates = [];

  // Try direct selectors first (highest priority)
  for (const sel of (fieldDef.selectors || [])) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        if (isVisible(el) && !el.disabled) {
          candidates.push({ el, score: 0.90 });
        }
      });
    } catch {}
  }

  // Then score all visible inputs/selects/textareas
  const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
  allInputs.forEach(el => {
    if (!isVisible(el) || el.disabled) return;
    const score = scoreElement(el, fieldDef);
    if (score >= minConfidence) candidates.push({ el, score });
  });

  if (!candidates.length) return null;

  // Return highest score
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// Fill a single field — handles input, select, textarea
function fillField(el, value) {
  if (!el || !value) return false;

  if (el.tagName === 'SELECT') {
    // Always try to set selects — the default value might be wrong/placeholder
    return setSelectValue(el, value);
  }

  // Don't overwrite text inputs that already have user-entered content
  const currentVal = el.value;
  if (currentVal && currentVal.trim() !== '') return false;

  triggerNativeInput(el, value);
  return true;
}

// Main mapping function — fills all known fields from profile
// alreadyFilled: optional Set of elements already handled (avoids double-filling)
// Returns { filled: number, skipped: number, fields: [] }
function mapAndFill(profile, alreadyFilled = new Set()) {
  const results = { filled: 0, skipped: 0, fields: [] };
  if (!profile) return results;

  const fieldValues = buildFieldValues(profile);

  for (const [fieldName, value] of Object.entries(fieldValues)) {
    if (!value) continue;

    const match = findFieldElement(fieldName);
    if (!match || alreadyFilled.has(match.el)) {
      results.skipped++;
      continue;
    }

    const success = fillField(match.el, value);
    if (success) {
      results.filled++;
      results.fields.push(fieldName);
      alreadyFilled.add(match.el);
    } else {
      results.skipped++;
    }
  }

  return results;
}

// Build a flat map of field name → profile value
function buildFieldValues(profile) {
  const latestJob = profile.workExperience?.[0];
  const addr = profile.address || {};

  return {
    firstName: profile.firstName,
    preferredFirstName: profile.preferredFirstName || profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    address: addr.street,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    country: addr.country,
    linkedinUrl: profile.linkedinUrl,
    portfolioUrl: profile.portfolioUrl,
    githubUrl: profile.githubUrl,
    currentCompany: latestJob?.company,
    currentTitle: latestJob?.title,
    resumeUrl: profile.resumeUrl,
    gender: profile.gender,
    disabilityStatus: profile.disabilityStatus,
    veteranStatus: profile.veteranStatus,
    ageRange: profile.ageRange,
    ethnicity: profile.ethnicity,
    willingToWorkOnsite: profile.willingToWorkOnsite,
  };
}

function isVisible(el) {
  if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}
