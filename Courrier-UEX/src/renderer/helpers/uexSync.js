// src/renderer/helpers/uexSync.js
//
// Centraliza TODO el sync de datos de UEX Corp que corre en el renderer
// (terminals, vehicles, items). Vive acá porque la API de UEX bloquea las
// llamadas hechas desde el proceso main (protección anti-bot) — el fetch
// tiene que hacerse desde el renderer y después mandarse a cachear a main
// vía IPC (uex:cacheTerminals / uex:cacheItems).
//
// ── GATE POR VERSIÓN DEL JUEGO (terminals + vehicles + star_systems + commodities) ──
// Estos 4 catálogos en el backend de UEX solo cambian cuando cambia la
// versión del juego (parche Live/PTU), no en cada sesión. Antes hacíamos un
// fetch completo en CADA arranque (terminals/vehicles) o directamente en
// cada montaje de una view (star_systems/commodities, desde Items.vue y
// Commodities.vue), generando llamadas innecesarias.
//
// La DECISIÓN de si hace falta sincronizar vive centralizada en el proceso
// main (services/gameVersionService.js + uexCache.js), persistida a disco —
// no acá. Este archivo solo:
//   1. Fetchea la versión actual (el renderer es el único que puede pegarle
//      a la API de UEX sin que la bloqueen).
//   2. Se la reporta a main vía window.api.UEX.reportGameVersion().
//   3. Main compara contra lo persistido y devuelve { changed, isFirstRun, missing }.
//      `missing` son keys gateadas sin datos en cache todavía (backfill para
//      instalaciones existentes cuando se agrega una key nueva al gate).
//   4. Si changed === true sincronizamos las 4; si no, solo las de `missing`.
// Así hay una sola fuente de verdad (main, disco) en vez de tener el estado
// de "cuándo sincronizamos por última vez" duplicado entre renderer y main.
//
// Los datos quedan en uexCache (main) bajo las keys 'terminals', 'vehicles',
// 'star_systems', 'commodities' — se leen desde cualquier view vía
// window.api.UEX.getCache(), nunca con fetch() directo a la API.
//
// El sync manual (botón de sync del usuario) sigue forzando todo, sin
// importar la versión, vía { force: true }.
//
// El sync de ITEMS (categorías + items) no entra en este gate: sigue su
// propio TTL de 24h / disco, controlado desde itemCacheService.js (proceso
// main) — acá solo hacemos el fetch cuando main nos lo pide vía
// 'items-cache:request-sync'. Ver syncItems() más abajo.

const UEX_BASE = 'https://api.uexcorp.uk/2.0'

// ── Versión del juego ────────────────────────────────────────────────────

/** Consulta la versión actual del juego en UEX. Devuelve null si falla.
 *  NOTA: debe leer el mismo endpoint/campos que ya usa Home.vue para
 *  mostrar la versión en pantalla — si difiere, alinear acá (o mejor,
 *  hacer que Home.vue importe esta función en vez de tener su propio fetch). */
export async function fetchCurrentGameVersion() {
  try {
    const res = await fetch(`${UEX_BASE}/game_versions`)
    const json = await res.json()
    if (json?.status === 'ok' && json.data) {
      return { live: json.data.live ?? null, ptu: json.data.ptu ?? null }
    }
    console.warn('[UEX Sync] ⚠️  Respuesta inesperada de /game_versions:', json?.status)
  } catch (err) {
    console.error('[UEX Sync] ❌ No se pudo obtener la versión del juego:', err)
  }
  return null
}

// ── Terminals ────────────────────────────────────────────────────────────

export async function syncTerminals(store) {
  try {
    console.log('[UEX Sync] 🔄 Fetching terminals...')
    if (store) store.setSyncState(true, 'Syncing terminals...')
    const response = await fetch(`${UEX_BASE}/terminals`)
    const data = await response.json()
    await window.api.invoke('uex:cacheTerminals', data)
    console.log('[UEX Sync] ✅ Terminals synced')
    if (store) store.setSyncState(false)
  } catch (err) {
    console.error('[UEX Sync] ❌ Terminals sync failed:', err)
    if (store) store.setSyncState(false)
  }
}

// ── Star systems ─────────────────────────────────────────────────────────
// Catálogo estático (no cambia por sesión, solo por parche) — mismo gate por
// versión del juego que terminals/vehicles. Antes Items.vue y Commodities.vue
// lo fetcheaban en crudo cada vez que se montaban; ahora vive acá y se lee
// de uexCache vía window.api.UEX.getCache().

export async function syncStarSystems(store) {
  try {
    console.log('[UEX Sync] 🔄 Fetching star systems...')
    const response = await fetch(`${UEX_BASE}/star_systems`)
    const data = await response.json()
    await window.api.invoke('uex:cacheStarSystems', data)
    console.log('[UEX Sync] ✅ Star systems synced')
  } catch (err) {
    console.error('[UEX Sync] ❌ Star systems sync failed:', err)
  }
}

// ── Commodities (catálogo) ──────────────────────────────────────────────
// El catálogo de commodities (nombres/tipos), no los precios — mismo gate.
// El handler 'uex:cacheCommodities' en main ya existía pero nada lo llamaba;
// Commodities.vue fetcheaba /commodities en crudo en cada montaje en su lugar.

export async function syncCommodities(store) {
  try {
    console.log('[UEX Sync] 🔄 Fetching commodities catalogue...')
    const response = await fetch(`${UEX_BASE}/commodities`)
    const data = await response.json()
    await window.api.invoke('uex:cacheCommodities', data)
    console.log('[UEX Sync] ✅ Commodities catalogue synced')
  } catch (err) {
    console.error('[UEX Sync] ❌ Commodities catalogue sync failed:', err)
  }
}

// ── Vehicles ─────────────────────────────────────────────────────────────

export async function syncVehicles(store) {
  try {
    console.log('[UEX Sync] 🔄 Fetching vehicles...')
    const response = await fetch(`${UEX_BASE}/vehicles`)
    const data = await response.json()
    const vehicles = data.data || []
    if (vehicles.length > 0) {
      await window.api.invoke('uex:cacheItems', { vehicles })
      console.log(`[UEX Sync] ✅ Vehicles synced (${vehicles.length})`)
    }
  } catch (err) {
    console.error('[UEX Sync] ❌ Vehicles sync failed:', err)
  }
}

// ── Items (categorías + items) ──────────────────────────────────────────
// Disparado SOLO cuando main emite 'items-cache:request-sync' (después de
// chequear su propio TTL de 24h en itemCacheService). No llamar directo
// desde acá sin pasar por ese chequeo — se salta el TTL.

export async function syncItems(store) {
  try {
    console.log('[UEX Sync] 🔄 Fetching item categories...')
    if (store) store.setSyncState(true, 'Syncing item categories...')

    const catRes = await fetch(`${UEX_BASE}/categories?type=item`)
    const catData = await catRes.json()
    if (catData.status !== 'ok') throw new Error(`categories API: ${catData.status}`)
    const categories = catData.data || []
    console.log(`[UEX Sync] Found ${categories.length} categories — fetching items...`)

    const allItems = []
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i]
      if (store) store.setSyncState(true, `Syncing items: ${cat.name} (${i + 1}/${categories.length})`)
      try {
        const res = await fetch(`${UEX_BASE}/items?id_category=${cat.id}`)
        const data = await res.json()
        if (data.status === 'ok') allItems.push(...(data.data || []))
      } catch (e) {
        console.warn(`[UEX Sync] ⚠️  Category ${cat.id} (${cat.name}) failed: ${e.message}`)
      }
      if (i < categories.length - 1) await new Promise(r => setTimeout(r, 200))
    }

    if (store) store.setSyncState(true, 'Finalizing items cache...')
    await window.api.invoke('uex:cacheItems', { categories, items: allItems })
    console.log(`[UEX Sync] ✅ ${allItems.length} items synced`)
    if (store) store.setSyncState(false)
  } catch (err) {
    console.error('[UEX Sync] ❌ Items sync failed:', err)
    if (store) store.setSyncState(false)
    await window.api.invoke('uex:cacheItemsError', err.message)
  }
}

// ── Gate por versión del juego (terminals + vehicles + star_systems + commodities) ──

/**
 * Sincroniza terminals/vehicles/star_systems/commodities SOLO si main
 * determina que la versión del juego cambió (o es el primer arranque), o si
 * alguna de esas keys todavía no tiene datos en cache (backfill). La
 * decisión y su persistencia viven en main — ver services/gameVersionService.js.
 *
 * @param {object} store - Pinia store (opcional, refleja isSyncing en la UI)
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Ignora el gate y sincroniza siempre
 *                                 (usado por el botón de sync manual)
 */
const GATED_SYNCERS = {
  terminals: syncTerminals,
  vehicles: syncVehicles,
  star_systems: syncStarSystems,
  commodities: syncCommodities,
}

export async function syncIfGameVersionChanged(store, options = {}) {
  try {
    // 1. Obtener la versión actual del juego desde el endpoint de UEX
    const response = await fetch('https://api.uexcorp.uk/2.0/game_versions')
    const json = await response.json()
    const currentVersion = json.data || json

    // 2. Reportar al proceso Main para verificar si cambió respecto a disco o faltan claves
    const { changed, missing = [] } = await window.api.invoke('uex:reportGameVersion', currentVersion)

    console.log(`[Sync] Version check -> changed: ${changed}, missing:`, missing)

    // 3. Si cambió la versión, si faltan claves (backfill), o si es un sync manual/forzado
    if (changed || missing.length > 0 || options?.force) {
      console.log('[Sync] 🔄 Iniciando re-sincronización de catálogos...')

      if (changed || options?.force) {
        // Cambio de versión de SC o Sync manual -> Refrescar todos los catálogos
        await syncTerminals(store)
        await syncVehicles(store)
        await syncStarSystems(store)
        await syncCommodities(store)
        await syncItems(store)
      } else {
        // Muestra de backfill puntual (ej: primer arranque o archivo borrado)
        for (const key of missing) {
          if (GATED_SYNCERS[key]) {
            await GATED_SYNCERS[key](store)
          }
        }
        if (missing.includes('items')) {
          await syncItems(store)
        }
      }
    }
  } catch (error) {
    console.error('[Sync] ❌ Error al verificar versión del juego:', error)
  }
}