// SpeedyApply — profile-form.js
// Profile tab rendering and logic

async function renderProfileTab(container) {
  const saved = await getProfile() || {};

  // If there's an unsaved draft newer than the saved profile, restore it
  const draftResult = await chrome.storage.local.get('speedyapply_draft');
  const draft = draftResult.speedyapply_draft;

  let profile = saved;
  let hasDraft = false;

  if (draft && draft.updatedAt && (!saved.updatedAt || draft.updatedAt > saved.updatedAt)) {
    profile = draft;
    hasDraft = true;
  }

  container.innerHTML = buildProfileHTML(profile);

  // Show draft restore banner if we loaded a draft
  if (hasDraft) {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;display:flex;justify-content:space-between;align-items:center;';
    banner.innerHTML = `
      <span>Unsaved draft restored</span>
      <button id="discard-draft" style="background:none;border:none;color:#92400E;cursor:pointer;font-size:12px;font-weight:600;text-decoration:underline;">Discard</button>
    `;
    container.querySelector('#profile-form').prepend(banner);
    container.querySelector('#discard-draft').addEventListener('click', async () => {
      await chrome.storage.local.remove('speedyapply_draft');
      renderProfileTab(container);
    });
  }

  initProfileForm(container, profile);
}

function buildProfileHTML(p) {
  const we = p.workExperience || [];
  const edu = p.education || [];
  const skills = p.skills || [];

  return `
    <div class="progress-wrap">
      <div class="progress-label">
        <span>Profile Completion</span>
        <span id="progress-pct">0%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
    </div>

    <form id="profile-form">
      <div class="section-title">Personal Info</div>
      <div class="form-row">
        <div class="form-group"><label>First Name</label><input type="text" name="firstName" value="${esc(p.firstName)}" placeholder="Jane" /></div>
        <div class="form-group"><label>Last Name</label><input type="text" name="lastName" value="${esc(p.lastName)}" placeholder="Smith" /></div>
      </div>
      <div class="form-group"><label>Email</label><input type="email" name="email" value="${esc(p.email)}" placeholder="jane@example.com" /></div>
      <div class="form-row">
        <div class="form-group"><label>Phone</label><input type="tel" name="phone" value="${esc(p.phone)}" placeholder="+1 555 555 5555" /></div>
        <div class="form-group"><label>LinkedIn URL</label><input type="text" name="linkedinUrl" value="${esc(p.linkedinUrl)}" placeholder="linkedin.com/in/username" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Portfolio / Website</label><input type="text" name="portfolioUrl" value="${esc(p.portfolioUrl)}" placeholder="yoursite.com" /></div>
        <div class="form-group"><label>GitHub URL</label><input type="text" name="githubUrl" value="${esc(p.githubUrl)}" placeholder="github.com/username" /></div>
      </div>
      <div class="form-group"><label>Resume Google Drive / Dropbox URL <span style="font-weight:400;color:#6B7280">(for "attach via link" fields)</span></label><input type="text" name="resumeUrl" value="${esc(p.resumeUrl)}" placeholder="https://drive.google.com/file/d/..." /></div>

      <div class="form-row">
        <div class="form-group"><label>Preferred First Name</label><input type="text" name="preferredFirstName" value="${esc(p.preferredFirstName)}" placeholder="Same as first name" /></div>
      </div>

      <div class="section-title">Address</div>
      <div class="form-group"><label>Street</label><input type="text" name="address.street" value="${esc(p.address?.street)}" placeholder="123 Main St" /></div>
      <div class="form-row">
        <div class="form-group"><label>City</label><input type="text" name="address.city" value="${esc(p.address?.city)}" placeholder="San Francisco" /></div>
        <div class="form-group"><label>State</label><input type="text" name="address.state" value="${esc(p.address?.state)}" placeholder="CA" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>ZIP Code</label><input type="text" name="address.zip" value="${esc(p.address?.zip)}" placeholder="94105" /></div>
        <div class="form-group"><label>Country</label><input type="text" name="address.country" value="${esc(p.address?.country) || 'US'}" placeholder="US" /></div>
      </div>

      <div class="section-title">Work Experience</div>
      <div id="work-entries">
        ${we.map((w, i) => buildWorkEntryHTML(w, i)).join('')}
      </div>
      <button type="button" class="btn-add" id="add-work">+ Add Experience</button>

      <div class="section-title">Education</div>
      <div id="edu-entries">
        ${edu.map((e, i) => buildEduEntryHTML(e, i)).join('')}
      </div>
      <button type="button" class="btn-add" id="add-edu">+ Add Education</button>

      <div class="section-title">Skills</div>
      <div class="skills-wrap" id="skills-wrap">
        ${skills.map(s => buildSkillTagHTML(s)).join('')}
        <input type="text" class="skill-input" id="skill-input" placeholder="Type a skill and press Enter" />
      </div>

      <div class="section-title">Application Defaults</div>
      <div class="form-row">
        <div class="form-group">
          <label>Requires Visa Sponsorship?</label>
          <select name="requiresVisaSponsorship">
            <option value="">Select...</option>
            <option value="No" ${p.requiresVisaSponsorship === 'No' ? 'selected' : ''}>No</option>
            <option value="Yes" ${p.requiresVisaSponsorship === 'Yes' ? 'selected' : ''}>Yes</option>
          </select>
        </div>
        <div class="form-group">
          <label>Work Authorized (US)?</label>
          <select name="workAuthorized">
            <option value="">Select...</option>
            <option value="Yes" ${p.workAuthorized === 'Yes' ? 'selected' : ''}>Yes</option>
            <option value="No" ${p.workAuthorized === 'No' ? 'selected' : ''}>No</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Salary Expectation</label><input type="text" name="salaryExpectation" value="${esc(p.salaryExpectation)}" placeholder="e.g. 120000 or $120k" /></div>
        <div class="form-group">
          <label>Over 18?</label>
          <select name="over18">
            <option value="">Select...</option>
            <option value="Yes" ${p.over18 === 'Yes' ? 'selected' : ''}>Yes</option>
            <option value="No" ${p.over18 === 'No' ? 'selected' : ''}>No</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Time Zone</label><input type="text" name="timezone" value="${esc(p.timezone)}" placeholder="e.g. EST, PST, GMT+5:30" /></div>
        <div class="form-group">
          <label>Willing to Work On-site?</label>
          <select name="willingToWorkOnsite">
            <option value="">Select...</option>
            <option value="Yes" ${p.willingToWorkOnsite === 'Yes' ? 'selected' : ''}>Yes</option>
            <option value="No" ${p.willingToWorkOnsite === 'No' ? 'selected' : ''}>No</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Gender <span style="font-weight:400;color:#6B7280">(EEO)</span></label>
          <select name="gender">
            <option value="">Select...</option>
            <option value="Male" ${p.gender === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${p.gender === 'Female' ? 'selected' : ''}>Female</option>
            <option value="Non-binary" ${p.gender === 'Non-binary' ? 'selected' : ''}>Non-binary</option>
            <option value="Decline to self identify" ${p.gender === 'Decline to self identify' ? 'selected' : ''}>Prefer not to say</option>
          </select>
        </div>
        <div class="form-group">
          <label>Disability Status <span style="font-weight:400;color:#6B7280">(EEO)</span></label>
          <select name="disabilityStatus">
            <option value="">Select...</option>
            <option value="No" ${p.disabilityStatus === 'No' ? 'selected' : ''}>No disability</option>
            <option value="Yes" ${p.disabilityStatus === 'Yes' ? 'selected' : ''}>Has disability</option>
            <option value="I don't wish to answer" ${p.disabilityStatus === "I don't wish to answer" ? 'selected' : ''}>Prefer not to say</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Veteran Status <span style="font-weight:400;color:#6B7280">(EEO)</span></label>
          <select name="veteranStatus">
            <option value="">Select...</option>
            <option value="Not a protected veteran" ${p.veteranStatus === 'Not a protected veteran' ? 'selected' : ''}>Not a veteran</option>
            <option value="I don't wish to answer" ${p.veteranStatus === "I don't wish to answer" ? 'selected' : ''}>Prefer not to say</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date of Birth <span style="font-weight:400;color:#6B7280">(age questions)</span></label>
          <input type="date" name="dateOfBirth" value="${p.dateOfBirth || ''}" max="${new Date().toISOString().slice(0,10)}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Race / Ethnicity <span style="font-weight:400;color:#6B7280">(EEO)</span></label>
          <select name="ethnicity">
            <option value="">Select...</option>
            <option value="Hispanic or Latino" ${p.ethnicity === 'Hispanic or Latino' ? 'selected' : ''}>Hispanic or Latino</option>
            <option value="White" ${p.ethnicity === 'White' ? 'selected' : ''}>White (not Hispanic)</option>
            <option value="Black or African American" ${p.ethnicity === 'Black or African American' ? 'selected' : ''}>Black or African American</option>
            <option value="Asian" ${p.ethnicity === 'Asian' ? 'selected' : ''}>Asian</option>
            <option value="Two or More Races" ${p.ethnicity === 'Two or More Races' ? 'selected' : ''}>Two or More Races</option>
            <option value="Native Hawaiian or Other Pacific Islander" ${p.ethnicity === 'Native Hawaiian or Other Pacific Islander' ? 'selected' : ''}>Native Hawaiian / Pacific Islander</option>
            <option value="American Indian or Alaska Native" ${p.ethnicity === 'American Indian or Alaska Native' ? 'selected' : ''}>American Indian / Alaska Native</option>
            <option value="I prefer not to answer" ${p.ethnicity === 'I prefer not to answer' ? 'selected' : ''}>Prefer not to say</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Work Authorization Note <span style="font-weight:400;color:#6B7280">(for visa/permit questions)</span></label>
        <input type="text" name="workAuthorizationNote" value="${esc(p.workAuthorizationNote)}" placeholder="e.g. US Citizen, H1B visa valid until 2027" />
      </div>

      <div class="section-title">Resume</div>
      <div class="file-upload-area" id="resume-upload-area">
        <div class="file-upload-text" id="resume-label">Click to upload PDF resume</div>
        <input type="file" id="resume-file" accept=".pdf" style="display:none" />
      </div>
      <button type="button" id="parse-resume-btn" style="width:100%;margin-top:8px;padding:8px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
        ✨ Parse Resume &amp; Fill Profile
      </button>
      <div id="parse-resume-status" style="font-size:12px;margin-top:6px;text-align:center;display:none;"></div>
      <div class="form-group" style="margin-top:10px">
        <label>Resume Text (for AI context)</label>
        <textarea name="resumeText" placeholder="Paste plain text version of your resume here...">${esc(p.resumeText)}</textarea>
      </div>

      <div style="margin-top:18px; display:flex; gap:8px;">
        <button type="submit" class="btn btn-primary btn-full">Save Profile</button>
      </div>
    </form>
  `;
}

function buildWorkEntryHTML(w = {}, i) {
  return `
    <div class="entry-card" data-work-idx="${i}">
      <div class="entry-card-header">
        <span class="entry-card-title">${esc(w.title) || 'New Position'}</span>
        <button type="button" class="btn-remove" data-remove-work="${i}">×</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Job Title</label><input type="text" name="work[${i}].title" value="${esc(w.title)}" placeholder="Software Engineer" /></div>
        <div class="form-group"><label>Company</label><input type="text" name="work[${i}].company" value="${esc(w.company)}" placeholder="Acme Corp" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Start (YYYY-MM)</label><input type="text" name="work[${i}].startDate" value="${esc(w.startDate)}" placeholder="2022-01" /></div>
        <div class="form-group"><label>End (YYYY-MM or blank)</label><input type="text" name="work[${i}].endDate" value="${esc(w.endDate)}" placeholder="Present" /></div>
      </div>
      <div class="form-group"><label>Location</label><input type="text" name="work[${i}].location" value="${esc(w.location)}" placeholder="San Francisco, CA" /></div>
      <div class="form-group"><label>Description</label><textarea name="work[${i}].description" placeholder="Key responsibilities and achievements...">${esc(w.description)}</textarea></div>
    </div>
  `;
}

function buildEduEntryHTML(e = {}, i) {
  return `
    <div class="entry-card" data-edu-idx="${i}">
      <div class="entry-card-header">
        <span class="entry-card-title">${esc(e.institution) || 'New School'}</span>
        <button type="button" class="btn-remove" data-remove-edu="${i}">×</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Institution</label><input type="text" name="edu[${i}].institution" value="${esc(e.institution)}" placeholder="MIT" /></div>
        <div class="form-group"><label>Degree</label><input type="text" name="edu[${i}].degree" value="${esc(e.degree)}" placeholder="Bachelor of Science" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Field of Study</label><input type="text" name="edu[${i}].field" value="${esc(e.field)}" placeholder="Computer Science" /></div>
        <div class="form-group"><label>GPA (optional)</label><input type="text" name="edu[${i}].gpa" value="${esc(e.gpa)}" placeholder="3.8" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Start Year</label><input type="text" name="edu[${i}].startDate" value="${esc(e.startDate)}" placeholder="2018" /></div>
        <div class="form-group"><label>End Year</label><input type="text" name="edu[${i}].endDate" value="${esc(e.endDate)}" placeholder="2022" /></div>
      </div>
    </div>
  `;
}

function buildSkillTagHTML(skill) {
  return `<span class="skill-tag">${esc(skill)}<button type="button" data-remove-skill="${esc(skill)}">×</button></span>`;
}

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initProfileForm(container, initialProfile) {
  const form = container.querySelector('#profile-form');
  let workEntries = [...(initialProfile.workExperience || [])];
  let eduEntries = [...(initialProfile.education || [])];
  let skills = [...(initialProfile.skills || [])];

  updateProgress();

  // Add work experience
  container.querySelector('#add-work').addEventListener('click', () => {
    workEntries.push({ id: generateId() });
    rerenderWork();
  });

  // Add education
  container.querySelector('#add-edu').addEventListener('click', () => {
    eduEntries.push({ id: generateId() });
    rerenderEdu();
  });

  // Remove entries (delegated)
  container.addEventListener('click', e => {
    if (e.target.dataset.removeWork !== undefined) {
      const idx = parseInt(e.target.dataset.removeWork);
      workEntries.splice(idx, 1);
      rerenderWork();
    }
    if (e.target.dataset.removeEdu !== undefined) {
      const idx = parseInt(e.target.dataset.removeEdu);
      eduEntries.splice(idx, 1);
      rerenderEdu();
    }
    if (e.target.dataset.removeSkill !== undefined) {
      skills = skills.filter(s => s !== e.target.dataset.removeSkill);
      rerenderSkills();
    }
  });

  // Skills tag input
  const skillInput = container.querySelector('#skill-input');
  skillInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = skillInput.value.trim().replace(/,$/, '');
      if (val && !skills.includes(val)) {
        skills.push(val);
        rerenderSkills();
      }
      skillInput.value = '';
    }
  });

  // Resume upload
  const uploadArea = container.querySelector('#resume-upload-area');
  const fileInput = container.querySelector('#resume-file');
  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      await saveResume({ name: file.name, size: file.size, base64, mimeType: file.type });
      uploadArea.classList.add('has-file');
      container.querySelector('#resume-label').innerHTML = `<span class="file-name">${esc(file.name)}</span><br><span class="file-upload-text">${(file.size / 1024).toFixed(0)} KB — click to replace</span>`;
    };
    reader.readAsDataURL(file);
  });

  // Check existing resume
  getResume().then(res => {
    if (res) {
      uploadArea.classList.add('has-file');
      container.querySelector('#resume-label').innerHTML = `<span class="file-name">${esc(res.name)}</span><br><span class="file-upload-text">${(res.size / 1024).toFixed(0)} KB — click to replace</span>`;
    }
  });

  // Parse Resume button — send PDF to Gemini, extract profile data, re-render form
  const parseBtn = container.querySelector('#parse-resume-btn');
  const parseStatus = container.querySelector('#parse-resume-status');
  parseBtn.addEventListener('click', async () => {
    parseBtn.disabled = true;
    parseBtn.textContent = '⏳ Parsing resume...';
    parseStatus.style.display = 'block';
    parseStatus.style.color = '#6B7280';
    parseStatus.textContent = 'Sending to AI — this takes 5-10 seconds...';

    const resp = await chrome.runtime.sendMessage({ type: 'PARSE_RESUME' });

    if (resp?.error) {
      parseStatus.style.color = '#DC2626';
      parseStatus.textContent = resp.error;
      parseBtn.disabled = false;
      parseBtn.textContent = '✨ Parse Resume & Fill Profile';
      return;
    }

    const parsed = resp.parsed;

    // Merge: parsed fills empty fields only; arrays replace if profile has none
    const current = collectFormData(form, workEntries, eduEntries, skills, initialProfile);
    const merged = {
      ...parsed,
      // Keep existing non-empty scalar fields
      ...Object.fromEntries(Object.entries(current).filter(([k, v]) =>
        v && !Array.isArray(v) && typeof v !== 'object' && k !== 'resumeText'
      )),
      // Keep existing arrays if already populated
      workExperience: current.workExperience?.length ? current.workExperience : (parsed.workExperience || []),
      education:      current.education?.length      ? current.education      : (parsed.education || []),
      skills:         current.skills?.length         ? current.skills         : (parsed.skills || []),
      address:        (current.address?.city || current.address?.country) ? current.address : (parsed.address || {}),
      resumeText:     parsed.resumeText || current.resumeText || '',
    };

    merged.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ speedyapply_draft: merged });
    parseStatus.style.color = '#059669';
    parseStatus.textContent = '✓ Profile filled from resume — review and save.';
    await renderProfileTab(container);
  });

  // Auto-save draft to local storage as user types (every 1.5s)
  // This is separate from the real save (sync storage) — just prevents data loss
  const autosaveDraft = debounce(async () => {
    const profile = collectFormData(form, workEntries, eduEntries, skills, initialProfile);
    await chrome.storage.local.set({ speedyapply_draft: profile });
    showDraftIndicator();
  }, 1500);

  function showDraftIndicator() {
    const btn = form.querySelector('button[type="submit"]');
    const existing = container.querySelector('#draft-indicator');
    if (existing) return;
    const indicator = document.createElement('div');
    indicator.id = 'draft-indicator';
    indicator.style.cssText = 'font-size:11px;color:#6B7280;text-align:center;margin-top:6px;';
    indicator.textContent = 'Draft saved';
    btn.parentNode.insertBefore(indicator, btn.nextSibling);
    setTimeout(() => indicator.remove(), 2500);
  }

  // Form submission — saves to sync storage (real save)
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const profile = collectFormData(form, workEntries, eduEntries, skills, initialProfile);
    await chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', payload: profile });
    // Clear draft once properly saved
    await chrome.storage.local.remove('speedyapply_draft');
    showToast('Profile saved!', 'success');
    updateProgress();
  });

  // Live progress updates + auto-save draft
  form.addEventListener('input', debounce(updateProgress, 300));
  form.addEventListener('input', autosaveDraft);

  function rerenderWork() {
    const wrap = container.querySelector('#work-entries');
    wrap.innerHTML = workEntries.map((w, i) => buildWorkEntryHTML(w, i)).join('');
  }

  function rerenderEdu() {
    const wrap = container.querySelector('#edu-entries');
    wrap.innerHTML = eduEntries.map((e, i) => buildEduEntryHTML(e, i)).join('');
  }

  function rerenderSkills() {
    const wrap = container.querySelector('#skills-wrap');
    const input = wrap.querySelector('#skill-input');
    const inputVal = input ? input.value : '';
    wrap.innerHTML = skills.map(s => buildSkillTagHTML(s)).join('') +
      `<input type="text" class="skill-input" id="skill-input" placeholder="Type a skill and press Enter" value="${esc(inputVal)}" />`;
    const newInput = wrap.querySelector('#skill-input');
    newInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = newInput.value.trim().replace(/,$/, '');
        if (val && !skills.includes(val)) { skills.push(val); rerenderSkills(); }
        newInput.value = '';
      }
    });
  }

  function updateProgress() {
    const profile = collectFormData(form, workEntries, eduEntries, skills, initialProfile);
    const pct = calculateCompletion(profile);
    container.querySelector('#progress-fill').style.width = pct + '%';
    container.querySelector('#progress-pct').textContent = pct + '%';
  }
}

// Ensure URLs have a protocol prefix — accepts linkedin.com/in/x or https://linkedin.com/in/x
function normalizeUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'https://' + url;
}

function collectFormData(form, workEntries, eduEntries, skills, initialProfile) {
  const data = new FormData(form);
  const profile = { ...initialProfile };

  // Flat fields
  for (const [key, value] of data.entries()) {
    if (!key.includes('[') && !key.includes('.')) {
      profile[key] = value.trim();
    }
  }

  // Normalize URL fields
  const urlFields = ['linkedinUrl', 'portfolioUrl', 'githubUrl'];
  for (const field of urlFields) {
    if (profile[field]) profile[field] = normalizeUrl(profile[field]);
  }

  // Nested address fields
  profile.address = profile.address || {};
  for (const [key, value] of data.entries()) {
    if (key.startsWith('address.')) {
      const field = key.split('.')[1];
      profile.address[field] = value.trim();
    }
  }

  // Work experience
  profile.workExperience = workEntries.map((entry, i) => {
    const w = { ...entry };
    for (const [key, value] of data.entries()) {
      const match = key.match(/^work\[(\d+)\]\.(.+)$/);
      if (match && parseInt(match[1]) === i) w[match[2]] = value.trim();
    }
    w.isCurrent = !w.endDate || w.endDate.toLowerCase() === 'present';
    return w;
  });

  // Education
  profile.education = eduEntries.map((entry, i) => {
    const e = { ...entry };
    for (const [key, value] of data.entries()) {
      const match = key.match(/^edu\[(\d+)\]\.(.+)$/);
      if (match && parseInt(match[1]) === i) e[match[2]] = value.trim();
    }
    return e;
  });

  profile.skills = skills;
  return profile;
}

function calculateCompletion(profile) {
  const fields = [
    profile.firstName, profile.lastName, profile.email, profile.phone,
    profile.linkedinUrl, profile.address?.city, profile.address?.state,
    profile.workExperience?.length > 0,
    profile.education?.length > 0,
    profile.skills?.length > 0,
    profile.requiresVisaSponsorship,
    profile.workAuthorized,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}
