// SpeedyApply — content-main.js
// Main orchestrator: runs on page load for all matched job sites

(async function init() {
  try {
    // 1. Detect portal
    const portal = detectPortal();

    // Fast bail-out: on random non-job sites we match via <all_urls>, but don't do any work
    // unless the URL looks like a job page or a known portal was detected.
    const isLocalTestPage = window.location.protocol === 'file:';
    if (portal === 'generic' && !isLocalTestPage) {
      if (!/apply|career|job|greenhouse|lever|ashby|workable|smartrecruiters|breezy|jobvite/i.test(window.location.href)) return;
    }

    // 2. Check settings
    const settingsResp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = settingsResp?.settings || {};
    if (!settings.autofillEnabled) return;

    // 3. Check if this is actually an application page
    // Give the page a moment to finish rendering
    // Ashby is a React SPA — poll until [data-field-id] appears (up to 4s)
    if (portal === 'ashby') {
      let waited = 0;
      while (!document.querySelector('[data-field-id]') && waited < 4000) {
        await sleep(300);
        waited += 300;
      }
    } else {
      await sleep(800);
    }

    // Skip the application-page check on file:// pages (local mock forms for testing)
    if (!isLocalTestPage && !isApplicationPage(portal)) {
      // Watch for SPA navigation to /application on Ashby listing pages
      if (portal === 'ashby') watchAshbyNavigation();
      // Watch for Workable inline application form appearing on listing pages
      if (portal === 'workable') watchWorkableJobsPage();
      return;
    }

    // On jobs.workable.com listing pages with selectedJobId: wait for inline form
    if (portal === 'workable' && window.location.hostname !== 'apply.workable.com') {
      if (!document.querySelector('input[name="firstname"], input[name="candidate[firstname]"], [data-ui="firstname"]')) {
        watchWorkableJobsPage();
        return;
      }
    }

    // 4. Load profile
    const profileResp = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });
    const profile = profileResp?.profile;

    if (!profile) return; // no profile, nothing to do

    // 5. Detect job context (title, company)
    const jobContext = detectJobContext();

    // 6. Inject sidebar
    injectSidebar(portal, jobContext);

    // 7. Watch for success/confirmation page to auto-log
    watchForSuccess(portal, jobContext);

    // 8. Listen for profile updates from the popup
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'PROFILE_UPDATED') {
        // Profile refreshed in popup — nothing to do unless user re-clicks fill
      }
    });

  } catch (err) {
    console.error('[SpeedyApply] Init error:', err);
  }
})();

function watchForSuccess(portal, jobContext) {
  const checkSuccess = () => {
    if (isSuccessPage(portal)) {
      const entry = {
        company: jobContext.company,
        role: jobContext.jobTitle,
        url: window.location.href,
        portal,
        source: 'autofill',
      };
      chrome.runtime.sendMessage({ type: 'LOG_APPLICATION', payload: entry });
      markApplicationLogged();
    }
  };

  // Check immediately (in case we landed on a success page)
  checkSuccess();

  // Watch for URL changes (SPAs)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(checkSuccess, 500);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Stop watching after 10 minutes
  setTimeout(() => urlObserver.disconnect(), 600000);
}

// Ashby: SPA navigation — user clicks "Apply" on the listing page,
// URL changes from /ashby/{uuid} to /ashby/{uuid}/application without a reload
function watchAshbyNavigation() {
  let lastUrl = window.location.href;

  const observer = new MutationObserver(debounce(async () => {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;

    if (!currentUrl.includes('/application')) return;
    if (document.getElementById('speedyapply-sidebar')) return; // already injected

    // Wait for the React form to render [data-field-id] elements
    let waited = 0;
    while (!document.querySelector('[data-field-id]') && waited < 3000) {
      await sleep(200);
      waited += 200;
    }

    const profileResp = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });
    if (!profileResp?.profile) return;

    const jobContext = detectJobContext();
    injectSidebar('ashby', jobContext);
  }, 300));

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 300000); // stop after 5 min
}

// Workable: jobs.workable.com/search shows job listings; clicking Apply may load
// an inline application form (or embed) in the same page. Watch for it.
function watchWorkableJobsPage() {
  // Selector that definitively means the Workable application form has rendered
  const FORM_SELECTOR = 'input[name="firstname"], input[name="candidate[firstname]"], [data-ui="firstname"], form[class*="application"]';

  // Already there?
  if (document.querySelector(FORM_SELECTOR)) {
    if (document.getElementById('speedyapply-sidebar')) return;
    chrome.runtime.sendMessage({ type: 'GET_PROFILE' }).then(resp => {
      if (!resp?.profile) return;
      injectSidebar('workable', detectJobContext());
    });
    return;
  }

  let lastSelectedJobId = new URLSearchParams(window.location.search).get('selectedJobId');

  const observer = new MutationObserver(debounce(async () => {
    // Also watch for selectedJobId changing (user picks a different job)
    const currentJobId = new URLSearchParams(window.location.search).get('selectedJobId');
    if (currentJobId && currentJobId !== lastSelectedJobId) {
      lastSelectedJobId = currentJobId;
      // New job selected — remove existing sidebar so it re-injects for new job
      document.getElementById('speedyapply-sidebar')?.remove();
      // Reset module-level sidebar state
      sidebarHost = null; shadowRoot = null;
    }

    if (!document.querySelector(FORM_SELECTOR)) return;
    if (document.getElementById('speedyapply-sidebar')) return;

    const resp = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });
    if (!resp?.profile) return;

    injectSidebar('workable', detectJobContext());
  }, 400));

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 300000); // stop after 5 min
}

