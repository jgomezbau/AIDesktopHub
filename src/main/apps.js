const DEFAULT_APP_ID = 'AIDesktopHub';

const APPS = Object.freeze({
  AIDesktopHub: {
    id: 'AIDesktopHub',
    name: 'AI Desktop Hub',
    title: 'AI Desktop Hub',
    url: 'https://chatgpt.com/',
    icon: 'providers/aidesktophub.png',
    loginDomains: [
      /(^|\.)chatgpt\.com$/i,
      /(^|\.)openai\.com$/i,
      /(^|\.)accounts\.google\.com$/i,
      /(^|\.)login\.microsoftonline\.com$/i,
      /(^|\.)login\.live\.com$/i,
      /(^|\.)appleid\.apple\.com$/i
    ]
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    title: 'ChatGPT',
    url: 'https://chatgpt.com/',
    icon: 'providers/chatgpt.png',
    loginDomains: [
      /(^|\.)chatgpt\.com$/i,
      /(^|\.)openai\.com$/i,
      /(^|\.)accounts\.google\.com$/i,
      /(^|\.)login\.microsoftonline\.com$/i,
      /(^|\.)login\.live\.com$/i,
      /(^|\.)appleid\.apple\.com$/i
    ]
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    title: 'Claude',
    url: 'https://claude.ai/new',
    icon: 'providers/claude.png',
    loginDomains: [
      /(^|\.)claude\.ai$/i,
      /(^|\.)anthropic\.com$/i,
      /(^|\.)claudeusercontent\.com$/i,
      /(^|\.)claudemcpclient\.com$/i,
      /(^|\.)intercom\.com$/i,
      /(^|\.)intercomcdn\.com$/i,
      /(^|\.)accounts\.google\.com$/i,
      /(^|\.)login\.microsoftonline\.com$/i,
      /(^|\.)login\.live\.com$/i,
      /(^|\.)appleid\.apple\.com$/i,
      /(^|\.)googleapis\.com$/i,
      /(^|\.)gstatic\.com$/i
    ]
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    title: 'Gemini',
    url: 'https://gemini.google.com/app',
    icon: 'providers/gemini.png',
    loginDomains: [
      /(^|\.)gemini\.google\.com$/i,
      /(^|\.)google\.com$/i,
      /(^|\.)googleapis\.com$/i,
      /(^|\.)gstatic\.com$/i,
      /(^|\.)googleusercontent\.com$/i,
      /(^|\.)accounts\.google\.com$/i
    ]
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    title: 'Grok',
    url: 'https://grok.com/',
    icon: 'providers/grok.png',
    loginDomains: [
      /(^|\.)grok\.com$/i,
      /(^|\.)x\.com$/i,
      /(^|\.)twitter\.com$/i,
      /(^|\.)accounts\.google\.com$/i,
      /(^|\.)appleid\.apple\.com$/i
    ]
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    title: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    icon: 'providers/deepseek.png',
    loginDomains: [
      /(^|\.)deepseek\.com$/i,
      /(^|\.)accounts\.google\.com$/i,
      /(^|\.)login\.live\.com$/i,
      /(^|\.)appleid\.apple\.com$/i
    ]
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen',
    title: 'Qwen',
    url: 'https://chat.qwen.ai/',
    icon: 'providers/qwen.png',
    loginDomains: [
      /(^|\.)qwen\.ai$/i,
      /(^|\.)tongyi\.com$/i,
      /(^|\.)aliyun\.com$/i,
      /(^|\.)accounts\.google\.com$/i,
      /(^|\.)login\.live\.com$/i,
      /(^|\.)appleid\.apple\.com$/i
    ]
  },
  zai: {
    id: 'zai',
    name: 'Z.ai',
    title: 'Z.ai',
    url: 'https://chat.z.ai/',
    icon: 'providers/zai.png',
    loginDomains: [
      /(^|\.)z\.ai$/i,
      /(^|\.)chat\.z\.ai$/i,
      /(^|\.)chatglm\.cn$/i,
      /(^|\.)zhipuai\.cn$/i,
      /(^|\.)accounts\.google\.com$/i,
      /(^|\.)login\.microsoftonline\.com$/i,
      /(^|\.)login\.live\.com$/i,
      /(^|\.)appleid\.apple\.com$/i
    ]
  }
});

function resolveAppId(input) {
  const normalized = String(input || '')
    .trim()
    .toLowerCase();
  return Object.keys(APPS).find((appId) => appId.toLowerCase() === normalized) || null;
}

function parseArgs(argv) {
  const result = {
    appId: DEFAULT_APP_ID,
    forceDevtools: false,
    explicitApp: false
  };

  for (const arg of argv.slice(1)) {
    const normalizedArg = String(arg).trim().toLowerCase();

    if (arg.startsWith('--app=')) {
      const resolvedAppId = resolveAppId(arg.slice('--app='.length));
      if (resolvedAppId) {
        result.appId = resolvedAppId;
        result.explicitApp = true;
      }
      continue;
    }

    if (normalizedArg === '--app') {
      continue;
    }

    if (normalizedArg.startsWith('start:')) {
      const resolvedAppId = resolveAppId(normalizedArg.slice('start:'.length));
      if (resolvedAppId) {
        result.appId = resolvedAppId;
        result.explicitApp = true;
        continue;
      }
    }

    const resolvedAppId = resolveAppId(normalizedArg);
    if (resolvedAppId) {
      result.appId = resolvedAppId;
      result.explicitApp = true;
      continue;
    }

    if (arg === '--devtools') {
      result.forceDevtools = true;
    }
  }

  if (!APPS[result.appId]) {
    result.appId = DEFAULT_APP_ID;
  }

  return result;
}

module.exports = {
  APPS,
  DEFAULT_APP_ID,
  resolveAppId,
  parseArgs
};
