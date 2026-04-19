// SpeedyApply — ai-handler.js
// Detect open-text questions suitable for AI-generated answers

// Returns an array of { el, labelText, idx, confidence }
function detectOpenTextQuestions() {
  const questions = getOpenTextFields().map((el, idx) => {
    const labelText = getQuestionLabel(el);
    const confidence = scoreAsAiQuestion(el, labelText);
    return { el, labelText, idx, confidence };
  }).filter(q => q.confidence >= 0.6 && q.labelText.length > 5);

  // Sort by confidence, return top candidates
  questions.sort((a, b) => b.confidence - a.confidence);
  return questions;
}

// Get all visible, unfilled open-text fields
function getOpenTextFields() {
  const candidates = [];

  // All textareas
  document.querySelectorAll('textarea').forEach(el => {
    if (isVisible(el) && !el.disabled && !el.value.trim()) candidates.push(el);
  });

  // Long text inputs (maxlength > 200 or no maxlength)
  document.querySelectorAll('input[type="text"]').forEach(el => {
    if (!isVisible(el) || el.disabled || el.value.trim()) return;
    const maxlen = parseInt(el.getAttribute('maxlength') || '0');
    if (maxlen === 0 || maxlen > 200) candidates.push(el);
  });

  // Contenteditable divs (Ashby and some React rich-text editors)
  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    if (!isVisible(el) || el.textContent.trim()) return;
    candidates.push(el);
  });

  return candidates;
}

// Get the best label text for an open-text question field.
// Falls back to walking up to a data-field-id container and reading
// any <p>, <div>, or <label> with substantial text — catches Ashby's
// long question paragraphs that sit above the textarea.
function getQuestionLabel(el) {
  let label = getLabelText(el);
  if (label && label.length > 5) return label;

  // Walk up to the data-field-id container (Ashby)
  let node = el.parentElement;
  while (node && !node.hasAttribute('data-field-id')) node = node.parentElement;
  if (!node) return label;

  // Look for the longest text block that isn't the textarea itself
  const textCandidates = Array.from(node.querySelectorAll(
    'label, legend, p, h2, h3, h4, [class*="question" i], [class*="label" i], [class*="prompt" i], [class*="title" i]'
  ));
  let best = '';
  for (const c of textCandidates) {
    if (c.contains(el)) continue;
    if (c.querySelector('input,select,textarea')) continue;
    const text = c.textContent.trim();
    if (text.length > best.length) best = text;
  }
  return best || label;
}

// Score a field as an AI question candidate (0-1)
function scoreAsAiQuestion(el, labelText) {
  let score = 0;
  const lowerLabel = labelText.toLowerCase();

  // Textarea is a strong signal — it's almost never used for a short structured answer
  if (el.tagName === 'TEXTAREA') score += 0.4;

  // Label text contains AI keywords
  if (AI_QUESTION_KEYWORDS.some(kw => lowerLabel.includes(kw))) {
    score += 0.5;
  }

  // Long label (> 30 chars) strongly suggests a written question, not a field name
  // "Please walk us through a specific time..." is 300+ chars
  if (lowerLabel.length > 80) score += 0.3;
  else if (lowerLabel.length > 30) score += 0.15;

  // Label ends with "?" — it's literally a question
  if (labelText.trim().endsWith('?')) score += 0.2;

  // Label starts with "Please" — explicit instruction to write something
  if (/^please\b/i.test(lowerLabel.trim())) score += 0.2;

  // Long maxlength
  const maxlen = parseInt(el.getAttribute('maxlength') || '0');
  if (maxlen > 500) score += 0.2;
  else if (maxlen > 200) score += 0.1;

  // Named "cover_letter", "additional_info", etc.
  const name = (el.getAttribute('name') || '').toLowerCase();
  if (name.includes('cover') || name.includes('additional') || name.includes('comments') ||
      name.includes('message') || name.includes('essay')) {
    score += 0.3;
  }

  return Math.min(score, 1.0);
}

function isVisible(el) {
  if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}
