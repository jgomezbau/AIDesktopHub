'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
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
} = require('../src/main/navigation');

test('hostnameOf returns the lowercased hostname for valid URLs', () => {
  assert.equal(hostnameOf('https://ChatGPT.com/path?q=1'), 'chatgpt.com');
  assert.equal(hostnameOf('https://sub.example.org/'), 'sub.example.org');
});

test('hostnameOf returns empty string for invalid input', () => {
  assert.equal(hostnameOf('not a url'), '');
  assert.equal(hostnameOf(''), '');
  assert.equal(hostnameOf(null), '');
  assert.equal(hostnameOf(undefined), '');
});

test('originOf returns the canonical origin', () => {
  assert.equal(originOf('https://chatgpt.com/'), 'https://chatgpt.com');
  assert.equal(originOf('https://example.org/x#frag'), 'https://example.org');
  assert.equal(originOf('garbage'), '');
});

test('hostnameMatches matches exact host and subdomains but not unrelated hosts', () => {
  assert.equal(hostnameMatches('chatgpt.com', 'chatgpt.com'), true);
  assert.equal(hostnameMatches('chat.openai.com', 'openai.com'), true);
  assert.equal(hostnameMatches('chatgpt.com', 'openai.com'), false);
  // Avoids the classic suffix-only false positive.
  assert.equal(hostnameMatches('evilnotchatgpt.com', 'chatgpt.com'), false);
});

test('matchesHostnames supports strings and RegExp rules', () => {
  assert.equal(matchesHostnames('https://x.com/', ['x.com']), true);
  assert.equal(matchesHostnames('https://sub.x.com/', ['x.com']), true);
  assert.equal(matchesHostnames('https://evilnotx.com/', ['x.com']), false);
  assert.equal(matchesHostnames('https://claude.ai/', [/(^|\.)claude\.ai$/i]), true);
});

test('matchesHostnames rejects malformed URLs and empty rule sets', () => {
  assert.equal(matchesHostnames('garbage', ['x.com']), false);
  assert.equal(matchesHostnames('https://x.com/', []), false);
});

test('matchesAllowed supports RegExp, exact, subdomain, and substring rules', () => {
  assert.equal(matchesAllowed('https://claude.ai/', [/(^|\.)claude\.ai$/i]), true);
  assert.equal(matchesAllowed('https://accounts.google.com/', ['accounts.google.com']), true);
  assert.equal(matchesAllowed('https://accounts.google.com/', ['google.com']), true);
  assert.equal(matchesAllowed('https://random-site.com/', ['google.com']), false);
});

test('isGeminiInternalUrl is true only for gemini and known Google hosts', () => {
  assert.equal(isGeminiInternalUrl('https://gemini.google.com/app'), true);
  assert.equal(isGeminiInternalUrl('https://accounts.google.com/signin'), true);
  assert.equal(isGeminiInternalUrl('https://consent.google.com/'), true);
  // Should NOT match for a non-gemini provider.
  assert.equal(isGeminiInternalUrl('https://accounts.google.com/', 'chatgpt'), false);
  // Should NOT match unrelated hosts even when provider is gemini.
  assert.equal(isGeminiInternalUrl('https://evil.com/'), false);
});

test('GEMINI_INTERNAL_HOSTS covers the documented set', () => {
  const expected = [
    'gemini.google.com',
    'accounts.google.com',
    'consent.google.com',
    'ogs.google.com',
    'myaccount.google.com',
    'www.google.com',
    'google.com'
  ];
  assert.deepEqual([...GEMINI_INTERNAL_HOSTS].sort(), [...expected].sort());
});

test('isClaudeAuthPopup matches SSO hosts only for claude', () => {
  assert.equal(isClaudeAuthPopup('https://accounts.google.com/oauth', 'claude'), true);
  assert.equal(isClaudeAuthPopup('https://login.microsoftonline.com/', 'claude'), true);
  assert.equal(isClaudeAuthPopup('https://appleid.apple.com/', 'claude'), true);
  // Fragments in the path/query also count for claude.
  assert.equal(isClaudeAuthPopup('https://example.com/signin', 'claude'), true);
  assert.equal(isClaudeAuthPopup('https://example.com/auth/callback', 'claude'), true);
  // Other providers never trigger the claude popup path.
  assert.equal(isClaudeAuthPopup('https://accounts.google.com/', 'chatgpt'), false);
});

test('CLAUDE_AUTH_HOSTS covers Google, Microsoft, and Apple SSO', () => {
  const expected = ['accounts.google.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com'];
  assert.deepEqual([...CLAUDE_AUTH_HOSTS].sort(), [...expected].sort());
});

test('isBaseAppUrl compares origins only', () => {
  assert.equal(isBaseAppUrl('https://chatgpt.com/c/abc', 'https://chatgpt.com/'), true);
  assert.equal(isBaseAppUrl('https://chatgpt.com/', 'https://chatgpt.com/'), true);
  assert.equal(isBaseAppUrl('https://openai.com/', 'https://chatgpt.com/'), false);
  assert.equal(isBaseAppUrl('garbage', 'https://chatgpt.com/'), false);
});
