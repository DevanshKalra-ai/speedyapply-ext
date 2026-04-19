// SpeedyApply — tracker-table.js
// Job tracker tab rendering and logic

async function renderTrackerTab(container) {
  const entries = await getTrackerEntries();
  const weekCount = await getWeeklyCount();

  const interviews = entries.filter(e => e.status === 'interview').length;
  const offers = entries.filter(e => e.status === 'offer').length;

  container.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">${weekCount}</div>
        <div class="stat-label">This Week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${entries.length}</div>
        <div class="stat-label">Total Applied</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${interviews}</div>
        <div class="stat-label">Interviews</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${offers}</div>
        <div class="stat-label">Offers</div>
      </div>
    </div>

    <div class="tracker-controls">
      <input type="text" class="tracker-search" id="tracker-search" placeholder="Search company or role..." />
      <button class="btn btn-secondary" id="export-csv">Export CSV</button>
    </div>

    <div id="tracker-body">
      ${buildTrackerTable(entries)}
    </div>
  `;

  // Search
  const searchInput = container.querySelector('#tracker-search');
  searchInput.addEventListener('input', debounce(() => {
    const q = searchInput.value.toLowerCase();
    const filtered = entries.filter(e =>
      (e.company || '').toLowerCase().includes(q) ||
      (e.role || '').toLowerCase().includes(q)
    );
    container.querySelector('#tracker-body').innerHTML = buildTrackerTable(filtered);
    bindTrackerEvents(container, entries);
  }, 250));

  // Export CSV
  container.querySelector('#export-csv').addEventListener('click', () => exportCSV(entries));

  bindTrackerEvents(container, entries);
}

function buildTrackerTable(entries) {
  if (!entries.length) {
    return `<div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-text">No applications yet.<br>Start applying and they'll appear here.</div>
    </div>`;
  }

  const rows = entries.map(e => `
    <tr data-id="${e.id}">
      <td>
        <div style="font-weight:600;font-size:12px">${esc(e.company) || '—'}</div>
        <div style="color:#6B7280;font-size:11px">${esc(e.role) || '—'}</div>
      </td>
      <td><span class="status-badge status-${e.status || 'applied'}">${statusLabel(e.status)}</span></td>
      <td style="color:#6B7280">${formatAppliedDate(e.appliedAt)}</td>
      <td>
        <select class="status-select" data-entry-id="${e.id}">
          ${statusOptions(e.status)}
        </select>
      </td>
    </tr>
  `).join('');

  return `
    <table class="tracker-table">
      <thead>
        <tr>
          <th>Company / Role</th>
          <th>Status</th>
          <th>Date</th>
          <th>Update</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function bindTrackerEvents(container, entries) {
  container.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.entryId;
      await chrome.runtime.sendMessage({
        type: 'UPDATE_TRACKER_ENTRY',
        payload: { id, updates: { status: sel.value } }
      });
      showToast('Status updated');
    });
  });
}

function statusOptions(current) {
  const options = [
    ['applied', 'Applied'],
    ['phone_screen', 'Phone Screen'],
    ['interview', 'Interview'],
    ['offer', 'Offer'],
    ['rejected', 'Rejected'],
    ['withdrawn', 'Withdrawn'],
  ];
  return options.map(([val, label]) =>
    `<option value="${val}" ${current === val ? 'selected' : ''}>${label}</option>`
  ).join('');
}

function statusLabel(status) {
  const map = {
    applied: 'Applied', phone_screen: 'Phone Screen', interview: 'Interview',
    offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
  };
  return map[status] || 'Applied';
}

function formatAppliedDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function exportCSV(entries) {
  const headers = ['Company', 'Role', 'Portal', 'Status', 'Date Applied', 'URL', 'Notes'];
  const rows = entries.map(e => [
    e.company, e.role, e.portal, e.status,
    e.appliedAt ? new Date(e.appliedAt).toLocaleDateString() : '',
    e.url, e.notes
  ].map(v => `"${(v || '').replace(/"/g, '""')}"`));

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speedyapply-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
