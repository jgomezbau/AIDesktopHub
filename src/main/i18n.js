const DEFAULT_LOCALE = 'es';

const STRINGS = {
  es: {
    app: {
      menu: 'Aplicación',
      reload: 'Recargar',
      print: 'Imprimir',
      inspect: 'Inspeccionar',
      openDevTools: 'Abrir DevTools',
      clearCache: 'Limpiar caché de esta app'
    },
    edit: {
      menu: 'Edición',
      undo: 'Deshacer',
      redo: 'Rehacer',
      cut: 'Cortar',
      copy: 'Copiar',
      paste: 'Pegar',
      selectAll: 'Seleccionar todo'
    },
    tray: {
      showHide: 'Mostrar/Ocultar',
      quit: 'Salir'
    },
    windows: {
      selectorTitle: 'AI Desktop Hub',
      selectorHeading: 'Elegi un Asistente',
      selectorBody:
        'Elegí el asistente que quieras usar. Más adelante podrás cambiarlo desde el tray de AI Desktop Hub.',
      aboutTitle: 'Acerca de AI Desktop Hub'
    }
  }
};

const active = STRINGS[DEFAULT_LOCALE];

function t(key) {
  const parts = key.split('.');
  let node = active;
  for (const part of parts) {
    if (node && typeof node === 'object' && part in node) {
      node = node[part];
    } else {
      return key;
    }
  }
  return typeof node === 'string' ? node : key;
}

module.exports = { t, STRINGS, DEFAULT_LOCALE };
