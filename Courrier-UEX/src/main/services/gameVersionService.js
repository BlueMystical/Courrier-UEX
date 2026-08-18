// src/main/services/gameVersionService.js
//
// Los datos de UEX (terminals, vehicles, ...) solo cambian cuando cambia la
// versión del juego (parche Live/PTU) — no vale la pena re-sincronizarlos en
// cada arranque de la app. Este servicio es la única fuente de verdad de
// "cuál fue la última versión contra la que sincronizamos", persistida a
// disco para que sobreviva reinicios.
//
// UEX bloquea llamadas hechas desde el proceso main (protección anti-bot),
// así que el fetch de /game_versions lo hace el renderer y nos la reporta
// acá vía IPC (uex:reportGameVersion). Este servicio solo compara y decide.

'use strict'

const path = require('path')
const fs = require('fs')
const { app } = require('electron')

function getDiskPath() {
  return path.join(app.getPath('userData'), 'game-version.json')
}

let _persisted = null   // { live, ptu } | null
let _loaded = false

/** Carga la versión persistida a memoria. Llamar una vez al arrancar. */
function load() {
  try {
    const filePath = getDiskPath()
    if (fs.existsSync(filePath)) {
      _persisted = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      console.log('[GameVersion] 💾 Versión persistida:', _persisted)
    } else {
      console.log('[GameVersion] 💾 Sin versión persistida (primer arranque)')
    }
  } catch (e) {
    console.warn('[GameVersion] ⚠️  No se pudo leer la versión persistida:', e.message)
    _persisted = null
  }
  _loaded = true
}

function getPersisted() {
  if (!_loaded) load()
  return _persisted
}

function sameVersion(a, b) {
  if (!a || !b) return false
  return a.live === b.live && a.ptu === b.ptu
}

/**
 * El renderer reporta la versión actual (fetcheada por él, ver nota arriba).
 * Si difiere de la persistida (o no hay ninguna persistida todavía) se
 * considera "cambió" y se persiste la nueva versión.
 *
 * @param {{live: string, ptu: string}} current
 * @returns {{ changed: boolean, isFirstRun: boolean }}
 */
function checkAndUpdate(current) {
  if (!current) return { changed: false, isFirstRun: false }

  const persisted = getPersisted()
  const isFirstRun = !persisted
  const changed = isFirstRun || !sameVersion(current, persisted)

  if (changed) {
    _persisted = current
    try {
      fs.writeFileSync(getDiskPath(), JSON.stringify(current))
    } catch (e) {
      console.warn('[GameVersion] ⚠️  No se pudo persistir la versión:', e.message)
    }
    console.log(`[GameVersion] ${isFirstRun ? '🆕 Primer arranque' : '🔄 Nueva versión detectada'} — Live ${current.live} / PTU ${current.ptu}`)
  } else {
    console.log(`[GameVersion] ✅ Sin cambios — Live ${current.live} / PTU ${current.ptu}`)
  }

  return { changed, isFirstRun }
}

module.exports = { load, getPersisted, checkAndUpdate }