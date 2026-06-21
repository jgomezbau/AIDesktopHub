'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  APPS,
  DEFAULT_APP_ID,
  parseArgs,
  resolveAppId
} = require('../src/main/apps');

test('resolveAppId resolves every registered provider case-insensitively', () => {
  for (const appId of Object.keys(APPS)) {
    assert.equal(resolveAppId(appId), appId);
    assert.equal(resolveAppId(appId.toUpperCase()), appId);
  }
});

test('resolveAppId rejects empty and unknown providers', () => {
  assert.equal(resolveAppId(), null);
  assert.equal(resolveAppId(''), null);
  assert.equal(resolveAppId('unknown-provider'), null);
});

test('parseArgs keeps the default application without an explicit provider', () => {
  assert.deepEqual(parseArgs(['electron', '.']), {
    appId: DEFAULT_APP_ID,
    forceDevtools: false,
    explicitApp: false
  });
});

test('parseArgs resolves --app providers and marks them as explicit', () => {
  const result = parseArgs(['electron', '.', '--app=zai']);

  assert.equal(result.appId, 'zai');
  assert.equal(result.explicitApp, true);
  assert.equal(result.forceDevtools, false);
});

test('parseArgs supports provider and npm start aliases', () => {
  assert.equal(parseArgs(['electron', 'qwen']).appId, 'qwen');
  assert.equal(parseArgs(['npm', 'start:deepseek']).appId, 'deepseek');
});

test('parseArgs ignores unknown providers and recognizes devtools', () => {
  const result = parseArgs(['electron', '.', '--app=unknown', '--devtools']);

  assert.equal(result.appId, DEFAULT_APP_ID);
  assert.equal(result.explicitApp, false);
  assert.equal(result.forceDevtools, true);
});

test('Z.ai has the expected isolated provider configuration', () => {
  assert.equal(APPS.zai.id, 'zai');
  assert.equal(APPS.zai.name, 'Z.ai');
  assert.equal(APPS.zai.url, 'https://chat.z.ai/');
  assert.equal(APPS.zai.icon, 'providers/zai.png');
});
