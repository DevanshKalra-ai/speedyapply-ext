// SpeedyApply — service-worker.js
// Message hub, Gemini API calls, storage writes

importScripts(
  'shared/constants.js',
  'shared/utils.js',
  'shared/storage.js',
  'shared/gemini.js'
);

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('[SpeedyApply SW] Error handling message:', err);
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_PROFILE':
      return { profile: await getProfile() };

    case 'GET_SETTINGS':
      return { settings: await getSettings() };

    case 'SAVE_PROFILE': {
      const saved = await saveProfile(message.payload);
      broadcastToContentScripts({ type: 'PROFILE_UPDATED', profile: saved });
      return { ok: true };
    }

    case 'LOG_APPLICATION': {
      const entry = message.payload;
      entry.id = entry.id || generateId();
      entry.appliedAt = entry.appliedAt || today();
      entry.updatedAt = today();
      entry.status = entry.status || 'applied';
      const saved = await addTrackerEntry(entry);
      return { ok: true, id: saved.id };
    }

    case 'UPDATE_TRACKER_ENTRY': {
      const updated = await updateTrackerEntry(message.payload.id, message.payload.updates);
      return { ok: true, entry: updated };
    }

    case 'GET_TRACKER':
      return { entries: await getTrackerEntries() };

    case 'PARSE_RESUME': {
      const apiKey = await getApiKey();
      if (!apiKey) return { error: 'no_api_key' };
      const resume = await getResume();
      if (!resume?.base64) return { error: 'No resume uploaded — please upload a PDF first.' };
      try {
        const parsed = await parseResumeFromPDF(resume.base64, resume.mimeType);
        return { parsed };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'GENERATE_AI_RESPONSE': {
      const { question, fieldContext } = message.payload;
      const apiKey = await getApiKey();
      if (!apiKey) return { error: 'no_api_key' };
      const profile = await getProfile();
      const answer = await generateAnswer(question, profile, fieldContext || {});
      return { answer };
    }

    case 'FILL_DROPDOWNS_AI': {
      const { dropdowns, fieldContext } = message.payload;
      const apiKey = await getApiKey();
      if (!apiKey) return { error: 'no_api_key', selections: {} };
      const profile = await getProfile();
      const selections = await fillDropdownsAI(dropdowns, profile, fieldContext || {});
      return { selections };
    }

    case 'TEST_API_KEY': {
      const valid = await testApiKey(message.payload.key);
      return { valid };
    }

    case 'SAVE_API_KEY':
      await saveApiKey(message.payload.key);
      return { ok: true };

    case 'GET_API_KEY':
      return { key: await getApiKey() };

    case 'SAVE_SETTINGS':
      await saveSettings(message.payload);
      return { ok: true };

    case 'CLEAR_ALL_DATA':
      await clearAllData();
      return { ok: true };

    case 'GET_RESUME':
      return { resume: await getResume() };

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

async function broadcastToContentScripts(message) {
  // Content scripts run on all https pages (to support embedded Greenhouse boards),
  // but only inject the sidebar on actual application pages. Broadcast everywhere —
  // tabs without our listener silently drop the message.
  const tabs = await chrome.tabs.query({ url: ['https://*/*', 'file:///*'] });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}
