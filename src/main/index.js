const { app, BrowserWindow, Menu, session, shell, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { APPS, DEFAULT_APP_ID, parseArgs } = require('./apps');
const { setupIPC } = require('./ipc');
const { applyRuntimeFlags } = require('./runtime-flags');
const navigation = require('./navigation');
const { renderTemplate } = require('./templates');
const { t } = require('./i18n');

const cli = parseArgs(process.argv);
const projectRoot = path.resolve(__dirname, '..', '..');
const iconsRoot = path.join(projectRoot, 'assets', 'icons');
const SELECTOR_PROTOCOL = 'aidesktophub-select://';
const brandingAppConfig = cli.explicitApp ? APPS[cli.appId] : APPS[DEFAULT_APP_ID];
const genericSettingsDir = path.join(app.getPath('appData'), 'AIDesktopHub');
const genericSettingsFile = path.join(genericSettingsDir, 'config.json');
const NO_PARAM_MODE = !cli.explicitApp;

/* DevTools are disabled in production builds unless explicitly requested via
 * `--devtools` or FORCE_DEVTOOLS=1. This keeps them out of shipped binaries. */
const DEV_TOOLS_ENABLED = cli.forceDevtools || process.env.FORCE_DEVTOOLS === '1';

/* ─────────────────── Deterministic single-instance lock ports ────────────────
 * Fixed port per provider avoids hash collisions between different providers
 * that the previous hash-modulo approach could produce.
 */
const PROFILE_LOCK_PORTS = {
  AIDesktopHub: 41000,
  chatgpt: 41001,
  claude: 41002,
  gemini: 41003,
  grok: 41004,
  deepseek: 41005,
  qwen: 41006,
  zai: 41007
};

let activeAppConfig = cli.explicitApp ? APPS[cli.appId] : null;
let isSwitchingProvider = false;
let initialSelectorRequired = false;
let isClosingSelectorForLaunch = false;
const assistantMenuIconCache = new Map();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveIconPath(iconName) {
  const candidates = [path.join(iconsRoot, iconName), path.join(iconsRoot, 'aidesktophub.png')];

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

function profileLockPort(profileId) {
  return PROFILE_LOCK_PORTS[profileId] || PROFILE_LOCK_PORTS.AIDesktopHub;
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

const providerIconDataUrlCache = new Map();

function getProviderState() {
  return {
    enabled: NO_PARAM_MODE && !!activeAppConfig,
    currentProviderId: activeAppConfig?.id || null,
    providers: getSupportedProviders().map((provider) => {
      let iconDataUrl = providerIconDataUrlCache.get(provider.id);
      if (!iconDataUrl) {
        const iconPath = resolveIconPath(provider.icon);
        const iconBuffer = fs.readFileSync(iconPath);
        iconDataUrl = `data:image/png;base64,${iconBuffer.toString('base64')}`;
        providerIconDataUrlCache.set(provider.id, iconDataUrl);
      }
      return {
        id: provider.id,
        name: provider.name,
        iconDataUrl
      };
    })
  };
}

const { matchesAllowed } = navigation;

function isBaseAppUrl(url) {
  return navigation.isBaseAppUrl(url, getActiveAppConfig().url);
}

function isGeminiInternalUrl(url) {
  return navigation.isGeminiInternalUrl(url, getActiveAppConfig().id);
}

const desktopBaseName =
  brandingAppConfig.id === DEFAULT_APP_ID ? 'AIDesktopHub' : `AIDesktopHub-${brandingAppConfig.id}`;
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
    { label: t('edit.cut'), role: 'cut', enabled: params.isEditable && params.editFlags.canCut },
    { label: t('edit.copy'), role: 'copy', enabled: params.editFlags.canCopy || !!params.selectionText?.trim() },
    { label: t('edit.paste'), role: 'paste', enabled: params.isEditable && params.editFlags.canPaste },
    { label: t('edit.selectAll'), role: 'selectAll', enabled: params.editFlags.canSelectAll },
    { type: 'separator' },
    { label: t('app.reload'), click: () => mainWindow?.reload() },
    { label: t('app.print'), click: () => mainWindow?.webContents.print() },
    {
      label: t('app.inspect'),
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.inspectElement(params.x, params.y);
      }
    }
  ]);
}

function buildAppMenu() {
  const appSubmenu = [
    { label: t('app.reload'), accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
    ...(DEV_TOOLS_ENABLED
      ? [
          {
            label: t('app.openDevTools'),
            accelerator: 'CmdOrCtrl+Shift+D',
            click: () => mainWindow?.webContents.openDevTools()
          }
        ]
      : []),
    {
      label: t('app.clearCache'),
      click: async () => {
        const ses = getSession();
        await ses.clearCache();
        await ses.clearStorageData();
        mainWindow?.reload();
      }
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];

  return Menu.buildFromTemplate([
    { label: t('app.menu'), submenu: appSubmenu },
    {
      label: t('edit.menu'),
      submenu: [
        { label: t('edit.undo'), role: 'undo' },
        { label: t('edit.redo'), role: 'redo' },
        { type: 'separator' },
        { label: t('edit.cut'), role: 'cut' },
        { label: t('edit.copy'), role: 'copy' },
        { label: t('edit.paste'), role: 'paste' },
        { label: t('edit.selectAll'), role: 'selectAll' }
      ]
    }
  ]);
}

function buildAboutHtml() {
  const iconPath = resolveIconPath('providers/aidesktophub.png');
  const iconDataUrl = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
  const activeAssistant = activeAppConfig?.name || 'Selector de asistentes';
  const supportedAssistants = getSupportedProviders()
    .map(({ name }) => name)
    .join(' · ');

  return renderTemplate(
    'about.html',
    {
      iconDataUrl,
      appVersion: app.getVersion(),
      activeAssistant,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      v8Version: process.versions.v8,
      platform: `${process.platform} · ${process.arch}`,
      supportedAssistants
    },
    ['iconDataUrl', 'supportedAssistants']
  );
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
    title: t('windows.aboutTitle'),
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

/**
 * Toggles visibility of the selector window if it's showing, otherwise the main
 * window. Shared by the tray click handler and the "Mostrar/Ocultar" menu entry.
 */
function toggleVisibleWindow() {
  if (selectorWindow && !selectorWindow.isDestroyed() && selectorWindow.isVisible()) {
    selectorWindow.hide();
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.isVisible() ? mainWindow.hide() : focusMainWindow();
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
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...(NO_PARAM_MODE
          ? [
              {
                label: t('windows.selectorHeading'),
                submenu: buildAssistantsSubmenu()
              },
              { type: 'separator' }
            ]
          : []),
        {
          label: `${t('tray.showHide')} ${brandingAppConfig.name}`,
          click: () => toggleVisibleWindow()
        },
        { type: 'separator' },
        {
          label: t('windows.aboutTitle'),
          click: showAboutWindow
        },
        { type: 'separator' },
        {
          label: t('tray.quit'),
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ])
    );
  }

  tray.setToolTip(brandingAppConfig.name);
  refreshTrayMenu();

  tray.on('click', () => toggleVisibleWindow());

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
      devTools: DEV_TOOLS_ENABLED,
      sandbox: true,
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
  return navigation.isClaudeAuthPopup(url, getActiveAppConfig().id);
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
  const cards = getSupportedProviders()
    .map((provider) => {
      const iconPath = resolveIconPath(provider.icon);
      const iconBuffer = fs.readFileSync(iconPath);
      const iconUrl = `data:image/png;base64,${iconBuffer.toString('base64')}`;
      return `
      <a class="provider-card" href="${SELECTOR_PROTOCOL}${provider.id}">
        <img src="${iconUrl}" alt="${provider.name}" class="provider-icon">
        <span class="provider-name">${provider.name}</span>
      </a>
    `;
    })
    .join('');

  return renderTemplate(
    'selector.html',
    {
      cards,
      title: t('windows.selectorTitle'),
      heading: t('windows.selectorHeading'),
      body: t('windows.selectorBody')
    },
    ['cards']
  );
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
      sandbox: true
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
  const windowState =
    previousWindow && !previousWindow.isDestroyed()
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
      devTools: DEV_TOOLS_ENABLED,
      spellcheck: false,
      backgroundThrottling: false,
      enableWebSQL: false,
      sandbox: true,
      webSecurity: true,
      partition: partitionName
    }
  });

  mainWindow = windowRef;

  const ses = getSession();

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowedPermissions = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write']);
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
            devTools: DEV_TOOLS_ENABLED,
            sandbox: true,
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

    if (DEV_TOOLS_ENABLED) {
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

setupIPC({ getProviderState });
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
