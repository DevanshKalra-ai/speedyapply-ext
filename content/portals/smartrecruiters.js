// SpeedyApply — portals/smartrecruiters.js
// SmartRecruiters autofill adapter — used by Visa, LinkedIn, Bosch, McDonald's, Skechers, Dungarvin

async function fillSmartRecruiters(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  // SmartRecruiters has TWO very different form shapes:
  //
  // 1. Classic forms (jobs.smartrecruiters.com/<Company>/<numeric-id>-<slug>)
  //    — standard <input name="firstName"> in the main document
  //
  // 2. OneClick Apply (jobs.smartrecruiters.com/oneclick-ui/...)
  //    — Angular Web Components inside Shadow DOM, fields use id-based naming:
  //    id="first-name-input", "last-name-input", "email-input", "linkedin-input",
  //    "facebook-input", "website-input", plus aria-label fallbacks for country/phone.
  //
  // We try (2) first via a deep shadow-DOM query, then fall back to (1).

  // ── OneClick: id-based matches inside shadow DOM ─────────────────────────
  const idMappings = [
    ['first-name-input', profile.firstName],
    ['last-name-input', profile.lastName],
    ['email-input', profile.email],
    ['confirm-email-input', profile.email],
    ['phone-input', profile.phone],
    ['city-input', profile.address?.city],
    ['linkedin-input', profile.linkedinUrl],
    ['website-input', profile.portfolioUrl],
    ['current-company-input', profile.workExperience?.[0]?.company],
    ['current-title-input', profile.workExperience?.[0]?.title],
  ];

  for (const [id, value] of idMappings) {
    if (!value) continue;
    const el = deepQuerySelector(`input[id="${id}"], textarea[id="${id}"]`);
    if (el && !el.disabled && !el.value && !alreadyFilled.has(el)) {
      triggerNativeInput(el, value);
      results.filled++;
      results.fields.push(id);
      alreadyFilled.add(el);
    }
  }

  // ── OneClick: aria-label fallback for fields without semantic id ─────────
  const ariaMappings = [
    [/phone.*number|phone$|mobile/i, profile.phone],
    [/\bcity\b/i, profile.address?.city],
    [/\bfirst\s*name\b/i, profile.firstName],
    [/\blast\s*name\b/i, profile.lastName],
    [/\bemail\b/i, profile.email],
    [/linkedin/i, profile.linkedinUrl],
    [/website|portfolio/i, profile.portfolioUrl],
  ];

  deepQuerySelectorAll('input, textarea').forEach(el => {
    if (alreadyFilled.has(el) || el.disabled || el.value || el.type === 'hidden' || el.type === 'file') return;
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const probe = aria || placeholder;
    if (!probe) return;
    for (const [pattern, value] of ariaMappings) {
      if (!value) continue;
      if (pattern.test(probe)) {
        triggerNativeInput(el, value);
        results.filled++;
        results.fields.push(aria || placeholder);
        alreadyFilled.add(el);
        break;
      }
    }
  });

  // ── Classic SmartRecruiters: standard name= attributes in main document ──
  const directMappings = [
    [['firstName', 'first_name', 'firstname'], profile.firstName],
    [['lastName', 'last_name', 'lastname'], profile.lastName],
    [['email', 'emailAddress', 'email_address'], profile.email],
    [['phone', 'phoneNumber', 'phone_number', 'mobile'], profile.phone],
    [['linkedinProfileUrl', 'linkedinUrl', 'linkedin_url', 'linkedin'], profile.linkedinUrl],
    [['websiteUrl', 'website', 'portfolio'], profile.portfolioUrl],
    [['currentCompany', 'company', 'currentEmployer'], profile.workExperience?.[0]?.company],
    [['currentPosition', 'jobTitle', 'currentTitle'], profile.workExperience?.[0]?.title],
    [['location', 'city'], profile.address?.city],
    [['country'], profile.address?.country],
    [['zipCode', 'postalCode', 'zip'], profile.address?.zip],
  ];

  for (const [names, value] of directMappings) {
    if (!value) continue;
    for (const name of names) {
      const el = document.querySelector(
        `input[name="${name}"], input[id="${name}"], textarea[name="${name}"], select[name="${name}"], select[id="${name}"]`
      );
      if (el && isVisible(el) && !el.disabled && !el.value && !alreadyFilled.has(el)) {
        if (el.tagName === 'SELECT') {
          if (setSelectValue(el, value)) { results.filled++; alreadyFilled.add(el); }
        } else {
          triggerNativeInput(el, value);
          results.filled++;
          results.fields.push(name);
          alreadyFilled.add(el);
        }
        break;
      }
    }
  }

  // Radios (yes/no, EEO) — reuse the Lever radio engine on main document
  results.filled += fillLeverRadios(document, profile, alreadyFilled);

  // Generic fallback for anything else
  const generic = mapAndFill(profile, alreadyFilled);
  results.filled += generic.filled;
  results.skipped += generic.skipped;

  return results;
}
