// src/main/helpers/settingsHelper.js

const { app } = require('electron')
const fs   = require('fs')
const path = require('path')
const { defaultShortcuts } = require('../../shared/shortcutsConfig.cjs')

const settingsFile = path.join(app.getPath('userData'), 'settings.json'); //<- %APPDATA%\SC-Courrier-UEX
console.log('Settings file path:', settingsFile);

const defaultSettings = {
  settings: {
    graphics: {
      renderer: 'opengl',
      gpuAcceleration: true
    },
    theme: {
      color: 'dark',
      preset: 'lara',
      primaryColor: 'blue',
      customColor: '#5e5e66'
    },
    paths: {
      userDocuments: app.getPath('documents'),
      securityLoginApi: 'https://api.uexcorp.uk/2.0/user/',
      userNotificationsApi: 'https://api.uexcorp.uk/2.0/user_notifications',
    },
    shortcuts: defaultShortcuts,
    // Tray defaults — both off by default
    tray: {
      minimizeToTray: false,
      startMinimized:  false,
    },
    security: {
      rememberMe: true,
      autoLogin: false,
      idleMinutesTimeout: 0,
      user: {
        id: -1,
        fullName: '',
        username: '',
        photo: '',
        role: '',
        token: '',
        funcionalidades: [],
        notifications: []
      }
    }
  }
}

function mergeAndCleanSettings(userSettings, defaults) {
  const merged = {}
  for (const key in defaults) {
    if (defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
      if (userSettings[key] && typeof userSettings[key] === 'object' && !Array.isArray(userSettings[key])) {
        merged[key] = mergeAndCleanSettings(userSettings[key], defaults[key])
      } else {
        merged[key] = JSON.parse(JSON.stringify(defaults[key]))
      }
    } else {
      merged[key] = key in userSettings ? userSettings[key] : defaults[key]
    }
  }
  return merged
}

function ensureSettingsFile() {
  try {
    let needsUpdate = false
    let currentSettings = {}

    if (fs.existsSync(settingsFile)) {
      try {
        const data = fs.readFileSync(settingsFile, 'utf-8')
        if (data && data.trim() !== '') {
          currentSettings = JSON.parse(data)
        } else {
          needsUpdate = true
        }
      } catch (parseErr) {
        console.error('Error parsing settings.json, recreating:', parseErr)
        needsUpdate = true
      }
    } else {
      needsUpdate = true
    }

    const mergedSettings = mergeAndCleanSettings(currentSettings, defaultSettings)

    if (needsUpdate || JSON.stringify(currentSettings) !== JSON.stringify(mergedSettings)) {
      saveSettings(mergedSettings)
      const added   = findAddedKeys(currentSettings, mergedSettings)
      const removed = findRemovedKeys(currentSettings, mergedSettings)
      if (added.length   > 0) console.log('Added keys:',   added)
      if (removed.length > 0) console.log('Removed keys:', removed)
    }
  } catch (err) {
    console.error('Error ensuring settings.json:', err)
    saveSettings(defaultSettings)
  }
}

function findAddedKeys(oldObj, newObj, prefix = '') {
  const added = []
  for (const key in newObj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (!(key in oldObj)) {
      added.push(fullKey)
    } else if (typeof newObj[key] === 'object' && !Array.isArray(newObj[key]) && newObj[key] !== null) {
      if (typeof oldObj[key] === 'object' && !Array.isArray(oldObj[key]) && oldObj[key] !== null) {
        added.push(...findAddedKeys(oldObj[key], newObj[key], fullKey))
      }
    }
  }
  return added
}

function findRemovedKeys(oldObj, newObj, prefix = '') {
  const removed = []
  for (const key in oldObj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (!(key in newObj)) {
      removed.push(fullKey)
    } else if (typeof oldObj[key] === 'object' && !Array.isArray(oldObj[key]) && oldObj[key] !== null) {
      if (typeof newObj[key] === 'object' && !Array.isArray(newObj[key]) && newObj[key] !== null) {
        removed.push(...findRemovedKeys(oldObj[key], newObj[key], fullKey))
      }
    }
  }
  return removed
}

function loadSettings() {
  ensureSettingsFile()
  try {
    const data = fs.readFileSync(settingsFile, 'utf-8')
    return JSON.parse(data)
  } catch (err) {
    console.error('Error reading settings.json:', err)
    return defaultSettings
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving settings.json:', err);
    return false;
  }
}

function getSetting(keyPath) {
  const settings = loadSettings()
  const keys = keyPath.split('/')
  return keys.reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), settings)
}

function setSetting(keyPath, value) {
  const settings = loadSettings();
  const keys = keyPath.split('/');
  let obj = settings;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  return saveSettings(settings);
}

function resetSettings() { return saveSettings(defaultSettings) }

module.exports = { loadSettings, saveSettings, getSetting, setSetting, resetSettings, settingsFile }
