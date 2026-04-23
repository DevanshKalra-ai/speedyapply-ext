// SpeedyApply — portals/personio.js
// Personio autofill adapter — <company>.jobs.personio.com / .de
// Used by Zalando, Statista, Premier Inn and thousands of EU companies

async function fillPersonio(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  // Personio wraps most fields in an `applicant[*]` bracket convention.
  // Some forms also expose individual `categories[...]` or plain names — match both.
  const directMappings = [
    [['applicant[first_name]', 'first_name', 'firstname'], profile.firstName],
    [['applicant[last_name]', 'last_name', 'lastname'], profile.lastName],
    [['applicant[email]', 'email'], profile.email],
    [['applicant[phone]', 'applicant[phone_number]', 'phone', 'phone_number'], profile.phone],
    [['applicant[linkedin]', 'applicant[linkedin_profile]', 'linkedin'], profile.linkedinUrl],
    [['applicant[website]', 'applicant[personal_website]', 'website'], profile.portfolioUrl],
    [['applicant[github]', 'github'], profile.githubUrl],
    [['applicant[company]', 'applicant[current_company]', 'current_company'], profile.workExperience?.[0]?.company],
    [['applicant[position]', 'applicant[current_position]', 'current_position'], profile.workExperience?.[0]?.title],
    [['applicant[location]', 'applicant[city]', 'location', 'city'], profile.address?.city],
    [['applicant[country]', 'country'], profile.address?.country],
    [['applicant[available_from]'], ''],
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

  // Generic fallback — label-based scan catches anything portal-specific we missed
  const generic = mapAndFill(profile, alreadyFilled);
  results.filled += generic.filled;
  results.skipped += generic.skipped;

  return results;
}
