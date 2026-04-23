// SpeedyApply — detector.js
// Detect which job portal we're on and whether this is an application page

function detectPortal() {
  const host = window.location.hostname;
  const search = window.location.search;

  // Host-based detection (primary signal)
  if (host.includes('greenhouse.io')) return 'greenhouse';
  if (host.includes('ashbyhq.com')) return 'ashby';
  if (host.includes('lever.co')) return 'lever';
  if (host.includes('workable.com')) return 'workable';
  if (host.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (host.includes('teamtailor.com')) return 'teamtailor';
  if (host.includes('jobvite.com')) return 'jobvite';

  // Embedded Greenhouse — careers.<company>.com/?gh_jid=...&gh_src=...
  // Many companies host Greenhouse-backed job boards on their own domain.
  if (/[?&]gh_jid=/.test(search) || /[?&]gh_src=/.test(search)) return 'greenhouse';

  // DOM-based fallback signals — catches embedded boards on custom career domains
  if (document.querySelector('form[action*="greenhouse"], form[action*="boards.greenhouse"], iframe[src*="greenhouse.io"], script[src*="boards.greenhouse.io"]')) return 'greenhouse';
  if (document.querySelector('[data-field-id]')) return 'ashby';
  if (document.querySelector('form[action*="lever.co"], form[action*="jobs.lever.co"]')) return 'lever';
  if (document.querySelector('[data-ui="firstname"], [data-ui="first-name"]')) return 'workable';

  // SmartRecruiters embedded iframe (some companies iframe jobs.smartrecruiters.com)
  if (document.querySelector('iframe[src*="smartrecruiters.com"], script[src*="smartrecruiters.com"]')) return 'smartrecruiters';
  // Teamtailor embedded / self-hosted: they set a meta generator tag or global teamtailor class
  if (document.querySelector('meta[name="generator"][content*="Teamtailor" i], [data-teamtailor], script[src*="teamtailor.com"]')) return 'teamtailor';
  // Jobvite embedded: jv-* class prefix
  if (document.querySelector('[class^="jv-"], [class*=" jv-"], script[src*="jobvite.com"]')) return 'jobvite';

  return 'generic';
}

// Is this page actually an application form (not just a job listing)?
function isApplicationPage(portal) {
  const url = window.location.href;

  switch (portal) {
    case 'greenhouse':
      return url.includes('/jobs/') ||
             /[?&]gh_jid=/.test(window.location.search) ||
             document.querySelector('#application-form, form#application_form, #app-form, form[action*="greenhouse"]') !== null;

    case 'ashby':
      return url.includes('/application') ||
             url.includes('/jobs/') ||
             document.querySelector('[data-field-id]') !== null ||
             document.querySelector('form[data-testid]') !== null;

    case 'lever':
      return url.includes('/apply') ||
             document.querySelector('form.application-form, #application-form') !== null;

    case 'workable':
      if (window.location.hostname === 'apply.workable.com') return true;
      if (url.includes('selectedJobId') || url.includes('/jobs/') || url.includes('/apply')) return true;
      return document.querySelector('form[data-ui], form[class*="application"]') !== null ||
             document.querySelector('input[name="firstname"], input[name="candidate[firstname]"]') !== null;

    case 'smartrecruiters':
      // SmartRecruiters uses several URL shapes:
      //   jobs.smartrecruiters.com/<Company>/<numeric-id>-<slug>
      //   jobs.smartrecruiters.com/oneclick-ui/company/<Company>/publication/<uuid>
      //   careers.smartrecruiters.com/<Company>/...
      // Since the hostname already told us this is SmartRecruiters, accept any path —
      // the sidebar sits idle until the user clicks Apply and autofills.
      return true;

    case 'teamtailor':
      // Hostname already confirmed Teamtailor — accept any path.
      return true;

    case 'jobvite':
      // Hostname already confirmed Jobvite — accept any path.
      return true;

    case 'generic':
      // A form with at least one visible input — but require a real apply signal
      // to avoid injecting the sidebar on every random site the user visits.
      if (!/apply|career|job|greenhouse|lever|ashby|workable|smartrecruiters|teamtailor|jobvite/i.test(url)) return false;
      return document.querySelector('form') !== null &&
             document.querySelector('input[type="text"], input[type="email"], input[type="tel"]') !== null;
  }
  return false;
}

// Detect job title and company from the page for tracker/AI context
function detectJobContext() {
  const context = { jobTitle: '', company: '' };

  // Greenhouse
  const ghTitle = document.querySelector('.app-title, h1.job-title, h2.app-title');
  if (ghTitle) context.jobTitle = ghTitle.textContent.trim();
  const ghCompany = document.querySelector('.company-name, .employer-name');
  if (ghCompany) context.company = ghCompany.textContent.trim();

  // Lever
  const lvTitle = document.querySelector('.posting-headline h2');
  if (lvTitle && !context.jobTitle) context.jobTitle = lvTitle.textContent.trim();
  const lvCompany = document.querySelector('.main-header-logo img');
  if (lvCompany && !context.company) context.company = lvCompany.alt || '';

  // Workable
  const wkTitle = document.querySelector('[data-ui="job-title"], h1[class*="job"], h1[class*="title"], .job-title h1');
  if (wkTitle && !context.jobTitle) context.jobTitle = wkTitle.textContent.trim();
  const wkCompany = document.querySelector('[data-ui="company-name"], .company-name, [class*="company"]');
  if (wkCompany && !context.company) context.company = wkCompany.textContent.trim();

  // Ashby
  const ashTitle = document.querySelector('h1[data-testid="job-title"], h1');
  if (ashTitle && !context.jobTitle) context.jobTitle = ashTitle.textContent.trim();

  // SmartRecruiters — job title is in the posting header, company is in the URL path
  const srTitle = document.querySelector('.job-title, h1[class*="job"], h1[class*="Title"], [class*="JobTitle"]');
  if (srTitle && !context.jobTitle) context.jobTitle = srTitle.textContent.trim();
  if (window.location.hostname.includes('smartrecruiters.com') && !context.company) {
    const m = window.location.pathname.match(/^\/([^/]+)/);
    if (m) context.company = decodeURIComponent(m[1]).replace(/-/g, ' ');
  }

  // Teamtailor — h1 holds the title
  const ttTitle = document.querySelector('[class*="JobTitle"], h1[class*="title"], h1');
  if (ttTitle && !context.jobTitle) context.jobTitle = ttTitle.textContent.trim();

  // Jobvite — .jv-job-detail-title
  const jvTitle = document.querySelector('.jv-job-detail-title, .jv-header-title, h2.jv-job-detail-title');
  if (jvTitle && !context.jobTitle) context.jobTitle = jvTitle.textContent.trim();

  // Fallbacks from page title
  if (!context.jobTitle) {
    const titleParts = document.title.split(/[-|–]/).map(s => s.trim());
    if (titleParts.length > 0) context.jobTitle = titleParts[0];
    if (titleParts.length > 1) context.company = titleParts[titleParts.length - 1];
  }

  return context;
}

// Check if this looks like a success/confirmation page
function isSuccessPage(portal) {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();
  const body = document.body.innerText.toLowerCase().slice(0, 500);

  const signals = SUCCESS_SIGNALS[portal] || SUCCESS_SIGNALS.greenhouse;

  if (signals.urlPatterns.some(p => url.includes(p))) return true;
  if (signals.titleKeywords.some(k => title.includes(k))) return true;
  if (body.includes('application submitted') || body.includes('thank you for applying')) return true;

  return false;
}
