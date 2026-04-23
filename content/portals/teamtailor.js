// SpeedyApply — portals/teamtailor.js
// Teamtailor autofill adapter — used by 12,000+ companies (Oneflow, Tailify, Rocco Forte, many EU startups)

async function fillTeamtailor(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  // Teamtailor uses the Rails-style job_application[field] bracket convention
  const directMappings = [
    [['job_application[first_name]', 'job_application[firstname]', 'first_name'], profile.firstName],
    [['job_application[last_name]', 'job_application[lastname]', 'last_name'], profile.lastName],
    [['job_application[name]', 'name'], `${profile.firstName || ''} ${profile.lastName || ''}`.trim()],
    [['job_application[email]', 'email'], profile.email],
    [['job_application[phone]', 'phone'], profile.phone],
    [['job_application[linkedin_profile]', 'job_application[linkedin]', 'linkedin_profile', 'linkedin'], profile.linkedinUrl],
    [['job_application[website]', 'job_application[personal_website]', 'website'], profile.portfolioUrl],
    [['job_application[location]', 'location', 'city'], profile.address?.city],
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
