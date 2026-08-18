// src/main/helpers/uexCache.js
//
// In-memory key-value cache with optional per-key TTL, and OPTIONAL disk
// persistence per key (opt-in via the `persist` flag on set()).
//
// Sin `persist`, el comportamiento es igual que antes: todo vive solo en
// memoria y se pierde al reiniciar la app. Con `persist: true`, el valor
// también se escribe a un JSON en userData y puede recuperarse en el
// próximo arranque con loadFromDisk(key), ANTES de que exista/expire nada
// en memoria — útil para keys como 'terminals' que antes no sobrevivían a
// un reinicio aunque el dato siguiera siendo válido (mismo patch del juego).
//
// API:
//   uexCache.set(key, value, ttlMs?, persist?) — store a value, opcionalmente con TTL y a disco
//   uexCache.get(key)                  — returns value or null (if expired/missing)
//   uexCache.loadFromDisk(key)         — carga a memoria lo persistido a disco (o null)
//   uexCache.isExpired(key)            — true if key is missing or TTL has elapsed
//   uexCache.getAge(key)               — ms since last set, or null
//   uexCache.delete(key)               — remove a key
//   uexCache.clear()                   — wipe everything
//   uexCache.keys()                    — list all non-expired keys

'use strict'

const path = require('path')
const fs = require('fs')
const { app } = require('electron')

function getDiskPath(key) {
  return path.join(app.getPath('userData'), `uex-cache-${key}.json`)
}

function writeDisk(key, value) {
  try {
    fs.writeFileSync(getDiskPath(key), JSON.stringify({ value, savedAt: Date.now() }))
  } catch (e) {
    console.warn(`[uexCache] ⚠️  No se pudo persistir "${key}" a disco:`, e.message)
  }
}

/**
 * Carga un valor persistido a disco DIRECTO a memoria (sin chequear TTL —
 * quien llama decide si el dato sigue siendo válido, p.ej. vía el gate de
 * versión del juego). Devuelve el valor cargado, o null si no hay nada.
 */
function loadFromDisk(key) {
  try {
    const filePath = getDiskPath(key)
    if (!fs.existsSync(filePath)) return null
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (!raw || raw.value === undefined) return null
    _store[key] = { value: raw.value, setAt: raw.savedAt || Date.now(), ttlMs: 0 }
    return raw.value
  } catch (e) {
    console.warn(`[uexCache] ⚠️  No se pudo cargar "${key}" desde disco:`, e.message)
    return null
  }
}

// Default TTLs for known keys (ms)
// Override by passing ttlMs to set()
const DEFAULT_TTLS = {
  terminals:       24 * 60 * 60 * 1000,   // 24 hours
  star_systems:    24 * 60 * 60 * 1000,   // 24 hours (gateado por versión del juego, ver uex:cacheStarSystems — set() lo llama con ttlMs=0, este default no aplica en la práctica)
  commodities:     24 * 60 * 60 * 1000,   // 24 hours
  items:           24 * 60 * 60 * 1000,   // 24 hours
  item_categories: 24 * 60 * 60 * 1000,   // 24 hours
  stations:        24 * 60 * 60 * 1000,   // 24 hours
  vehicles:        48 * 60 * 60 * 1000,   // 48 hours (vehicle data is mostly static, but we want to refresh periodically for new additions/changes)
  items_last_sync: Infinity,               // never expires (timestamp is checked externally)
}

// Internal store: { [key]: { value, setAt, ttlMs } }
const _store = {}

/**
 * Store a value.
 * @param {string} key
 * @param {*} value
 * @param {number} [ttlMs]  - optional TTL override in ms. 0 = no expiry.
 * @param {boolean} [persist] - if true, also write this value to disk so it
 *                              survives app restarts (see loadFromDisk()).
 */
function set(key, value, ttlMs, persist = false) {
  const resolvedTtl = ttlMs !== undefined
    ? ttlMs
    : (DEFAULT_TTLS[key] ?? 0)   // 0 = no expiry

  _store[key] = {
    value,
    setAt: Date.now(),
    ttlMs: resolvedTtl
  }

  if (persist) writeDisk(key, value)
}

/**
 * Get a value. Returns null if key doesn't exist or is expired.
 */
function get(key) {
  const entry = _store[key]
  if (!entry) return null

  // Check TTL
  if (entry.ttlMs > 0 && (Date.now() - entry.setAt) > entry.ttlMs) {
    console.log(`[uexCache] 🕐 Key "${key}" has expired (TTL: ${entry.ttlMs / 3600000}h)`)
    delete _store[key]
    return null
  }

  return entry.value
}

/**
 * Returns true if the key is missing or has expired.
 */
function isExpired(key) {
  return get(key) === null
}

/**
 * Returns ms since the key was last set, or null if key doesn't exist.
 */
function getAge(key) {
  const entry = _store[key]
  if (!entry) return null
  return Date.now() - entry.setAt
}

/**
 * Returns the TTL remaining for a key in ms.
 * Returns Infinity if no TTL, 0 if expired.
 */
function getTtlRemaining(key) {
  const entry = _store[key]
  if (!entry) return 0
  if (!entry.ttlMs) return Infinity
  const remaining = entry.ttlMs - (Date.now() - entry.setAt)
  return Math.max(0, remaining)
}

/**
 * Delete a key.
 */
function del(key) {
  delete _store[key]
}

/**
 * Clear all keys.
 */
function clear() {
  Object.keys(_store).forEach(k => delete _store[k])
}

/**
 * Returns all non-expired key names.
 */
function keys() {
  return Object.keys(_store).filter(k => get(k) !== null)
}

/**
 * Returns a summary of all keys with their age and TTL info.
 * Useful for debug/settings UI.
 */
function getStats() {
  return Object.entries(_store).map(([key, entry]) => {
    const ageMs     = Date.now() - entry.setAt
    const remaining = entry.ttlMs ? Math.max(0, entry.ttlMs - ageMs) : null
    const isArr     = Array.isArray(entry.value)

    return {
      key,
      count:          isArr ? entry.value.length : null,
      ageMinutes:     Math.round(ageMs / 60000),
      ttlHours:       entry.ttlMs ? (entry.ttlMs / 3600000).toFixed(1) : 'none',
      remainingHours: remaining !== null ? (remaining / 3600000).toFixed(1) : 'none',
      expired:        entry.ttlMs > 0 && ageMs > entry.ttlMs
    }
  })
}

module.exports = { set, get, isExpired, getAge, getTtlRemaining, delete: del, clear, keys, getStats, loadFromDisk }