// SpeedyApply — portals/breezy.js
// Breezy HR autofill adapter — <company>.breezy.hr/p/<hash>-<slug>/apply

async function fillBreezy(profile) {
  const results = { filled: 0, skipped: 0, fields: [] };
  const alreadyFilled = new Set();

  // Breezy HR uses flat lowercase names. Some forms split first/last,
  // others use a single "name" or "full_name" field — handle both.
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();

  const directMappings = [
    [['first_name', 'firstname', 'fname'], profile.firstName],
    [['last_name', 'lastname', 'lname'], profile.lastName],
    [['name', 'full_name', 'fullname', 'candidate_name'], fullName],
    [['email', 'email_address'], profile.email],
    [['phone', 'phone_number', 'mobile'], profile.phone],
    [['linkedin', 'linkedin_url', 'linkedin_profile'], profile.linkedinUrl],
    [['website', 'website_url', 'portfolio', 'personal_website'], profile.portfolioUrl],
    [['github', 'github_url'], profile.githubUrl],
    [['current_company', 'company', 'employer'], profile.workExperience?.[0]?.company],
    [['current_title', 'job_title', 'title'], profile.workExperience?.[0]?.title],
    [['location', 'city'], profile.address?.city],
    [['country'], profile.address?.country],
    [['summary', 'experience_summary'], profile.resumeText?.slice(0, 600)],
    [['cover_letter', 'cover-letter', 'coverletter'], ''], // left blank — AI cards handle this
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
