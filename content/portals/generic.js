// SpeedyApply — portals/generic.js
// Generic autofill — label DOM reading + confidence scoring

async function fillGeneric(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const fieldValues = buildFieldValues(profile);
  const alreadyFilled = new Set(); // track elements filled to avoid double-filling

  // ── Pass 1: Label <for> attribute reading (highest accuracy) ──────────────
  // Read every <label for="..."> on the page and find its exact input.
  // This is the most reliable signal on custom/unknown sites.
  document.querySelectorAll('label[for]').forEach(label => {
    const forId = label.getAttribute('for');
    if (!forId) return;

    const input = document.getElementById(forId);
    if (!input || alreadyFilled.has(input)) return;
    if (!isVisible(input) || input.disabled || input.value) return;

    const labelText = label.textContent.toLowerCase().trim();
    const fieldName = matchLabelToField(labelText, input);
    if (!fieldName) return;

    const value = fieldValues[fieldName];
    if (!value) return;

    if (input.tagName === 'SELECT') {
      if (setSelectValue(input, value)) {
        results.filled++;
        results.fields.push(fieldName);
        alreadyFilled.add(input);
      }
    } else {
      triggerNativeInput(input, value);
      results.filled++;
      results.fields.push(fieldName);
      alreadyFilled.add(input);
    }
  });

  // ── Pass 2: Wrapping label (no for attribute) ─────────────────────────────
  // Some sites wrap <label><input .../></label> without a for attribute
  document.querySelectorAll('label').forEach(label => {
    const input = label.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
    if (!input || alreadyFilled.has(input)) return;
    if (!isVisible(input) || input.disabled || input.value) return;

    const labelText = label.textContent.toLowerCase().trim();
    const fieldName = matchLabelToField(labelText, input);
    if (!fieldName) return;

    const value = fieldValues[fieldName];
    if (!value) return;

    if (input.tagName === 'SELECT') {
      if (setSelectValue(input, value)) {
        results.filled++;
        results.fields.push(fieldName);
        alreadyFilled.add(input);
      }
    } else {
      triggerNativeInput(input, value);
      results.filled++;
      results.fields.push(fieldName);
      alreadyFilled.add(input);
    }
  });

  // ── Pass 3: name/id attribute keyword scan ───────────────────────────────
  // Many sites have no labels but use predictable name/id attrs like "fname", "email"
  document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), select, textarea').forEach(input => {
    if (alreadyFilled.has(input)) return;
    if (!isVisible(input) || input.disabled || input.value) return;

    const nameAttr = (input.getAttribute('name') || '').toLowerCase();
    const idAttr = (input.getAttribute('id') || '').toLowerCase();
    const token = nameAttr || idAttr;
    if (!token) return;

    let fieldName = null;
    if (/fname|firstname|first.name|given.name/.test(token)) fieldName = 'firstName';
    else if (/lname|lastname|last.name|surname|family.name/.test(token)) fieldName = 'lastName';
    else if (/email/.test(token)) fieldName = 'email';
    else if (/phone|mobile|tel/.test(token)) fieldName = 'phone';
    else if (/linkedin/.test(token)) fieldName = 'linkedinUrl';
    else if (/github/.test(token)) fieldName = 'githubUrl';
    else if (/portfolio|website|personalurl/.test(token)) fieldName = 'portfolioUrl';
    else if (/^city$|cityname/.test(token)) fieldName = 'city';
    else if (/^state$|province|region/.test(token)) fieldName = 'state';
    else if (/zip|postal/.test(token)) fieldName = 'zip';
    else if (/^country/.test(token)) fieldName = 'country';
    else if (/street|address1|addressline/.test(token)) fieldName = 'address';

    if (!fieldName) return;
    const value = fieldValues[fieldName];
    if (!value) return;

    if (input.tagName === 'SELECT') {
      if (setSelectValue(input, value)) { results.filled++; results.fields.push(fieldName); alreadyFilled.add(input); }
    } else {
      triggerNativeInput(input, value);
      results.filled++;
      results.fields.push(fieldName);
      alreadyFilled.add(input);
    }
  });

  // ── Pass 4: aria-labelledby ───────────────────────────────────────────────
  document.querySelectorAll('[aria-labelledby]').forEach(input => {
    if (alreadyFilled.has(input)) return;
    if (!isVisible(input) || input.disabled || input.value) return;
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(input.tagName)) return;

    const labelId = input.getAttribute('aria-labelledby');
    const labelEl = document.getElementById(labelId);
    if (!labelEl) return;

    const labelText = labelEl.textContent.toLowerCase().trim();
    const fieldName = matchLabelToField(labelText, input);
    if (!fieldName) return;

    const value = fieldValues[fieldName];
    if (!value) return;

    triggerNativeInput(input, value);
    results.filled++;
    results.fields.push(fieldName);
    alreadyFilled.add(input);
  });

  // ── Pass 5: Radio buttons ─────────────────────────────────────────────────
  results.filled += fillLeverRadios(document, profile, alreadyFilled);

  // ── Pass 6: Custom (non-native) dropdowns ────────────────────────────────
  const customDropdownResults = await fillCustomDropdowns(profile, alreadyFilled);
  results.filled += customDropdownResults;

  // ── Pass 6: Confidence-scored fallback for anything not yet filled ─────────
  const remainingResults = mapAndFill(profile, alreadyFilled);
  results.filled += remainingResults.filled;
  results.skipped += remainingResults.skipped;

  return results;
}

async function fillCustomDropdowns(profile, alreadyFilled) {
  const fieldValues = buildFieldValues(profile);
  let filled = 0;

  // Find elements that look like custom dropdown triggers
  const triggers = Array.from(document.querySelectorAll(
    '[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"], ' +
    '[data-automation-id*="dropdown"], [class*="select__control"], [class*="dropdown-toggle"]'
  ));

  for (const trigger of triggers) {
    if (alreadyFilled.has(trigger)) continue;
    if (!isVisible(trigger) || trigger.disabled) continue;

    // Skip if already has a selected value
    const current = trigger.getAttribute('aria-label') || trigger.textContent?.trim();
    if (current && current !== 'Select...' && current !== 'Select' && current !== '') continue;

    const labelText = getLabelText(trigger).toLowerCase();
    if (!labelText) continue;

    const fieldName = matchLabelToField(labelText, trigger);
    if (!fieldName || !fieldValues[fieldName]) continue;

    const success = await fillCustomDropdown(trigger, String(fieldValues[fieldName]));
    if (success) {
      filled++;
      alreadyFilled.add(trigger);
    }
  }

  return filled;
}

// Match a label string to a profile field name
// Returns the field key or null
function matchLabelToField(labelText, el) {
  // Remove asterisks, colons, extra whitespace from label
  const t = labelText.replace(/[*:]/g, '').trim();

  if (/preferred\s*(first\s*)?name/i.test(t)) return 'preferredFirstName';
  if (/first\s*name|given\s*name|prénom/i.test(t)) return 'firstName';
  if (/last\s*name|surname|family\s*name|nom/i.test(t)) return 'lastName';
  if (/\bemail\b/i.test(t)) return 'email';
  if (/phone|mobile|telephone|cell/i.test(t)) return 'phone';
  if (/street|address\s*(line)?\s*1?$/i.test(t)) return 'address';
  if (/\bcity\b|\btown\b/i.test(t)) return 'city';
  if (/\bstate\b|\bprovince\b|\bregion\b/i.test(t)) return 'state';
  if (/zip|postal/i.test(t)) return 'zip';
  if (/\bcountry\b/i.test(t)) return 'country';
  if (/linkedin/i.test(t)) return 'linkedinUrl';
  if (/github/i.test(t)) return 'githubUrl';
  if (/portfolio|personal\s*site|personal\s*web/i.test(t)) return 'portfolioUrl';
  if (/\bwebsite\b|\burl\b/i.test(t) && !(/linkedin|github/i.test(t))) return 'portfolioUrl';
  if (/company|employer|organization|current\s*(employer|company)/i.test(t)) return 'currentCompany';
  if (/job\s*title|current\s*(title|role|position)|title/i.test(t)) return 'currentTitle';
  if (/google.?drive|dropbox|attach.*link|resume.*link|resume.*url|paste.*link/i.test(t)) return 'resumeUrl';

  // Also check the input's autocomplete attribute as a tiebreaker
  const ac = (el?.getAttribute('autocomplete') || '').toLowerCase();
  if (ac === 'given-name') return 'firstName';
  if (ac === 'family-name') return 'lastName';
  if (ac === 'email') return 'email';
  if (ac === 'tel') return 'phone';
  if (ac === 'street-address' || ac === 'address-line1') return 'address';
  if (ac === 'address-level2') return 'city';
  if (ac === 'address-level1') return 'state';
  if (ac === 'postal-code') return 'zip';
  if (ac === 'country' || ac === 'country-name') return 'country';
  if (ac === 'organization') return 'currentCompany';
  if (ac === 'organization-title') return 'currentTitle';

  return null;
}
