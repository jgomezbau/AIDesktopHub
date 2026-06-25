const { ipcMain, dialog } = require('electron');

/**
 * Wires up all main-process IPC handlers.
 *
 * Clipboard access is handled entirely in the sandboxed preload via
 * electron.clipboard (exposed through contextBridge), so it does not need an
 * IPC round-trip. Only dialog and provider-state go through IPC.
 *
 * @param {object} deps
 * @param {() => object} deps.getProviderState Returns the current provider state
 *   (active provider id + list of providers with icons) for the renderer.
 */
function setupIPC({ getProviderState } = {}) {
  ipcMain.handle('dialog:show', async (_, options) => {
    try {
      const result = await dialog.showMessageBox(options);
      return result;
    } catch (error) {
      console.error('Error al mostrar diálogo:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('provider:state', async () => {
    try {
      return getProviderState ? getProviderState() : null;
    } catch (error) {
      console.error('Error al obtener el estado del provider:', error);
      return null;
    }
  });
}

module.exports = { setupIPC };
