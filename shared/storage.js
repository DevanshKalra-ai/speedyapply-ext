// SpeedyApply — storage.js
// Abstraction over chrome.storage (sync for profile/settings, local for tracker/resume)

const KEYS = {
  PROFILE:  'speedyapply_profile',
  SETTINGS: 'speedyapply_settings',
  TRACKER:  'speedyapply_tracker',
  RESUME:   'speedyapply_resume',   // base64 PDF — local only, never sync
  API_KEY:  'speedyapply_gemini_key',
};

// ---------- Profile (sync) ----------

async function getProfile() {
  const result = await chrome.storage.sync.get(KEYS.PROFILE);
  return result[KEYS.PROFILE] || null;
}

async function saveProfile(profile) {
  profile.updatedAt = new Date().toISOString();
  if (!profile.createdAt) profile.createdAt = profile.updatedAt;
  await chrome.storage.sync.set({ [KEYS.PROFILE]: profile });
  return profile;
}

// ---------- Settings (sync) ----------

const DEFAULT_SETTINGS = {
  autofillEnabled: true,
  aiEnabled: true,
  autoSubmit: false,
};

async function getSettings() {
  const result = await chrome.storage.sync.get(KEYS.SETTINGS);
  return Object.assign({}, DEFAULT_SETTINGS, result[KEYS.SETTINGS] || {});
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ [KEYS.SETTINGS]: settings });
  return settings;
}

// ---------- API Key (sync) ----------

async function getApiKey() {
  const result = await chrome.storage.sync.get(KEYS.API_KEY);
  return result[KEYS.API_KEY] || '';
}

async function saveApiKey(key) {
  await chrome.storage.sync.set({ [KEYS.API_KEY]: key });
}

// ---------- Resume (local — never sync due to size) ----------

async function getResume() {
  const result = await chrome.storage.local.get(KEYS.RESUME);
  return result[KEYS.RESUME] || null; // { name, size, base64, mimeType }
}

async function saveResume(resumeData) {
  // resumeData = { name, size, base64, mimeType }
  await chrome.storage.local.set({ [KEYS.RESUME]: resumeData });
}

// ---------- Tracker (local) ----------

async function getTrackerEntries() {
  const result = await chrome.storage.local.get(KEYS.TRACKER);
  return result[KEYS.TRACKER] || [];
}

async function addTrackerEntry(entry) {
  const entries = await getTrackerEntries();
  entries.unshift(entry); // newest first
  await chrome.storage.local.set({ [KEYS.TRACKER]: entries });
  return entry;
}

async function updateTrackerEntry(id, updates) {
  const entries = await getTrackerEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;
  entries[idx] = Object.assign({}, entries[idx], updates, { updatedAt: new Date().toISOString() });
  await chrome.storage.local.set({ [KEYS.TRACKER]: entries });
  return entries[idx];
}

async function deleteTrackerEntry(id) {
  const entries = await getTrackerEntries();
  const filtered = entries.filter(e => e.id !== id);
  await chrome.storage.local.set({ [KEYS.TRACKER]: filtered });
}

async function clearAllData() {
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
}

// Count applications this week
async function getWeeklyCount() {
  const entries = await getTrackerEntries();
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return entries.filter(e => new Date(e.appliedAt).getTime() > oneWeekAgo).length;
}
