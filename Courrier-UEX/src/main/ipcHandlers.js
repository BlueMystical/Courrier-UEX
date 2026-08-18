// src/main/ipcHandlers.js

// src/main/ipcHandlers.js

const { app, ipcMain, net, dialog, BrowserWindow, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const windowManager = require('./windowManager')
const uexService = require('./services/uexService')
const uexCache = require('./helpers/uexCache') // Cache local en main para terminales, commodities e items (memoria + disco opcional, se llena desde renderer)
const itemCacheService = require('./services/itemCacheService')
const gameVersionService = require('./services/gameVersionService') // Fuente de verdad del gate por versión del juego (terminals/vehicles)
const { processOCR } = require('./services/ocrService')
const settingsHelper = require('./helpers/settingsHelper')
const screenshotWatcher = require('./helpers/screenshotWatcher')


function registerIpcHandlers({ createTray, destroyTray, registerShortcuts, initScreenshotWatcher } = {}) {

    // #region --- Window Management ---

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

    // #endregion

    // #region --- UEX Cache & Sync ---

    ipcMain.handle('uex:getCache', async () => {
        return {
            terminals: uexCache.get('terminals') || [],
            stations: uexCache.get('stations') || [],
            commodities: uexCache.get('commodities') || [],
            items: uexCache.get('items') || [],
            star_systems: uexCache.get('star_systems') || []
        }
    })

    ipcMain.handle('uex:cacheTerminals', async (_, data) => {
        // persist=true: antes esto vivía SOLO en memoria y se perdía en cada
        // reinicio de la app. Como ahora el sync de terminals está gateado
        // por la versión del juego (puede pasar mucho tiempo sin re-sincronizar),
        // necesitamos que sobreviva a un reinicio o el usuario se queda sin
        // datos hasta el próximo cambio de versión.
        uexCache.set('terminals', data, 0, true)
        console.log('[UEX] ✅ Terminals cached from renderer', data?.data?.length ?? data, 'items')
        return true
    })

    // Star systems: mismo criterio que terminals — gateado por versión del
    // juego (no por TTL), así que persiste a disco para sobrevivir reinicios.
    ipcMain.handle('uex:cacheStarSystems', async (_, data) => {
        uexCache.set('star_systems', data, 0, true)
        console.log('[UEX] ✅ Star systems cached from renderer', data?.data?.length ?? 0, 'items')
        return true
    })

    // Catálogos gateados por versión del juego (terminals/vehicles/star_systems/
    // commodities): si alguno TODAVÍA no tiene datos en cache — típicamente una
    // instalación existente que ya tenía la versión persistida (changed=false
    // para siempre) al momento de agregar una key nueva a este gate — el
    // renderer necesita saberlo para hacer un backfill puntual de esa key,
    // sin esperar al próximo cambio de versión del juego.
    function emptyGatedKeys() {
        return ['terminals', 'vehicles', 'star_systems', 'commodities'].filter(key => {
            const value = uexCache.get(key)
            if (!value) return true
            if (Array.isArray(value)) return value.length === 0
            if (Array.isArray(value.data)) return value.data.length === 0
            return false
        })
    }

    // El renderer fetchea /game_versions (UEX bloquea llamadas desde main) y
    // reporta acá la versión actual. gameVersionService decide, de forma
    // centralizada y persistida a disco, si cambió respecto a la última vez
    // — el renderer usa la respuesta para decidir si sincroniza terminals/vehicles.
    ipcMain.handle('uex:reportGameVersion', (_, current) => {
        const result = gameVersionService.checkAndUpdate(current)
        return { ...result, missing: emptyGatedKeys() }
    })

    ipcMain.handle('uex:getTerminals', async () => {
        try {
            const terminals = uexCache.get('terminals') || [];
            return {
                success: true,
                terminals
            }

        } catch (err) {
            console.error('[uex:getTerminals] ERROR:', err)
            return {
                success: false,
                error: err.message
            }
        }
    })

    ipcMain.handle('uex:cacheCommodities', async (_, data) => {
        uexCache.set('commodities', data)
        console.log('[UEX] ✅ Commodities cached from renderer', data?.data?.length ?? 0, 'items')
        return true
    })

    // Renderer delivers fetched items catalogue → store in cache
    ipcMain.handle('uex:cacheItems', async (_, { categories, items, vehicles }) => {
        itemCacheService.receiveSyncData({ categories, items, vehicles })
        return true
    })

    // Renderer reports items fetch error
    ipcMain.handle('uex:cacheItemsError', async (_, errorMsg) => {
        itemCacheService.receiveSyncError(errorMsg)
        return true
    })

    ipcMain.handle('items:getAll', () => {
        return itemCacheService.getItems()
    })

    ipcMain.handle('items:getCategories', () => {
        return itemCacheService.getCategories()
    })

    // Vehículos: ya se cacheaban en main (gateados por versión del juego,
    // ver itemCacheService.getVehicles()) pero nunca se expusieron por IPC
    // — cualquier view que necesitara la lista terminaba haciendo fetch()
    // directo a /vehicles en cada montaje, salteándose el cache entero.
    ipcMain.handle('items:getVehicles', () => {
        return itemCacheService.getVehicles()
    })

    ipcMain.handle('items:getSyncStatus', () => {
        return itemCacheService.getStatus()
    })

    ipcMain.handle('items:isCacheFresh', () => {
        return itemCacheService.isCacheFresh()
    })

    ipcMain.handle('items:forceSync', () => {
        itemCacheService.forceSync()
        return itemCacheService.getStatus()
    })


    ipcMain.handle('uex:submitData', async (event, payload) => {
        return await uexService.submitData(payload)
    })

    ipcMain.handle('uex:checkToken', () => {
        return uexService.hasToken()
    })

    ipcMain.handle('uex:saveToken', async (event, token) => {
        settingsHelper.setSetting('settings/security/user/token', token)
        return true
    })

    // #endregion

    // #region --- Settings & Shortcuts ---

    ipcMain.handle('settings:get', (event, keyPath) => settingsHelper.getSetting(keyPath))

    ipcMain.handle('settings:set', (event, { keyPath, value }) => {
        settingsHelper.setSetting(keyPath, value)

        // When tray settings change, update tray state immediately
        if (keyPath.startsWith('settings/tray/')) {
            const minimizeToTray = settingsHelper.getSetting('settings/tray/minimizeToTray') ?? false
            const startMinimized = settingsHelper.getSetting('settings/tray/startMinimized') ?? false
            if (minimizeToTray || startMinimized) createTray()
            else destroyTray()
        }

        console.log(`📡 Broadcasting settings change: ${keyPath} = ${value}`)
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed()) win.webContents.send('settings-updated', { keyPath, value })
        })

        return true
    })

    ipcMain.handle('shortcuts:get', () => settingsHelper.getSetting('settings/shortcuts'))

    ipcMain.handle('shortcuts:update', (event, shortcuts) => {
        settingsHelper.setSetting('settings/shortcuts', shortcuts)
        registerShortcuts()
        return { success: true }
    })

    // #endregion

    // #region --- Screenshots & OCR ---

    // Renderer asks: what folder are we watching?
    ipcMain.handle('screenshots:get-folder', () => ({
        folder: screenshotWatcher.getWatchedFolder(),
        default: screenshotWatcher.getDefaultPath(),
    }))

    // Renderer asks: open a folder picker dialog and save the result
    ipcMain.handle('screenshots:pick-folder', async () => {
        const win = windowManager.getWindow('main')
        const result = await dialog.showOpenDialog(win, {
            title: 'Select Star Citizen Screenshots Folder',
            properties: ['openDirectory'],
            defaultPath: screenshotWatcher.getDefaultPath(),
        })

        if (result.canceled || !result.filePaths.length) return { canceled: true }

        const chosen = result.filePaths[0]
        settingsHelper.setSetting('settings/paths/screenshotsFolder', chosen)
        screenshotWatcher.startWatcher(chosen, win)
        return { canceled: false, path: chosen }
    })

    // Renderer asks: restart watcher (e.g. after settings change)
    ipcMain.handle('screenshots:restart-watcher', () => {
        const win = windowManager.getWindow('main')
        if (win) initScreenshotWatcher(win)
        return { folder: screenshotWatcher.getWatchedFolder() }
    })

    ipcMain.handle('ocr:process', async (_, payload) => {
        return await processOCR(payload)
    })

    // #endregion

    // #region --- System ---

    ipcMain.handle('get-version', () => app.getVersion())

    ipcMain.handle('file:writeTempImage', async (event, { base64, filename }) => {
        try {
            const tmpDir = app.getPath('temp')
            const ext = (filename ?? 'preview.jpg').split('.').pop().toLowerCase()
            const tmpPath = path.join(tmpDir, `uex-preview-${Date.now()}.${ext}`)
            fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'))
            shell.openPath(tmpPath)
            return tmpPath
        } catch (e) {
            console.error('[file:writeTempImage]', e)
            return null
        }
    })

    ipcMain.handle('paths:getResourcesPath', () => {
        if (app.isPackaged) {
            // En prod, los archivos están en resources/resources/ dentro del instalado
            return path.join(process.resourcesPath, 'resources')
        } else {
            return path.join(__dirname, '../../resources')
        }
    })

    // #endregion

    ipcMain.handle('uex:getNotifications', async () => {
        return await uexService.getUserNotifications()
    })

    ipcMain.handle('avatar:fetchAsBase64', async (event, url) => {
        return new Promise((resolve) => {
            const request = net.request(url)
            const chunks = []
            request.on('response', (response) => {
                response.on('data', (chunk) => chunks.push(chunk))
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks)
                    const mimeType = response.headers['content-type'] || 'image/jpeg'
                    resolve(`data:${mimeType};base64,${buffer.toString('base64')}`)
                })
            })
            request.on('error', () => resolve(null))
            request.end()
        })
    })
}

module.exports = { registerIpcHandlers }