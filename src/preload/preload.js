// File: src/preload/preload.js
// Self-contained preload: no local require() so we can run with sandbox: true.
// Clipboard, style, and string helpers are inlined here for sandbox compatibility.
const { contextBridge, ipcRenderer, clipboard } = require('electron');

/* ───────────────────────────── Strings (i18n) ──────────────────────────────
 * Centralized user-facing strings. Swapping this object is all that's needed
 * to translate the injected UI.
 */
const STRINGS = {
  copiedToClipboard: 'Copiado al portapapeles',
  copyError: 'Error al copiar',
  readClipboardError: 'Error al leer del portapapeles'
};

/* ───────────────────────────── Clipboard styles ───────────────────────────── */
const clipboardStyles = `
[aria-label="Copy code"],
.copy-button,
.code-block-copy-button,
[data-testid="copy-code-button"],
button[class*="copy"],
div[class*="copyButton"] {
  position: relative;
  z-index: 10 !important;
  cursor: pointer !important;
}

[aria-label="Copy code"].copied:after,
.copy-button.copied:after,
.code-block-copy-button.copied:after,
[data-testid="copy-code-button"].copied:after,
button[class*="copy"].copied:after,
div[class*="copyButton"].copied:after {
  content: "Copiado!";
  position: absolute;
  right: 100%;
  top: 0;
  background: #10a37f;
  color: white;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  margin-right: 8px;
  opacity: 1;
  animation: ccFadeIn 0.3s, ccFadeOut 0.5s 1s forwards;
}

@keyframes ccFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes ccFadeOut { from { opacity: 1; } to { opacity: 0; } }

.relative pre,
.relative code,
pre, code {
  user-select: text !important;
  -webkit-user-select: text !important;
}

[aria-label="Copy code"]:hover,
.copy-button:hover,
.code-block-copy-button:hover,
[data-testid="copy-code-button"]:hover,
button[class*="copy"]:hover,
div[class*="copyButton"]:hover {
  opacity: 1 !important;
  background-color: rgba(255, 255, 255, 0.1) !important;
}

/* ── RENDIMIENTO PARA CHATS LARGOS ──
 * content-visibility: auto omite layout+paint de mensajes fuera del viewport.
 */
article[data-testid^="conversation-turn"],
[data-testid^="conversation-turn"],
.font-claude-message,
[data-testid="conversation"] > *,
main article,
.message,
[class*="message-row"],
[class*="chat-message"] {
  content-visibility: auto;
  contain-intrinsic-size: 0 1000px;
}

html, body { overflow-anchor: none !important; }

header *, nav *, aside * {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* Aislamiento del área de input para tipeo fluido con DOM grande */
main > div:first-of-type,
[class*="conversation-list"],
[class*="messages-container"],
[class*="chat-list"],
[role="presentation"] > div {
  contain: layout style;
  will-change: scroll-position;
}

[data-testid="composer-footer"],
[data-testid="send-button-container"],
form:has(textarea),
.stretch,
div:has(> #prompt-textarea),
div:has(> textarea) {
  contain: layout style;
  isolation: isolate;
}

#prompt-textarea,
textarea[data-id],
textarea[placeholder*="Message"],
textarea[placeholder*="mensaje"],
textarea[placeholder*="Ask"],
textarea[placeholder*="Pregunta"] {
  will-change: contents;
  contain: layout style;
}
`;

/* ───────────────────────────── Copy-button helpers ────────────────────────── */
const COPY_BUTTON_SELECTORS = [
  '[aria-label="Copy code"]',
  '.copy-button',
  '.code-block-copy-button',
  '[data-testid="copy-code-button"]',
  'button[class*="copy"]',
  'div[class*="copyButton"]'
].join(',');

function findCopyButtonFromEventTarget(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest(COPY_BUTTON_SELECTORS);
}

function getCodeTextFromButton(button) {
  if (!button) return null;

  let codeBlock = null;

  const relativeParent = button.closest && button.closest('.relative');
  if (relativeParent) codeBlock = relativeParent.querySelector('code, pre');

  if (!codeBlock) {
    const parent = button.parentElement;
    if (parent) codeBlock = parent.querySelector('pre, code');
  }

  if (!codeBlock && button.parentElement && button.parentElement.parentElement) {
    codeBlock = button.parentElement.parentElement.querySelector('pre, code');
  }

  return codeBlock ? codeBlock.textContent : null;
}

/* ───────────────────────────── UI helpers ─────────────────────────────────── */
function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.className = `notification ${isError ? 'error' : 'success'}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2500);
}

function handleClipboardCopy(text) {
  if (!text) return false;
  try {
    clipboard.writeText(text);
    showNotification(STRINGS.copiedToClipboard);
    return true;
  } catch (error) {
    console.error('Error copiando al portapapeles:', error);
    showNotification(STRINGS.copyError, true);
    return false;
  }
}

function handleClipboardRead() {
  try {
    return clipboard.readText();
  } catch (error) {
    console.error('Error leyendo del portapapeles:', error);
    showNotification(STRINGS.readClipboardError, true);
    return null;
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  copyToClipboard: (text) => handleClipboardCopy(text),
  readFromClipboard: () => handleClipboardRead(),
  getSystemInfo: () => ({ platform: process.platform, version: process.versions.electron }),
  invoke: (channel, ...args) => {
    const validChannels = ['dialog:show', 'provider:state'];
    if (validChannels.includes(channel)) return ipcRenderer.invoke(channel, ...args);
    return Promise.reject(new Error(`Canal no permitido: ${channel}`));
  }
});

function injectStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = clipboardStyles;
  document.head.appendChild(styleElement);
}

/**
 * CSP-safe copy-code fix: capture-phase click delegation from the isolated world.
 */
function installCopyDelegate() {
  document.addEventListener(
    'click',
    (event) => {
      const button = findCopyButtonFromEventTarget(event.target);
      if (!button) return;

      const text = getCodeTextFromButton(button);
      if (!text) return;

      event.preventDefault();
      event.stopPropagation();

      const ok = handleClipboardCopy(text);
      if (ok) {
        button.classList.add('copied');
        setTimeout(() => button.classList.remove('copied'), 1200);
      }
    },
    true
  );
}

/**
 * Fallback for "copy" events in code blocks when clipboardData is empty.
 */
function installCopyFallback() {
  document.addEventListener('copy', (event) => {
    const target = event.target;
    if (!target || !target.closest) return;

    const isInCodeBlock =
      target.closest('pre, code') || target.closest('.relative') || target.closest('[class*="prose"]');

    if (isInCodeBlock && event.clipboardData && !event.clipboardData.getData('text')) {
      const selection = window.getSelection();
      const text = selection ? selection.toString() : '';
      if (text) {
        handleClipboardCopy(text);
        event.preventDefault();
      }
    }
  });
}

/**
 * scheduler.yield() (Chromium 115+) gives the browser thread priority over
 * React update batches during long streaming responses, keeping input snappy.
 */
function installInputPriorityBoost() {
  if (typeof scheduler === 'undefined' || typeof scheduler.yield !== 'function') return;

  const originalRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function (callback) {
    return originalRAF.call(window, async (...args) => {
      await scheduler.yield();
      callback(...args);
    });
  };
}

window.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  installCopyDelegate();
  installCopyFallback();
  installInputPriorityBoost();
});
