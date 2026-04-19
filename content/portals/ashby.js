// SpeedyApply — portals/ashby.js
// Ashby autofill — intercepts applicationForm.info API to get full form schema
//
// Ashby's public API returns the complete form schema on page load — no API key needed.
// Endpoint: https://api.ashbyhq.com/applicationForm.info
// Schema: { fieldGroups: [{ fields: [{ fieldId, title, type, isRequired, selectableValues }] }] }
//
// We capture fieldId, title, type, AND selectableValues (exact dropdown options).
// This lets us match profile values against known option labels before touching the DOM,
// which is more accurate than partial-text matching against rendered <option> elements.

let ashbyFormSchema = null;

// Normalize profile gender value → Ashby/Greenhouse select option wording.
// Stored values (Male/Female) differ from display options (Man/Woman) on some portals.
function normalizeGenderForSelect(gender) {
  if (!gender) return gender;
  const g = gender.toLowerCase().trim();
  if (g === 'male') return 'Man';
  if (g === 'female') return 'Woman';
  if (g === 'non-binary') return 'Non-Binary';
  if (/decline|prefer not|not.{0,10}answer|not.{0,10}wish/i.test(g)) return 'I prefer not to answer';
  return gender; // pass through (already in display form or unknown)
}

// Extract the Ashby job posting ID from the page.
// Reads the inline __appData script tag (accessible from isolated world via DOM).
function getAshbyPostingId() {
  // Parse from window.__appData inline script
  for (const s of document.querySelectorAll('script:not([src])')) {
    const m = s.textContent.match(/"posting"\s*:\s*\{[^}]*"id"\s*:\s*"([0-9a-f-]{36})"/i);
    if (m) return m[1];
  }
  // Fallback: UUID in the URL path (jobs.ashbyhq.com/Company/uuid or /uuid/application)
  const urlMatch = window.location.pathname.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return urlMatch?.[1] || null;
}

// ── Schema interception (fallback — ashby-intercept-early.js handles the main case) ──

function interceptAshbyApi() {
  if (window.__speedyapplyAshbyIntercepted) return;
  window.__speedyapplyAshbyIntercepted = true;

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('ashbyhq.com') && url.includes('applicationForm')) {
      const response = await originalFetch.apply(this, args);
      try {
        const data = await response.clone().json();
        const form = data?.results?.applicationForm || data?.applicationForm;
        if (form) ashbyFormSchema = parseAshbySchema(form);
      } catch {}
      return response;
    }
    return originalFetch.apply(this, args);
  };
}

// ── Schema parsing ────────────────────────────────────────────────────────────

// Parse fieldGroups into a flat map: { fieldId → { title, type, options: [{label, value}] } }
function parseAshbySchema(applicationForm) {
  const schema = {};
  const groups = applicationForm.fieldGroups || applicationForm.sections || [];

  for (const group of groups) {
    const fields = group.fields || group.applicationFormFields || [];
    for (const field of fields) {
      const id = field.fieldId || field.id || field.path;
      if (!id) continue;

      // selectableValues is the key addition — gives us exact option labels
      const rawOptions = field.selectableValues || field.options || field.choices || [];
      const options = rawOptions.map(o => ({
        label: (o.label || o.title || o.name || String(o)).trim(),
        value: (o.value !== undefined ? String(o.value) : (o.label || o.title || String(o))).trim(),
      }));

      schema[id] = {
        title: (field.title || field.label || '').toLowerCase(),
        type: (field.type || field.fieldType || 'String').toLowerCase(),
        isRequired: field.isRequired || false,
        options, // exact options for select/multiselect/boolean fields
      };
    }
  }

  return schema;
}

// ── Profile value mapping ─────────────────────────────────────────────────────

function getAshbyValue(fieldId, fieldTitle, profile) {
  const id = fieldId.toLowerCase();
  const title = (fieldTitle || '').toLowerCase();
  const latestJob = profile.workExperience?.[0];
  const addr = profile.address || {};

  if (id.includes('_systemfield_name') || id === 'name' || title === 'name' || title === 'full name' || title === 'full_name') {
    return `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  }
  if (id.includes('first_name') || id.includes('firstname') || title.includes('first name')) return profile.firstName;
  if (id.includes('preferred') && (id.includes('name') || title.includes('preferred'))) return profile.preferredFirstName || profile.firstName;
  if (id.includes('last_name') || id.includes('lastname') || title.includes('last name')) return profile.lastName;
  if (id.includes('email') || title.includes('email')) return profile.email;
  if (id.includes('phone') || title.includes('phone') || title.includes('mobile') || title.includes('telephone')) return profile.phone;
  if (id.includes('linkedin') || title.includes('linkedin')) return profile.linkedinUrl;
  if (id.includes('github') || title.includes('github')) return profile.githubUrl;
  if (id.includes('website') || id.includes('portfolio') || title.includes('website') || title.includes('portfolio')) return profile.portfolioUrl;
  if (id.includes('resume_url') || id.includes('resumeurl') || title.includes('google drive') || title.includes('resume link') || title.includes('dropbox')) return profile.resumeUrl;
  // "Which country do you intend to work from?" — country-only field
  if ((id.includes('country') && !id.includes('city')) || (title.includes('country') && !title.includes('city'))) {
    return addr.country || addr.state || '';
  }
  if (id.includes('location') || id.includes('city') || title.includes('location') || title.includes('city') || (title.includes('city') && title.includes('country'))) {
    // "Please list your city and country" — return City, Country combined
    return addr.city ? `${addr.city}, ${addr.country || addr.state || ''}`.trim().replace(/,$/, '') : '';
  }
  if (id.includes('company') || id.includes('employer') || title.includes('company') || title.includes('employer')) return latestJob?.company;
  if (id.includes('title') || id.includes('role') || title.includes('job title') || title.includes('current role')) return latestJob?.title;

  if (/visa|sponsor/i.test(id) || /visa|sponsor/i.test(title)) return profile.requiresVisaSponsorship;
  if (/work.?auth|authoriz|legally.?work/i.test(id) || /work.?auth|authoriz|legally.?work/i.test(title)) return profile.workAuthorized;

  if (/gender/i.test(id) || /gender/i.test(title)) return normalizeGenderForSelect(profile.gender);
  if (/disab/i.test(id) || /disab/i.test(title)) return profile.disabilityStatus;
  if (/veteran|military/i.test(id) || /veteran|military/i.test(title)) return profile.veteranStatus;
  if (/\bage\b|age.?range/i.test(id) || /\bage\b|age.?range|how.?old|current.?age/i.test(title)) return profile.ageRange;
  if (/ethnicity|race\b/i.test(id) || /ethnicity|\brace\b/i.test(title)) return profile.ethnicity;

  if (/on.?site|in.?office|remote/i.test(id) || /on.?site|in.?office|meet.*requirement/i.test(title)) return profile.willingToWorkOnsite;
  if (/salary|compensation|pay/i.test(id) || /salary|compensation|pay/i.test(title)) return profile.salaryExpectation;
  if (/cover.?letter/i.test(id) || /cover.?letter/i.test(title)) return profile.defaultCoverLetter;

  return null;
}

// ── Best-option matching using schema options ─────────────────────────────────
// Finds the closest option label/value to profileValue using the known options list.
// Much more reliable than DOM partial-text matching for long EEO option strings.
function matchToSchemaOption(profileValue, options) {
  if (!options?.length || !profileValue) return null;

  const pv = profileValue.toLowerCase().trim();

  // 1. Exact match on label or value
  let m = options.find(o => o.label.toLowerCase() === pv || o.value.toLowerCase() === pv);
  if (m) return m.label;

  // 2. Option label starts with profile value
  m = options.find(o => o.label.toLowerCase().startsWith(pv));
  if (m) return m.label;

  // 3. Option label contains profile value
  m = options.find(o => o.label.toLowerCase().includes(pv));
  if (m) return m.label;

  // 4. Profile value contains option label (e.g. profile="Not a protected veteran", option="Not a Veteran")
  m = options.find(o => pv.includes(o.label.toLowerCase()));
  if (m) return m.label;

  return null;
}

// ── Boolean (Yes/No) field handling ──────────────────────────────────────────
// Modern Ashby: two <button> elements (Yes/No) inside a div with class containing "yesno",
// with a hidden <input type="checkbox" name="{fieldId}"> to store the value.
// Older builds: radio inputs. We try buttons first, radios as fallback.
function fillAshbyBoolean(container, value, fieldId) {
  if (!value) return false;
  const want = value.toLowerCase().trim();
  const fid = fieldId || container.getAttribute('data-field-id') || '';
  const questionLabelEl = fid ? document.querySelector(`label[for="${fid}"]`) : null;
  const logLabel = questionLabelEl?.textContent?.trim() || getLabelText(container) || fid;

  // Button-based Yes/No (modern Ashby)
  const widget = findAshbyYesNoWidget(container, fid);
  if (widget) {
    const btn = clickAshbyYesNoButton(widget, want);
    if (btn) { appendFillLog(logLabel, value, 'field'); return true; }
  }

  // Radio-based fallback (older builds)
  function getOptLabel(r) {
    return (r.getAttribute('aria-label') || getRadioOptionLabel(r, document) || r.value || '').toLowerCase().trim();
  }
  function clickMatchedRadio(radios) {
    const synonyms = getRadioValueSynonyms(want);
    const match = radios.find(r => {
      const optLabel = getOptLabel(r);
      if (!optLabel) return false;
      const wordMatch = (w) => optLabel === w
        || (optLabel.startsWith(w) && optLabel.length > w.length && !/[a-z0-9]/i.test(optLabel[w.length]));
      return wordMatch(want) || synonyms.some(s => wordMatch(s));
    });
    if (!match || match.checked) return false;
    clickRadio(match);
    appendFillLog(logLabel, value, 'field');
    return true;
  }
  const roots = [container, container.nextElementSibling, container.parentElement,
                 container.parentElement?.nextElementSibling, container.parentElement?.parentElement];
  for (const root of roots) {
    if (!root) continue;
    const radios = Array.from(root.querySelectorAll('input[type="radio"]')).filter(r => !r.disabled);
    if (radios.length && clickMatchedRadio(radios)) return true;
  }
  if (fid) {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
      .filter(r => (r.getAttribute('name') || '').includes(fid) && !r.disabled);
    if (radios.length && clickMatchedRadio(radios)) return true;
  }

  const sel = container.querySelector('select') || container.parentElement?.querySelector('select');
  if (sel) return setSelectValue(sel, value);
  return false;
}

// Find the _yesno_ button widget for a field
function findAshbyYesNoWidget(container, fieldId) {
  if (fieldId) {
    const cb = document.querySelector(`input[type="checkbox"][name="${fieldId}"]`);
    if (cb) return cb.closest('[class*="yesno" i]') || cb.parentElement;
  }
  for (const root of [container, container.nextElementSibling, container.parentElement]) {
    if (!root) continue;
    const w = root.querySelector('[class*="yesno" i]');
    if (w) return w;
    if (typeof root.className === 'string' && root.className.toLowerCase().includes('yesno')) return root;
  }
  return null;
}

// Click the Yes or No button in an Ashby _yesno_ widget
function clickAshbyYesNoButton(widget, want) {
  const synonyms = getRadioValueSynonyms(want);
  const buttons = Array.from(widget.querySelectorAll('button'));
  const match = buttons.find(btn => {
    const text = btn.textContent.trim().toLowerCase();
    const wordMatch = (w) => text === w
      || (text.startsWith(w) && text.length > w.length && !/[a-z0-9]/i.test(text[w.length]));
    return wordMatch(want) || synonyms.some(s => wordMatch(s));
  });
  if (!match) return null;
  match.click();
  match.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return match;
}

// Scan ALL _yesno_ button widgets on the page and fill from rules
function fillAshbyYesNoFields(profile, alreadyFilledFieldIds) {
  const rules = [
    { test: t => /authorized.{0,40}work|work.{0,40}authoriz|legally.{0,30}work|eligible.{0,30}work/i.test(t),   value: profile.workAuthorized },
    { test: t => /visa.{0,40}sponsor|sponsor.{0,40}visa|require.*sponsor|future.*visa|future.*sponsor/i.test(t), value: profile.requiresVisaSponsorship },
    { test: t => /over.{0,5}18|at\s*least\s*18|age.{0,10}18|18.{0,10}(or\s*older|or\s*above|and\s*over|\+)|eighteen|legal\s*(working\s*)?age|legally\s*(eligible|old\s*enough)|old\s*enough\s*to\s*work/i.test(t), value: profile.over18 },
    { test: t => /willing.{0,20}relocat|open.{0,20}relocat/i.test(t),                                            value: 'Yes' },
    { test: t => /on.?site|in.?office|office.*days|meet this requirement/i.test(t),                               value: profile.willingToWorkOnsite },
    { test: t => /used.*\bai\b|ai.*answer|reflects.*voice|thought.*care.*put/i.test(t),                          value: 'Yes' },
  ];

  let filled = 0;
  document.querySelectorAll('input[type="checkbox"][name]').forEach(cb => {
    const fieldId = cb.name;
    if (alreadyFilledFieldIds.has(fieldId)) return;
    const widget = cb.closest('[class*="yesno" i]') || cb.parentElement;
    if (!widget || !widget.querySelector('button')) return;

    // label[for=fieldId] is how Ashby links question text to field (no data-field-id on most forms)
    const labelEl = document.querySelector(`label[for="${fieldId}"]`);
    if (!labelEl) return;
    const questionLabel = labelEl.textContent.trim().toLowerCase();
    if (!questionLabel) return;

    for (const rule of rules) {
      if (!rule.test(questionLabel) || !rule.value) continue;
      const btn = clickAshbyYesNoButton(widget, rule.value.toLowerCase().trim());
      if (btn) {
        appendFillLog(questionLabel.slice(0, 60), rule.value, 'field');
        alreadyFilledFieldIds.add(fieldId);
        filled++;
      }
      break;
    }
  });
  return filled;
}

// Does this options list look like a Yes/No boolean? (true for 2 options that are yes/no)
function isYesNoOptionList(options) {
  if (!Array.isArray(options) || options.length !== 2) return false;
  const labels = options.map(o => (o.label || '').toLowerCase().trim());
  const hasYes = labels.some(l => l === 'yes' || l === 'true' || l === 'y');
  const hasNo  = labels.some(l => l === 'no'  || l === 'false' || l === 'n');
  return hasYes && hasNo;
}

// ── Radio group filling — Ashby-specific ─────────────────────────────────────
// Ashby radio name format: "{formId}_{fieldId}"
// The fieldId (second UUID) matches the [data-field-id] attribute of the question container.
// Radios live OUTSIDE that container, so we must look up the label via the name.
function fillAshbyRadioGroups(profile, alreadyFilled) {
  let filled = 0;

  // Same rules as fillLeverRadios
  const rules = [
    { test: t => /authorized.{0,40}work|work.{0,40}authoriz|legally.{0,30}work|eligible.{0,30}work/i.test(t),  value: profile.workAuthorized },
    { test: t => /visa.{0,40}sponsor|sponsor.{0,40}visa|require.*sponsor|future.*visa|future.*sponsor/i.test(t), value: profile.requiresVisaSponsorship },
    { test: t => /over.{0,5}18|at\s*least\s*18|age.{0,10}18|18.{0,10}(or\s*older|or\s*above|and\s*over|\+)|eighteen|legal\s*(working\s*)?age|legally\s*(eligible|old\s*enough)|old\s*enough\s*to\s*work/i.test(t),
      get value() { const a = getAgeFromDOB(profile.dateOfBirth); return a !== null ? (a >= 18 ? 'Yes' : 'No') : profile.over18; } },
    { test: t => /willing.{0,20}relocat|open.{0,20}relocat/i.test(t),                                           value: 'Yes' },
    { test: t => /on.?site|in.?office|office.*days|meet this requirement/i.test(t),                              value: profile.willingToWorkOnsite },
    { test: t => /\bgender\b|gender.{0,15}identity/i.test(t),                                                    value: profile.gender },
    { test: t => /disability|disabled/i.test(t),                                                                  value: profile.disabilityStatus },
    { test: t => /veteran|military.{0,20}status/i.test(t),                                                        value: profile.veteranStatus },
    { test: t => /\bage\b|age\s*range|how\s*old|current\s*age/i.test(t),
      matchFn: (radios) => {
        const age = getAgeFromDOB(profile.dateOfBirth);
        if (age === null) return null;
        const optLabels = radios.map(r => getRadioOptionLabel(r, document));
        const best = matchAgeToOption(age, optLabels);
        return best ? radios.find(r => getRadioOptionLabel(r, document) === best) : null;
      }
    },
    { test: t => /\brace\b|ethnicity|ethnic\s*group/i.test(t),                                                    value: profile.ethnicity },
    { test: t => /used.*\bai\b|ai.*answer|reflects.*voice|voice.*experience|accurate.*reflect|thought.*care.*put/i.test(t), value: 'Yes' },
  ];

  // Group radios by name attribute
  const groups = {};
  document.querySelectorAll('input[type="radio"]').forEach(r => {
    const name = r.getAttribute('name');
    if (!name) return;
    if (!groups[name]) groups[name] = [];
    groups[name].push(r);
  });

  for (const [groupName, radios] of Object.entries(groups)) {
    if (radios.some(r => r.checked)) continue;
    if (radios.some(r => alreadyFilled.has(r))) continue;

    // Get question label using Ashby's UUID naming convention:
    // name = "{formId}_{fieldId}" — fieldId matches [data-field-id]
    let groupLabel = getAshbyRadioGroupLabel(groupName);

    // Fallback to generic DOM walking if UUID lookup fails
    if (!groupLabel) groupLabel = getRadioGroupLabel(radios[0], document);
    if (!groupLabel) continue;

    let matched = false;
    for (const rule of rules) {
      if (!rule.test(groupLabel)) continue;

      let chosen = null;

      if (rule.matchFn) {
        chosen = rule.matchFn(radios);
      } else {
        if (!rule.value) continue;
        const want = rule.value.toLowerCase().trim();
        const synonyms = getRadioValueSynonyms(want);
        const wordMatch = (optLabel, w) => optLabel === w
            || (optLabel.startsWith(w) && optLabel.length > w.length && !/[a-z0-9]/i.test(optLabel[w.length]));
        chosen = radios.find(r => {
          const optLabel = getRadioOptionLabel(r, document).toLowerCase().trim();
          return wordMatch(optLabel, want) || synonyms.some(s => wordMatch(optLabel, s));
        });
      }

      if (chosen && !alreadyFilled.has(chosen)) {
        clickRadio(chosen);
        alreadyFilled.add(chosen);
        filled++;
      }
      matched = true;
      break;
    }

    // EEO fallback: unmatched diversity question → "I prefer not to answer"
    if (!matched && /gender|age\s*range|current\s*age|ethnicity|race\b|disability|veteran|military|sexual\s*orient|pronoun/i.test(groupLabel)) {
      const PREFER_NOT_RE = /prefer\s*(not|to\s*not)\s*(to\s*)?answer|decline|not\s*(wish|want)\s*to/i;
      const fallback = radios.find(r => PREFER_NOT_RE.test(getRadioOptionLabel(r, document)));
      if (fallback && !alreadyFilled.has(fallback)) {
        clickRadio(fallback);
        alreadyFilled.add(fallback);
        filled++;
      }
    }
  }

  return filled;
}

// Extract the question label for an Ashby radio group.
// Ashby radio name = "{formId}_{fieldId}".
// The question label element uses for="{fieldId}" — this is the most reliable lookup.
// Falls back to [data-field-id] for older Ashby builds, then to fieldset walking.
function getAshbyRadioGroupLabel(radioName) {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const parts = radioName.split('_');

  for (let i = parts.length - 1; i >= 0; i--) {
    if (!uuidRe.test(parts[i])) continue;
    const fieldId = parts[i];

    // Primary: label[for=fieldId] — Ashby question labels use for=fieldId directly
    const labelEl = document.querySelector(`label[for="${fieldId}"]`);
    if (labelEl) {
      const txt = labelEl.textContent.trim();
      if (txt.length > 4 && txt.length < 500) return txt.toLowerCase();
    }

    // Secondary: [data-field-id] container (older Ashby builds)
    const container = document.querySelector(`[data-field-id="${fieldId}"]`);
    if (container) {
      const txt = container.textContent.trim();
      if (txt.length > 4 && txt.length < 500) return txt.toLowerCase();
    }
  }
  return '';
}

// ── Checkbox groups — diversity survey filling ────────────────────────────────
// Ashby renders checkboxes with IDs like: {prefix}-labeled-checkbox-{N}
// where all checkboxes in the same question share the same prefix.
// They are NOT inside [data-field-id] containers.
function fillAshbyCheckboxGroups(profile) {
  const PREFER_NOT_RE = /prefer\s*(not|to\s*not)\s*(to\s*)?answer|decline|not\s*(wish|want)\s*to|none\s*of\s*the\s*above/i;
  let filled = 0;

  const groupMap = new Map(); // prefix → checkbox[]

  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    // Ashby's checkbox <input>s are visually hidden like radios — check disabled only
    if (cb.disabled) return;

    let key;

    // Primary: group by ID prefix — strip suffix patterns Ashby uses across builds:
    //   "{prefix}-labeled-checkbox-N", "{prefix}-checkbox-N", "{prefix}-option-N", "{prefix}-N"
    if (cb.id) {
      const m = cb.id.match(/^(.+?)-(?:labeled-)?(?:checkbox|option|opt|cb)-\d+$/i)
             || cb.id.match(/^(.+?)-\d+$/);
      if (m) { key = m[1]; }
    }

    // Secondary: group by shared name when it's a UUID (identical name = same group)
    // When name is human text (e.g. "Tuesday through Saturday"), group by DOM ancestor instead
    if (!key && cb.name && /^[0-9a-f-]{36}$/.test(cb.name)) {
      key = 'name:' + cb.name;
    }

    // Fallback: shared DOM ancestor (fieldset, role=group, or any common container)
    if (!key) {
      const ancestor = cb.closest('[role="group"], fieldset, [data-field-id], [class*="checkbox" i], [class*="CheckboxGroup" i]')
                    || cb.parentElement?.parentElement;
      if (ancestor) {
        if (!ancestor.__speedyCbKey) ancestor.__speedyCbKey = '_cbg_' + Math.random().toString(36).slice(2);
        key = ancestor.__speedyCbKey;
      }
    }

    if (!key) return;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(cb);
  });

  const CONSENT_RE = /\b(i\s*(agree|confirm|accept|acknowledge|consent|certify|authorize|understand)|terms|privacy|policy|gdpr|data\s*protection|have\s*read)\b/i;

  for (const [, cbs] of groupMap) {
    if (cbs.some(c => c.checked)) continue;

    // Standalone consent checkbox — single checkbox whose label says "I agree / accept / terms"
    if (cbs.length === 1) {
      const cb = cbs[0];
      const optText = getAshbyCheckboxOptionLabel(cb);
      const ctxText = getAshbyCheckboxGroupLabel(cb) || optText;
      if (CONSENT_RE.test(optText) || CONSENT_RE.test(ctxText)) {
        clickAshbyCheckbox(cb, ctxText || 'consent');
        filled++;
      }
      continue;
    }

    // Get the question label by walking up from the first checkbox
    const questionLabel = getAshbyCheckboxGroupLabel(cbs[0]);

    // Map question to a profile value
    let profileValue = null;
    if (/ethnicity|\brace\b/i.test(questionLabel))          profileValue = profile?.ethnicity;
    else if (/\bgender\b/i.test(questionLabel))             profileValue = profile?.gender;
    else if (/disabilit|communit|identit/i.test(questionLabel)) profileValue = profile?.disabilityStatus;
    else if (/veteran|military/i.test(questionLabel))       profileValue = profile?.veteranStatus;

    const profileWantsPreferNot = profileValue && PREFER_NOT_RE.test(profileValue);

    if (profileValue && !profileWantsPreferNot) {
      const pv = profileValue.toLowerCase().trim();
      const synonyms = getRadioValueSynonyms(pv);

      const match = cbs.find(cb => {
        const optLabel = getAshbyCheckboxOptionLabel(cb).toLowerCase().trim();
        return optLabel === pv ||
               optLabel.includes(pv) ||
               pv.includes(optLabel) ||
               synonyms.some(s => optLabel === s || optLabel.includes(s));
      });

      if (match) {
        clickAshbyCheckbox(match, questionLabel);
        filled++;
        continue;
      }
    }

    // Only fall back to "prefer not to answer" on known diversity questions — never
    // blanket-check this option on arbitrary multi-checkbox groups.
    const isDiversity = /gender|ethnicity|race\b|disability|veteran|military|sexual|identity|communit/i.test(questionLabel);
    if (!isDiversity) continue;
    const preferNot = cbs.find(cb => PREFER_NOT_RE.test(getAshbyCheckboxOptionLabel(cb)));
    if (preferNot) {
      clickAshbyCheckbox(preferNot, questionLabel);
      filled++;
    }
  }

  return filled;
}

// Get the label text for a checkbox option — label[for] is most reliable on Ashby
function getAshbyCheckboxOptionLabel(cb) {
  if (cb.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  // name attribute IS the option text on Ashby
  if (cb.getAttribute('name') && !/^[0-9a-f-]{36}$/.test(cb.getAttribute('name'))) {
    return cb.getAttribute('name');
  }
  return cb.closest('label')?.textContent.trim() || '';
}

// Walk up from a checkbox to find the question label.
// Primary: extract fieldId from checkbox id prefix, use label[for=fieldId].
// Fallback: walk up to fieldset and read its question label element.
function getAshbyCheckboxGroupLabel(cb) {
  // Extract fieldId from id like "{formId}_{fieldId}-labeled-checkbox-N"
  if (cb.id) {
    const m = cb.id.match(/^[^_]+_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i);
    if (m) {
      const labelEl = document.querySelector(`label[for="${m[1]}"]`);
      if (labelEl) {
        const txt = labelEl.textContent.trim();
        if (txt.length > 4) return txt.toLowerCase();
      }
    }
  }

  // Fallback: walk up DOM looking for a label/legend that doesn't contain inputs
  let node = cb.parentElement;
  const visited = new Set();
  while (node && node !== document.body) {
    if (visited.has(node)) break;
    visited.add(node);
    const candidates = node.querySelectorAll(
      ':scope > label, :scope > legend, :scope > p, :scope > h2, :scope > h3, :scope > h4, ' +
      ':scope > [class*="label" i], :scope > [class*="question" i], :scope > [class*="title" i]'
    );
    for (const c of candidates) {
      if (c.contains(cb)) continue;
      if (c.querySelector('input, select, textarea')) continue;
      const text = c.textContent.trim();
      if (text.length > 4 && text.length < 400) return text.toLowerCase();
    }
    node = node.parentElement;
  }
  return '';
}

// Click a checkbox reliably in React — try label first, then native setter
function clickAshbyCheckbox(cb, questionLabel) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;

  // Ashby: React onClick/onChange is on the input itself — call via __reactProps$ directly
  if (triggerReactHandler(cb)) {
    if (nativeSetter) nativeSetter.call(cb, true);
    appendFillLog(questionLabel || 'diversity', getAshbyCheckboxOptionLabel(cb), 'field');
    return;
  }

  // Fallback: label click, then direct input
  if (cb.id) {
    const label = document.querySelector(`label[for="${CSS.escape(cb.id)}"]`);
    if (label) {
      label.click();
      label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (nativeSetter) nativeSetter.call(cb, true);
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      appendFillLog(questionLabel || 'diversity', getAshbyCheckboxOptionLabel(cb), 'field');
      return;
    }
  }
  cb.focus();
  cb.click();
  if (nativeSetter) nativeSetter.call(cb, true);
  cb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  cb.dispatchEvent(new Event('change', { bubbles: true }));
  appendFillLog(questionLabel || 'diversity', getAshbyCheckboxOptionLabel(cb), 'field');
}

// ── Text input fill with execCommand fallback ─────────────────────────────────
// For React 18 apps (like Ashby) where triggerNativeInput alone may not update state
function ashbyFillText(input, value) {
  triggerNativeInput(input, value);

  // If the React state didn't pick it up (value not reflected), try execCommand
  // execCommand('insertText') uses the browser's native editing pipeline which
  // React hooks into at a lower level than synthetic events
  if (input.value !== value && document.execCommand) {
    input.focus();
    input.select();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, value);
  }
}

// ── Main fill function ────────────────────────────────────────────────────────

async function fillAshby(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };

  // 1. sessionStorage bridge — early intercept (MAIN world) writes here on fetch intercept
  if (!ashbyFormSchema) {
    try {
      const stored = sessionStorage.getItem('__speedyapplyAshbySchema');
      if (stored) ashbyFormSchema = parseAshbySchema(JSON.parse(stored));
    } catch {}
  }

  // 2. Direct API fetch — extension fetch bypasses page CSP entirely.
  //    Extract posting ID from the inline __appData script tag.
  if (!ashbyFormSchema) {
    try {
      const postingId = getAshbyPostingId();
      if (postingId) {
        const resp = await fetch('https://api.ashbyhq.com/applicationForm.info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobPostingId: postingId }),
        });
        const data = await resp.json();
        const form = data?.results?.applicationForm || data?.applicationForm;
        if (form) ashbyFormSchema = parseAshbySchema(form);
      }
    } catch {}
  }

  // 3. Wait for event (catches cases where early intercept fires after fillAshby starts)
  if (!ashbyFormSchema) {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 3000);
      window.addEventListener('speedyapply:ashby:schema', (e) => {
        clearTimeout(timeout);
        ashbyFormSchema = parseAshbySchema(e.detail);
        resolve();
      }, { once: true });
    });
  }

  // Extra wait — React needs time to fully mount all field components after schema loads
  await new Promise(r => setTimeout(r, 600));

  // ── Path A: Use intercepted API schema (most accurate) ───────────────────
  if (ashbyFormSchema && Object.keys(ashbyFormSchema).length > 0) {
    const filledEls = new Set();

    for (const [fieldId, fieldInfo] of Object.entries(ashbyFormSchema)) {
      const rawValue = getAshbyValue(fieldId, fieldInfo.title, profile);
      if (!rawValue) { results.skipped++; continue; }

      // Find the field container using multiple strategies — Ashby stopped using data-field-id
      // on modern forms. Try: legacy data-field-id → input id → input name → label[for]
      const container = document.querySelector(`[data-field-id="${fieldId}"]`)
        || document.getElementById(fieldId)?.closest('._fieldEntry_17tft_29, [class*="fieldEntry" i], fieldset')
        || document.querySelector(`[name="${fieldId}"]`)?.closest('._fieldEntry_17tft_29, [class*="fieldEntry" i], fieldset')
        || document.querySelector(`label[for="${fieldId}"]`)?.closest('._fieldEntry_17tft_29, [class*="fieldEntry" i], fieldset');
      if (!container) { results.skipped++; continue; }

      const fieldType = fieldInfo.type; // 'string', 'longtext', 'select', 'boolean', etc.

      // Boolean field — button-based Yes/No (modern Ashby) or radio-based (older)
      const isBooleanField = fieldType === 'boolean'
                          || fieldType === 'yesno'
                          || isYesNoOptionList(fieldInfo.options);
      if (isBooleanField) {
        if (fillAshbyBoolean(container, rawValue, fieldId)) {
          results.filled++;
          results.fields.push(fieldId);
          document.querySelectorAll('input[type="radio"]').forEach(r => {
            if ((r.getAttribute('name') || '').includes(fieldId)) filledEls.add(r);
          });
        } else {
          results.skipped++;
        }
        continue;
      }

      // Select / enum field — use schema options for accurate matching
      if ((fieldType === 'select' || fieldType === 'valueoption') && fieldInfo.options?.length) {
        const bestLabel = matchToSchemaOption(rawValue, fieldInfo.options);
        const valueToFill = bestLabel || rawValue;

        const sel = container.querySelector('select');
        if (sel && isVisible(sel) && !sel.disabled) {
          if (setSelectValue(sel, valueToFill)) {
            results.filled++; results.fields.push(fieldId); filledEls.add(sel);
          } else { results.skipped++; }
          continue;
        }

        // Combobox / typeahead
        const comboInput = container.querySelector('[role="combobox"], [aria-haspopup="listbox"]');
        if (comboInput) {
          const ok = await fillAshbyCombobox(comboInput, valueToFill);
          if (ok) { results.filled++; results.fields.push(fieldId); filledEls.add(comboInput); }
          else { results.skipped++; }
          continue;
        }

        results.skipped++;
        continue;
      }

      // Text / textarea / contenteditable fields
      // Prefer direct getElementById lookup (id === fieldId on modern Ashby forms)
      const input = document.getElementById(fieldId)
        || container.querySelector('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea')
        || (container.tagName === 'INPUT' ? container : null);

      const contentEl = !input ? container.querySelector('[contenteditable="true"]') : null;

      if (contentEl && isVisible(contentEl) && !contentEl.textContent.trim()) {
        contentEl.focus();
        contentEl.textContent = rawValue;
        contentEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: rawValue }));
        contentEl.dispatchEvent(new Event('change', { bubbles: true }));
        appendFillLog(fieldInfo.title || fieldId, rawValue, 'field');
        results.filled++; results.fields.push(fieldId); filledEls.add(contentEl);
        continue;
      }

      if (!input || input.disabled) { results.skipped++; continue; }
      if (input.value) { results.skipped++; continue; }

      ashbyFillText(input, rawValue);
      results.filled++;
      results.fields.push(fieldId);
      filledEls.add(input);
    }

    // Button-based Yes/No fields (modern Ashby)
    const filledYesNoIds = new Set(results.fields);
    results.filled += fillAshbyYesNoFields(profile, filledYesNoIds);

    // Radio groups — uses Ashby UUID-name trick to find question labels reliably
    results.filled += fillAshbyRadioGroups(profile, filledEls);

    // Diversity survey checkboxes — fill from profile or default to "I prefer not to answer"
    results.filled += fillAshbyCheckboxGroups(profile);

    // Generic label pass for fields not in schema
    const genericResults = await fillGenericLabelPass(profile, filledEls);
    results.filled += genericResults.filled;
    results.skipped += genericResults.skipped;

    return results;
  }

  // ── Path B: No schema — direct data-field-id targeting + generic fallback ──
  const filledEls = new Set();

  const directMappings = [
    ['_systemfield_name',         `${profile.firstName || ''} ${profile.lastName || ''}`.trim()],
    ['_systemfield_first_name',   profile.firstName],
    ['_systemfield_last_name',    profile.lastName],
    ['_systemfield_email',        profile.email],
    ['_systemfield_phone',        profile.phone],
    ['_systemfield_linkedin_url', profile.linkedinUrl],
    ['_systemfield_website_url',  profile.portfolioUrl],
    ['_systemfield_location',     profile.address?.city ? `${profile.address.city}, ${profile.address.country || profile.address.state || ''}`.trim().replace(/,$/, '') : ''],
  ];

  for (const [fieldId, value] of directMappings) {
    if (!value) continue;
    const container = document.querySelector(`[data-field-id="${fieldId}"]`);
    if (!container) continue;
    const el = container.querySelector('input:not([type="hidden"]), select, textarea');
    if (!el || !isVisible(el) || el.disabled) continue;
    if (el.tagName !== 'SELECT' && el.value) continue;
    if (el.tagName === 'SELECT') { setSelectValue(el, value); }
    else { ashbyFillText(el, value); }
    results.filled++;
    results.fields.push(fieldId);
    filledEls.add(el);
  }

  results.filled += fillAshbyYesNoFields(profile, new Set(results.fields));
  results.filled += fillAshbyRadioGroups(profile, filledEls);
  results.filled += fillAshbyCheckboxGroups(profile);

  // Comprehensive DOM scan — catches everything direct mappings miss
  const genericLabel = await fillGenericLabelPass(profile, filledEls);
  results.filled += genericLabel.filled;
  results.skipped += genericLabel.skipped;

  return results;
}

// ── Supplementary generic label pass ─────────────────────────────────────────
// Scans ALL visible inputs using getLabelText (9-method detection).
// Ashby uses React components that don't have label[for] attributes,
// so scanning label[for] alone misses almost everything.
async function fillGenericLabelPass(profile, alreadyFilled) {
  const results = { filled: 0, skipped: 0 };
  const fieldValues = buildFieldValues(profile);

  // Add Ashby-specific fields not in buildFieldValues
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  if (fullName) fieldValues.fullName = fullName;
  if (profile.salaryExpectation) fieldValues.salaryExpectation = profile.salaryExpectation;
  if (profile.defaultCoverLetter) fieldValues.coverLetter = profile.defaultCoverLetter;
  if (profile.workAuthorizationNote) fieldValues.workAuthorizationNote = profile.workAuthorizationNote;
  const addr = profile.address || {};
  if (addr.city) {
    fieldValues.location = `${addr.city}, ${addr.country || addr.state || ''}`.trim().replace(/,$/, '');
  }
  // country standalone (e.g. "Which country do you intend to work from?")
  if (addr.country) fieldValues.country = addr.country;

  const allInputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select'
  );

  for (const input of allInputs) {
    if (alreadyFilled.has(input)) continue;
    if (!isVisible(input) || input.disabled) continue;
    if (input.tagName !== 'SELECT' && input.value) continue; // already filled

    // getLabelText uses all 9 detection methods — far more reliable than label[for] alone
    let labelText = getLabelText(input);

    // Ashby fallback: walk up to the data-field-id container and read its label text
    if (!labelText) {
      let node = input.parentElement;
      while (node && !node.hasAttribute('data-field-id')) node = node.parentElement;
      if (node) {
        const labelEl = node.querySelector('label, [class*="label" i], legend');
        if (labelEl) {
          // Exclude the label text if it contains another input
          if (!labelEl.querySelector('input,select,textarea')) {
            labelText = labelEl.textContent.trim().toLowerCase();
          }
        }
      }
    }

    if (!labelText) { results.skipped++; continue; }

    // Try matchLabelToField (handles standard profile fields)
    let fieldName = matchLabelToField(labelText, input);

    // Handle fullName — Ashby's combined "Name *" field
    if (!fieldName && /^name\b/i.test(labelText.trim()) && !/last|first|middle|preferred/i.test(labelText)) {
      fieldName = 'fullName';
    }
    // "Please list your city and country" / "City and Country" — combined location field
    // matchLabelToField would return 'city' alone; override to use "City, Country" format
    if ((fieldName === 'city' || fieldName === 'country') && /city/i.test(labelText) && /country/i.test(labelText)) {
      fieldName = 'location';
    }
    // Location / city / where are you located (single field)
    if (!fieldName && /\blocation\b|where.*located/i.test(labelText)) {
      fieldName = 'location';
    }
    // "Which country do you intend to work from?" or similar country-only fields
    if (!fieldName && /\bcountry\b/i.test(labelText)) {
      fieldName = 'country';
    }
    // Salary / compensation
    if (!fieldName && /salary|compensation|pay\s*expectation/i.test(labelText)) {
      fieldName = 'salaryExpectation';
    }
    // Cover letter
    if (!fieldName && /cover.?letter/i.test(labelText)) {
      fieldName = 'coverLetter';
    }
    // Work authorization note
    if (!fieldName && /citizenship|work\s*authoriz|visa|permit|immigration/i.test(labelText)) {
      fieldName = 'workAuthorizationNote';
    }

    if (!fieldName || !fieldValues[fieldName]) { results.skipped++; continue; }

    const valueToFill = fieldValues[fieldName];

    if (input.tagName === 'SELECT') {
      if (setSelectValue(input, valueToFill)) {
        results.filled++;
        alreadyFilled.add(input);
      } else {
        results.skipped++;
      }
    } else {
      // Detect combobox/typeahead: Ashby's country/location pickers show "Start typing..."
      const isTypeahead = input.placeholder?.toLowerCase().includes('start typing') ||
                          input.getAttribute('role') === 'combobox' ||
                          input.getAttribute('aria-autocomplete') === 'list' ||
                          !!input.closest('[role="combobox"]');

      if (isTypeahead) {
        const filled = await fillAshbyCombobox(input, valueToFill);
        if (filled) { results.filled++; alreadyFilled.add(input); }
        else results.skipped++;
      } else {
        ashbyFillText(input, valueToFill);
        results.filled++;
        alreadyFilled.add(input);
      }
    }
  }

  return results;
}

// Fill an Ashby combobox/typeahead:
// 1. Click the toggle button (if present) to open the dropdown
// 2. Type the value to filter options
// 3. Wait for options to render, then click the best match
async function fillAshbyCombobox(input, value) {
  // Open dropdown via toggle button if it exists (Ashby's dropdown arrow)
  const wrapper = input.closest('[class*="inputContainer" i], [class*="combobox" i]') || input.parentElement;
  const toggleBtn = wrapper?.querySelector('button[class*="toggle" i], button[class*="arrow" i], button[class*="chevron" i]');
  if (toggleBtn && input.getAttribute('aria-expanded') !== 'true') {
    toggleBtn.click();
    await new Promise(r => setTimeout(r, 150));
  }

  // Type the value
  input.focus();
  ashbyFillText(input, value);

  // Wait for dropdown to render (up to 800ms with two checks)
  for (const delay of [300, 500]) {
    await new Promise(r => setTimeout(r, delay));
    const selected = await clickBestDropdownOption(value);
    if (selected) return true;
  }

  // If no option was found, the typed text may still be accepted by the form
  // Return true so we don't mark it as skipped — the field has a value
  return input.value.length > 0;
}

// After typing into a typeahead/combobox, find and click the best matching dropdown option
async function clickBestDropdownOption(value) {
  const OPTION_SELECTORS = [
    '[role="option"]',
    '[role="listbox"] li',
    '[role="listbox"] [role="option"]',
    '[role="menu"] [role="menuitem"]',
    '[data-automation-id*="option"]',
    '[class*="_option_"]:not(select):not(input)',
    '[class*="option"]:not(select):not(input)',
    '[class*="suggestion"]',
    '[class*="_item_"]:not(select):not(input)',
    'li[data-value]',
  ];

  const valueLower = value.toLowerCase().trim();

  for (const sel of OPTION_SELECTORS) {
    const options = Array.from(document.querySelectorAll(sel));
    if (!options.length) continue;

    const match = options.find(o => {
      const text = o.textContent.trim().toLowerCase();
      return text === valueLower || text.startsWith(valueLower) || valueLower.startsWith(text);
    });

    if (match) {
      match.click();
      match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    }
  }
  return false;
}
