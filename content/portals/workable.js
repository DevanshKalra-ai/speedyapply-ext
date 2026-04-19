// SpeedyApply — portals/workable.js
// Workable autofill adapter
// Workable URLs: apply.workable.com/company/j/JOBID/

async function fillWorkable(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();
  // Reset the "+ Add" button tracking for this fill pass
  window.__speedyWorkableClicked = new WeakSet();
  const latestJob = profile.workExperience?.[0];
  const addr = profile.address || {};

  // ── Pass 1: Direct name attribute mappings (Workable standard fields) ────
  const directMappings = [
    ['firstname',          profile.firstName],
    ['lastname',           profile.lastName],
    ['email',              profile.email],
    ['phone',              profile.phone],
    ['address',            addr.street],
    ['city',               addr.city],
    ['state',              addr.state],
    ['zip',                addr.zip],
    ['linkedin_profile',   profile.linkedinUrl],
    ['website',            profile.portfolioUrl],
    ['github',             profile.githubUrl],
    ['current_company',    latestJob?.company],
    ['current_title',      latestJob?.title],
    ['cover_letter',       profile.defaultCoverLetter],
    ['coverletter',        profile.defaultCoverLetter],
    ['resume_text',        profile.resumeUrl],
    // Workable newer versions
    ['candidate[firstname]',        profile.firstName],
    ['candidate[lastname]',         profile.lastName],
    ['candidate[email]',            profile.email],
    ['candidate[phone]',            profile.phone],
    ['candidate[linkedin_profile]', profile.linkedinUrl],
    ['candidate[website]',          profile.portfolioUrl],
  ];

  for (const [name, value] of directMappings) {
    if (!value) continue;
    const el = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`);
    if (!el || alreadyFilled.has(el)) continue;
    if (!isVisible(el) || el.disabled || el.value) continue;
    triggerWorkableInput(el, value);
    results.filled++;
    results.fields.push(name);
    alreadyFilled.add(el);
  }

  // ── Pass 2: data-ui attribute targeting (Workable v2 forms) ──────────────
  const dataUiMappings = [
    ['first-name',   profile.firstName],
    ['last-name',    profile.lastName],
    ['email',        profile.email],
    ['phone',        profile.phone],
    ['linkedin',     profile.linkedinUrl],
    ['website',      profile.portfolioUrl],
  ];

  for (const [dataUi, value] of dataUiMappings) {
    if (!value) continue;
    // Only select actual input elements, never the container div
    const el = document.querySelector(
      `[data-ui="${dataUi}"] input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), ` +
      `input[data-ui="${dataUi}"], textarea[data-ui="${dataUi}"]`
    );
    if (!el || alreadyFilled.has(el)) continue;
    if (!isVisible(el) || el.disabled || el.value) continue;
    triggerWorkableInput(el, value);
    results.filled++;
    results.fields.push(dataUi);
    alreadyFilled.add(el);
  }

  // ── Pass 3: Label reading for standard + EEO + custom questions ──────────
  fillWorkableStandardQuestions(profile, alreadyFilled, results);

  // ── Pass 4: Radio button groups ──────────────────────────────────────────
  results.filled += fillLeverRadios(document, profile, alreadyFilled);

  // ── Pass 5: Generic label pass for anything remaining (all inputs) ──────
  const fieldValues = buildFieldValues(profile);
  const allPassFiveInputs = Array.from(document.querySelectorAll(
    'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"]), ' +
    'textarea, select'
  ));
  for (const input of allPassFiveInputs) {
    if (alreadyFilled.has(input)) continue;
    if (!isVisible(input) || input.disabled) continue;
    if (input.tagName !== 'SELECT' && input.value) continue;

    const labelText = getLabelText(input);
    if (!labelText) continue;

    const fieldName = matchLabelToField(labelText.toLowerCase(), input);
    if (!fieldName) continue;

    const value = fieldValues[fieldName];
    if (!value) continue;

    if (input.tagName === 'SELECT') {
      if (setSelectValue(input, value)) {
        results.filled++;
        alreadyFilled.add(input);
      }
    } else {
      triggerWorkableInput(input, value);
      results.filled++;
      alreadyFilled.add(input);
    }
  }

  // ── Pass 6: Work experience — click "Add" then fill ────────────────────────
  await fillWorkableExperienceSection(profile, results);

  // ── Pass 7: Education — click "Add" then fill ────────────────────────────
  // Wait for React to finish processing experience events before touching education
  await sleep(400);
  await fillWorkableEducationSection(profile, results);

  // ── Pass 8: Resume upload ─────────────────────────────────────────────────
  await tryWorkableResumeUpload();

  return results;
}

// Track which "+ Add" buttons we have already clicked this fill pass
// (Workable uses identical "+ Add" text for both experience and education)
function getWorkableClickedSet() {
  if (!window.__speedyWorkableClicked) window.__speedyWorkableClicked = new WeakSet();
  return window.__speedyWorkableClicked;
}

// ── Click a Workable section's "Add" button and wait for fields to render ─────
// sectionKeywords: words to match against button text (specific, e.g. 'add experience')
// sectionTopics:   words to look for in the button's surrounding container text
async function clickWorkableAddButton(sectionKeywords, sectionTopics) {
  const topics = (sectionTopics || sectionKeywords).map(t => t.toLowerCase());
  const clicked = getWorkableClickedSet();
  const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"]'));

  let btn = null;

  // Pass 1: Specific descriptive button text — 'Add Experience', 'Add Position', etc.
  btn = allButtons.find(b => {
    if (!isVisible(b) || clicked.has(b)) return false;
    const text = b.textContent.trim().toLowerCase();
    // Only non-generic keywords here — '+ add' is handled in Pass 2
    const specific = sectionKeywords.filter(kw => kw !== '+ add' && kw !== 'add');
    return specific.some(kw => text.includes(kw));
  });

  // Pass 2: Generic "+ Add" button — walk up DOM to confirm it's in the right section
  if (!btn) {
    const addBtns = allButtons.filter(b => {
      if (!isVisible(b) || clicked.has(b)) return false;
      const text = b.textContent.trim().toLowerCase();
      return /^\+\s*add$|^\badd\b$/.test(text);
    });

    for (const candidate of addBtns) {
      // Walk up max 10 levels looking for any ancestor whose text mentions the topic
      let node = candidate.parentElement;
      let depth = 0;
      while (node && node !== document.body && depth < 10) {
        // Check just the direct children's text, not deeply nested text, to avoid
        // matching unrelated content far up the tree
        const directText = Array.from(node.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && !n.querySelector('button')))
          .map(n => n.textContent)
          .join(' ')
          .toLowerCase();

        if (topics.some(t => directText.includes(t))) {
          btn = candidate;
          break;
        }
        node = node.parentElement;
        depth++;
      }
      if (btn) break;
    }
  }

  // Pass 3: Fall back to first unclicked "+ Add" on the page (order: exp first, edu second)
  if (!btn) {
    btn = allButtons.find(b => {
      if (!isVisible(b) || clicked.has(b)) return false;
      return /^\+\s*add$|^\badd\b$/.test(b.textContent.trim().toLowerCase());
    });
  }

  if (!btn) return false;

  clicked.add(btn); // mark as used so the next section finds the next "+ Add"
  btn.click();
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

  await new Promise(r => setTimeout(r, 500));
  return true;
}

// Wait for a selector to appear after clicking an Add button (up to maxMs)
async function waitForElement(selector, maxMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (document.querySelector(selector)) return true;
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

// ── Work experience filling ───────────────────────────────────────────────────
async function fillWorkableExperienceSection(profile, results) {
  const jobs = profile.workExperience || [];
  if (!jobs.length) return;

  // Check if experience fields already exist (some Workable forms pre-expand)
  const alreadyExpanded = document.querySelector(
    'input[name*="experience"][name*="company"], input[name*="experience"][name*="title"], ' +
    '[data-ui="experience-title"], [data-ui="experience-company"]'
  );

  if (!alreadyExpanded) {
    const clicked = await clickWorkableAddButton(
      // Button text keywords
      ['add experience', 'add work experience', 'add work', 'add position', 'add job',
       'add employment', 'experience', 'work history', '+ add', 'new position'],
      // Section heading topics
      ['experience', 'work history', 'employment', 'position', 'work experience']
    );
    if (!clicked) return;
    await waitForElement('input[name*="experience"], [data-ui*="experience"], input[placeholder*="company" i], input[placeholder*="employer" i]', 2000);
  }

  // Fill up to 2 most recent jobs (most Workable forms only ask for 1-2)
  for (let i = 0; i < Math.min(jobs.length, 2); i++) {
    const job = jobs[i];
    const idx = i; // for indexed name patterns like experience[0][company]

    // If this is not the first entry and we need to add another, click "Add" again
    if (i > 0) {
      const addedAnother = await clickWorkableAddButton(
        ['add experience', 'add another', 'add more', 'add work', 'add position', '+ add'],
        ['experience', 'work history', 'employment']
      );
      if (!addedAnother) break;
    }

    await fillWorkableExperienceEntry(job, idx, results);
  }
}

async function fillWorkableExperienceEntry(job, idx, results) {
  // Workable uses several naming conventions across versions
  const fieldPatterns = [
    // v1: name="experience[0][company]"
    { company:    `experience[${idx}][company]`,     title: `experience[${idx}][title]`,
      location:   `experience[${idx}][location]`,    start: `experience[${idx}][start_date]`,
      end:        `experience[${idx}][end_date]`,    desc:  `experience[${idx}][summary]`,
      current:    `experience[${idx}][current]` },
    // v1 alt: name="experiences[][company]"
    { company:    'experiences[][company]',          title: 'experiences[][title]',
      location:   'experiences[][location]',         start: 'experiences[][start_date]',
      end:        'experiences[][end_date]',         desc:  'experiences[][summary]',
      current:    'experiences[][current]' },
  ];

  // Try indexed name patterns first
  let filled = false;
  for (const p of fieldPatterns) {
    const companyEl = document.querySelector(`input[name="${p.company}"], textarea[name="${p.company}"]`);
    if (!companyEl || !isVisible(companyEl)) continue;

    if (job.company && !companyEl.value) { triggerWorkableInput(companyEl, job.company); results.filled++; }
    await sleep(80);
    await fillByName(p.title,    job.title,    results); await sleep(80);
    await fillByName(p.location, job.location, results); await sleep(80);
    await fillWorkableDate(p.start, job.startDate, results); await sleep(80);
    if (!job.isCurrent) { await fillWorkableDate(p.end, job.endDate, results); await sleep(80); }

    // "Currently working here" checkbox
    if (job.isCurrent) {
      const cb = document.querySelector(`input[type="checkbox"][name="${p.current}"]`);
      if (cb && !cb.checked) { cb.click(); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    if (job.description) { await fillByName(p.desc, job.description, results); await sleep(80); }
    filled = true;
    break;
  }

  // data-ui pattern: grab the idx-th set of experience inputs
  if (!filled) {
    const prevFilled = results.filled;
    await fillWorkableDataUiEntry('experience', job, idx, results);
    if (results.filled > prevFilled) filled = true;
  }

  // Label/placeholder pass — ONLY if name and data-ui both found nothing
  // (avoids re-filling already-filled React controlled inputs mid-update-cycle)
  if (!filled) {
    await sleep(300); // let React settle before scanning
    await fillWorkableEntryByLabel({
      company:   job.company,
      title:     job.title,
      location:  job.location,
      startDate: job.startDate,
      endDate:   job.isCurrent ? null : job.endDate,
      description: job.description,
    }, {
      company:     /company|employer|organization/i,
      title:       /job\s*title|position\b|role\b|\btitle\b/i,
      location:    /\blocation\b/i,
      startDate:   /start\s*date|from\b/i,
      endDate:     /end\s*date|to\b/i,
      description: /description|responsibilities|summary/i,
    }, results);
  }

  // AI-generated summary for the optional Summary field
  await fillWorkableExperienceSummary(job, results);
}

// Generate and fill the optional Summary field in a Workable experience entry using AI
async function fillWorkableExperienceSummary(job, results) {
  const summaryEl = Array.from(document.querySelectorAll('textarea')).find(el => {
    if (!isVisible(el) || el.disabled || el.value) return false;
    const label = (getLabelText(el) || el.placeholder || '').toLowerCase();
    return /summary|description|responsibilities|about.*role|tell us/i.test(label);
  });
  if (!summaryEl) return;

  try {
    const question = `Write a concise 2-3 sentence professional summary for a resume experience entry.
Role: ${job.title || 'N/A'} at ${job.company || 'N/A'}${job.location ? ' (' + job.location + ')' : ''}.
Write in first person, focus on key responsibilities and achievements. Keep it under 100 words.`;

    const resp = await chrome.runtime.sendMessage({
      type: 'GENERATE_AI_RESPONSE',
      payload: { question, fieldContext: { jobTitle: job.title, company: job.company } },
    });

    if (resp?.answer) {
      triggerWorkableInput(summaryEl, resp.answer);
      results.filled++;
    }
  } catch {}
}

// ── Education filling ─────────────────────────────────────────────────────────
async function fillWorkableEducationSection(profile, results) {
  const educations = profile.education || [];
  if (!educations.length) return;

  const alreadyExpanded = document.querySelector(
    'input[name*="education"][name*="school"], input[name*="education"][name*="degree"], ' +
    '[data-ui="education-school"], [data-ui="education-degree"]'
  );

  if (!alreadyExpanded) {
    const clicked = await clickWorkableAddButton(
      ['add education', 'add school', 'add degree', 'add academic', 'add university',
       'education', '+ add', 'new education'],
      ['education', 'school', 'degree', 'academic', 'university', 'college']
    );
    if (!clicked) return;
    await waitForElement('input[name*="education"], [data-ui*="education"], input[placeholder*="school" i], input[placeholder*="university" i]', 2000);
  }

  for (let i = 0; i < Math.min(educations.length, 2); i++) {
    const edu = educations[i];
    if (i > 0) {
      const addedAnother = await clickWorkableAddButton(
        ['add education', 'add another', 'add more', '+ add'],
        ['education', 'school', 'degree']
      );
      if (!addedAnother) break;
    }
    await fillWorkableEducationEntry(edu, i, results);
  }
}

async function fillWorkableEducationEntry(edu, idx, results) {
  const fieldPatterns = [
    { school: `education[${idx}][school]`,    degree: `education[${idx}][degree]`,
      field:  `education[${idx}][field_of_study]`, start: `education[${idx}][start_date]`,
      end:    `education[${idx}][end_date]`,   gpa:   `education[${idx}][grade]` },
    { school: 'educations[][school]',         degree: 'educations[][degree]',
      field:  'educations[][field_of_study]', start: 'educations[][start_date]',
      end:    'educations[][end_date]',        gpa:   'educations[][grade]' },
  ];

  let filled = false;
  for (const p of fieldPatterns) {
    const schoolEl = document.querySelector(`input[name="${p.school}"], textarea[name="${p.school}"]`);
    if (!schoolEl || !isVisible(schoolEl)) continue;

    if (edu.institution && !schoolEl.value) { triggerWorkableInput(schoolEl, edu.institution); results.filled++; }
    await sleep(80);

    // Degree: try the select first, fall back to text input
    const degreeEl = document.querySelector(`select[name="${p.degree}"]`);
    if (degreeEl) { setSelectValue(degreeEl, edu.degree || ''); }
    else { await fillByName(p.degree, edu.degree, results); }
    await sleep(80);

    await fillByName(p.field, edu.field, results); await sleep(80);
    await fillWorkableDate(p.start, edu.startDate, results); await sleep(80);
    await fillWorkableDate(p.end,   edu.endDate,   results); await sleep(80);
    if (edu.gpa) { await fillByName(p.gpa, edu.gpa, results); await sleep(80); }
    filled = true;
    break;
  }

  if (!filled) {
    const prevFilled = results.filled;
    await fillWorkableDataUiEntry('education', edu, idx, results);
    if (results.filled > prevFilled) filled = true;
  }

  // Label pass only as last resort — don't re-scan if name/data-ui already filled
  if (!filled) {
    await sleep(300);
    await fillWorkableEntryByLabel({
      school:  edu.institution,
      degree:  edu.degree,
      field:   edu.field,
      startDate: edu.startDate,
      endDate:   edu.endDate,
    }, {
      school:    /school|university|institution|college/i,
      degree:    /\bdegree\b|qualification/i,
      field:     /\bfield\b|major|subject|study/i,
      startDate: /start\s*date|from\b/i,
      endDate:   /end\s*date|to\b|graduation/i,
    }, results);
  }
}

// Workable-safe input fill — does NOT dispatch a plain Event('change').
// Workable's onChange handler reads event.nativeEvent.data; a plain Event('change')
// has no .data property so event.nativeEvent.data is undefined, which crashes
// their getPostDelimiter() call with "Cannot read properties of undefined (reading 'slice')".
// Using InputEvent with data set avoids this entirely.
function triggerWorkableInput(el, value) {
  if (!el || !value) return;

  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) nativeSetter.call(el, value);
  else el.value = value;

  // InputEvent carries .data — Workable's onChange won't crash on .nativeEvent.data.slice()
  el.dispatchEvent(new InputEvent('input', {
    bubbles: true, cancelable: true,
    inputType: 'insertText', data: value,
  }));
  // Fire change as InputEvent too, keeping .data populated
  el.dispatchEvent(new InputEvent('change', {
    bubbles: true, data: value,
  }));

  appendFillLog(getLabelText(el) || el.name || el.id, value, 'field');
}

// Fill a field by name attribute
async function fillByName(name, value, results) {
  if (!name || !value) return;
  const el = document.querySelector(`input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`);
  if (!el || !isVisible(el) || el.disabled || el.value) return;
  if (el.tagName === 'SELECT') { setSelectValue(el, value); }
  else { triggerWorkableInput(el, value); }
  results.filled++;
}

// Fill a Workable date input without opening the calendar popup.
// react-datepicker opens its calendar on `focus` — so we skip focus events entirely
// and use the native value setter + input/change only.
// dateStr is stored as "YYYY-MM" or "YYYY"
async function fillWorkableDate(name, dateStr, results) {
  if (!name || !dateStr) return;
  const el = document.querySelector(`input[name="${name}"]`);
  if (!el || !isVisible(el) || el.disabled || el.value) return;
  if (el.readOnly || el.getAttribute('aria-hidden') === 'true') return;

  const parts = dateStr.split('-');
  const inputType = (el.getAttribute('type') || 'text').toLowerCase();
  let display;

  if (inputType === 'date') {
    display = parts.length === 2 ? `${parts[0]}-${parts[1]}-01` : `${dateStr}-01-01`;
  } else if (inputType === 'month') {
    display = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : dateStr;
  } else {
    // text input — use placeholder to infer format
    if (parts.length === 2) {
      const ph = (el.placeholder || '').toLowerCase();
      if (ph.includes('mm/yyyy') || ph.includes('mm / yyyy')) {
        display = `${parts[1]}/${parts[0]}`; // MM/YYYY
      } else if (ph.includes('yyyy-mm')) {
        display = dateStr;
      } else {
        const months = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        const m = parseInt(parts[1], 10) - 1;
        display = `${months[m] || parts[1]} ${parts[0]}`;
      }
    } else {
      display = dateStr;
    }
  }

  // Use native setter WITHOUT firing focus — focus opens the react-datepicker calendar
  // which conflicts with programmatic value setting and crashes the page.
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) nativeSetter.call(el, display);
  else el.value = display;

  el.dispatchEvent(new InputEvent('input',  { bubbles: true, cancelable: true, inputType: 'insertText', data: display }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  appendFillLog(getLabelText(el) || el.name, display, 'field');
  results.filled++;
}

// data-ui pattern for experience/education (Workable v2)
// Grabs the idx-th instance of each data-ui field
async function fillWorkableDataUiEntry(type, data, idx, results) {
  const isExp = type === 'experience';

  const fieldMap = isExp
    ? { company: 'experience-company', title: 'experience-title',
        location: 'experience-location', start: 'experience-start-date',
        end: 'experience-end-date', desc: 'experience-description' }
    : { school: 'education-school', degree: 'education-degree',
        field: 'education-field', start: 'education-start-date',
        end: 'education-end-date' };

  for (const [dataKey, uiKey] of Object.entries(fieldMap)) {
    const allEls = Array.from(document.querySelectorAll(
      `[data-ui="${uiKey}"] input, [data-ui="${uiKey}"] textarea, [data-ui="${uiKey}"] select, ` +
      `input[data-ui="${uiKey}"], textarea[data-ui="${uiKey}"]`
    )).filter(isVisible);

    const el = allEls[idx]; // idx-th instance for multi-entry forms
    if (!el || el.disabled || el.value) continue;

    const value = isExp
      ? ({ company: data.company, title: data.title, location: data.location,
           start: data.startDate, end: data.endDate, desc: data.description })[dataKey]
      : ({ school: data.institution, degree: data.degree,
           field: data.field, start: data.startDate, end: data.endDate })[dataKey];

    if (!value) continue;

    if (el.tagName === 'SELECT') { setSelectValue(el, value); }
    else { triggerWorkableInput(el, value); }
    results.filled++;
  }
}

// Fill an experience/education entry by scanning visible inputs whose label/placeholder
// matches the given regex map. Used as last-resort when name and data-ui both fail.
async function fillWorkableEntryByLabel(values, labelRegexMap, results) {
  const allInputs = Array.from(document.querySelectorAll(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select'
  )).filter(el => isVisible(el) && !el.disabled && !el.value);

  for (const [key, regex] of Object.entries(labelRegexMap)) {
    const val = values[key];
    if (!val) continue;

    const el = allInputs.find(inp => {
      const label = getLabelText(inp) || inp.placeholder || '';
      return regex.test(label);
    });

    if (!el) continue;
    if (el.readOnly || el.getAttribute('aria-hidden') === 'true') continue;

    if (el.tagName === 'SELECT') {
      setSelectValue(el, val);
    } else {
      triggerWorkableInput(el, val);
    }
    results.filled++;
    // Remove from candidates so the next field doesn't reuse the same element
    const idx = allInputs.indexOf(el);
    if (idx !== -1) allInputs.splice(idx, 1);
  }
}

// Fill standard yes/no + EEO dropdowns by label text
function fillWorkableStandardQuestions(profile, alreadyFilled, results) {
  const labelRules = [
    { test: t => /visa.{0,40}sponsor|require.{0,20}visa|need.{0,20}visa|now.*require.*visa/i.test(t),   value: profile.requiresVisaSponsorship },
    { test: t => /work.?authoriz|legally.{0,20}work|authorized.{0,20}work/i.test(t),                   value: profile.workAuthorized },
    { test: t => /over.{0,5}18|at least 18|age.{0,10}18/i.test(t),                                     value: profile.over18 },
    { test: t => /salary|compensation|base.{0,10}pay|pay.{0,10}expectation/i.test(t),                   value: profile.salaryExpectation },
    { test: t => /\bgender\b|gender.{0,15}identity/i.test(t),                                           value: profile.gender },
    { test: t => /disability|disabled/i.test(t),                                                        value: profile.disabilityStatus },
    { test: t => /veteran|military.{0,20}status/i.test(t),                                              value: profile.veteranStatus },
    { test: t => /on.?site|in.{0,5}office|office.*days|meet this requirement/i.test(t),                 value: profile.willingToWorkOnsite },
    { test: t => /google.?drive|dropbox|attach.*link|resume.*link|paste.*link/i.test(t),                value: profile.resumeUrl },
  ];

  document.querySelectorAll('select, input[type="text"], input[type="number"], input[type="url"], textarea').forEach(el => {
    if (alreadyFilled.has(el)) return;
    if (!isVisible(el) || el.disabled) return;
    // For selects, always try (placeholder might be non-empty string); for text inputs skip if already filled
    if (el.tagName !== 'SELECT' && el.value) return;

    const labelText = getLabelText(el).toLowerCase();
    if (!labelText) return;

    for (const { test, value } of labelRules) {
      if (!value || !test(labelText)) continue;
      if (el.tagName === 'SELECT') {
        if (setSelectValue(el, value)) {
          alreadyFilled.add(el);
          results.filled++;
        }
      } else {
        triggerWorkableInput(el, value);
        alreadyFilled.add(el);
        results.filled++;
      }
      break;
    }
  });
}

async function tryWorkableResumeUpload() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_RESUME' });
  const resume = resp?.resume;
  if (!resume) return;

  const fileInput = document.querySelector(
    'input[type="file"][name*="resume"], input[type="file"][data-ui="resume"], input[type="file"]'
  );
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
    console.warn('[SpeedyApply] Workable resume upload failed:', e);
  }
}
