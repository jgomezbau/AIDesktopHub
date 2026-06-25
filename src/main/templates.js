// Tiny mustache-style template renderer for window HTML files.
// Replaces {{key}} tokens with values. Tokens with no match are left empty.

const path = require('path');
const fs = require('fs');

const WINDOWS_DIR = path.join(__dirname, '..', 'windows');

const templateCache = new Map();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readTemplate(name) {
  if (templateCache.has(name)) return templateCache.get(name);
  const filePath = path.join(WINDOWS_DIR, name);
  const content = fs.readFileSync(filePath, 'utf8');
  templateCache.set(name, content);
  return content;
}

/**
 * Renders `templateName` (a file under src/windows) by replacing {{key}} tokens
 * with the provided `values`. Values are HTML-escaped unless `raw` is a list of
 * keys that should be inserted verbatim (trusted app-supplied HTML).
 */
function renderTemplate(templateName, values = {}, raw = []) {
  const template = readTemplate(templateName);
  const rawSet = new Set(raw);

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in values)) return '';
    const value = values[key];
    return rawSet.has(key) ? String(value) : escapeHtml(value);
  });
}

module.exports = { renderTemplate, escapeHtml };
