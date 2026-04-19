// SpeedyApply — constants.js
// Portal hostnames, field selector dictionaries, AI keywords

const PORTALS = {
  greenhouse: { hosts: ['.greenhouse.io', 'boards.greenhouse.io'], name: 'Greenhouse' },
  ashby:      { hosts: ['.ashbyhq.com', 'jobs.ashbyhq.com'], name: 'Ashby' },
  lever:      { hosts: ['.lever.co', 'jobs.lever.co'], name: 'Lever' },
  workable:   { hosts: ['apply.workable.com', '.workable.com'], name: 'Workable' },
  generic:    { hosts: [], name: 'Job Site' },
};

// Confidence-scored field selector dictionary.
// Each entry: { selectors, names, ariaLabels, placeholders, autocomplete, dataAutomation }
const FIELD_SELECTORS = {
  firstName: {
    selectors: ['input[name="fname"]', 'input[name="first_name"]', 'input[name="firstName"]', 'input[name="applicant[first_name]"]', 'input[name="candidate[first_name]"]'],
    names: ['fname', 'first_name', 'firstname', 'first-name', 'given_name', 'givenname', 'applicant_first_name', 'your_first_name', 'legalfirstname'],
    ariaLabels: ['first name', 'given name', 'prénom', 'legal first name', 'your first name'],
    placeholders: ['first name', 'given name', 'your first name', 'e.g. jane'],
    autocomplete: ['given-name'],
    inputTypes: [],
    dataAutomation: ['legalNameSection_firstName', 'firstName', 'fname'],
    classHints: ['first-name', 'firstname', 'given-name'],
  },
  preferredFirstName: {
    selectors: ['input[name="preferred_name"]', 'input[name="preferred_first_name"]', 'input[name="first_name_preferred"]'],
    names: ['preferred_name', 'preferred_first_name', 'first_name_preferred', 'preferredname', 'preferredfirstname', 'candidate[preferred_name]'],
    ariaLabels: ['preferred name', 'preferred first name', 'goes by', 'nickname'],
    placeholders: ['preferred name', 'nickname', 'preferred first name'],
    autocomplete: ['nickname'],
    inputTypes: [],
    dataAutomation: [],
    classHints: ['preferred-name', 'preferred-first'],
  },
  lastName: {
    selectors: ['input[name="lname"]', 'input[name="last_name"]', 'input[name="lastName"]', 'input[name="applicant[last_name]"]', 'input[name="candidate[last_name]"]'],
    names: ['lname', 'last_name', 'lastname', 'last-name', 'surname', 'family_name', 'familyname', 'applicant_last_name'],
    ariaLabels: ['last name', 'surname', 'family name', 'nom', 'legal last name'],
    placeholders: ['last name', 'surname', 'your last name', 'e.g. smith'],
    autocomplete: ['family-name'],
    inputTypes: [],
    dataAutomation: ['legalNameSection_lastName', 'lastName', 'lname'],
    classHints: ['last-name', 'lastname', 'family-name', 'surname'],
  },
  email: {
    selectors: ['input[type="email"]', 'input[name="email"]', 'input[name="emailAddress"]', 'input[name="applicant[email]"]'],
    names: ['email', 'emailaddress', 'email_address', 'applicant_email', 'your_email', 'contact_email', 'work_email'],
    ariaLabels: ['email', 'email address', 'work email', 'your email'],
    placeholders: ['email', 'your email', 'email address', 'you@example.com'],
    autocomplete: ['email'],
    inputTypes: ['email'],
    dataAutomation: ['email', 'emailAddress', 'candidate-email'],
    classHints: ['email'],
  },
  phone: {
    selectors: ['input[type="tel"]', 'input[name="phone"]', 'input[name="phoneNumber"]', 'input[name="applicant[phone]"]'],
    names: ['phone', 'phonenumber', 'phone_number', 'mobile', 'cell', 'telephone', 'contact_phone', 'applicant_phone', 'phone_mobile'],
    ariaLabels: ['phone', 'phone number', 'mobile number', 'telephone', 'cell phone', 'contact number'],
    placeholders: ['phone', 'phone number', 'mobile', '(555) 555-5555', '+1', 'your phone'],
    autocomplete: ['tel', 'tel-national'],
    inputTypes: ['tel'],
    dataAutomation: ['phone', 'phoneNumber', 'phone-number', 'candidate-phone'],
    classHints: ['phone', 'telephone', 'mobile'],
  },
  address: {
    selectors: ['input[name="address"]', 'input[name="street_address"]', 'input[name="address1"]', 'input[name="address_line_1"]'],
    names: ['address', 'address1', 'street_address', 'streetaddress', 'addressline1', 'address_line_1', 'street', 'street1'],
    ariaLabels: ['address', 'street address', 'address line 1', 'street', 'mailing address'],
    placeholders: ['address', 'street address', '123 main st', 'street address'],
    autocomplete: ['street-address', 'address-line1'],
    inputTypes: [],
    dataAutomation: ['addressSection_addressLine1'],
    classHints: ['street', 'address-line'],
  },
  city: {
    selectors: ['input[name="city"]', 'input[id*="city"]', 'input[name="applicant[city]"]'],
    names: ['city', 'city_name', 'cityname', 'town', 'municipality', 'applicant_city'],
    ariaLabels: ['city', 'town', 'city or town', 'city / town'],
    placeholders: ['city', 'your city', 'town', 'e.g. san francisco'],
    autocomplete: ['address-level2'],
    inputTypes: [],
    dataAutomation: ['addressSection_city'],
    classHints: ['city', 'town'],
  },
  state: {
    selectors: ['input[name="state"]', 'select[name="state"]', 'select[name="province"]', 'input[id*="state"]'],
    names: ['state', 'province', 'region', 'state_province', 'stateprovince', 'state_or_province'],
    ariaLabels: ['state', 'province', 'state or province', 'state / province', 'region'],
    placeholders: ['state', 'province', 'e.g. ca'],
    autocomplete: ['address-level1'],
    inputTypes: [],
    dataAutomation: ['addressSection_countryRegion', 'addressSection_stateDropdown', 'addressSection_state'],
    classHints: ['state', 'province', 'region'],
  },
  zip: {
    selectors: ['input[name="zip"]', 'input[name="postal_code"]', 'input[name="zipCode"]', 'input[name="postcode"]'],
    names: ['zip', 'zipcode', 'postal_code', 'postalcode', 'postcode', 'zip_code'],
    ariaLabels: ['zip', 'zip code', 'postal code', 'postcode'],
    placeholders: ['zip', 'zip code', 'postal code', '12345', 'e.g. 94105'],
    autocomplete: ['postal-code'],
    inputTypes: [],
    dataAutomation: ['addressSection_postalCode', 'addressSection_zipCode'],
    classHints: ['zip', 'postal'],
  },
  country: {
    selectors: ['select[name="country"]', 'input[name="country"]', 'select[name*="country"]'],
    names: ['country', 'countrycode', 'country_code', 'country_name', 'applicant_country'],
    ariaLabels: ['country', 'country or region', 'country of residence'],
    placeholders: ['country', 'select country', 'e.g. united states'],
    autocomplete: ['country', 'country-name'],
    inputTypes: [],
    dataAutomation: ['addressSection_countryDropdown', 'addressSection_country'],
    classHints: ['country'],
  },
  linkedinUrl: {
    selectors: ['input[name="linkedin"]', 'input[name="linkedin_profile"]', 'input[name="urls[LinkedIn]"]'],
    names: ['linkedin', 'linkedin_profile', 'linkedinurl', 'linkedin_url', 'urls[linkedin]', 'candidate_linkedin'],
    ariaLabels: ['linkedin', 'linkedin profile', 'linkedin url', 'linkedin profile url'],
    placeholders: ['linkedin', 'linkedin.com/in/...', 'your linkedin url', 'https://linkedin.com'],
    autocomplete: [],
    inputTypes: [],
    dataAutomation: ['linkedInUrl', 'linkedIn', 'linkedin'],
    classHints: ['linkedin'],
  },
  portfolioUrl: {
    selectors: ['input[name="portfolio"]', 'input[name="website"]', 'input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]'],
    names: ['portfolio', 'website', 'websiteurl', 'personal_website', 'personal_site', 'portfolio_url', 'urls[portfolio]', 'urls[other]', 'personal_url'],
    ariaLabels: ['portfolio', 'website', 'personal website', 'portfolio url', 'personal site', 'website url'],
    placeholders: ['portfolio', 'website', 'https://...', 'your website', 'yoursite.com'],
    autocomplete: ['url'],
    inputTypes: [],
    dataAutomation: ['websiteUrl', 'website', 'portfolio'],
    classHints: ['portfolio', 'website'],
  },
  githubUrl: {
    selectors: ['input[name="github"]', 'input[name="urls[GitHub]"]'],
    names: ['github', 'githuburl', 'github_url', 'github_profile', 'urls[github]'],
    ariaLabels: ['github', 'github profile', 'github url', 'github profile url'],
    placeholders: ['github', 'github.com/...', 'your github'],
    autocomplete: [],
    inputTypes: [],
    dataAutomation: ['githubUrl', 'github'],
    classHints: ['github'],
  },
  currentCompany: {
    selectors: ['input[name="org"]', 'input[name="company"]', 'input[name="current_company"]', 'input[name="employer"]'],
    names: ['org', 'company', 'current_company', 'currentcompany', 'employer', 'current_employer', 'organization', 'applicant_company'],
    ariaLabels: ['company', 'current company', 'employer', 'organization', 'current employer', 'most recent employer'],
    placeholders: ['company', 'current employer', 'your company', 'organization'],
    autocomplete: ['organization'],
    inputTypes: [],
    dataAutomation: ['currentOrg', 'currentEmployer', 'mostRecentEmployer'],
    classHints: ['company', 'employer', 'organization'],
  },
  currentTitle: {
    selectors: ['input[name="title"]', 'input[name="current_title"]', 'input[name="job_title"]'],
    names: ['title', 'current_title', 'jobtitle', 'job_title', 'currenttitle', 'position', 'current_position', 'applicant_title'],
    ariaLabels: ['title', 'job title', 'current title', 'current role', 'position', 'current position'],
    placeholders: ['title', 'job title', 'your current role', 'e.g. software engineer'],
    autocomplete: ['organization-title'],
    inputTypes: [],
    dataAutomation: ['currentTitle', 'currentJobTitle', 'currentPosition'],
    classHints: ['job-title', 'jobtitle', 'current-title'],
  },
  coverLetter: {
    selectors: ['textarea[name="cover_letter"]', 'textarea[id*="cover"]', 'textarea[name="coverLetter"]'],
    names: ['cover_letter', 'coverletter', 'cover_note', 'covernote'],
    ariaLabels: ['cover letter', 'covering letter', 'cover note'],
    placeholders: ['cover letter', 'write your cover letter', 'tell us why you'],
    autocomplete: [],
    inputTypes: [],
    dataAutomation: ['coverLetter'],
    classHints: ['cover-letter', 'coverletter'],
  },
};

// Keywords that signal an open-text question suitable for AI generation
const AI_QUESTION_KEYWORDS = [
  // Why / motivation
  'why do you want', 'why are you interested', 'why are you applying',
  'why this company', 'why this role', 'what motivates you', 'what excites you',
  'passion for', 'vision for',

  // Tell me / tell us
  'tell us about yourself', 'tell us about', 'tell me about',
  'tell us why', 'tell us more',

  // Describe / walk through
  'describe a time', 'describe a situation', 'describe a scenario',
  'describe your experience', 'describe how you', 'describe your approach',
  'walk us through', 'walk me through',

  // Specific examples (STAR behavioral)
  'specific time', 'specific example', 'specific situation',
  'give an example', 'provide an example', 'share an example',
  'tell me about a time', 'tell us about a time', 'have you ever',

  // How / what
  'how did you', 'how do you', 'how would you', 'how have you',
  'what would you', 'what experience', 'what makes you',
  'what can you bring', 'why should we',
  'what is your approach', 'what is your process',
  'outline your process', 'outline your approach',

  // Challenges / problem solving
  'challenge you overcame', 'challenging situation', 'difficult situation',
  'problem you solved', 'obstacle', 'troubleshoot', 'debugging',
  'investigate', 'root cause', 'no documentation', 'unique',

  // Achievements / strengths / weaknesses
  'greatest achievement', 'greatest strength', 'greatest weakness',
  'proudest', 'accomplishment', 'success story',

  // Learnings / retrospective
  'what did you learn', 'what would you do differently',
  'lessons learned', 'learnings', 'tools you utilized', 'tools utilized',

  // Standard open-text fields
  'cover letter', 'additional information', 'additional comments',
  'anything else', 'anything you would like', 'how did you hear',
  'goals', 'background in', 'experience with',

  // Please… prompts
  'please explain', 'please describe', 'please share',
  'please tell', 'please provide', 'please walk', 'please elaborate',
  'please give', 'please list',
];

// Success/confirmation page URL signals per portal
const SUCCESS_SIGNALS = {
  greenhouse: { urlPatterns: ['/confirmation', 'application_submitted'], titleKeywords: ['application submitted', 'thank you'] },
  ashby:      { urlPatterns: ['/confirmation', '/submitted'], titleKeywords: ['submitted', 'thank you', 'received'] },
  lever:      { urlPatterns: ['/thanks', '/confirmation'], titleKeywords: ['application submitted', 'thank you'] },
  workable:   { urlPatterns: ['/confirmation', '/applied', '/success'], titleKeywords: ['application submitted', 'thank you', 'successfully applied'] },
  generic:    { urlPatterns: ['/thank-you', '/thanks', '/confirmation', '/submitted'], titleKeywords: ['application submitted', 'thank you', 'received'] },
};
