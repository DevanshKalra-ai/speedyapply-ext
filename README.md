# SpeedyApply — Job Application Autofill Chrome Extension

A Manifest V3 Chrome extension that autofills job applications across multiple portals, uploads your resume, and uses Gemini AI to generate answers for open-ended questions.

## Supported Portals

| Portal | Detection | Example companies |
|--------|-----------|-------------------|
| **Greenhouse** | `boards.greenhouse.io`, `?gh_jid=` URL param, DOM signals | Anthropic, Figma, Duolingo, HubSpot, Loop |
| **Ashby** | `*.ashbyhq.com` | Notion, Linear, Ramp, Vercel, Plaid, Supabase, PostHog, Deel, Reddit, Snowflake |
| **Lever** | `jobs.lever.co` | Spotify, Shopify, Netflix (legacy), KPMG, Atlassian |
| **Workable** | `apply.workable.com`, `*.workable.com` | 30,000+ companies incl. Workable careers |
| **SmartRecruiters** | `jobs.smartrecruiters.com`, `*.smartrecruiters.com` (incl. OneClick shadow DOM) | Visa, LinkedIn, Bosch, McDonald's, Skechers, Dungarvin |
| **Breezy HR** | `*.breezy.hr` | Thousands of startups and mid-size employers |
| **Jobvite** | `jobs.jobvite.com`, `.jv-*` classes | Starwood Capital, Internet Brands, INNIO Group |
| **Generic** | Any URL with `apply`, `career`, or `job` keywords | Fallback label-based field matching |

### Greenhouse embedded boards
SpeedyApply detects Greenhouse-backed career pages hosted on the company's own domain. If the URL contains `?gh_jid=` or `?gh_src=` (e.g. `careers.nebius.com/?gh_jid=...`), it activates Greenhouse autofill. Also catches embedded `iframe` and `script` signals.

## Features

- **Smart autofill** — fills name, email, phone, address, LinkedIn, GitHub, portfolio, and more
- **Resume upload** — automatically attaches your PDF to file inputs
- **AI-generated answers** — Gemini generates STAR-format answers for behavioral questions
- **AI dropdown fill** — uses Gemini to pick the best option for unknown dropdowns
- **EEO / diversity fields** — fills gender, ethnicity, disability, veteran status from profile
- **Age / DOB inference** — derives age range answers from your date of birth
- **Job tracker** — logs applications and auto-records submissions
- **Resume PDF parsing** — parse your resume PDF to auto-populate your profile

## Setup

### 1. Load the extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder

### 2. Add a Gemini API key

1. Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click the extension icon → **Settings** → paste your key and save

### 3. Fill your profile

1. Click the extension icon → **Profile**
2. Fill in your personal details, work experience, education, and EEO fields
3. Upload your resume PDF

### 4. Apply to jobs

Navigate to a supported job application page. The **SpeedyApply** sidebar will appear automatically. Click **⚡ Autofill Now**.

## Project Structure

```
speedyapply-ext/
├── manifest.json                  # MV3 manifest
├── service-worker.js              # Background: Gemini API calls, storage
├── shared/
│   ├── constants.js               # PORTALS, FIELD_SELECTORS, AI_QUESTION_KEYWORDS
│   ├── utils.js                   # DOM helpers, age/DOB utilities, debounce
│   ├── storage.js                 # chrome.storage wrappers (profile, resume, tracker)
│   └── gemini.js                  # Gemini API client (answers, dropdowns, resume parse)
├── content/
│   ├── content-main.js            # Orchestrator: detect portal, inject sidebar
│   ├── detector.js                # Portal + application-page detection
│   ├── field-mapper.js            # Generic confidence-scored field matching
│   ├── ai-handler.js              # Open-text question detection
│   ├── sidebar.js                 # Shadow DOM sidebar UI + AI fill logic
│   ├── ashby-intercept-early.js   # MAIN world bridge for Ashby React props
│   └── portals/
│       ├── greenhouse.js
│       ├── ashby.js
│       ├── lever.js
│       ├── workable.js
│       ├── smartrecruiters.js
│       ├── breezy.js
│       ├── jobvite.js
│       └── generic.js
├── popup/
│   ├── popup.html / popup.css / popup.js
│   └── components/
│       ├── profile-form.js        # Profile tab (personal info, work, education, EEO)
│       ├── settings-panel.js      # API key + autofill toggles
│       └── tracker-table.js       # Application tracker tab
├── assets/
│   ├── sidebar.css
│   └── icons/
└── test/mock-forms/               # Local HTML forms for testing
```

## How AI Works

All AI calls go through **Gemini 2.5 Flash** (`gemini-2.5-flash`):

- **Open-text questions** — detected by keyword matching; sidebar shows AI cards with Accept / Regenerate buttons
- **Dropdown fill** — unfilled `<select>`, radio groups, and custom comboboxes are batched in one call
- **Resume parsing** — multimodal Gemini call; extracts structured profile data from your PDF

Your API key is stored in `chrome.storage.local` and never sent to any server other than Google's Generative Language API.

## Greenhouse Embedded Sites

Many companies host Greenhouse-backed job boards on their own domain (e.g. `careers.company.com/?gh_jid=123`). SpeedyApply detects these via:

1. `?gh_jid=` or `?gh_src=` URL parameters
2. DOM signals: `form[action*="greenhouse"]`, `iframe[src*="greenhouse.io"]`, `script[src*="boards.greenhouse.io"]`

The extension runs on all `https://` pages and activates only when a job application is detected, so performance on unrelated sites is unaffected.

## Privacy

- All data (profile, resume, tracker) is stored locally in Chrome storage
- AI calls are sent directly to Google's Generative Language API using your own key
- No data is sent to any SpeedyApply server

## Version

**v1.0.0** — Initial release
