// src/shared/preload.js
const { contextBridge, ipcRenderer } = require('electron')

// Extraer la ruta inicial de la URL (del hash)
const getInitialRoute = () => {
  const hash = window.location.hash
  return hash.replace('#', '') || '/'
}

contextBridge.exposeInMainWorld('api', {
  getInitialRoute, // Exponer función para obtener ruta inicial

  Windows: {  //<- winodw.api.Windows..
    openWindow: (route, options) => ipcRenderer.send('open-window', { route, options }),
    navigateMain: (route) => ipcRenderer.send('navigate-main', route)
  },
  Settings: { //<- winodw.api.Settings..
    get: (keyPath) => ipcRenderer.invoke('settings:get', keyPath),
    set: (keyPath, value) => ipcRenderer.invoke('settings:set', { keyPath, value }),
    onSettingsChanged: (callback) => ipcRenderer.on('settings-updated', (_, data) => callback(data))
  },
  System: { //<- winodw.api.System..
    getVersion: () => ipcRenderer.invoke('get-version'),

    showOpenDialog: (options) => ipcRenderer.invoke('file:showOpenDialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('file:showSaveDialog', options),
    ShowMessageBox: (options) => ipcRenderer.invoke('ShowMessageBox', options),

    openUrlInBrowser: (url) => ipcRenderer.invoke('file:openUrlInBrowser', url),
    openPathInExplorer: (filePath) => ipcRenderer.invoke('file:openPathInExplorer', filePath),
    openFile: (filePath) => ipcRenderer.invoke('file:openFile', filePath),

    detectProgram: (exeName) => ipcRenderer.invoke('file:detectProgram', exeName),
    terminateProgram: (exeName, options) => ipcRenderer.invoke('file:terminateProgram', exeName, options),
    runScriptOrProgram: (filePath, args) => ipcRenderer.invoke('file:runScriptOrProgram', filePath, args),
  },
   Navigation: {
    onNavigateTo: (callback) => {
      ipcRenderer.on('navigate-to', (event, route) => callback(route))
    },
    offNavigateTo: () => {
      ipcRenderer.removeAllListeners('navigate-to')
    }
  },
   Shortcuts: {
    get: () => ipcRenderer.invoke('shortcuts:get'),
    update: (shortcuts) => ipcRenderer.invoke('shortcuts:update', shortcuts),
  },
  Paths: {
    getAll: () => ipcRenderer.invoke('paths:getAll'),
    get: (name) => ipcRenderer.invoke('paths:get', name),
    join: (...segments) => ipcRenderer.invoke('paths:join', ...segments),
    resolveEnv: (inputPath) => ipcRenderer.invoke('paths:resolveEnv', inputPath),

    /** Obtiene la carpeta padre de una ruta dada.
     * @param {string} givenPath - Ruta absoluta o relativa.
     * @returns {Promise<string>} Carpeta padre de la ruta.
     * @example
     * const parent = await window.api.paths.getParent('C:/foo/bar/file.txt');
     * // parent: 'C:/foo/bar'     */
    getParent: (givenPath) => ipcRenderer.invoke('paths:getParent', givenPath),

    /** Obtiene el nombre base de un archivo, con o sin extensión.
     * @param {string} filePath - Ruta completa al archivo.
     * @param {string} [extension] - Extensión a eliminar (opcional).
     * @returns {Promise<string>} Nombre base del archivo.
     * @example
     * const base = await window.api.paths.getBaseName('C:/foo/bar/file.txt');
     * // base: 'file.txt'
     * const baseNoExt = await window.api.paths.getBaseName('C:/foo/bar/file.txt', '.txt');
     * // baseNoExt: 'file'     */
    getBaseName: (filePath, extension) => ipcRenderer.invoke('paths:getBaseName', filePath, extension),

    getAssetPath: (assetPath) => ipcRenderer.invoke('paths:getAssetPath', assetPath),
    getAssetUrl: (assetPath) => ipcRenderer.invoke('paths:getAssetUrl', assetPath)
  },
  Files: {
    copy: (srcDir, destDir, ext) => ipcRenderer.invoke('file:copy', srcDir, destDir, ext),
    move: (srcDir, destDir, ext) => ipcRenderer.invoke('file:move', srcDir, destDir, ext),
    delete: (srcDir, ext) => ipcRenderer.invoke('file:delete', srcDir, ext),
    deleteDir: (dirPath) => ipcRenderer.invoke('file:deleteDir', dirPath),

    list: (dir, extFilter) => ipcRenderer.invoke('file:list', dir, extFilter),
    findFile: (folderPath, pattern) => ipcRenderer.invoke('file:findFile', folderPath, pattern),

    readJSON: (filePath) => ipcRenderer.invoke('file:readJSON', filePath),
    writeJSON: (filePath, obj) => ipcRenderer.invoke('file:writeJSON', filePath, obj),

    checkExists: (filePath) => ipcRenderer.invoke('file:checkExists', filePath),
    ensureDir: (dirPath) => ipcRenderer.invoke('file:ensureDir', dirPath),

    downloadAsset: (url, destination) => ipcRenderer.invoke('file:downloadAsset', url, destination),

    /** Descarga un archivo desde una URL y lo guarda en la ruta especificada.
     * Puedes escuchar el progreso de la descarga usando `onDownloadProgress`.
     *
     * @param {string} url - URL completa del archivo a descargar.
     * @param {string} filePath - Ruta local donde guardar el archivo descargado.
     * @returns {Promise<void>} - Promesa que se resuelve cuando la descarga finaliza.
     *
     * @example
     * // Inicia la descarga y escucha el progreso:
     * window.api.files.onDownloadProgress((event, data) => {
     *   // data.progress: porcentaje (0-100)
     *   // data.speed: velocidad en bytes/segundo
     *   console.log(`Progreso: ${data.progress}% - Velocidad: ${data.speed} B/s`);
     * });
     *
     * await window.api.files.downloadFile(
     *   'https://servidor.com/archivo.zip',
     *   'C:/descargas/archivo.zip'
     * );      */
    downloadFile: (url, filePath) => ipcRenderer.invoke('download-file', url, filePath),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
    removeDownloadProgress: (callback) => ipcRenderer.removeListener('download-progress', callback),

  },
})