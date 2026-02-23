// src/main/helpers/PathHelper.js

const { app, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const os = require('os');

/** Devuelve rutas útiles del sistema y de la app. */
function getAppPaths() {
  return {
    appDir: app.getAppPath(),                // Carpeta donde está instalada la app
    userData: app.getPath('userData'),       // Carpeta de datos/config de usuario
    temp: app.getPath('temp'),               // Carpeta temporal del sistema
    desktop: app.getPath('desktop'),         // Escritorio del usuario
    documents: app.getPath('documents'),     // Documentos del usuario
    downloads: app.getPath('downloads'),     // Descargas del usuario
    home: app.getPath('home'),               // Carpeta home del usuario
    exe: app.getPath('exe'),                 // Ruta al ejecutable de la app
    logs: app.getPath('logs'),               // Carpeta de logs
    cache: app.getPath('cache'),             // Carpeta de caché    
    resources: path.join(process.resourcesPath), 
    localAppData: getLocalAppDataPath()
  };
}

/** Returns a single path value from getAppPaths() by key. */
function getPath(name) {
  const paths = getAppPaths();
  return paths[name] || null;
}

/** Returns the System folder to install the App. %LOCALAPPDATA% */
function getLocalAppDataPath() {
  switch (process.platform) {
    case 'win32':
      return path.join(os.homedir(), 'AppData', 'Local');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support');
    case 'linux':
      return path.join(os.homedir(), '.local', 'share');
    default:
      throw new Error('Unsupported operating system');
  }
}

/** Resolves environment variables in a given path string. */
function resolveEnvVariables(inputPath) {
  try {
    if (typeof inputPath !== 'string') {
      console.warn("Input path must be a string. Returning original input:", inputPath);
      return inputPath;
    }

    let resolvedPath = inputPath;

    const envVars = {
      '%USERPROFILE%': os.homedir(),
      '%APPDATA%': app.getPath('userData'),
      '%LOCALAPPDATA%': getLocalAppDataPath(),
      '%PROGRAMFILES%': process.env.PROGRAMFILES || process.env['ProgramFiles'],
      '%PROGRAMFILES(X86)%': process.env['PROGRAMFILES(X86)'] || process.env['ProgramFiles(x86)'],
      '%PROGRAMDATA%': process.env.PROGRAMDATA,
      '%APPDIR%': app.getAppPath(),
      '$HOME': os.homedir(),
      '~': os.homedir(),
      '%TEMP%': process.env.TEMP || process.env.TMP,
      '$TMPDIR': process.platform === 'win32' ? (process.env.TEMP || process.env.TMP) : (process.env.TMPDIR || '/tmp'),
      '$XDG_CONFIG_HOME': process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
      '$XDG_DATA_HOME': process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    };

    resolvedPath = inputPath.replace(/(~|\$[A-Z_]+|%[^%]+%)/g, (match) => {
      return envVars[match] || match;
    });

    const isWindows = process.platform === 'win32';
    resolvedPath = isWindows
      ? resolvedPath.replace(/\//g, '\\') 
      : resolvedPath.replace(/\\/g, '/'); 

    return path.normalize(resolvedPath);

  } catch (error) {
    throw new Error(error.message + '\n' + error.stack);
  }
}

function getParentFolder(givenPath) {
  return path.dirname(givenPath);
}

// #region Assets Handling

function getAssetPath(assetPath) {
  try {
    if (process.env.NODE_ENV === 'development') {
      if (assetPath.startsWith('public')) {
        return path.join(__dirname, '../../', assetPath); 
      } else {
        return path.join(__dirname, '../../src', assetPath); 
      }
    } else {
      return path.join(process.resourcesPath, assetPath); 
    }
  } catch (error) {
    throw new Error(error.message + error.stack);
  }
}

function getAssetUrl(assetPath) {
  try {
    const resolvedPath = getAssetPath(assetPath);
    return url.pathToFileURL(resolvedPath).toString();
  } catch (error) {
    throw new Error(error.message + error.stack);
  }
}

// #endregion

// #region IPC Handlers

ipcMain.handle('paths:getAll', () => {
  return getAppPaths();
});

ipcMain.handle('paths:get', (event, name) => {
  return getPath(name);
});

ipcMain.handle('paths:join', (event, ...segments) => {
  return path.join(...segments);
});

ipcMain.handle('paths:getBaseName', (event, filePath, extension) => {
  return path.basename(filePath, extension);
});

ipcMain.handle('paths:resolveEnv', (event, inputPath) => {
  return resolveEnvVariables(inputPath);
});

ipcMain.handle('paths:getParent', (event, givenPath) => {
  return getParentFolder(givenPath);
});

ipcMain.handle('paths:getAssetPath', (event, assetPath) => {
  return getAssetPath(assetPath);
});

ipcMain.handle('paths:getAssetUrl', (event, assetPath) => {
  return getAssetUrl(assetPath);
});

// #endregion

module.exports = {
  getAppPaths,
  getPath,
  resolveEnvVariables,
  getParentFolder,
  getAssetPath,
  getAssetUrl
};