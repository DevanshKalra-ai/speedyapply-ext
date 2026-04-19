// SpeedyApply — ashby-intercept-early.js
// Runs at document_start to intercept Ashby's applicationForm.info API call
// BEFORE the page's JS executes and makes the fetch request.
// Stores schema in window.__speedyapplyAshbySchema for ashby.js to consume.

(function () {
  if (window.__speedyapplyAshbyEarlyIntercepted) return;
  window.__speedyapplyAshbyEarlyIntercepted = true;

  const originalFetch = window.fetch;

  // Handle fill requests from isolated-world content scripts.
  // __reactProps$ is only visible in MAIN world, so content scripts dispatch an event here.
  document.addEventListener('speedyapply:reactFill', function (e) {
    const { id, name } = e.detail || {};
    let el = id ? document.getElementById(id) : null;
    if (!el && name) el = document.querySelector('[name="' + name + '"]');
    if (!el) return;
    const pk = Object.keys(el).find(function (k) { return k.startsWith('__reactProps'); });
    if (!pk) return;
    const props = el[pk];
    if (props && props.onChange) {
      props.onChange({ target: { checked: true, value: el.value }, currentTarget: el, preventDefault: function () {}, stopPropagation: function () {} });
    }
  });

  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

    if (url.includes('ashbyhq.com') && url.includes('applicationForm')) {
      const response = await originalFetch.apply(this, args);
      try {
        const data = await response.clone().json();
        const form = data?.results?.applicationForm || data?.applicationForm;
        if (form) {
          window.__speedyapplyAshbySchema = form;
          // sessionStorage bridges MAIN world → isolated world (content scripts can read it)
          try { sessionStorage.setItem('__speedyapplyAshbySchema', JSON.stringify(form)); } catch {}
          // Also fire event for real-time delivery if ashby.js happens to be ready
          window.dispatchEvent(new CustomEvent('speedyapply:ashby:schema', { detail: form }));
        }
      } catch {}
      return response;
    }

    return originalFetch.apply(this, args);
  };
})();
