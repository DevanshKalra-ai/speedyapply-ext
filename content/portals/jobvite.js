// SpeedyApply — portals/jobvite.js
// Jobvite autofill adapter — jobs.jobvite.com/<company>

async function fillJobvite(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  // Jobvite forms use snake_case standard names — first_name, last_name, email, phone
  const directMappings = [
    [['first_name', 'firstName'], profile.firstName],
    [['last_name', 'lastName'], profile.lastName],
    [['email', 'email_address'], profile.email],
    [['phone', 'phone_number', 'mobile_phone'], profile.phone],
    [['linkedin_url', 'linkedin', 'linkedin_profile'], profile.linkedinUrl],
    [['website', 'portfolio', 'personal_website'], profile.portfolioUrl],
    [['current_company', 'employer'], profile.workExperience?.[0]?.company],
    [['current_title', 'job_title'], profile.workExperience?.[0]?.title],
    [['address', 'street_address'], profile.address?.street],
    [['city'], profile.address?.city],
    [['state', 'region'], profile.address?.state],
    [['zip', 'postal_code'], profile.address?.zip],
    [['country'], profile.address?.country],
  ];

  for (const [names, value] of directMappings) {
    if (!value) continue;
    for (const name of names) {
      const el = document.querySelector(
        `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`
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

  // Radios (yes/no, EEO)
  results.filled += fillLeverRadios(document, profile, alreadyFilled);

  // Generic fallback
  const generic = mapAndFill(profile, alreadyFilled);
  results.filled += generic.filled;
  results.skipped += generic.skipped;

  return results;
}
