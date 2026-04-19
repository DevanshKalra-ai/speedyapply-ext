// SpeedyApply — gemini.js
// Gemini API client — called ONLY from the service worker

const GEMINI_MODEL = 'gemini-2.5-flash-lite-preview-06-17';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Generate a free-text answer for an open-text question
async function generateAnswer(question, profile, context = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key configured');

  const prompt = buildAnswerPrompt(question, profile, context);
  // Detailed behavioral questions need more tokens (~300 words = ~420 tokens + prompt overhead)
  const maxTokens = isDetailedQuestion(question) ? 900 : 500;
  return callGemini(apiKey, prompt, 2, maxTokens);
}

// Given a list of unfilled dropdowns, return best option for each in one call
async function fillDropdownsAI(dropdowns, profile, context = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) return {};

  if (!dropdowns.length) return {};

  const prompt = buildDropdownPrompt(dropdowns, profile, context);
  const raw = await callGemini(apiKey, prompt);

  // Parse JSON from response
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {};
  }
}

// Parse a resume PDF using Gemini's multimodal input and return structured profile data
async function parseResumeFromPDF(base64, mimeType) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key configured');

  const prompt = `Extract all information from this resume and return ONLY a raw JSON object with this exact structure. No markdown, no explanation, just JSON:
{
  "firstName": "",
  "lastName": "",
  "email": "",
  "phone": "",
  "linkedinUrl": "",
  "portfolioUrl": "",
  "githubUrl": "",
  "resumeText": "",
  "skills": [],
  "workExperience": [
    { "title": "", "company": "", "location": "", "startDate": "YYYY-MM", "endDate": "YYYY-MM", "isCurrent": false, "description": "" }
  ],
  "education": [
    { "institution": "", "degree": "", "field": "", "startDate": "YYYY-MM", "endDate": "YYYY-MM", "gpa": "" }
  ],
  "address": { "city": "", "state": "", "country": "", "zip": "" }
}
Rules:
- Dates must be YYYY-MM format (e.g. "2022-03"). Year-only becomes YYYY-01.
- isCurrent = true if person still works there (Present / Current / now).
- resumeText = full plain-text content of the resume for AI context.
- Extract ALL work experience and education entries in reverse-chronological order.
- Use empty string "" for missing text fields, empty array [] for missing arrays.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: mimeType || 'application/pdf', data: base64 } },
          { text: prompt },
        ]}],
        generationConfig: { maxOutputTokens: 8000, temperature: 0.1 },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error: ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse resume — try again');

  // Clean common AI JSON issues: trailing commas before } or ]
  const cleaned = jsonMatch[0]
    .replace(/,\s*([}\]])/g, '$1')   // trailing commas
    .replace(/[\u0000-\u001F\u007F]/g, ' '); // control characters

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Could not parse resume data — try again');
  }
}

async function testApiKey(apiKey) {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// Detect if a question requires a long STAR-format behavioral answer
function isDetailedQuestion(question) {
  const q = question.toLowerCase();
  return /walk.*through|specific.*time|specific.*example|describe.*time|tell.*about.*time|outline.*process|what.*would.*you.*differently|troubleshoot|root.*cause|tools.*utiliz|learnings|please.*be.*specific|do not provide.*specific|if you do not provide/i.test(q)
    || question.length > 150; // very long question text always warrants a detailed answer
}

function buildAnswerPrompt(question, profile, context) {
  const latestJob = profile?.workExperience?.[0];
  const skills = (profile?.skills || []).slice(0, 10).join(', ');
  const latestEdu = profile?.education?.[0];
  const detailed = isDetailedQuestion(question);

  // More resume context for detailed questions
  const resumeChars = detailed ? 1200 : 600;
  const wordLimit = detailed ? 300 : 120;

  let prompt = `You are helping ${profile?.firstName || 'a job applicant'} write a professional response to a job application question.\n\n`;

  // Applicant context
  prompt += 'Applicant background:\n';
  if (latestJob) {
    prompt += `- Most recent role: ${latestJob.title} at ${latestJob.company}`;
    if (latestJob.description) prompt += ` — ${latestJob.description.slice(0, 200)}`;
    prompt += '\n';
  }
  if (profile?.workExperience?.[1]) {
    const prev = profile.workExperience[1];
    prompt += `- Previous role: ${prev.title} at ${prev.company}\n`;
  }
  if (skills) prompt += `- Skills: ${skills}\n`;
  if (latestEdu) prompt += `- Education: ${latestEdu.degree || ''} in ${latestEdu.field || ''} from ${latestEdu.institution || ''}\n`;
  if (profile?.resumeText) prompt += `\nResume:\n${profile.resumeText.slice(0, resumeChars)}\n`;

  prompt += '\n';
  if (context.jobTitle && context.company) {
    prompt += `Applying for: ${context.jobTitle} at ${context.company}.\n`;
  }

  prompt += `\nQuestion: "${question}"\n\n`;

  if (detailed) {
    prompt += `Instructions:
- Write a specific, detailed answer in ${wordLimit} words or fewer
- Use STAR format (Situation → Task → Action → Result) for behavioral/story questions
- Reference real tools, processes, and outcomes where possible based on the resume
- Be concrete — vague answers will be rejected by the recruiter
- Write in first person as the applicant
- No preamble, no "Certainly!", just the answer itself

Answer:`;
  } else {
    prompt += `Write a concise answer in ${wordLimit} words or fewer. First person, no preamble:\n\nAnswer:`;
  }

  return prompt;
}

function buildDropdownPrompt(dropdowns, profile, context) {
  const latestJob = profile?.workExperience?.[0];

  let prompt = `You are helping fill out a job application form. For each dropdown question below, pick the BEST option from the provided list.\n\n`;

  if (context.company) prompt += `Company: ${context.company}\n`;
  if (context.jobTitle) prompt += `Role: ${context.jobTitle}\n`;
  if (latestJob) prompt += `Applicant's current role: ${latestJob.title} at ${latestJob.company}\n`;

  prompt += '\nDropdown questions:\n';
  dropdowns.forEach((d, i) => {
    prompt += `\n${i + 1}. Label: "${d.label}"\n   Options: [${d.options.map(o => `"${o}"`).join(', ')}]\n`;
  });

  prompt += `\nRules:
- Return ONLY a raw JSON object, no markdown, no explanation
- The key must exactly match the label text provided
- The value must exactly match one of the provided options
- If you have no idea, pick the most neutral/common option
- Example: {"How did you hear about us?": "LinkedIn", "Are you a collector?": "No"}

JSON:`;

  return prompt;
}

async function callGemini(apiKey, prompt, retries = 2, maxTokens = 600) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    // 25-second timeout per attempt — prevents infinite "Generating..." state
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const resp = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
        }),
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error: ${resp.status}`);
      }

      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt === retries) {
        if (err.name === 'AbortError') throw new Error('Gemini request timed out — check your internet connection.');
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}
