// Pure, Electron-independent URL navigation helpers.
// Extracted from index.js so they can be unit-tested without booting Electron.

function hostnameOf(targetUrl) {
  try {
    return new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function originOf(targetUrl) {
  try {
    return new URL(targetUrl).origin;
  } catch {
    return '';
  }
}

/**
 * Returns true if `hostname` is exactly `host` or a subdomain of it.
 */
function hostnameMatches(hostname, host) {
  const normalized = String(host).toLowerCase();
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

/**
 * Returns true if the URL's hostname matches any entry in `hosts`.
 * Each host entry may be a plain string (exact host or subdomain) or a RegExp
 * tested against the hostname.
 */
function matchesHostnames(targetUrl, hosts = []) {
  const hostname = hostnameOf(targetUrl);
  if (!hostname) return false;

  return hosts.some((host) => {
    if (host instanceof RegExp) return host.test(hostname);
    return hostnameMatches(hostname, host);
  });
}

/**
 * Loose rule match used for login-domain allowlists.
 * Falls back to substring matching for non-hostname rules.
 */
function matchesAllowed(url, rules = []) {
  const hostname = hostnameOf(url);
  if (!hostname) return false;

  return rules.some((rule) => {
    if (rule instanceof RegExp) return rule.test(hostname);
    const value = String(rule).toLowerCase();
    return hostname === value || hostname.endsWith(`.${value}`) || hostname.includes(value);
  });
}

/**
 * Google hosts that the Gemini flow must keep inside the embedded app:
 * consent, accounts, myaccount, and the general google.com umbrella.
 */
const GEMINI_INTERNAL_HOSTS = [
  'gemini.google.com',
  'accounts.google.com',
  'consent.google.com',
  'ogs.google.com',
  'myaccount.google.com',
  'www.google.com',
  'google.com'
];

function isGeminiInternalUrl(url, activeAppId = 'gemini') {
  if (activeAppId !== 'gemini') return false;
  return matchesHostnames(url, GEMINI_INTERNAL_HOSTS);
}

/**
 * Hosts that indicate a Claude auth popup (Google / Microsoft / Apple SSO).
 */
const CLAUDE_AUTH_HOSTS = ['accounts.google.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com'];

function isClaudeAuthPopup(url, activeAppId = 'claude') {
  if (activeAppId !== 'claude') return false;

  if (matchesHostnames(url, CLAUDE_AUTH_HOSTS)) return true;

  const lowerUrl = String(url).toLowerCase();
  return ['oauth', 'signin', 'login', 'auth'].some((fragment) => lowerUrl.includes(fragment));
}

/**
 * Decides whether a popup/navigation URL belongs to the active app's base origin.
 */
function isBaseAppUrl(url, activeAppUrl) {
  return originOf(url) === originOf(activeAppUrl);
}

module.exports = {
  hostnameOf,
  originOf,
  hostnameMatches,
  matchesHostnames,
  matchesAllowed,
  isGeminiInternalUrl,
  isClaudeAuthPopup,
  isBaseAppUrl,
  GEMINI_INTERNAL_HOSTS,
  CLAUDE_AUTH_HOSTS
};
