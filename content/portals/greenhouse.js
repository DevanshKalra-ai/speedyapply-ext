// SpeedyApply — portals/greenhouse.js
// Greenhouse autofill adapter

async function fillGreenhouse(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  // Greenhouse uses predictable name attributes.
  // Some companies use flat names (first_name), others use candidate[first_name] format.
  const directMappings = [
    [['first_name', 'candidate[first_name]'], profile.firstName],
    [['preferred_first_name', 'first_name_preferred', 'preferred_name', 'preferredName', 'candidate[preferred_name]', 'candidate[preferred_first_name]'], profile.preferredFirstName || profile.firstName],
    [['last_name', 'candidate[last_name]'], profile.lastName],
    [['email', 'candidate[email]'], profile.email],
    [['phone', 'candidate[phone]'], profile.phone],
    [['linkedin_profile', 'candidate[linkedin]', 'urls[LinkedIn]'], profile.linkedinUrl],
    [['website', 'candidate[website]', 'urls[Portfolio]', 'urls[Other]'], profile.portfolioUrl],
    [['github', 'urls[GitHub]'], profile.githubUrl],
    // Resume link fields (Google Drive / Dropbox "attach via link")
    [['resume_text', 'resume_url', 'resumeUrl', 'candidate[resume_text]'], profile.resumeUrl],
  ];

  for (const [names, value] of directMappings) {
    if (!value) continue;
    for (const name of names) {
      const el = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`);
      if (el && isVisible(el) && !el.disabled && !el.value) {
        triggerNativeInput(el, value);
        results.filled++;
        results.fields.push(name);
        alreadyFilled.add(el);
        break; // found one match for this field, move on
      }
    }
  }

  // Address + country fields
  const country = profile.address?.country;
  const city = profile.address?.city;
  const state = profile.address?.state;

  // Location text field (city, state)
  const locationEl = document.querySelector('[name="job_application[location]"]');
  if (locationEl && isVisible(locationEl) && !locationEl.disabled && !locationEl.value && city) {
    triggerNativeInput(locationEl, state ? `${city}, ${state}` : city);
    results.filled++;
    alreadyFilled.add(locationEl);
  }

  // Country — try every known Greenhouse selector pattern
  if (country) {
    const countrySelectors = [
      'select[name="job_application[location_attributes][country]"]',
      'select[name="country"]',
      'select[name*="country"]',
      'select[id*="country"]',
    ];
    for (const sel of countrySelectors) {
      const el = document.querySelector(sel);
      if (el && isVisible(el) && !el.disabled && !alreadyFilled.has(el)) {
        if (setSelectValue(el, country)) {
          results.filled++;
          alreadyFilled.add(el);
          break;
        }
      }
    }
  }

  // Phone country code — Greenhouse uses a custom dropdown (flag picker)
  // It typically renders as a button/div with class containing "selected-flag" or "flag-dropdown"
  if (country) {
    const phoneCountryTrigger = document.querySelector(
      '.selected-flag, .flag-dropdown, [class*="phone-country"], [class*="phoneCountry"], ' +
      '[class*="country-flag"], button[data-phone-country], [aria-label*="country code"]'
    );
    if (phoneCountryTrigger && isVisible(phoneCountryTrigger) && !alreadyFilled.has(phoneCountryTrigger)) {
      await fillCustomDropdown(phoneCountryTrigger, country);
      alreadyFilled.add(phoneCountryTrigger);
    }
  }

  // Resume link (Google Drive / Dropbox) — label-based fallback
  if (profile.resumeUrl) {
    fillGreenhouseResumeLink(profile.resumeUrl, alreadyFilled);
  }

  // Standard yes/no + EEO dropdowns matched by label text
  fillGreenhouseStandardQuestions(profile, alreadyFilled);

  // Radio button groups (visa sponsorship, work auth, on-site, etc.)
  results.filled += fillLeverRadios(document, profile, alreadyFilled);

  // Fall back to generic mapper for anything not caught above
  const genericResults = mapAndFill(profile, alreadyFilled);
  results.filled += genericResults.filled;
  results.skipped += genericResults.skipped;

  // Resume file upload
  await tryFileUpload(profile);

  return results;
}

function fillGreenhouseStandardQuestions(profile, alreadyFilled) {
  // Map label keywords → profile value
  const labelRules = [
    { keywords: ['over the age of 18', 'are you 18', 'at least 18'],           value: profile.over18 },
    { keywords: ['visa sponsorship', 'require.*visa', 'need.*visa', 'now.*require.*visa', 'require.*sponsorship'], value: profile.requiresVisaSponsorship },
    { keywords: ['future.*visa', 'future.*sponsorship'],                        value: profile.requiresVisaSponsorship },
    { keywords: ['work authorization', 'legally.*work', 'authorized to work', 'proof of.*work'], value: profile.workAuthorized },
    { keywords: ['salary', 'compensation', 'base.*pay', 'pay.*expectation'],    value: profile.salaryExpectation },
    // EEO fields
    { keywords: ['\\bgender\\b', 'gender identity'],                             value: profile.gender },
    { keywords: ['disability', 'disabled'],                                      value: profile.disabilityStatus },
    { keywords: ['veteran', 'military status'],                                  value: profile.veteranStatus },
    // On-site / remote requirements
    { keywords: ['on.?site', 'in.?office', 'office.*days', 'days.*week.*office', 'work from.*office', 'meet this requirement'], value: profile.willingToWorkOnsite },
  ];

  // Check every select and text input that hasn't been filled yet
  document.querySelectorAll('select, input[type="text"], input[type="number"]').forEach(el => {
    if (alreadyFilled.has(el)) return;
    if (!isVisible(el) || el.disabled || el.value) return;

    const labelText = getLabelText(el).toLowerCase();
    if (!labelText) return;

    for (const { keywords, value } of labelRules) {
      if (!value) continue;
      const matches = keywords.some(k => new RegExp(k, 'i').test(labelText));
      if (!matches) continue;

      if (el.tagName === 'SELECT') {
        if (setSelectValue(el, value)) alreadyFilled.add(el);
      } else {
        triggerNativeInput(el, value);
        alreadyFilled.add(el);
      }
      break;
    }
  });
}

// Fill the "attach resume via link" text field (Google Drive / Dropbox)
function fillGreenhouseResumeLink(resumeUrl, alreadyFilled) {
  const RESUME_LINK_LABELS = /google.?drive|dropbox|attach.*link|link.*resume|resume.*link|paste.*link|resume.*url|drive\.google|file.*link/i;
  const RESUME_LINK_PLACEHOLDERS = /drive\.google|dropbox|https?:\/\/(www\.)?drive|paste.*link/i;

  // Try name-attribute direct matches first (fastest, most reliable)
  for (const nameAttr of ['resume_text', 'resume_url', 'resumeUrl', 'resume_link']) {
    const el = document.querySelector(`input[name="${nameAttr}"], textarea[name="${nameAttr}"]`);
    if (el && isVisible(el) && !el.disabled && !el.value && !alreadyFilled.has(el)) {
      triggerNativeInput(el, resumeUrl);
      alreadyFilled.add(el);
      return;
    }
  }

  // Label / placeholder scan fallback
  document.querySelectorAll('input[type="text"], input[type="url"], textarea').forEach(el => {
    if (alreadyFilled.has(el) || !isVisible(el) || el.disabled || el.value) return;
    const label = getLabelText(el).toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    if (RESUME_LINK_LABELS.test(label) || RESUME_LINK_PLACEHOLDERS.test(placeholder)) {
      triggerNativeInput(el, resumeUrl);
      alreadyFilled.add(el);
    }
  });
}

async function tryFileUpload(profile) {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_RESUME' });
  const resume = resp?.resume;
  if (!resume) return;

  const fileInput = document.querySelector('input[type="file"][name*="resume"], input[type="file"][id*="resume"]');
  if (!fileInput) return;

  try {
    const byteStr = atob(resume.base64);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: resume.mimeType || 'application/pdf' });
    const file = new File([blob], resume.name, { type: blob.type });

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (e) {
    console.warn('[SpeedyApply] Resume upload failed:', e);
  }
}
