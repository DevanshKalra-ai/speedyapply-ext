// SpeedyApply — portals/lever.js
// Lever autofill adapter

async function fillLever(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  const doc = window.self !== window.top ? window.document : document;

  // Direct name-attribute mappings
  const directMappings = [
    ['name', `${profile.firstName || ''} ${profile.lastName || ''}`.trim()],
    ['email', profile.email],
    ['phone', profile.phone],
    ['org', profile.workExperience?.[0]?.company],
    ['urls[LinkedIn]', profile.linkedinUrl],
    ['urls[GitHub]', profile.githubUrl],
    ['urls[Portfolio]', profile.portfolioUrl],
    ['urls[Other]', profile.portfolioUrl],
  ];

  for (const [name, value] of directMappings) {
    if (!value) continue;
    const el = doc.querySelector(`input[name="${name}"]`);
    if (el && isVisible(el) && !el.disabled && !el.value) {
      triggerNativeInput(el, value);
      results.filled++;
      results.fields.push(name);
      alreadyFilled.add(el);
    }
  }

  // Radio buttons (Yes/No questions)
  results.filled += fillLeverRadios(doc, profile, alreadyFilled);

  // Open-text questions matched by label
  results.filled += fillLeverTextQuestions(doc, profile, alreadyFilled);

  // Dropdowns matched by label
  results.filled += fillLeverDropdowns(doc, profile, alreadyFilled);

  // Generic fallback
  const generic = mapAndFill(profile, alreadyFilled);
  results.filled += generic.filled;
  results.skipped += generic.skipped;

  return results;
}

// ── Radio helper utilities ───────────────────────────────────────────────────

// Map profile stored values → alternate option labels used by various portals.
// Ashby uses "Man/Woman", Greenhouse uses "Male/Female" — both need to work.
function getRadioValueSynonyms(value) {
  const map = {
    'male':                       ['man', 'male'],
    'female':                     ['woman', 'female'],
    'non-binary':                 ['non-binary', 'nonbinary', 'non binary', 'another gender identity'],
    'decline to self identify':   ['i prefer not to answer', 'prefer not to answer', 'decline', 'prefer not', 'i prefer not'],
    "i don't wish to answer":     ['i prefer not to answer', 'prefer not to answer', 'decline', 'prefer not'],
    "i don't wish to disclose":   ['i prefer not to answer', 'prefer not to answer', 'decline', 'prefer not'],
    'not a protected veteran':    ['not a veteran', 'not a protected veteran', 'i am not a veteran'],
    'yes':                        ['yes'],
    'no':                         ['no'],
    'i prefer not to answer':     ['prefer not to answer', 'decline', 'prefer not', 'i prefer not'],
  };
  return map[value] || [];
}

// Trigger React's onChange handler on a radio/checkbox input.
// Content scripts run in isolated world — __reactProps$ is only visible in MAIN world.
// On Ashby: dispatch a custom event handled by ashby-intercept-early.js (MAIN world).
// On other portals: try __reactProps$ directly (may work depending on React version).
function triggerReactHandler(el) {
  if (window.location.hostname.includes('ashbyhq')) {
    document.dispatchEvent(new CustomEvent('speedyapply:reactFill', {
      detail: { id: el.id || '', name: el.getAttribute('name') || '' }
    }));
    return true;
  }
  const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
  if (!pk) return false;
  const props = el[pk];
  if (props?.onChange) {
    props.onChange({ target: { checked: true, value: el.value }, currentTarget: el, preventDefault: () => {}, stopPropagation: () => {} });
    return true;
  }
  return false;
}

// Click a radio input and fire all events React/custom frameworks need
function clickRadio(radio) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;

  // Ashby: React onClick/onChange is on the input itself — call it via __reactProps$ directly
  if (triggerReactHandler(radio)) {
    if (nativeSetter) nativeSetter.call(radio, true);
    return;
  }

  // Prefer clicking the associated <label> — Lever custom components attach handler there
  if (radio.id) {
    const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
    if (label) {
      label.click();
      label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (nativeSetter) nativeSetter.call(radio, true);
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }

  // Fallback: direct input click with native setter
  radio.focus();
  if (nativeSetter) nativeSetter.call(radio, true);
  radio.click();
  radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  radio.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Radio button filling ────────────────────────────────────────────────────

function fillLeverRadios(doc, profile, alreadyFilled) {
  let filled = 0;

  const rules = [
    {
      test: t => /authorized.{0,40}work|work.{0,40}authoriz|legally.{0,30}work|eligible.{0,30}work/i.test(t),
      value: profile.workAuthorized,
    },
    {
      test: t => /visa.{0,40}sponsor|sponsor.{0,40}visa|work permit|require.*authorization|future.*visa|future.*sponsor|now.*require.*sponsor|require.*sponsor.*employ|employ.*visa.*status/i.test(t),
      value: profile.requiresVisaSponsorship,
    },
    {
      test: t => /over.{0,5}18|at\s*least\s*18|age.{0,10}18|18.{0,10}(or\s*older|or\s*above|and\s*over|\+)|eighteen|legal\s*(working\s*)?age|legally\s*(eligible|old\s*enough)|old\s*enough\s*to\s*work/i.test(t),
      get value() {
        const age = getAgeFromDOB(profile.dateOfBirth);
        if (age !== null) return age >= 18 ? 'Yes' : 'No';
        return profile.over18;
      },
    },
    {
      test: t => /willing.{0,20}relocat|open.{0,20}relocat/i.test(t),
      value: 'Yes',
    },
    {
      test: t => /on.?site|in.?office|office.*days|days.*week.*office|work from.*office|meet this requirement/i.test(t),
      value: profile.willingToWorkOnsite,
    },
    // EEO radio groups
    {
      test: t => /\bgender\b|gender.{0,15}identity/i.test(t),
      value: profile.gender,
    },
    {
      test: t => /disability|disabled/i.test(t),
      value: profile.disabilityStatus,
    },
    {
      test: t => /veteran|military.{0,20}status/i.test(t),
      value: profile.veteranStatus,
    },
    // Age range (diversity survey) — match dynamically against whatever buckets the form uses
    {
      test: t => /\bage\b|age\s*range|how\s*old|current\s*age/i.test(t),
      matchFn: (radios) => {
        const age = getAgeFromDOB(profile.dateOfBirth);
        if (age === null) return null;
        const optLabels = radios.map(r => getRadioOptionLabel(r, doc));
        const best = matchAgeToOption(age, optLabels);
        return best ? radios.find(r => getRadioOptionLabel(r, doc) === best) : null;
      },
    },
    // Race / ethnicity
    {
      test: t => /\brace\b|ethnicity|ethnic\s*group/i.test(t),
      value: profile.ethnicity,
    },
    // "Have you used AI?" — always honest Yes
    {
      test: t => /used.*\bai\b|ai.*answer|reflects.*voice|voice.*experience|accurate.*reflect|thought.*care.*put/i.test(t),
      value: 'Yes',
    },
  ];

  // Group radios by name attribute, with DOM-proximity fallback for React (nameless) radio groups
  const groups = {};
  doc.querySelectorAll('input[type="radio"]').forEach(radio => {
    const name = radio.getAttribute('name');
    if (name) {
      // Standard: group by name
      if (!groups[name]) groups[name] = [];
      groups[name].push(radio);
    } else {
      // React/custom radio: group by closest shared ancestor
      // data-field-id is the most reliable for Ashby — each question has its own container
      const groupRoot =
        radio.closest('[data-field-id]') ||
        radio.closest('fieldset') ||
        radio.closest('[role="radiogroup"]') ||
        radio.closest('[role="group"]') ||
        radio.parentElement?.parentElement; // common 2-level nesting pattern
      if (!groupRoot) return;
      // Use a WeakMap-friendly key via a data attribute trick
      if (!groupRoot.__speedyRadioKey) {
        groupRoot.__speedyRadioKey = '_dom_' + Math.random().toString(36).slice(2);
      }
      const key = groupRoot.__speedyRadioKey;
      if (!groups[key]) groups[key] = [];
      groups[key].push(radio);
    }
  });

  for (const radios of Object.values(groups)) {
    if (radios.some(r => r.checked)) continue; // already answered

    const groupLabel = getRadioGroupLabel(radios[0], doc);
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
        chosen = radios.find(r => {
          const optLabel = getRadioOptionLabel(r, doc).toLowerCase().trim();
          return optLabel === want ||
                 optLabel.startsWith(want) ||
                 want.startsWith(optLabel) ||
                 synonyms.some(s => optLabel === s || optLabel.startsWith(s));
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

    // Diversity survey fallback: if question looks like EEO and no rule matched,
    // default to "I prefer not to answer" / "Decline" option
    if (!matched && /gender|age\s*range|current\s*age|ethnicity|race\b|disability|veteran|military|sexual\s*orient|pronoun/i.test(groupLabel)) {
      const PREFER_NOT_RE = /prefer\s*(not|to\s*not)\s*(to\s*)?answer|decline|not\s*(wish|want)\s*to/i;
      const fallback = radios.find(r => PREFER_NOT_RE.test(getRadioOptionLabel(r, doc)));
      if (fallback && !alreadyFilled.has(fallback)) {
        clickRadio(fallback);
        alreadyFilled.add(fallback);
        filled++;
      }
    }
  }

  return filled;
}

// Walk up the DOM tree to find the question text for a radio group
function getRadioGroupLabel(radio, doc) {
  let node = radio.parentElement;
  const visited = new Set();

  while (node && node !== doc.body) {
    if (visited.has(node)) break;
    visited.add(node);

    // Fieldset → legend is the most semantic pattern
    if (node.tagName === 'FIELDSET') {
      const legend = node.querySelector('legend');
      if (legend) return legend.textContent.trim();
    }

    // Look for a direct child that looks like a label/heading and doesn't wrap an input
    const candidates = node.querySelectorAll(
      ':scope > label, :scope > legend, :scope > p, ' +
      ':scope > h2, :scope > h3, :scope > h4, :scope > h5, ' +
      ':scope > [class*="label" i], :scope > [class*="question" i], ' +
      ':scope > [class*="title" i], :scope > [class*="prompt" i]'
    );

    for (const c of candidates) {
      if (c.contains(radio)) continue;               // skip wrappers
      if (c.querySelector('input, select, textarea')) continue; // skip form containers
      const text = c.textContent.trim();
      if (text.length > 8 && text.length < 400) return text;
    }

    node = node.parentElement;
  }

  // aria-labelledby as last resort
  const lby = radio.getAttribute('aria-labelledby');
  if (lby) {
    const el = doc.getElementById(lby);
    if (el) return el.textContent.trim();
  }

  return '';
}

function getRadioOptionLabel(radio, doc) {
  if (radio.id) {
    const label = doc.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
    if (label) return label.textContent.trim();
  }
  const wrapping = radio.closest('label');
  if (wrapping) {
    // Remove the radio's own value text to get just the label
    return wrapping.textContent.trim();
  }
  const next = radio.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE) return next.textContent.trim();
  if (next?.nodeType === Node.ELEMENT_NODE) return next.textContent.trim();
  return radio.value || '';
}

// ── Open-text question filling ──────────────────────────────────────────────

function fillLeverTextQuestions(doc, profile, alreadyFilled) {
  let filled = 0;

  const rules = [
    {
      test: t => /citizenship|work authoriz|visa|permit|immigration/i.test(t),
      value: profile.workAuthorizationNote,
    },
    {
      test: t => /salary|compensation|pay expectation/i.test(t),
      value: profile.salaryExpectation,
    },
  ];

  doc.querySelectorAll('textarea, input[type="text"]').forEach(el => {
    if (alreadyFilled.has(el) || !isVisible(el) || el.disabled || el.value) return;
    const label = getLabelText(el);
    if (!label) return;

    for (const { test, value } of rules) {
      if (!value || !test(label)) continue;
      triggerNativeInput(el, value);
      alreadyFilled.add(el);
      filled++;
      break;
    }
  });

  return filled;
}

// ── Dropdown filling ────────────────────────────────────────────────────────

function fillLeverDropdowns(doc, profile, alreadyFilled) {
  let filled = 0;

  const rules = [
    {
      test: t => /time.?zone|timezone/i.test(t),
      value: profile.timezone,
    },
    {
      test: t => /\bcountry\b/i.test(t),
      value: profile.address?.country,
    },
    {
      test: t => /\bstate\b|\bprovince\b/i.test(t),
      value: profile.address?.state,
    },
  ];

  doc.querySelectorAll('select').forEach(el => {
    if (alreadyFilled.has(el) || !isVisible(el) || el.disabled) return;
    const label = getLabelText(el);
    if (!label) return;

    for (const { test, value } of rules) {
      if (!value || !test(label)) continue;
      if (setSelectValue(el, value)) {
        alreadyFilled.add(el);
        filled++;
        break;
      }
    }
  });

  return filled;
}
