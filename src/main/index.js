const { app, BrowserWindow, Menu, session, shell, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { APPS, DEFAULT_APP_ID, parseArgs } = require('./apps');
const { setupIPC } = require('./ipc');
const { applyRuntimeFlags } = require('./runtime-flags');

const cli = parseArgs(process.argv);
const projectRoot = path.resolve(__dirname, '..', '..');
const iconsRoot = path.join(projectRoot, 'assets', 'icons');
const SELECTOR_PROTOCOL = 'aidesktophub-select://';
const brandingAppConfig = cli.explicitApp ? APPS[cli.appId] : APPS[DEFAULT_APP_ID];
const genericSettingsDir = path.join(app.getPath('appData'), 'AIDesktopHub');
const genericSettingsFile = path.join(genericSettingsDir, 'config.json');
const NO_PARAM_MODE = !cli.explicitApp;

let activeAppConfig = cli.explicitApp ? APPS[cli.appId] : null;
let isSwitchingProvider = false;
let initialSelectorRequired = false;
let isClosingSelectorForLaunch = false;
const assistantMenuIconCache = new Map();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveIconPath(iconName) {
  const candidates = [
    path.join(iconsRoot, iconName),
    path.join(iconsRoot, 'aidesktophub.png')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
}

function createTrayIcon(iconName) {
  const iconPath = resolveIconPath(iconName);
  let image = nativeImage.createFromPath(iconPath);

  if (image.isEmpty()) {
    image = nativeImage.createFromPath(path.join(iconsRoot, 'aidesktophub.png'));
  }

  if (image.isEmpty()) {
    return image;
  }

  if (process.platform === 'linux') {
    return image.resize({
      width: 22,
      height: 22,
      quality: 'best'
    });
  }

  return image;
}

function getAssistantMenuIcon(iconName) {
  if (assistantMenuIconCache.has(iconName)) {
    return assistantMenuIconCache.get(iconName);
  }

  const iconPath = resolveIconPath(iconName);
  let image = nativeImage.createFromPath(iconPath);

  if (image.isEmpty()) {
    image = nativeImage.createFromPath(resolveIconPath('providers/aidesktophub.png'));
  }

  if (!image.isEmpty()) {
    image = image.resize({
      width: 16,
      height: 16,
      quality: 'best'
    });
  }

  assistantMenuIconCache.set(iconName, image);
  return image;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function profileLockPort(profileId) {
  return 41000 + (hashString(`AIDesktopHub:${profileId}`) % 2000);
}

function getActiveAppConfig() {
  return activeAppConfig || brandingAppConfig;
}

function getPartitionName() {
  return `persist:AIDesktopHub:${getActiveAppConfig().id}`;
}

function getUserDataPath() {
  return path.join(app.getPath('appData'), 'AIDesktopHub', getActiveAppConfig().id);
}

function setActiveApp(appId) {
  activeAppConfig = APPS[appId];
  ensureDir(getUserDataPath());
  app.setPath('userData', getUserDataPath());
}

function getSupportedProviders() {
  return Object.values(APPS).filter(({ id }) => id !== DEFAULT_APP_ID);
}

function isSupportedProvider(appId) {
  return getSupportedProviders().some((provider) => provider.id === appId);
}

function loadLastProviderForGenericMode() {
  const config = readJsonFile(genericSettingsFile);
  const providerId = config?.lastProviderId;
  return isSupportedProvider(providerId) ? providerId : null;
}

function persistLastProviderForGenericMode(appId) {
  if (!NO_PARAM_MODE || !isSupportedProvider(appId)) return;

  const current = readJsonFile(genericSettingsFile) || {};
  writeJsonFile(genericSettingsFile, {
    ...current,
    lastProviderId: appId
  });
}

function getProviderState() {
  return {
    enabled: NO_PARAM_MODE && !!activeAppConfig,
    currentProviderId: activeAppConfig?.id || null,
    providers: getSupportedProviders().map((provider) => {
      const iconPath = resolveIconPath(provider.icon);
      const iconBuffer = fs.readFileSync(iconPath);
      return {
        id: provider.id,
        name: provider.name,
        iconDataUrl: `data:image/png;base64,${iconBuffer.toString('base64')}`
      };
    })
  };
}

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

function matchesAllowed(url, rules) {
  const hostname = hostnameOf(url);
  if (!hostname) return false;

  return rules.some((rule) => {
    if (rule instanceof RegExp) return rule.test(hostname);
    const value = String(rule).toLowerCase();
    return hostname === value || hostname.endsWith(`.${value}`) || hostname.includes(value);
  });
}

function isBaseAppUrl(url) {
  return originOf(url) === originOf(getActiveAppConfig().url);
}

function isGeminiInternalUrl(url) {
  if (getActiveAppConfig().id !== 'gemini') return false;

  const hostname = hostnameOf(url);
  if (!hostname) return false;

  return (
    hostname === 'gemini.google.com' ||
    hostname.endsWith('.gemini.google.com') ||
    hostname === 'accounts.google.com' ||
    hostname.endsWith('.accounts.google.com') ||
    hostname === 'consent.google.com' ||
    hostname.endsWith('.consent.google.com') ||
    hostname === 'ogs.google.com' ||
    hostname.endsWith('.ogs.google.com') ||
    hostname === 'myaccount.google.com' ||
    hostname.endsWith('.myaccount.google.com') ||
    hostname === 'www.google.com' ||
    hostname.endsWith('.www.google.com') ||
    hostname === 'google.com' ||
    hostname.endsWith('.google.com')
  );
}

const desktopBaseName = brandingAppConfig.id === DEFAULT_APP_ID
  ? 'AIDesktopHub'
  : `AIDesktopHub-${brandingAppConfig.id}`;
app.setName(desktopBaseName);
app.setDesktopName(`${desktopBaseName}.desktop`);
ensureDir(getUserDataPath());
app.setPath('userData', getUserDataPath());
applyRuntimeFlags(app);

let mainWindow = null;
let loginWindow = null;
let selectorWindow = null;
let aboutWindow = null;
let tray = null;
let lockServer = null;
let isQuitting = false;

function focusMainWindow() {
  if (selectorWindow && !selectorWindow.isDestroyed() && selectorWindow.isVisible()) {
    selectorWindow.focus();
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function sendFocusToExistingInstance() {
  const client = net.createConnection({ host: '127.0.0.1', port: profileLockPort(brandingAppConfig.id) }, () => {
    client.write('focus');
    client.end();
    app.quit();
  });

  client.on('error', () => {
    app.quit();
  });
}

function acquireProfileLock() {
  lockServer = net.createServer((socket) => {
    socket.on('data', () => {
      focusMainWindow();
    });
  });

  lockServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      sendFocusToExistingInstance();
      return;
    }

    console.error(`Profile lock error for ${brandingAppConfig.id}:`, error);
    app.quit();
  });

  lockServer.listen(profileLockPort(brandingAppConfig.id), '127.0.0.1');
}

function getSession() {
  return session.fromPartition(getPartitionName());
}

function buildContextMenu(params) {
  return Menu.buildFromTemplate([
    { label: 'Cortar', role: 'cut', enabled: params.isEditable && params.editFlags.canCut },
    { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy || !!params.selectionText?.trim() },
    { label: 'Pegar', role: 'paste', enabled: params.isEditable && params.editFlags.canPaste },
    { label: 'Seleccionar todo', role: 'selectAll', enabled: params.editFlags.canSelectAll },
    { type: 'separator' },
    { label: 'Recargar', click: () => mainWindow?.reload() },
    { label: 'Imprimir', click: () => mainWindow?.webContents.print() },
    {
      label: 'Inspeccionar',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.inspectElement(params.x, params.y);
      }
    }
  ]);
}

function buildAppMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Aplicación',
      submenu: [
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { label: 'Abrir DevTools', accelerator: 'CmdOrCtrl+Shift+D', click: () => mainWindow?.webContents.openDevTools() },
        {
          label: 'Limpiar caché de esta app',
          click: async () => {
            const ses = getSession();
            await ses.clearCache();
            await ses.clearStorageData();
            mainWindow?.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Salir',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', role: 'undo' },
        { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' }
      ]
    }
  ]);
}

function buildAboutHtml() {
  const iconPath = resolveIconPath('providers/aidesktophub.png');
  const iconDataUrl = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
  const activeAssistant = activeAppConfig?.name || 'Selector de asistentes';
  const supportedAssistants = getSupportedProviders().map(({ name }) => name).join(' · ');

  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';">
      <title>Acerca de AI Desktop Hub</title>
      <style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #e7edf7;
          background:
            radial-gradient(circle at 15% 0%, rgba(50, 125, 255, 0.28), transparent 38%),
            radial-gradient(circle at 100% 90%, rgba(122, 82, 255, 0.22), transparent 36%),
            linear-gradient(145deg, #0a1020, #10182a 55%, #0b1220);
        }
        .card {
          width: min(100%, 620px);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          background: rgba(15, 23, 42, 0.82);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
          backdrop-filter: blur(18px);
        }
        .hero {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 28px 30px 22px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .logo {
          width: 78px;
          height: 78px;
          flex: none;
          object-fit: contain;
          filter: drop-shadow(0 10px 20px rgba(30, 100, 255, 0.28));
        }
        h1 { margin: 0 0 5px; font-size: 27px; letter-spacing: -0.03em; }
        .version { color: #8eb6ff; font-size: 14px; font-weight: 700; }
        .tagline { margin: 7px 0 0; color: #aab6ca; font-size: 14px; line-height: 1.45; }
        .content { padding: 22px 30px 26px; }
        .status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          padding: 12px 15px;
          border-radius: 14px;
          background: rgba(72, 119, 255, 0.1);
          border: 1px solid rgba(107, 148, 255, 0.17);
        }
        .status-label { color: #9eabc0; font-size: 12px; }
        .status-value { color: #dce7ff; font-size: 13px; font-weight: 700; text-align: right; }
        .versions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .item {
          padding: 12px 14px;
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.065);
        }
        .item span { display: block; color: #8f9bb0; font-size: 11px; margin-bottom: 4px; }
        .item strong { font-size: 14px; font-weight: 650; }
        .assistants { margin: 20px 0 0; color: #8f9bb0; font-size: 12px; line-height: 1.6; }
        .assistants strong { color: #cdd7e8; }
        .footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          color: #7f8ba0;
          font-size: 12px;
        }
        a {
          padding: 9px 13px;
          border-radius: 11px;
          color: #dce8ff;
          text-decoration: none;
          font-weight: 700;
          background: linear-gradient(135deg, #315fc7, #6747c7);
          box-shadow: 0 8px 22px rgba(50, 85, 190, 0.25);
        }
        a:hover { filter: brightness(1.12); }
        @media (max-width: 520px) {
          body { padding: 12px; }
          .hero, .content { padding-left: 20px; padding-right: 20px; }
          .versions { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <main class="card">
        <header class="hero">
          <img class="logo" src="${iconDataUrl}" alt="AI Desktop Hub">
          <div>
            <h1>AI Desktop Hub</h1>
            <div class="version">Versión ${app.getVersion()}</div>
            <p class="tagline">Tus asistentes de IA favoritos, integrados en un escritorio Linux con sesiones independientes.</p>
          </div>
        </header>
        <section class="content">
          <div class="status">
            <span class="status-label">Asistente activo</span>
            <span class="status-value">${activeAssistant}</span>
          </div>
          <div class="versions">
            <div class="item"><span>Electron</span><strong>${process.versions.electron}</strong></div>
            <div class="item"><span>Chromium</span><strong>${process.versions.chrome}</strong></div>
            <div class="item"><span>Node.js</span><strong>${process.versions.node}</strong></div>
            <div class="item"><span>V8</span><strong>${process.versions.v8}</strong></div>
            <div class="item"><span>Plataforma</span><strong>${process.platform} · ${process.arch}</strong></div>
            <div class="item"><span>Licencia</span><strong>MIT</strong></div>
          </div>
          <p class="assistants"><strong>Asistentes soportados:</strong><br>${supportedAssistants}</p>
          <footer class="footer">
            <span>Proyecto independiente y no oficial.</span>
            <a href="https://github.com/jgomezbau/AIDesktopHub" target="_blank" rel="noreferrer">Ver proyecto</a>
          </footer>
        </section>
      </main>
    </body>
  </html>`;
}

function showAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildAboutHtml())}`);
    aboutWindow.show();
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 680,
    height: 650,
    minWidth: 520,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: 'Acerca de AI Desktop Hub',
    icon: resolveIconPath('providers/aidesktophub.png'),
    backgroundColor: '#0a1020',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false
    }
  });

  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  aboutWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape') {
      aboutWindow?.close();
    }
  });

  aboutWindow.once('ready-to-show', () => {
    aboutWindow?.show();
    aboutWindow?.focus();
  });

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });

  aboutWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildAboutHtml())}`);
}

function createTray() {
  if (tray) return;

  const icon = createTrayIcon(brandingAppConfig.icon);
  tray = new Tray(icon);

  function buildAssistantsSubmenu() {
    if (!NO_PARAM_MODE) {
      return [];
    }

    const currentAssistantId = getActiveAppConfig().id;

    return getSupportedProviders().map((provider) => ({
        label: provider.name,
        type: 'radio',
        checked: provider.id === currentAssistantId,
        icon: getAssistantMenuIcon(provider.icon),
        click: () => {
          if (provider.id !== currentAssistantId) {
            switchProviderInMainWindow(provider.id);
          }
        }
      }));
  }

  function refreshTrayMenu() {
    tray.setContextMenu(Menu.buildFromTemplate([
      ...(NO_PARAM_MODE
          ? [
            {
              label: 'Elegi un Asistente',
              submenu: buildAssistantsSubmenu()
            },
            { type: 'separator' }
          ]
        : []),
      {
        label: `Mostrar/Ocultar ${brandingAppConfig.name}`,
        click: () => {
          if (selectorWindow && !selectorWindow.isDestroyed() && selectorWindow.isVisible()) {
            selectorWindow.isVisible() ? selectorWindow.hide() : selectorWindow.show();
            selectorWindow.focus();
            return;
          }

          if (!mainWindow || mainWindow.isDestroyed()) return;
          mainWindow.isVisible() ? mainWindow.hide() : focusMainWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Acerca de AI Desktop Hub',
        click: showAboutWindow
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]));
  }

  tray.setToolTip(brandingAppConfig.name);
  refreshTrayMenu();

  tray.on('click', () => {
    if (selectorWindow && !selectorWindow.isDestroyed() && selectorWindow.isVisible()) {
      selectorWindow.isVisible() ? selectorWindow.hide() : selectorWindow.show();
      selectorWindow.focus();
      return;
    }

    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.isVisible() ? mainWindow.hide() : focusMainWindow();
  });

  tray.refreshMenu = refreshTrayMenu;
}

function createLoginWindow(targetUrl) {
  const appConfig = getActiveAppConfig();
  const partitionName = getPartitionName();

  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.loadURL(targetUrl);
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 520,
    height: 760,
    parent: mainWindow,
    modal: true,
    show: true,
    autoHideMenuBar: true,
    title: `${appConfig.title} - Login`,
    icon: resolveIconPath(appConfig.icon),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      sandbox: false,
      webSecurity: true,
      spellcheck: false,
      partition: partitionName
    }
  });

  loginWindow.loadURL(targetUrl);

  loginWindow.webContents.on('will-redirect', (_event, nextUrl) => {
    if (isBaseAppUrl(nextUrl)) {
      mainWindow?.loadURL(nextUrl);
      loginWindow?.close();
    }
  });

  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isBaseAppUrl(url) || matchesAllowed(url, appConfig.loginDomains)) {
      createLoginWindow(url);
    } else {
      shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

function shouldStayInsideApp(url) {
  return isBaseAppUrl(url) || isGeminiInternalUrl(url);
}

function isClaudeAuthPopup(url) {
  if (getActiveAppConfig().id !== 'claude') return false;

  const lowerUrl = String(url).toLowerCase();
  const hostname = hostnameOf(url);

  return (
    hostname.includes('accounts.google.com') ||
    hostname.includes('login.microsoftonline.com') ||
    hostname.includes('login.live.com') ||
    hostname.includes('appleid.apple.com') ||
    lowerUrl.includes('oauth') ||
    lowerUrl.includes('signin') ||
    lowerUrl.includes('login') ||
    lowerUrl.includes('auth')
  );
}

function shouldUseLoginWindow(url) {
  if (isClaudeAuthPopup(url)) {
    return false;
  }

  if (getActiveAppConfig().id === 'gemini') {
    return false;
  }

  return matchesAllowed(url, getActiveAppConfig().loginDomains) && !isBaseAppUrl(url);
}

function buildProviderSelectorHtml() {
  const providers = getSupportedProviders();
  const cards = providers.map((provider) => {
    const iconPath = resolveIconPath(provider.icon);
    const iconBuffer = fs.readFileSync(iconPath);
    const iconUrl = `data:image/png;base64,${iconBuffer.toString('base64')}`;
    return `
      <a class="provider-card" href="${SELECTOR_PROTOCOL}${provider.id}">
        <img src="${iconUrl}" alt="${provider.name}" class="provider-icon">
        <span class="provider-name">${provider.name}</span>
      </a>
    `;
  }).join('');

  return `<!DOCTYPE html>
  <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AI Desktop Hub</title>
      <style>
        :root {
          color-scheme: light;
          font-family: "Noto Sans", "Segoe UI", sans-serif;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at top, rgba(34, 197, 94, 0.18), transparent 36%),
            linear-gradient(145deg, #f6f7fb 0%, #eef2f7 50%, #e8edf4 100%);
          color: #162032;
        }
        .panel {
          width: min(560px, calc(100vw - 32px));
          padding: 28px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18);
          border: 1px solid rgba(148, 163, 184, 0.22);
        }
        h1 {
          margin: 0 0 8px;
          font-size: 28px;
          text-align: center;
        }
        p {
          margin: 0 0 22px;
          line-height: 1.5;
          color: #475569;
          text-align: center;
        }
        .providers {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .provider-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 16px;
          text-decoration: none;
          color: inherit;
          background: #f8fafc;
          border: 1px solid #dbe3ef;
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .provider-card:hover {
          transform: translateY(-1px);
          border-color: #94a3b8;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
        }
        .provider-icon {
          width: 36px;
          height: 36px;
          object-fit: contain;
          flex: none;
        }
        .provider-name {
          font-size: 16px;
          font-weight: 600;
        }
        @media (max-width: 540px) {
          .providers { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <main class="panel">
        <h1>Elegi un Asistente</h1>
        <p>Elegí el asistente que quieras usar. Más adelante podrás cambiarlo desde el tray de AI Desktop Hub.</p>
        <section class="providers">
          ${cards}
        </section>
      </main>
    </body>
  </html>`;
}

function createSelectorWindow() {
  if (selectorWindow && !selectorWindow.isDestroyed()) {
    selectorWindow.show();
    selectorWindow.focus();
    return;
  }

  selectorWindow = new BrowserWindow({
    width: 560,
    height: 420,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    autoHideMenuBar: true,
    title: brandingAppConfig.title,
    icon: resolveIconPath(brandingAppConfig.icon),
    backgroundColor: '#eef2f7',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  selectorWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildProviderSelectorHtml())}`);

  selectorWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.toLowerCase().startsWith(SELECTOR_PROTOCOL)) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const appId = url.slice(SELECTOR_PROTOCOL.length).trim().toLowerCase();
    if (!APPS[appId] || appId === DEFAULT_APP_ID.toLowerCase()) {
      return;
    }

    selectorWindow.hide();
    openSelectedProvider(appId);
  });

  selectorWindow.once('ready-to-show', () => {
    selectorWindow.show();
    selectorWindow.focus();
  });

  selectorWindow.on('closed', () => {
    selectorWindow = null;
    if (!mainWindow && !isQuitting && !isClosingSelectorForLaunch) {
      app.quit();
    }
  });
}

function openSelectedProvider(appId) {
  if (!isSupportedProvider(appId)) {
    return;
  }

  persistLastProviderForGenericMode(appId);
  setActiveApp(appId);
  tray?.refreshMenu?.();

  if (selectorWindow && !selectorWindow.isDestroyed()) {
    isClosingSelectorForLaunch = true;
    selectorWindow.close();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(getActiveAppConfig().url);
    focusMainWindow();
    isClosingSelectorForLaunch = false;
    return;
  }

  createWindow();
  isClosingSelectorForLaunch = false;
}

function switchProviderInMainWindow(appId) {
  if (!NO_PARAM_MODE || !isSupportedProvider(appId) || activeAppConfig?.id === appId) {
    return { success: false, error: 'Invalid or unchanged provider.' };
  }

  persistLastProviderForGenericMode(appId);

  const previousWindow = mainWindow;
  const windowState = previousWindow && !previousWindow.isDestroyed()
    ? {
        bounds: previousWindow.getBounds(),
        isMaximized: previousWindow.isMaximized()
      }
    : null;

  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.destroy();
    loginWindow = null;
  }

  setActiveApp(appId);
  tray?.refreshMenu?.();

  if (!previousWindow || previousWindow.isDestroyed()) {
    createWindow(windowState);
    return { success: true };
  }

  isSwitchingProvider = true;
  previousWindow.destroy();
  createWindow(windowState);
  isSwitchingProvider = false;

  return { success: true };
}

function createWindow(windowState = null) {
  const appConfig = getActiveAppConfig();
  const partitionName = getPartitionName();
  const useGenericBranding = NO_PARAM_MODE;
  const windowRef = new BrowserWindow({
    width: windowState?.bounds?.width || 1280,
    height: windowState?.bounds?.height || 900,
    x: windowState?.bounds?.x,
    y: windowState?.bounds?.y,
    show: false,
    autoHideMenuBar: true,
    title: useGenericBranding ? `AI Desktop Hub - ${appConfig.name}` : appConfig.title,
    icon: resolveIconPath(useGenericBranding ? brandingAppConfig.icon : appConfig.icon),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(projectRoot, 'src', 'preload', 'preload.js'),
      devTools: true,
      spellcheck: false,
      backgroundThrottling: false,
      enableWebSQL: false,
      enableRemoteModule: false,
      sandbox: false,
      webSecurity: true,
      partition: partitionName
    }
  });

  mainWindow = windowRef;

  const ses = getSession();

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowedPermissions = new Set([
      'media',
      'clipboard-read',
      'clipboard-sanitized-write'
    ]);
    callback(allowedPermissions.has(permission));
  });

  windowRef.webContents.setWindowOpenHandler(({ url, features }) => {
    if (shouldStayInsideApp(url)) {
      setTimeout(() => {
        if (windowRef && !windowRef.isDestroyed()) {
          windowRef.loadURL(url);
        }
      }, 0);

      return { action: 'deny' };
    }

    if (isClaudeAuthPopup(url)) {
      let width = 520;
      let height = 760;

      if (features) {
        const parts = features.split(',');
        for (const part of parts) {
          const [key, value] = part.trim().split('=');
          if (key === 'width' && !Number.isNaN(Number(value))) {
            width = Math.max(Number(value), 420);
          }
          if (key === 'height' && !Number.isNaN(Number(value))) {
            height = Math.max(Number(value), 640);
          }
        }
      }

      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width,
          height,
          title: `${appConfig.title} - Login`,
          show: true,
          autoHideMenuBar: true,
          icon: resolveIconPath(appConfig.icon),
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: true,
            sandbox: false,
            webSecurity: true,
            spellcheck: false,
            partition: partitionName
          }
        }
      };
    }

    if (shouldUseLoginWindow(url)) {
      createLoginWindow(url);
      return { action: 'deny' };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  windowRef.webContents.on('will-navigate', (event, url) => {
    if (shouldStayInsideApp(url)) {
      return;
    }

    if (isClaudeAuthPopup(url)) {
      return;
    }

    if (shouldUseLoginWindow(url)) {
      event.preventDefault();
      createLoginWindow(url);
      return;
    }

    // Allow file URLs so drag-and-drop keeps working in the embedded web app.
    if (url.startsWith('file://')) {
      return;
    }

    event.preventDefault();
    shell.openExternal(url);
  });

  windowRef.webContents.on('context-menu', (_event, params) => {
    buildContextMenu(params).popup();
  });

  windowRef.on('close', (event) => {
    if (isSwitchingProvider) {
      return;
    }

    if (process.platform !== 'darwin' && !isQuitting) {
      event.preventDefault();
      windowRef.hide();
    }
  });

  windowRef.on('closed', () => {
    if (mainWindow === windowRef) {
      mainWindow = null;
    }

    if (!cli.explicitApp && selectorWindow && !selectorWindow.isDestroyed()) {
      selectorWindow.show();
      selectorWindow.focus();
    }
  });

  windowRef.once('ready-to-show', () => {
    if (windowState?.isMaximized) {
      windowRef.maximize();
    }

    windowRef.show();

    if (process.env.FORCE_DEVTOOLS === '1' || cli.forceDevtools) {
      windowRef.webContents.openDevTools({ mode: 'right' });
    }
  });

  windowRef.loadURL(appConfig.url);
}

if (NO_PARAM_MODE) {
  const savedProviderId = loadLastProviderForGenericMode();
  if (savedProviderId) {
    setActiveApp(savedProviderId);
  } else {
    initialSelectorRequired = true;
  }
}

setupIPC();
acquireProfileLock();

app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  if (process.env.NODE_ENV === 'development') {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

app.whenReady().then(() => {
  createTray();
  if (cli.explicitApp) {
    createWindow();
  } else if (initialSelectorRequired) {
    createSelectorWindow();
  } else {
    createWindow();
  }
  Menu.setApplicationMenu(buildAppMenu());
});

app.on('activate', () => {
  if (mainWindow === null && !cli.explicitApp && initialSelectorRequired && !activeAppConfig) {
    createSelectorWindow();
  } else if (mainWindow === null) {
    createWindow();
  } else {
    focusMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (isQuitting) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;

  if (tray) {
    tray.destroy();
  }

  if (lockServer) {
    try {
      lockServer.close();
    } catch {}
  }
});
