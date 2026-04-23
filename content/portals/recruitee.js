// SpeedyApply — portals/recruitee.js
// Recruitee autofill adapter — <company>.recruitee.com
// Used by 3,500+ companies across 70+ countries (Transavia, many EU SaaS)

async function fillRecruitee(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  // Recruitee uses a combined `candidate[name]` field (full name) rather than
  // separate first/last — per their careers-site API. Still try split fields
  // as a fallback for custom forms.
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();

  const directMappings = [
    [['candidate[name]', 'candidate[full_name]', 'name', 'full_name'], fullName],
    [['candidate[first_name]', 'first_name'], profile.firstName],
    [['candidate[last_name]', 'last_name'], profile.lastName],
    [['candidate[email]', 'email'], profile.email],
    [['candidate[phone]', 'phone'], profile.phone],
    [['candidate[linkedin]', 'candidate[linkedin_url]', 'linkedin'], profile.linkedinUrl],
    [['candidate[website]', 'candidate[portfolio]', 'website'], profile.portfolioUrl],
    [['candidate[github]', 'github'], profile.githubUrl],
    [['candidate[current_company]', 'current_company'], profile.workExperience?.[0]?.company],
    [['candidate[current_title]', 'current_title'], profile.workExperience?.[0]?.title],
    [['candidate[location]', 'candidate[city]', 'city'], profile.address?.city],
    [['candidate[cover_letter]'], ''],  // left blank, AI card handles open-text
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
