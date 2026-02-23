// src/main/main.js

const { app, ipcMain, BrowserWindow, globalShortcut, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const packageJson = require('../../package.json')


// 1. Identity configuration
const appName = packageJson.productName || 'SC-Courrier-UEX';
app.name = appName;

if (process.env.VITE_DEV_SERVER_URL) {
  const userDataPath = path.join(app.getPath('appData'), appName);
  app.setPath('userData', userDataPath);
}

// 2. Own modules
const windowManager  = require('./windowManager')
const settingsHelper = require('./helpers/settingsHelper')
const FileHelper = require('./helpers/FileHelper')
const { routeMap }   = require('../shared/shortcutsConfig.cjs')
const { session }    = require('electron')

// --- SYSTEM TRAY ---
let tray = null

function getTrayIconPath() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(__dirname, '../../resources/LogoCutcsa.ico')
  } else if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources/LogoCutcsa.ico')
  } else {
    return path.join(__dirname, '../../resources/LogoCutcsa.ico')
  }
}

function createTray() {
  if (tray) return // already created

  const icon = nativeImage.createFromPath(getTrayIconPath())
  tray = new Tray(icon)
  tray.setToolTip(appName)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        const win = windowManager.getWindow('main')
        if (win) { win.show(); win.focus() }
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // Double-click on tray icon → show window
  tray.on('double-click', () => {
    const win = windowManager.getWindow('main')
    if (win) { win.show(); win.focus() }
  })
}

function destroyTray() {
  if (tray) { tray.destroy(); tray = null }
}

// --- SHORTCUTS ---
function registerShortcuts() {
  globalShortcut.unregisterAll()

  const shortcuts = settingsHelper.getSetting('settings/shortcuts') || {}

  Object.entries(shortcuts).forEach(([key, shortcut]) => {
    if (!shortcut || !routeMap[key]) return

    const registered = globalShortcut.register(shortcut, () => {
      const mainWin = windowManager.getWindow('main')
      if (!mainWin) return
      if (mainWin.isMinimized()) mainWin.restore()
      if (!mainWin.isVisible()) mainWin.show()
      mainWin.focus()
      mainWin.webContents.send('navigate-to', routeMap[key])
    })

    if (!registered) {
      console.warn(`⚠️ Shortcut "${shortcut}" for "${key}" could not be registered (system conflict)`)
    }
  })
}

// 3. App lifecycle
app.whenReady().then(() => {
  console.log('🚀 App ready...')

  // Spoof request headers for UEX/RSI CDNs — Cloudflare blocks requests with localhost Referer or Electron User-Agent
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.uexcorp.space/*', 'https://*.uexcorp.uk/*', 'https://*.robertsspaceindustries.com/*', 'https://robertsspaceindustries.com/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders }
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      headers['Referer']    = 'https://uexcorp.space/'
      headers['Origin']     = 'https://uexcorp.space'
      delete headers['sec-fetch-site']
      delete headers['sec-fetch-mode']
      delete headers['sec-fetch-dest']
      delete headers['sec-fetch-storage-access']
      delete headers['sec-ch-ua']
      delete headers['sec-ch-ua-mobile']
      delete headers['sec-ch-ua-platform']
      callback({ requestHeaders: headers })
    }
  )

  const startMinimized = settingsHelper.getSetting('settings/tray/startMinimized') ?? false
  const minimizeToTray = settingsHelper.getSetting('settings/tray/minimizeToTray') ?? false

  // Create tray if any tray option is enabled
  if (startMinimized || minimizeToTray) createTray()

  const win = windowManager.createWindow('main', '/', { width: 961, height: 650 })

  // Hook close event to intercept if minimizeToTray is on
  win.on('close', (event) => {
    const shouldMinimize = settingsHelper.getSetting('settings/tray/minimizeToTray') ?? false
    if (shouldMinimize && !app.isQuitting) {
      event.preventDefault()
      win.hide()
      createTray() // ensure tray exists
    }
  })

  // Hide window on startup if startMinimized is on
  if (startMinimized) {
    win.once('ready-to-show', () => {
      win.hide() // override the show() in windowManager
    })
  }

  registerShortcuts()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  destroyTray()
})

app.on('window-all-closed', () => {
  const minimizeToTray = settingsHelper.getSetting('settings/tray/minimizeToTray') ?? false
  // On non-mac, only quit if not using tray
  if (process.platform !== 'darwin' && !minimizeToTray) app.quit()
})

app.on('activate', () => {
  if (!windowManager.getWindow('main')) {
    windowManager.createWindow('main', '/', { width: 961, height: 650 })
  }
})

// 4. IPC
ipcMain.on('open-window', (event, { route, options }) => {
  windowManager.createWindow(route, route, options)
})

ipcMain.on('navigate-main', (event, route) => {
  const mainWin = windowManager.getWindow('main')
  if (mainWin) {
    if (process.env.VITE_DEV_SERVER_URL) {
      mainWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${route}`)
    } else {
      mainWin.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), { hash: route })
    }
  }
})

ipcMain.handle('shortcuts:get', () => settingsHelper.getSetting('settings/shortcuts'))

ipcMain.handle('shortcuts:update', (event, shortcuts) => {
  settingsHelper.setSetting('settings/shortcuts', shortcuts)
  registerShortcuts()
  return { success: true }
})

ipcMain.handle('settings:get', (event, keyPath) => settingsHelper.getSetting(keyPath))

ipcMain.handle('settings:set', (event, { keyPath, value }) => {
  settingsHelper.setSetting(keyPath, value)

  // When tray settings change, update tray state immediately
  if (keyPath.startsWith('settings/tray/')) {
    const minimizeToTray = settingsHelper.getSetting('settings/tray/minimizeToTray') ?? false
    const startMinimized  = settingsHelper.getSetting('settings/tray/startMinimized')  ?? false
    if (minimizeToTray || startMinimized) createTray()
    else destroyTray()
  }

  console.log(`📡 Broadcasting settings change: ${keyPath} = ${value}`)
  BrowserWindow.getAllWindows().forEach(win => {
    if (win && !win.isDestroyed()) win.webContents.send('settings-updated', { keyPath, value })
  })

  return true
})

ipcMain.handle('get-version', () => app.getVersion())