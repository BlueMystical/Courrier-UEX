// src/main/services/itemCacheService.js
//
// Cache manager for UEX items catalogue.
// Fetching is done in the RENDERER (to bypass API protection) and sent here via IPC.
// This service manages cache state, disk persistence, and renderer sync notifications.
//
// Flow:
//   1. main.js calls startBackgroundSync(win) after did-finish-load
//   2. On startup, tries to load cache from disk — if fresh (<24h), uses it directly
//   3. If stale/missing, emits 'items-cache:request-sync' to the renderer
//   4. Renderer fetches categories + items, calls window.api.invoke('uex:cacheItems', data)
//   5. main.js IPC handler calls receiveSyncData(data) here
//   6. ocrService reads uexCache.get('items') as usual

'use strict'

const path = require('path')
const fs   = require('fs')
const { app } = require('electron')
const uexCache = require('../helpers/uexCache')

const CACHE_KEY_ITEMS      = 'items'
const CACHE_KEY_CATEGORIES = 'item_categories'
const CACHE_KEY_LAST_SYNC  = 'items_last_sync'
const TTL_MS               = 24 * 60 * 60 * 1000

// Disk cache file — stored alongside settings.json in userData
function getDiskCachePath() {
  return path.join(app.getPath('userData'), 'items-cache.json')
}

function loadFromDisk() {
  try {
    const filePath = getDiskCachePath()
    if (!fs.existsSync(filePath)) {
      console.log('[ItemCache] 💾 No disk cache found')
      return null
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    if (!data || !data.savedAt || !Array.isArray(data.items)) {
      console.log('[ItemCache] 💾 Disk cache invalid — ignoring')
      return null
    }
    console.log(`[ItemCache] 💾 Disk cache loaded: ${data.items.length} items, savedAt: ${new Date(data.savedAt).toISOString()}`)
    return data
  } catch (e) {
    console.warn('[ItemCache] ⚠️  Failed to load disk cache:', e.message)
    return null
  }
}

function saveToDisk(categories, items) {
  try {
    const filePath = getDiskCachePath()
    const data = { savedAt: Date.now(), categories: categories || [], items: items || [] }
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
    console.log(`[ItemCache] 💾 Saved to disk: ${items?.length} items → ${filePath}`)
  } catch (e) {
    console.warn('[ItemCache] ⚠️  Failed to save disk cache:', e.message)
  }
}

let _win       = null
let _syncTimer = null

const _state = {
  state:    'idle',
  progress: 0,
  total:    0,
  done:     0,
  cached:   0,
  lastSync: null,
  error:    null
}

function emit(event, data) {
  try {
    if (_win && !_win.isDestroyed()) _win.webContents.send(event, data)
  } catch (_) {}
}

function isCacheFresh() {
  const lastSync = uexCache.get(CACHE_KEY_LAST_SYNC)
  if (!lastSync) return false
  return (Date.now() - lastSync) < TTL_MS
}

// Called by main.js IPC handler when renderer delivers fetched data.
function receiveSyncData({ categories, items }) {
  console.log(`[ItemCache] ✅ Received from renderer: ${categories?.length} categories, ${items?.length} items`)
  uexCache.set(CACHE_KEY_CATEGORIES, categories || [])
  uexCache.set(CACHE_KEY_ITEMS, items || [])
  uexCache.set(CACHE_KEY_LAST_SYNC, Date.now())
  saveToDisk(categories, items)
  _state.state    = 'done'
  _state.cached   = items?.length ?? 0
  _state.lastSync = Date.now()
  _state.progress = 100
  _state.error    = null
  emit('items-cache:sync-complete', { total: _state.cached, errors: 0, lastSync: _state.lastSync })
}

// Called by main.js IPC handler when renderer reports a sync error.
function receiveSyncError(errorMsg) {
  console.error(`[ItemCache] ❌ Renderer sync failed: ${errorMsg}`)
  _state.state = 'error'
  _state.error = errorMsg
  emit('items-cache:sync-error', { error: errorMsg })
}

// Tells the renderer to start fetching.
function requestSync() {
  console.log('[ItemCache] 📡 Requesting renderer to fetch items...')
  _state.state    = 'syncing'
  _state.progress = 0
  _state.error    = null
  emit('items-cache:request-sync', {})
}

function startBackgroundSync(win, delayMs = 8000) {
  _win = win

  // 1. Try in-memory cache first (fastest path — same session)
  if (isCacheFresh()) {
    const items = uexCache.get(CACHE_KEY_ITEMS) || []
    _state.state    = 'done'
    _state.cached   = items.length
    _state.lastSync = uexCache.get(CACHE_KEY_LAST_SYNC)
    _state.progress = 100
    console.log(`[ItemCache] ✅ In-memory cache fresh (${items.length} items) — skipping sync`)
    setTimeout(() => emit('items-cache:sync-complete', {
      total: items.length, errors: 0, lastSync: _state.lastSync, fromCache: true
    }), 500)
    scheduleAutoRefresh()
    return
  }

  // 2. Try loading from disk (persists across app restarts)
  const disk = loadFromDisk()
  if (disk && disk.savedAt && (Date.now() - disk.savedAt) < TTL_MS) {
    console.log(`[ItemCache] ✅ Disk cache fresh (${disk.items.length} items, age: ${Math.round((Date.now()-disk.savedAt)/60000)}min) — loading into memory`)
    uexCache.set(CACHE_KEY_CATEGORIES, disk.categories || [])
    uexCache.set(CACHE_KEY_ITEMS, disk.items || [])
    uexCache.set(CACHE_KEY_LAST_SYNC, disk.savedAt)
    _state.state    = 'done'
    _state.cached   = disk.items.length
    _state.lastSync = disk.savedAt
    _state.progress = 100
    setTimeout(() => emit('items-cache:sync-complete', {
      total: disk.items.length, errors: 0, lastSync: disk.savedAt, fromCache: true
    }), 500)
    scheduleAutoRefresh()
    return
  }

  // 3. Cache stale or missing — fetch from API via renderer
  console.log(`[ItemCache] 🕐 Initial sync scheduled in ${delayMs / 1000}s...`)
  setTimeout(() => requestSync(), delayMs)
  scheduleAutoRefresh()
}

function scheduleAutoRefresh() {
  if (_syncTimer) clearInterval(_syncTimer)
  _syncTimer = setInterval(() => {
    console.log('[ItemCache] ⏰ 24h auto-refresh triggered')
    requestSync()
  }, TTL_MS)
}

function forceSync()     { requestSync() }
function getItems()      { return uexCache.get(CACHE_KEY_ITEMS)      || [] }
function getCategories() { return uexCache.get(CACHE_KEY_CATEGORIES) || [] }
function getStatus()     { return { ..._state } }
function destroy() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null }
  _win = null
}

module.exports = { startBackgroundSync, receiveSyncData, receiveSyncError, forceSync, getItems, getCategories, getStatus, destroy, isCacheFresh }