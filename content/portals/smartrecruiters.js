// SpeedyApply — portals/smartrecruiters.js
// SmartRecruiters autofill adapter — used by Visa, LinkedIn, Bosch, McDonald's, Skechers

async function fillSmartRecruiters(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  // SmartRecruiters forms use camelCase name/id conventions per their API docs.
  // Some instances render with lowercase variants too — handle both.
  const directMappings = [
    [['firstName', 'first_name', 'firstname'], profile.firstName],
    [['lastName', 'last_name', 'lastname'], profile.lastName],
    [['email', 'emailAddress', 'email_address'], profile.email],
    [['phone', 'phoneNumber', 'phone_number', 'mobile'], profile.phone],
    [['linkedinProfileUrl', 'linkedinUrl', 'linkedin_url', 'linkedin'], profile.linkedinUrl],
    [['websiteUrl', 'website', 'portfolio', 'personalWebsiteUrl'], profile.portfolioUrl],
    [['currentCompany', 'company', 'currentEmployer'], profile.workExperience?.[0]?.company],
    [['currentPosition', 'jobTitle', 'currentTitle'], profile.workExperience?.[0]?.title],
    [['location', 'city'], profile.address?.city],
    [['country'], profile.address?.country],
    [['zipCode', 'postalCode', 'zip'], profile.address?.zip],
  ];

  for (const [names, value] of directMappings) {
    if (!value) continue;
    for (const name of names) {
      // SmartRecruiters sometimes uses id and sometimes name — try both
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

  // Radio buttons (yes/no, EEO) — reuse the Lever radio engine
  results.filled += fillLeverRadios(document, profile, alreadyFilled);

  // Generic fallback — label scan catches anything portal-specific we missed
  const generic = mapAndFill(profile, alreadyFilled);
  results.filled += generic.filled;
  results.skipped += generic.skipped;

  return results;
}
