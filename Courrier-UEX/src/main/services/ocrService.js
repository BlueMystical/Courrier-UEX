// src/main/services/ocrService.js

// #region Imports & Constants

const { app } = (() => { try { return require('electron') } catch { return {} } })()
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')
const uexCache = require('../helpers/uexCache')
const { runOCRPass, runOCRFull, runTesseractPass } = require('../helpers/ocrHelper')

const TMP_DIR = os.tmpdir()
const IS_DEV = !app?.isPackaged

const SECTOR_A_BLACKLIST = [
  'YOUR INVENTORIES', 'YOUR INVENTORIE', 'YOUR INVENTOR', 'IN DEMAND', 'IN DEMANO',
  'NO DEMAND', 'NO DEMANO', 'CANNOT SELL', 'CANNO SELL', 'SELECT SUB-CATEGORY',
  'SELECT SUB CATEGORY', 'SELECT SUB', 'COMMODITIES', 'ITEMS', 'VEHICLES',
  'CHOOSE DESTINATION', 'CHOOSE CATEGORY', 'CHOOSE SUBCATEGORY',
  'CHOOSE SUB-DESTINATION', 'CHOOSE SUB DESTINATION', 'ALL OPTIONS',
  'ALL CATEGORIES', 'SUBCATEGORY', 'ITEM NAME',
]

const NOMBRE_NOISE_TOKENS = [
  / VV\s*$/, / V\s*$/, / IP\s*$/, / [A-Z]{1,2}\s*$/, /^\s*\|\s*/, /\s*\|\s*$/,
]

const MIN_LINE_LENGTH = 5

/**
 * Stock statuses — aligned with UEX API /commodities_status
 */
const STOCK_STATUS_MAP = [
  {
    code: 1, name: 'Out of Stock (Empty)', short: 'Out Stock', abbr: 'OS',
    patterns: [
      'OUT OF STOCK', 'OUT OF STOC', 'OUT STOCK', 'OUT OF STECK', 'OUT OF STEK', 'OUT OF STUCK',
      'OUE OF SEOCK', 'CUE OF SEOCK', 'OUE OF STOCK', 'OUT OF SEOCK',
      'OUE OF SEO', 'CUE OF SEO', 'OUT OF SEO',
      'EF SEOCK', 'EF STOCK', 'OF SEOCK',
    ]
  },
  { code: 2, name: 'Very Low Inventory', short: 'Very Low', abbr: 'VL', patterns: ['VERY LOW'] },
  { code: 3, name: 'Low Inventory', short: 'Low', abbr: 'LO', patterns: ['LOW INV', 'LOW'] },
  { code: 4, name: 'Medium Inventory', short: 'Medium', abbr: 'ME', patterns: ['MEDIUM', 'NEDIUN', 'MEDIUN', 'NEDIUM'] },
  { code: 5, name: 'High Inventory', short: 'High', abbr: 'HI', patterns: ['HIGH INV', 'HIGH'] },
  { code: 6, name: 'Very High Inventory', short: 'Very High', abbr: 'VH', patterns: ['VERY HIGH'] },
  { code: 7, name: 'Maximum Inventory (Full)', short: 'Maximum', abbr: 'MA', patterns: ['MAXIMUM', 'MAX INV', 'MAK INV'] },
]

const SHOP_SUBTYPE_COMPANY = {
  center_mass: 'Center Mass',
  cubby_blast: 'Cubby Blast',
  casaba: 'Casaba Outlet',
  refinery_shop: 'Refinery Shop',
  teachs: "Teach's Ship Shop",
  pharmacy: 'Pharmacy',
  weapons_shop: 'Live Fire Weapons',
  armor_shop: 'Garrity Defense',
  skutters: 'Skutters',
  dumpers_depot: "Dumper's Depot",
  platinum_bay: 'Platinum Bay',
  garrity_defense: 'Garrity Defense',
  conscientious_objects: 'Conscientious Objects',
}

const UI_PROFILES = {
  // =============================================================================
  // COMMODITIES - Layout completamente diferente a Items
  // =============================================================================


  'commodities_orange': {        // ✅ CALIBRADO - Pyro (The Golden Riviera, etc.)
    type: 'commodity',
    colorScheme: 'orange',
    // Header: "COMMODITIES" con icono en esquina superior izquierda
    header: { left: 0.05, top: 0.05, width: 0.30, height: 0.10 },
    // Sector A: Panel izquierdo (YOUR INVENTORIES + dropdown ubicación)
    sectorA: {
      // Tipo: "COMMODITIES" text en header
      tipo: { left: 0.02, top: 0.15, width: 0.45, height: 0.08 },
      // Nombre: dropdown debajo de YOUR INVENTORIES
      terminalName: { left: 0.05, top: 0.22, width: 0.25, height: 0.08 },
      // Modo: tabs Buy/Local Market Value en panel derecho
      modeTabs: {
        buyLeft: 0.58, sellLeft: 0.72, top: 0.18, width: 0.15, height: 0.06
      }
    },
    // Sector B: Panel derecho (SHOP INVENTORY + lista commodities)
    sectorB: {
      // Tabs: zona de Buy/Local Market Value
      tabs: { left: 0.58, top: 0.18, width: 0.38, height: 0.06 },
      // Items: lista de commodities con SCU y precios
      items: { left: 0.58, top: 0.25, width: 0.38, height: 0.65 }
    }
  },

  'commodities_blue': {          // ✅ CALIBRADO - Stanton azul oscuro (CRU-L4, etc.)
    type: 'commodity',
    colorScheme: 'blue',
    header: { left: 0.05, top: 0.05, width: 0.30, height: 0.10 },
    sectorA: {
      tipo: { left: 0.02, top: 0.15, width: 0.45, height: 0.08 },
      terminalName: { left: 0.05, top: 0.20, width: 0.28, height: 0.06 },
      modeTabs: { buyLeft: 0.60, sellLeft: 0.74, top: 0.15, width: 0.15, height: 0.06 }
    },
    sectorB: {
      tabs: { left: 0.60, top: 0.15, width: 0.35, height: 0.06 },
      items: { left: 0.60, top: 0.22, width: 0.35, height: 0.70 }
    }
  },

  'commodities_light': {         // ✅ CALIBRADO - Stanton amarillo/dorado claro
    type: 'commodity',
    colorScheme: 'light',
    header: { left: 0.05, top: 0.05, width: 0.30, height: 0.10 },
    sectorA: {
      tipo: { left: 0.02, top: 0.15, width: 0.45, height: 0.08 },
      terminalName: { left: 0.05, top: 0.18, width: 0.28, height: 0.06 },
      modeTabs: { buyLeft: 0.62, sellLeft: 0.76, top: 0.13, width: 0.15, height: 0.06 }
    },
    sectorB: {
      tabs: { left: 0.62, top: 0.13, width: 0.33, height: 0.06 },
      items: { left: 0.62, top: 0.20, width: 0.33, height: 0.72 }
    }
  },

  // ========== ITEMS ==========
  // Todas las coordenadas son relativas a la imagen completa (0.0 - 1.0).
  // Campos requeridos por extractItemShop:
  //   header      : zona donde aparece el nombre de la tienda / logo
  //   destination : dropdown "CHOOSE DESTINATION" o valor seleccionado
  //   col1        : columna izquierda de items
  //   col2        : columna derecha de items
  //   buyTab      : zona del tab BUY (para detectItemShopMode)
  //   sellTab     : zona del tab SELL (para detectItemShopMode)
  // -----------------------------------------------------------------------
  // items_generic — FALLBACK para detección inicial de header
  // Debe ser muy amplio para capturar cualquier tipo de logo/texto
  // -----------------------------------------------------------------------
  'items_generic': {
    type: 'item',
    colorScheme: 'blue',
    header: { left: 0.20, top: 0.05, width: 0.60, height: 0.15 },
    destination: { left: 0.08, top: 0.16, width: 0.30, height: 0.05 },
    col1: { left: 0.12, top: 0.35, width: 0.34, height: 0.45 },
    col2: { left: 0.50, top: 0.35, width: 0.34, height: 0.45 },
    buyTab: { left: 0.12, top: 0.10, width: 0.08, height: 0.05 },
    sellTab: { left: 0.22, top: 0.10, width: 0.08, height: 0.05 },
  },

  // =============================================================================
  // PERFIL BASE STANTON - Layout preciso para tiendas de Stanton
  // =============================================================================
  'items_stanton': {
    type: 'item',
    colorScheme: 'blue',
    destination: { left: 0.078, top: 0.205, width: 0.28, height: 0.05 },
    col1: { left: 0.078, top: 0.335, width: 0.305, height: 0.55 },
    col2: { left: 0.505, top: 0.335, width: 0.305, height: 0.55 },
    buyTab: { left: 0.06, top: 0.06, width: 0.11, height: 0.09 },
    sellTab: { left: 0.175, top: 0.06, width: 0.11, height: 0.09 },
    header: { left: 0.35, top: 0.04, width: 0.30, height: 0.14 },
  },

  // =============================================================================
  // ESPECIALIZACIONES STANTON
  // =============================================================================

  'items_center_mass': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'blue',
    header: { left: 0.35, top: 0.04, width: 0.30, height: 0.14 },
  },

  'items_casaba': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'light',
    header: { left: 0.30, top: 0.04, width: 0.40, height: 0.14 },
  },

  'items_cubby_blast': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'dark',
    header: { left: 0.32, top: 0.05, width: 0.36, height: 0.13 },
  },

  'items_dumpers_depot': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'dark',  // Amarillo oscuro/industrial
  },

  // STANTON - Live Fire Weapons (verde militar)
  'items_live_fire_weapons': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'dark',
    // Header: texto "LIVE FIRE WEAPONS" ancho
    header: { left: 0.30, top: 0.04, width: 0.40, height: 0.14 },
  },

  // STANTON - Kel-To (blanco/beige claro)
  'items_kel_to': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'light',
    // Header: logo Kel-To con texto
    header: { left: 0.35, top: 0.04, width: 0.30, height: 0.14 },
  },

  // STANTON - Omega Pro (naranja oscuro, logo + texto)
  'items_omega_pro': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'orange',  // Naranja oscuro industrial
    // Header: logo Ω con "OMEGA PRO"
    header: { left: 0.35, top: 0.04, width: 0.30, height: 0.14 },
  },

  // STANTON - Platinum Bay (azul morado)
  'items_platinum_bay': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'blue',
    // Header: texto "PLATINUM BAY" ancho
    header: { left: 0.30, top: 0.04, width: 0.40, height: 0.14 },
  },

  // STANTON - Pharmacy (hereda todo de items_stanton)
  'items_pharmacy': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'blue',
    // Header: "+ PHARMACY" con icono
    header: { left: 0.30, top: 0.04, width: 0.40, height: 0.14 },
  },

  // STANTON - Armor genérico (hereda todo de items_stanton)
  'items_generic_armor': {
    _inherits: 'items_stanton',
    type: 'item',
    colorScheme: 'blue',
    // Header: texto "ARMOR" centrado
    header: { left: 0.35, top: 0.04, width: 0.30, height: 0.14 },
  },


  // =============================================================================
  // PYRO - Layout diferente (naranja)
  // =============================================================================
  // PERFIL BASE PYRO - Layout común para todas las tiendas de Pyro
  // =============================================================================
  'items_pyro': {                // 🏗️ BASE - Layout Pyro (naranja)
    type: 'item',
    colorScheme: 'orange',
    // Header: texto ancho tipo "SHOP_TERMINAL", "medical_shop", "WEAPONS_SHOP"
    header: { left: 0.35, top: 0.08, width: 0.45, height: 0.12 },
    // Destination: más arriba que Stanton
    destination: { left: 0.08, top: 0.18, width: 0.35, height: 0.06 },
    // Columnas: más anchas, más arriba, más altas
    col1: { left: 0.08, top: 0.28, width: 0.38, height: 0.65 },
    col2: { left: 0.50, top: 0.28, width: 0.38, height: 0.65 },
    // Tabs: más anchos, más arriba
    buyTab: { left: 0.08, top: 0.06, width: 0.12, height: 0.08 },
    sellTab: { left: 0.22, top: 0.06, width: 0.12, height: 0.08 },
  },
  // =============================================================================
  // ESPECIALIZACIONES PYRO (heredan del base, ajustan header si es necesario)
  // =============================================================================

  'items_pyro_item_shop': {      // ✅ CALIBRADO - "SHOP_TERMINAL"
    _inherits: 'items_pyro',
    type: 'item',
    colorScheme: 'orange',
    // Header específico si es necesario ajustar
    header: { left: 0.35, top: 0.08, width: 0.45, height: 0.12 },
  },

  'items_pyro_medical_shop': {   // ✅ CALIBRADO - "medical_shop" (lowercase)
    _inherits: 'items_pyro',
    type: 'item',
    colorScheme: 'orange',
    // Mismo layout, detectable por regex /medical_shop/
  },

  'items_pyro_weapon_shop': {    // ✅ CALIBRADO - "WEAPONS_SHOP" (uppercase)
    _inherits: 'items_pyro',
    type: 'item',
    colorScheme: 'orange',
    // Mismo layout, detectable por regex /WEAPONS_SHOP/
  },

  'items_pyro_refinery_shop': {
    _inherits: 'items_pyro',
    type: 'item',
    colorScheme: 'orange',
    // Mismo layout que Pyro Item Shop
  },


  // Teach's en Levski usa layout similar pero no idéntico
  'items_teachs': {              // 🔧 PARCIAL - Levski/Pyro antiguo
    _inherits: 'items_pyro',
    type: 'item',
    colorScheme: 'orange',
    // Ajustes específicos de Levski si difieren del Pyro moderno
    header: { left: 0.20, top: 0.06, width: 0.60, height: 0.12 },
    destination: { left: 0.08, top: 0.14, width: 0.30, height: 0.06 },
    col1: { left: 0.095, top: 0.30, width: 0.28, height: 0.65 },
    col2: { left: 0.48, top: 0.30, width: 0.35, height: 0.50 },
    buyTab: { left: 0.14, top: 0.08, width: 0.08, height: 0.05 },
    sellTab: { left: 0.30, top: 0.08, width: 0.08, height: 0.05 },
  },

  'items_skutters': { _inherits: 'items_teachs', type: 'item', colorScheme: 'orange' },

  // Subtipos adicionales
  'items_garrity_defense': { _inherits: 'items_stanton', type: 'item', colorScheme: 'blue' },
  'items_conscientious_objects': { _inherits: 'items_stanton', type: 'item', colorScheme: 'blue' },

  // ========== VEHICLES ==========

  'vehicles_default': {          
  type: 'vehicle',
  colorScheme: 'dark',
  // Header: Un poco más arriba y ancho para atrapar "BUY & FLY" o "ASTRO ARMADA"
  header: { left: 0.04, top: 0.03, width: 0.40, height: 0.10 },
  // VehicleList: Empezamos en 14% para atrapar la lista completa, y lo hacemos más ancho (45%)
  vehicleList: { left: 0.02, top: 0.14, width: 0.45, height: 0.82 },
},

'vehicles_astro_armada': {     
  _inherits: 'vehicles_default',
  type: 'vehicle',
  colorScheme: 'dark',
},

'vehicles_buy_and_fly': {      
  _inherits: 'vehicles_default',
  type: 'vehicle',
  colorScheme: 'dark', // Buy & Fly es bastante oscuro/neutro, no naranja como Pyro
},

};

// ---------------------------------------------------------------------------
// Mapeo canónico: shopSubtype (string interno) → clave en UI_PROFILES
// Agregar aquí cuando se detecte un nuevo subtipo en detectItemShopSubtype()
// ---------------------------------------------------------------------------
const SUBTYPE_TO_PROFILE_KEY = {
  // Stanton Items
  'center_mass': 'items_center_mass',
  'cubby_blast': 'items_cubby_blast',
  'casaba': 'items_casaba',
  'dumpers_depot': 'items_dumpers_depot',
  'pharmacy': 'items_pharmacy',
  'omega_pro': 'items_omega_pro',        // ✅
  'platinum_bay': 'items_platinum_bay',     // ✅
  'armor_shop': 'items_generic_armor',
  'weapons_shop': 'items_live_fire_weapons',
  'kel_to': 'items_kel_to',
  'garrity_defense': 'items_garrity_defense',
  'conscientious_objects': 'items_conscientious_objects',

  // Pyro Items
  'pyro_item_shop': 'items_pyro_item_shop',
  'pyro_weapon_shop': 'items_pyro_weapon_shop',
  'pyro_medical_shop': 'items_pyro_medical_shop',
  'pyro_refinery_shop': 'items_pyro_refinery_shop',

  // Legacy
  'teachs': 'items_teachs',
  'skutters': 'items_skutters',

  // Fallback
  'generic_item': 'items_generic',
}

const VEHICLE_SUBTYPE_TO_TERMINAL = {
  'astro_armada': {
    id: 148, 
    name: 'Astro Armada - Area 18',
    type: 'vehicle_buy'
  },
  'buy_and_fly': {
    id: 147, // Pon el ID numérico real si lo sabes, servirá de fallback
    name: 'Buy & Fly',
    type: 'vehicle_buy'
  },
  'generic_vehicle': {
    id: 0,
    name: 'Unknown Vehicle Terminal',
    type: 'vehicle_buy'
  }
}

/** Resuelve el perfil UI para un shopSubtype dado.
 * Si el perfil tiene `_inherits`, fusiona recursivamente con el perfil padre.
 * Garantiza que siempre retorna un objeto con todos los campos necesarios.
 *
 * @param {string} shopSubtype  — valor de detectItemShopSubtype(), ej: 'center_mass'
 * @returns {object}            — perfil completo listo para usar en crop functions
 */
function getProfileForSubtype(shopSubtype) {
  const profileKey = SUBTYPE_TO_PROFILE_KEY[shopSubtype] ?? 'items_generic'
  return resolveProfile(profileKey)
}

/** Resuelve herencia de perfiles. Si un perfil tiene `_inherits`, aplica
 * los campos del padre como base y sobreescribe con los del hijo.
 * Máximo 5 niveles de herencia para evitar ciclos.
 */
function resolveProfile(profileKey, depth = 0) {
  if (depth > 5) {
    console.warn(`[Profile] Max inheritance depth reached for "${profileKey}", using generic fallback`)
    return UI_PROFILES['items_generic']
  }

  const profile = UI_PROFILES[profileKey]
  if (!profile) {
    console.warn(`[Profile] Profile "${profileKey}" not found, using generic fallback`)
    return UI_PROFILES['items_generic']
  }

  if (!profile._inherits) {
    const { _inherits, ...clean } = profile
    return clean
  }

  // Resolver padre recursivamente y fusionar — hijo sobreescribe padre
  const parent = resolveProfile(profile._inherits, depth + 1)
  const { _inherits, ...ownFields } = profile
  const resolved = { ...parent, ...ownFields }
  console.log(`[Profile] "${profileKey}" inherits from "${profile._inherits}"`)
  return resolved
}

// #endregion

// #region Fuzzy Matching & Resolution

/** Calculates Levenshtein distance between two strings. */
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/** Fuzzy matches a terminal name against the database. */
function fuzzyMatchTerminal(ocrText, terminals) {
  if (!ocrText || !terminals?.length) return null
  const query = ocrText.toUpperCase().trim()
  console.log(`[FuzzyMatch] Terminal lookup: "${query}"`)
  let bestMatch = null, bestScore = Infinity, bestSimilarity = 0
  for (const terminal of terminals) {
    const candidates = [terminal.nickname, terminal.displayname, terminal.space_station_name, terminal.name].filter(Boolean).map(s => s.toUpperCase().trim())
    for (const name of candidates) {
      const dist = levenshtein(query, name)
      const maxLen = Math.max(query.length, name.length)
      const similarity = maxLen > 0 ? 1 - dist / maxLen : 0
      if (dist < bestScore) { bestScore = dist; bestMatch = terminal; bestSimilarity = similarity }
    }
  }
  if (bestSimilarity < 0.65) {
    console.log(`[FuzzyMatch] Terminal reject (Best sim: ${bestSimilarity.toFixed(2)}, Match: ${bestMatch?.name})`)
    return null
  }
  console.log(`[FuzzyMatch] Terminal match: "${bestMatch.name}" (Sim: ${bestSimilarity.toFixed(2)})`)
  return { terminal: bestMatch, similarity: bestSimilarity }
}

/** Fuzzy matches a commodity name. */
function fuzzyMatchCommodity(ocrName, commodities) {
  if (!ocrName || !commodities?.length) return null
  const query = ocrName.toUpperCase().trim()
  if (query.length < 2) return null
  let bestMatch = null, bestScore = Infinity, bestSimilarity = 0
  for (const commodity of commodities) {
    const candidates = [commodity.name, commodity.name_short, commodity.code].filter(Boolean).map(s => s.toUpperCase().trim())
    for (const name of candidates) {
      const dist = levenshtein(query, name)
      const maxLen = Math.max(query.length, name.length)
      const similarity = maxLen > 0 ? 1 - dist / maxLen : 0
      if (dist < bestScore) { bestScore = dist; bestMatch = commodity; bestSimilarity = similarity }
    }
  }
  if (bestSimilarity < 0.55) return null
  console.log(`[FuzzyMatch:Commodity] "${query}" => "${bestMatch.name}" (Sim: ${bestSimilarity.toFixed(2)})`)
  return { commodity: bestMatch, similarity: bestSimilarity }
}

/** Fuzzy matches an item name from cache. */
function fuzzyMatchItemName(ocrName, cachedItems) {
  if (!ocrName || !cachedItems?.length) return null
  const query = ocrName.toUpperCase().trim()
  if (query.length < 3) return null
  let bestMatch = null, bestScore = Infinity, bestSimilarity = 0
  for (const item of cachedItems) {
    const candidates = [item.name, item.slug?.replace(/-/g, ' ')].filter(Boolean).map(s => s.toUpperCase().trim())
    for (const cand of candidates) {
      const dist = levenshtein(query, cand)
      const sim = Math.max(query.length, cand.length) > 0 ? 1 - dist / Math.max(query.length, cand.length) : 0
      if (dist < bestScore) { bestScore = dist; bestMatch = item; bestSimilarity = sim }
    }
  }
  if (bestSimilarity < 0.65) return null
  console.log(`[FuzzyMatch:Item] "${query}" => "${bestMatch.name}" (Sim: ${bestSimilarity.toFixed(2)})`)
  return { item: bestMatch, similarity: bestSimilarity }
}

/** Resolves a list of item names against the cache. */
function resolveItemNames(gridItems, cachedItems) {
  if (!cachedItems?.length) return gridItems.map(it => ({ ...it, id_resolved: null, matchSimilarity: 0 }))
  return gridItems.map(item => {
    const match = fuzzyMatchItemName(item.name, cachedItems)
    return match ? { ...match.item, price: item.price, matchSimilarity: match.similarity, ocr_name: item.name, volumeUSCU: item.volumeUSCU }
      : { ...item, id_resolved: null, matchSimilarity: 0 }
  })
}

// #endregion

// #region Debug & Image Utilities

const DEBUG_SAVE_IMAGES = IS_DEV
const DEBUG_DIR = IS_DEV ? path.join(os.homedir(), 'Desktop', 'ocr-debug') : path.join(os.tmpdir(), 'sc-courrier-ocr-debug')

async function ensureDebugDir() {
  if (!DEBUG_SAVE_IMAGES) return
  try {
    await fs.promises.rm(DEBUG_DIR, { recursive: true, force: true })
    await fs.promises.mkdir(DEBUG_DIR, { recursive: true })
  } catch (e) { }
}

async function saveDebugImage(buffer, name) {
  if (!DEBUG_SAVE_IMAGES) return
  try { await fs.promises.writeFile(path.join(DEBUG_DIR, name), buffer) } catch (e) { }
}

/**
 * Corrects image skew by finding the optimal rotation angle.
 */
async function deskewBuffer(buffer, maxAngleDeg = 12, stepDeg = 1.0) {
  const meta = await sharp(buffer).metadata()
  const scale = Math.min(1, 400 / meta.width)
  const sw = Math.round(meta.width * scale), sh = Math.round(meta.height * scale)
  const gray = await sharp(buffer).resize(sw, sh).grayscale().threshold(100).raw().toBuffer()
  let bestAngle = 0, bestScore = -1
  for (let deg = -maxAngleDeg; deg <= maxAngleDeg; deg += stepDeg) {
    const rad = (deg * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad), cx = sw / 2, cy = sh / 2
    const rowSums = new Float32Array(sh).fill(0)
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const srcX = Math.round((x - cx) * cos + (y - cy) * sin + cx), srcY = Math.round(-(x - cx) * sin + (y - cy) * cos + cy)
        if (srcX >= 0 && srcX < sw && srcY >= 0 && srcY < sh && gray[srcY * sw + srcX] > 128) rowSums[y]++
      }
    }
    const mean = rowSums.reduce((a, b) => a + b, 0) / sh
    const variance = rowSums.reduce((a, v) => a + (v - mean) ** 2, 0) / sh
    if (variance > bestScore) { bestScore = variance; bestAngle = deg }
  }
  if (Math.abs(bestAngle) < 0.5) return buffer
  return await sharp(buffer).rotate(-bestAngle, { background: { r: 0, g: 0, b: 0, alpha: 1 } }).toBuffer()
}
// #endregion

// #region UI Detection & Color Analysis

async function detectUIAnchors(buffer, width, height) {
  /**
   * Detecta puntos de referencia clave en la UI para calcular crops correctos
   * Retorna: { buyTabY, sellTabY, headerBottomY, hasLogo }
   */

  // Scanear la parte superior para encontrar BUY/SELL tabs
  const topRegion = await sharp(buffer)
    .extract({ left: 0, top: 0, width: Math.floor(width * 0.5), height: Math.floor(height * 0.3) })
    .grayscale()
    .threshold(100)
    .raw()
    .toBuffer();

  const regionW = Math.floor(width * 0.5);
  const regionH = Math.floor(height * 0.3);

  // Buscar líneas horizontales brillantes (tabs activos)
  let buyTabY = null;
  let sellTabY = null;
  let headerBottomY = null;

  // Analizar por filas
  for (let y = 0; y < regionH; y += 2) {
    let brightPixels = 0;
    let brightStreak = 0;

    for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.4); x++) {
      const val = topRegion[y * regionW + x];
      if (val > 200) brightPixels++;
      if (val > 150) brightStreak++;
    }

    // Detectar tab BUY (brillo concentrado izquierda)
    if (brightPixels > regionW * 0.15 && brightPixels < regionW * 0.25 && y > height * 0.08) {
      if (!buyTabY) buyTabY = y;
    }
  }

  // Si no detectamos, usar defaults
  return {
    buyTabY: buyTabY || Math.floor(height * 0.12),
    headerBottomY: buyTabY ? buyTabY + Math.floor(height * 0.08) : Math.floor(height * 0.20),
    hasLogo: false // Detectar por presencia de círculo en centro
  };
}

function identifyTerminalType(rawTipo, rawNombre) {
  const fullText = (rawTipo + ' ' + rawNombre).toUpperCase();
  
  // 1. Prioridad: Vehículos
  // Buscamos palabras que aparecen en Buy & Fly, Astro Armada o terminales de naves
  if (/VEHICLE|SHIP|FLYABLE|MANUFACTURER|GROUND|STV|ROC|CYCLONE|PISCUES|SHIPYARD/i.test(fullText)) {
    return 'vehicle';
  }

  // 2. Items (Armaduras, Armas, etc)
  if (/ITEMS|WEAPONS|ARMOR|EQUIPMENT|CLOTHING|GADGET|ATTACHMENT/i.test(fullText)) {
    return 'item';
  }

  // 3. Por defecto: Commodities (es el flujo más común)
  return 'commodity';
}

// Nota: detectUIProfile() fue reemplazada por getProfileForSubtype() + resolveProfile().
// Para item shops: usar getProfileForSubtype(shopSubtype).
// Para commodities: el sistema de perfiles aún no está migrado (usan coordenadas hardcodeadas).

/** Detects the vertical boundaries (top/bottom) of the terminal UI. */
async function detectUIBounds(buffer, width, height) {
  const stripX = Math.floor(width * 0.15), stripW = Math.floor(width * 0.10)
  const raw = await sharp(buffer).extract({ left: stripX, top: 0, width: stripW, height }).grayscale().raw().toBuffer()
  const rowBrightness = []
  for (let y = 0; y < height; y++) {
    let sum = 0; for (let x = 0; x < stripW; x++) sum += raw[y * stripW + x]
    rowBrightness.push(sum / stripW)
  }
  const DARK_THRESHOLD = 60, MIN_DARK_ROWS = 40
  let uiTop = 0, uiBottom = height - 1
  for (let y = 0; y < height - MIN_DARK_ROWS; y++) {
    if (rowBrightness[y] < DARK_THRESHOLD) {
      let darkCount = 0; for (let dy = 0; dy < MIN_DARK_ROWS; dy++) if (rowBrightness[y + dy] < DARK_THRESHOLD + 20) darkCount++
      if (darkCount >= MIN_DARK_ROWS * 0.7) { uiTop = y; break }
    }
  }
  for (let y = height - 1; y > uiTop + MIN_DARK_ROWS; y--) if (rowBrightness[y] < DARK_THRESHOLD) { uiBottom = y; break }
  const uiHeight = uiBottom - uiTop
  console.log(`[OCR:UI] Bounds detected: Top=${uiTop}, Bottom=${uiBottom}, Height=${uiHeight} (Total=${height})`)
  if (uiHeight < height * 0.5) {
    console.warn(`[OCR:UI] Warning: Detected height too small (${uiHeight}). Resetting to full.`)
    console.log(`[OCR:UI] Brightness range: Min=${Math.min(...rowBrightness).toFixed(1)}, Max=${Math.max(...rowBrightness).toFixed(1)}`)
    return { uiTop: 0, uiBottom: height - 1, uiHeight: height }
  }
  return { uiTop, uiBottom, uiHeight }
}

/**
 * Detects the color scheme of the terminal (Blue, Orange, Light, Dark). */
async function detectUIColorScheme(buffer, width, height, uiTop = null) {
  const top = uiTop !== null ? uiTop + Math.floor((height - uiTop) * 0.10) : Math.floor(height * 0.15)
  const x = Math.floor(width * 0.10), w = Math.floor(width * 0.35), h = Math.floor(height * 0.35), safeH = Math.min(h, height - top)
  if (safeH < 10) return 'dark'
  const raw = await sharp(buffer).extract({ left: x, top, width: w, height: safeH }).raw().toBuffer()
  const meta = await sharp(buffer).metadata(), channels = meta.channels ?? 3
  let rSum = 0, gSum = 0, bSum = 0, count = 0
  for (let i = 0; i < raw.length; i += channels) { rSum += raw[i]; gSum += raw[i + 1]; bSum += raw[i + 2]; count++ }
  const avgR = rSum / count, avgG = gSum / count, avgB = bSum / count, avgBrightness = (avgR + avgG + avgB) / 3, rgRatio = avgR / Math.max(avgG, 1)

  let scheme = 'dark'
  if (avgBrightness > 140) scheme = 'light'
  else if (rgRatio > 1.4 && avgBrightness > 80) scheme = 'orange'  // Añadir brillo mínimo para naranja
  else if (avgB > avgR + 10 && avgB > avgG + 5) scheme = 'blue'
  // else queda 'dark' (Dumper's Depot, Cubby Blast, etc.)

  console.log(`[OCR:Color] Avg RGB: (${avgR.toFixed(1)}, ${avgG.toFixed(1)}, ${avgB.toFixed(1)}), Brightness: ${avgBrightness.toFixed(1)}, RG Ratio: ${rgRatio.toFixed(2)} => Scheme: ${scheme.toUpperCase()}`)
  return scheme
}

/** Detecta Buy/Sell mode para Commodities usando el perfil
 * @param {Buffer} buffer - Imagen completa
 * @param {number} width - Ancho imagen
 * @param {number} height - Alto imagen
 * @param {object} profile - Perfil de commodities
 * @param {object} uiBounds - Límites UI detectados
 */
async function detectCommoditiesMode(buffer, width, height, profile, uiBounds = null) {
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const p = profile.sectorB.tabs

  // Usar coordenadas del perfil
  const tabY = uiTop + Math.floor(uiHeight * (p.top - 0.05))
  const tabH = Math.floor(uiHeight * p.height)
  const panelX = Math.floor(width * p.left)
  const panelW = Math.floor(width * p.width)

  // Extraer zona de tabs
  const tabStrip = await sharp(buffer)
    .extract({ left: panelX, top: tabY, width: panelW, height: tabH })
    .grayscale()
    .raw()
    .toBuffer()

  // Calcular brillo por columna (mismo algoritmo que antes)
  const colBrightness = new Float32Array(panelW)
  for (let x = 0; x < panelW; x++) {
    let sum = 0
    for (let y = 0; y < tabH; y++) sum += tabStrip[y * panelW + x]
    colBrightness[x] = sum / tabH
  }

  // Suavizar
  const smoothed = new Float32Array(panelW), WIN = 20
  for (let x = 0; x < panelW; x++) {
    let s = 0, cnt = 0
    for (let dx = -WIN; dx <= WIN; dx++) {
      const xi = x + dx
      if (xi >= 0 && xi < panelW) { s += colBrightness[xi]; cnt++ }
    }
    smoothed[x] = s / cnt
  }

  // Encontrar pico de brillo
  let maxBrightness = 0, maxCol = 0
  for (let x = 0; x < panelW; x++) {
    if (smoothed[x] > maxBrightness) {
      maxBrightness = smoothed[x]
      maxCol = x
    }
  }

  // Calcular posición relativa del pico
  const peakRatio = maxCol / panelW
  console.log(`[OCR:CommoditiesMode] Peak at ${(peakRatio * 100).toFixed(1)}% (brightness: ${maxBrightness.toFixed(1)})`)

  // OCR de confirmación en zona del pico
  const tabZoneW = Math.max(80, Math.floor(panelW * 0.15))
  const activeX = panelX + Math.max(0, maxCol - tabZoneW)
  const activeW = Math.min(tabZoneW * 2, width - activeX)

  const tabCrop = await sharp(buffer).extract({
    left: activeX, top: tabY, width: activeW, height: tabH
  }).toBuffer()

  const scale = Math.min(4, Math.floor(800 / activeW))
  const processed = await sharp(tabCrop)
    .resize({ width: activeW * scale })
    .grayscale()
    .normalize()
    .threshold(140)
    .toBuffer()

  const rawText = await runOCRPass(processed, 6)
  const cleaned = rawText.trim().toUpperCase().replace(/[^A-Z\s]/g, '').trim()
  console.log(`[OCR:CommoditiesMode] OCR: "${cleaned}"`)

  // Determinar modo
  if (cleaned.includes('SELL') || cleaned.includes('LOCAL') || cleaned.includes('MARKET')) {
    return 'sell'
  }
  if (cleaned.includes('BUY')) {
    return 'buy'
  }

  // Fallback por posición (ajustado por perfil)
  // En commodities, "Buy" está a la izquierda (~0-30%), "Local Market Value" a la derecha (~30-100%)
  const mode = peakRatio > 0.30 ? 'sell' : 'buy'
  console.log(`[OCR:CommoditiesMode] Positional fallback: ${mode.toUpperCase()}`)
  return mode
}

function detectVehicleShopSubtype(raw) {
  const up = raw.toUpperCase().replace(/[^A-Z0-9\s\-&]/g, ' ')

  if (/ASTRO\s*ARMADA/.test(up)) return 'astro_armada'
  if (/BUY\s*AND\s*FLY|BUY-&-FLY|BUY\s*&\s*FLY/.test(up)) return 'buy_and_fly'
  // Agregar más según vayan apareciendo

  return 'generic_vehicle'
}

/**
 * Robustly detects Buy/Sell mode by scanning tab brightness in Sector B.
 */
async function detectModeByBrightness(buffer, width, height, uiBounds = null) {
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const tabY = uiTop + Math.floor(uiHeight * 0.210), tabH = Math.floor(uiHeight * 0.040), panelX = Math.floor(width * 0.640), panelW = width - panelX
  const tabStrip = await sharp(buffer).extract({ left: panelX, top: tabY, width: panelW, height: tabH }).grayscale().raw().toBuffer()
  const colBrightness = new Float32Array(panelW)
  for (let x = 0; x < panelW; x++) {
    let sum = 0; for (let y = 0; y < tabH; y++) sum += tabStrip[y * panelW + x]
    colBrightness[x] = sum / tabH
  }
  const smoothed = new Float32Array(panelW), WIN = 20
  for (let x = 0; x < panelW; x++) {
    let s = 0, cnt = 0; for (let dx = -WIN; dx <= WIN; dx++) { const xi = x + dx; if (xi >= 0 && xi < panelW) { s += colBrightness[xi]; cnt++ } }
    smoothed[x] = s / cnt
  }
  let maxBrightness = 0, maxCol = 0; for (let x = 0; x < panelW; x++) if (smoothed[x] > maxBrightness) { maxBrightness = smoothed[x]; maxCol = x }
  const tabZoneW = Math.max(80, Math.floor(panelW * 0.15)), activeX = panelX + Math.max(0, maxCol - tabZoneW), activeW = Math.min(tabZoneW * 2, width - activeX)

  console.log(`[OCR:Mode] Max brightness at col ${maxCol}/${panelW} (Val: ${maxBrightness.toFixed(1)})`)

  const tabCrop = await sharp(buffer).extract({ left: activeX, top: tabY, width: activeW, height: tabH }).toBuffer()
  const scale = Math.min(4, Math.floor(800 / activeW))
  const tryOCR = async (pipeline, label) => {
    const processedBuffer = await pipeline(sharp(tabCrop).resize({ width: activeW * scale })).toBuffer()
    //const tmp = path.join(TMP_DIR, `ocr-tab-${Date.now()}.png`)
    //await fs.promises.writeFile(tmp, proc); const text = await runTesseract(tmp, 7); await fs.promises.unlink(tmp)*/

    const rawText = await runOCRPass(processedBuffer, 6)
    const cleaned = rawText.trim().toUpperCase().replace(/[^A-Z\s]/g, '').trim()
    console.log(`[OCR:Mode] OCR Pass (${label}): "${cleaned}"`)
    return cleaned
  }
  let activeText = await tryOCR(s => s.grayscale().normalize().threshold(140), 'normal')
  if (!/BUY|SELL|LOCAL|MARKET|RENT/.test(activeText)) activeText = await tryOCR(s => s.grayscale().negate().normalize().threshold(130), 'negated')

  if (activeText.includes('SELL') || activeText.includes('LOCAL') || activeText.includes('MARKET')) return 'sell'
  if (activeText.includes('RENT')) return 'rent'
  if (activeText.includes('BUY')) return 'buy'

  // Positional fallback: in orange UI, the "Buy" tab is narrow (~0-18% of panel width)
  // and "Local Market Value" tab is wider (~18-75%). The brightness peak for the active
  // "Local Market Value" tab therefore tends to land around 25-45% even though it's the
  // RIGHT tab. Use a lower threshold (0.18) to avoid mis-classifying it as "buy".
  const fallbackMode = (maxCol / panelW) > 0.18 ? 'sell' : 'buy'
  console.log(`[OCR:Mode] Positional fallback: peak at ${(maxCol / panelW * 100).toFixed(1)}% => ${fallbackMode.toUpperCase()}`)
  return fallbackMode
}

// Función auxiliar para fallback por OCR
async function extractTabTextWithOCR(buffer, width, height, uiTop, uiHeight) {
  const crop = {
    left: Math.floor(width * 0.14),
    top: uiTop + Math.floor(uiHeight * 0.13),
    width: Math.floor(width * 0.20),
    height: Math.floor(uiHeight * 0.06)
  };
  const processed = await sharp(buffer)
    .extract(crop)
    .resize({ width: crop.width * 3 })
    .grayscale()
    .normalize()
    .threshold(140)
    .toBuffer();

  const text = await runOCRPass(processed, 7);
  return text.toUpperCase();
}

// #endregion

// #region Image Preprocessing

async function preprocessNombreSoft(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().normalize().sharpen().toBuffer() }
async function preprocessPass1(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().normalize().threshold(100).sharpen().toBuffer() }
async function preprocessPass2(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().negate().normalize().sharpen().toBuffer() }
async function preprocessSectorB_orange(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().normalize().sharpen({ sigma: 1.5 }).toBuffer() }
async function preprocessSectorB_blue(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().normalize().sharpen({ sigma: 1.5 }).toBuffer() }

// #endregion

// #region Crop Functions - Commodities (Profile-based)

/**
 * Cropea el header de tipo "COMMODITIES" usando el perfil
 */
async function cropCommoditiesHeader(buffer, profile) {
  const { width, height } = await sharp(buffer).metadata()
  const p = profile.header
  const crop = {
    left: Math.floor(width * p.left),
    top: Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] Commodities_Header [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

/**
 * Cropea la zona de tipo (texto "COMMODITIES") usando perfil
 */
async function cropCommoditiesTipo(buffer, profile) {
  const { width, height } = await sharp(buffer).metadata()
  const p = profile.sectorA.tipo
  const crop = {
    left: Math.floor(width * p.left),
    top: Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] Commodities_Tipo [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

/**
 * Cropea la zona del nombre de terminal (dropdown) usando perfil
 */
async function cropCommoditiesTerminalName(buffer, profile, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop } = uiBounds ?? { uiTop: 0 }
  const p = profile.sectorA.terminalName
  const crop = {
    left: Math.floor(width * p.left),
    top: uiTop + Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] Commodities_TerminalName [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

/**
 * Cropea los tabs de modo (Buy/Local Market Value) usando perfil
 */
async function cropCommoditiesModeTabs(buffer, profile, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const p = profile.sectorB.tabs
  const crop = {
    left: Math.floor(width * p.left),
    top: uiTop + Math.floor(uiHeight * (p.top - 0.05)), // Ajuste fino relativo a uiBounds
    width: Math.floor(width * p.width),
    height: Math.floor(uiHeight * p.height),
  }
  console.log(`[OCR:Crop] Commodities_ModeTabs [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

/**
 * Cropea la lista de commodities usando perfil
 */
async function cropCommoditiesItems(buffer, profile, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const p = profile.sectorB.items
  const crop = {
    left: Math.floor(width * p.left),
    top: uiTop + Math.floor(uiHeight * (p.top - 0.05)), // Ajuste fino
    width: Math.floor(width * p.width),
    height: Math.floor(uiHeight * p.height),
  }
  console.log(`[OCR:Crop] Commodities_Items [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

// #endregion

// #region Crop Functions



async function cropSectorA_tipo(buffer, uiBounds = null, colorScheme = 'blue') {
  const { width, height } = await sharp(buffer).metadata();

  // ABSOLUTO: Siempre empezar desde arriba, no desde uiBounds
  // El tipo está en la parte superior izquierda, debajo del título de la terminal

  const crop = {
    left: Math.floor(width * 0.02),
    top: Math.floor(height * 0.15), // ABSOLUTO: debajo del header de la ventana
    width: Math.floor(width * 0.45),
    height: Math.floor(height * 0.08), // Compacto
  };

  console.log(`[OCR:Crop] SectorA_tipo (ABSOLUTE): ${JSON.stringify(crop)}`);
  return await sharp(buffer).extract(crop).toBuffer();
}
async function cropSectorA_nombre(buffer, colorScheme = 'blue', uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata();

  // ABSOLUTO: El nombre de terminal está debajo de CHOOSE DESTINATION
  const crop = {
    left: Math.floor(width * 0.04),
    top: Math.floor(height * 0.22), // ABSOLUTO: después del dropdown de destination
    width: Math.floor(width * 0.40),
    height: Math.floor(height * 0.06), // Muy compacto, solo el nombre
  };

  console.log(`[OCR:Crop] SectorA_nombre (ABSOLUTE): ${JSON.stringify(crop)}`);
  return await sharp(buffer).extract(crop).toBuffer();
}
async function cropSectorB_tabs(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata(), { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  // Cambiado: left de 0.64 a 0.62, width de 0.36 a 0.38 para atrapar la 'L' de Local Market
  const crop = { left: Math.floor(width * 0.62), top: uiTop + Math.floor(uiHeight * 0.13), width: Math.floor(width * 0.38), height: Math.floor(uiHeight * 0.12) }
  console.log(`[OCR:Crop] SectorB_tabs: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}
async function cropSectorB_items(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  // Antes: left 0.58 — ahora 0.61 para evitar el HUD izquierdo
  const crop = {
    left: Math.floor(width * 0.61),
    top: uiTop + Math.floor(uiHeight * 0.22),
    width: Math.floor(width * 0.39),
    height: Math.floor(uiHeight * 0.75)
  }
  console.log(`[OCR:Crop] SectorB_items: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}
/**
 * Cropea el header de la tienda para detectar su nombre/logo y subtipo.
 * Usa el perfil genérico porque se llama ANTES de conocer el subtipo.
 * Una vez detectado el subtipo, las demás crops usan el perfil específico.
 */
async function cropItemShop_header(buffer) {
  const { width, height } = await sharp(buffer).metadata()
  const p = UI_PROFILES['items_generic'].header
  const crop = {
    left: Math.floor(width * p.left),
    top: Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] ItemShop_header: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

/**
 * Cropea la zona del dropdown CHOOSE DESTINATION / valor seleccionado.
 * @param {object} profile — perfil resuelto por getProfileForSubtype()
 */
async function cropItemShop_destination(buffer, profile) {
  const { width, height } = await sharp(buffer).metadata()
  const p = profile.destination
  const crop = {
    left: Math.floor(width * p.left),
    top: Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] ItemShop_destination [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  const rawBuf = await sharp(buffer).extract(crop).toBuffer()

  // Para esquemas naranjas: extraer canal R-B para mejorar contraste del texto
  if (profile.colorScheme === 'orange') {
    const { data, info } = await sharp(rawBuf).raw().toBuffer({ resolveWithObject: true })
    const ch = info.channels, rb = Buffer.allocUnsafe(info.width * info.height)
    for (let i = 0; i < rb.length; i++) rb[i] = Math.max(0, Math.min(255, data[i * ch] - data[i * ch + 2]))
    return await sharp(rb, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer()
  } else if (profile.colorScheme === 'light') {
    // Para fondos claros, invertir colores puede ayudar al OCR
    const { data, info } = await sharp(rawBuf).raw().toBuffer({ resolveWithObject: true })
    const inverted = Buffer.allocUnsafe(info.width * info.height * info.channels)
    for (let i = 0; i < data.length; i++) inverted[i] = 255 - data[i]
    return await sharp(inverted, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer()
  }
  return rawBuf
}

/**
 * Cropea la columna izquierda de items del grid.
 * @param {object} profile — perfil resuelto por getProfileForSubtype()
 */
async function cropItemShop_col1(buffer, profile) {
  const { width, height } = await sharp(buffer).metadata()
  const p = profile.col1
  const crop = {
    left: Math.floor(width * p.left),
    top: Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] ItemShop_col1 [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

/**
 * Cropea la columna derecha de items del grid.
 * @param {object} profile — perfil resuelto por getProfileForSubtype()
 */
async function cropItemShop_col2(buffer, profile) {
  const { width, height } = await sharp(buffer).metadata()
  const p = profile.col2
  const crop = {
    left: Math.floor(width * p.left),
    top: Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] ItemShop_col2 [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

async function cropVehicleHeader(buffer, profile) {
  const { width, height } = await sharp(buffer).metadata()
  const p = profile.header
  const crop = {
    left: Math.floor(width * p.left),
    top: Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] Vehicle_Header [${profile.colorScheme}]: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

async function cropVehicleList(buffer, profile) {
  const { width, height } = await sharp(buffer).metadata()
  const p = profile.vehicleList
  const crop = {
    left: Math.floor(width * p.left),
    top: Math.floor(height * p.top),
    width: Math.floor(width * p.width),
    height: Math.floor(height * p.height),
  }
  console.log(`[OCR:Crop] Vehicle_List: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}

// #endregion

// #region Text Extraction Helpers

function cleanLine(line) { return line.toUpperCase().replace(/[^A-Z0-9\-\s]/g, '').replace(/\s+/g, ' ').trim() }
function isBlacklisted(line) { return SECTOR_A_BLACKLIST.some(b => line.includes(b)) }
function extractValidLines(rawText, label) {
  const valid = []
  for (const line of rawText.split(/\r?\n/)) {
    const cleaned = cleanLine(line); if (cleaned && cleaned.length >= MIN_LINE_LENGTH && !isBlacklisted(cleaned)) valid.push(cleaned)
  }
  return valid
}
function detectTypeFromRaw(rawText) {
  const upper = rawText.toUpperCase().replace(/[^A-Z]/g, ' ').replace(/\s+/g, ' ')
  if (upper.includes('COMMODITIES')) return 'commodity'
  if (upper.includes('ITEMS')) return 'item'
  if (upper.includes('VEHICLES')) return 'vehicle'
  const words = upper.split(' ').filter(w => w.length >= 6)
  for (const w of words) {
    if (levenshtein(w, 'COMMODITIES') <= 6) return 'commodity'
    if (levenshtein(w, 'VEHICLES') <= 3) return 'vehicle'
  }
  return 'unknown'
}
function isReasonableCandidate(text) {
  if (!text || text.length < 8) return false
  const words = text.split(' ').filter(w => w.length > 2)
  if (words.length < 2) return false
  const letters = (text.match(/[A-Z]/g) || []).length, numbers = (text.match(/[0-9]/g) || []).length
  return numbers <= letters
}
function extractPyroStationName(rawTexts) {
  const sources = Array.isArray(rawTexts) ? rawTexts : [rawTexts], INV = /YOUR\s*INVENTOR|JUR\s+INVENTOR|OUR\s+INVENTOR/i, SUB = /SELECT\s+SUB|ELECT\s+SUB/i, BL = /^(YOUR|SELECT|CHOOSE|IN.DEMAND|NO.DEMAND|CANNOT|INVENTORI)/
  for (const raw of sources) {
    if (!raw) continue
    const lines = raw.split(/\r?\n/), clean = lines.map(l => l.toUpperCase().replace(/[^A-Z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim())
    for (let i = 0; i < clean.length; i++) {
      if (INV.test(clean[i])) {
        for (let j = i + 1; j < Math.min(i + 5, clean.length); j++) {
          const cand = clean[j]; if (!cand || cand.length < 3 || SUB.test(cand) || BL.test(cand)) continue
          const wc = (cand.match(/[A-Z]/g) || []).length, tot = cand.replace(/\s/g, '').length, tkns = cand.split(/\s+/).filter(t => t.length > 0), long = tkns.filter(t => t.length >= 3)
          if (wc / Math.max(tot, 1) >= 0.5 && cand.length >= 5 && cand.length <= 40 && long.length >= 1 && long.length >= tkns.length * 0.40 && tkns.length <= 6) return cand
        }
      }
    }
  }
  return null
}
function extractNameFromHeader(line) {
  return line.replace(/[|'`\[\](){}'"\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s+[\d,]+\s+S[A-Z]{2,3}\b.*/i, '').trim().replace(/^[^A-Za-z]+/, '').replace(/^(?:[A-Za-z0-9%]{1,4}\s+)+(?=[A-Za-z]{4})/, '').trim().replace(/[^A-Za-z0-9\s\-']/g, ' ').replace(/\s+/g, ' ').trim()
}

// #endregion

// #region Commodity Sector Parsing

/** Extrae Sector A para Commodities usando perfiles
 */
async function extractCommoditiesSectorA(imageBuffer, profile, uiBounds = null, ocrMethod = 'win-ocr') {
  const { width, height } = await sharp(imageBuffer).metadata()
  console.log(`[OCR:Commodities:SectorA] Profile: ${profile.colorScheme} | Engine: ${ocrMethod}`)

  // Cropear usando perfil
  const tBuf = await cropCommoditiesTipo(imageBuffer, profile)
  await saveDebugImage(tBuf, '00-commodities-tipo.png')

  const nBuf = await cropCommoditiesTerminalName(imageBuffer, profile, uiBounds)
  await saveDebugImage(nBuf, '02-commodities-terminal.png')

  let rawT = '', rawS = '', stationName = null

  if (ocrMethod === 'win-ocr') {
    // Procesar tipo
    const mTipo = await sharp(tBuf).metadata()
    const tProc = await sharp(tBuf).resize({ width: mTipo.width * 2 }).grayscale().toBuffer()
    rawT = await runOCRPass(tProc, 6)
    console.log(`[OCR:Commodities:SectorA] Tipo: "${rawT.trim()}"`)

    // Procesar nombre
    const mNom = await sharp(nBuf).metadata()
    const nProc = await sharp(nBuf).resize({ width: mNom.width * 2 }).grayscale().toBuffer()
    rawS = await runOCRPass(nProc, 6)
    console.log(`[OCR:Commodities:SectorA] Terminal: "${rawS.trim()}"`)

    stationName = rawS.trim()
  } else {
    // Legacy Tesseract
    const tProc = await preprocessPass2(tBuf)
    rawT = await runOCRPass(tProc, 6)

    const nSoft = await preprocessNombreSoft(nBuf)
    rawS = await runOCRPass(nSoft, 6)
    stationName = rawS.trim()
  }

  return {
    type: 'commodity',
    stationName,
    rawTipo: rawT,
    rawNombre: rawS
  }
}

/** Extrae Sector B para Commodities usando perfiles
 */
async function extractCommoditiesSectorB(imageBuffer, profile, commodities = [], uiBounds = null, ocrMethod = 'win-ocr') {
  const { width, height } = await sharp(imageBuffer).metadata()

  // Detectar modo usando perfil
  const mode = await detectCommoditiesMode(imageBuffer, width, height, profile, uiBounds)
  console.log(`[OCR:Commodities:SectorB] Mode detected: ${mode}`)

  // Cropear tabs e items usando perfil
  const tabsBuf = await cropCommoditiesModeTabs(imageBuffer, profile, uiBounds)
  await saveDebugImage(tabsBuf, '10-commodities-tabs.png')

  const itemsBuf = await cropCommoditiesItems(imageBuffer, profile, uiBounds)
  await saveDebugImage(itemsBuf, '11-commodities-items.png')

  const deskewed = await deskewBuffer(itemsBuf)

  let rawText = ''
  let tessResult = null

  if (ocrMethod === 'win-ocr') {
    const m = await sharp(deskewed).metadata()
    const processed = await sharp(deskewed)
      .resize({ width: m.width * 2, kernel: 'lanczos3' })
      .grayscale()
      .normalize()
      .linear(1.8, -30)
      .toBuffer()
    await saveDebugImage(processed, '12-commodities-processed.png')

    const ocrResult = await runOCRFull(processed, 6)

    if (ocrResult.source === 'windows' && ocrResult.lines?.length > 0) {
      rawText = reconstructLines(ocrResult.lines, 25)
    } else {
      rawText = ocrResult.text
    }

    // Para orange: segunda pasada con Tesseract
    let tesseractPrices = []
    if (profile.colorScheme === 'orange') {
      tessResult = await runTesseractPass(processed, 6)
      tesseractPrices = extractPricesFromTesseract(tessResult.text || tessResult)
    }

    return {
      mode,
      items: parseSectorBItems(rawText, commodities, ocrMethod, tesseractPrices),
      rawItems: rawText
    }
  } else {
    // Legacy Tesseract
    const processed = profile.colorScheme === 'orange'
      ? await preprocessSectorB_orange(deskewed)
      : await preprocessSectorB_blue(deskewed)
    await saveDebugImage(processed, '12-commodities-processed.png')

    rawText = await runOCRPass(processed, 6)

    return {
      mode,
      items: parseSectorBItems(rawText, commodities, ocrMethod),
      rawItems: rawText
    }
  }
}

/** Obtiene el perfil de commodities según el color scheme
 */
function getCommoditiesProfile(colorScheme) {
  const profileKey = `commodities_${colorScheme}`
  const profile = UI_PROFILES[profileKey]

  if (!profile) {
    console.warn(`[Profile] Commodities profile "${profileKey}" not found, using orange fallback`)
    return UI_PROFILES['commodities_orange']
  }

  return profile
}

/** Agrupa líneas de Windows OCR que están a la misma altura (Y)
 * para reconstruir las filas de una tabla/grilla.
 */
function reconstructLines(lines, yThreshold = 25) {
  if (!lines || lines.length === 0) return ''

  // Extraer la Y real del primer word de cada línea
  const withY = lines.map(line => ({
    text: line.text,
    y: line.words?.[0]?.y ?? 0,
    x: line.words?.[0]?.x ?? 0,
  }))

  const sorted = [...withY].sort((a, b) => (a.y - b.y) || (a.x - b.x))

  const rows = []
  let currentRow = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (Math.abs(curr.y - prev.y) <= yThreshold) {
      currentRow.push(curr)
    } else {
      rows.push(currentRow)
      currentRow = [curr]
    }
  }
  rows.push(currentRow)

  return rows
    .map(row => row.sort((a, b) => a.x - b.x).map(l => l.text).join(' '))
    .join('\n')
}
function resolveStockStatus(text) {
  const up = text.toUpperCase(); for (const s of STOCK_STATUS_MAP) if (s.patterns.some(p => up.includes(p))) {
    console.log(`[OCR:Stock] Status match (exact): "${s.name}" from "${up}"`)
    return { code: s.code, name: s.name, short: s.short, abbr: s.abbr }
  }
  const words = up.replace(/[^A-Z\s]/g, '').trim().split(/\s+/).slice(0, 3).join(' ')
  let best = null, bestDist = Infinity; for (const s of STOCK_STATUS_MAP) { const d = levenshtein(words, s.short.toUpperCase()); if (d < bestDist) { bestDist = d; best = s } }
  if (best && bestDist <= 4) {
    console.log(`[OCR:Stock] Status match (fuzzy): "${best.name}" from "${up}" (Dist: ${bestDist})`)
    return { code: best.code, name: best.name, short: best.short, abbr: best.abbr }
  }
  return null
}
function parseSectorBItems(rawText, commodities = [], ocrMethod = 'tesseract', tesseractPrices = []) {
  console.log(`[OCR:SectorB:RAW]\n${rawText}\n[/OCR:SectorB:RAW]`)
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 3)
  const items = []
  let priceIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nextLine = i + 1 < lines.length ? lines[i + 1] : ''

    // Limpiar nombre quitando cantidad y texto de stock pegado
    const nameOnly = line
      .replace(/\s+\d+\s*SCU\b.*/i, '')
      .replace(/\s+(out|cue|oue|of|stock|seock)\b.*/i, '')
      .trim()

    const queryText = (nameOnly && nameOnly.length >= 3) ? nameOnly : line
    const match = fuzzyMatchCommodity(queryText, commodities)
      ?? fuzzyMatchCommodity(line.split(/\s+/).slice(0, 2).join(' '), commodities)
    if (!match) continue

    // Precio: WinOCR primero, luego línea siguiente, luego Tesseract fallback
    let price = parsePrice(line, ocrMethod)
    if (!price) price = parsePrice(nextLine, ocrMethod)
    if (!price && tesseractPrices.length > priceIndex) {
      price = tesseractPrices[priceIndex]
      console.log(`[OCR:SectorB] Price from Tesseract fallback: ${price}`)
    }
    priceIndex++

    // Stock quantity: buscar en línea actual y siguiente
    let quantity = parseStockQuantity(line)
    if (quantity === null) quantity = parseStockQuantity(nextLine)

    // Status: buscar en línea actual y siguiente
    let status = resolveStockStatus(line)
    if (!status) status = resolveStockStatus(nextLine)

    console.log(`[OCR:SectorB] Item: "${match.commodity.name}" | price: ${price ?? 'null'} | qty: ${quantity ?? 'null'} | status: ${status?.short ?? 'null'} | raw: "${line}"`)
    items.push({
      name: match.commodity.name,
      price,
      quantity,
      status,
      raw: line
    })
  }
  return items
}

function parseStockQuantity(line) {
  // Busca patrones como "0 SCU", "150 SCU", "1500 SCU"
  const m = line.match(/(?:^|[^0-9])(\d+)\s*SCU\b/i)
  if (m) {
    const val = parseInt(m[1])
    // Excluir valores que son claramente tamaños de cargo (1,2,4,8,16)
    if (![1, 2, 4, 8, 16].includes(val)) return val
  }
  return null
}

/** * Parses a commodity price from a Sector B OCR line.
 * * Key insight: with K suffix, the real pre-K number is at most 4 integer digits.
 * OCR inserts decimal digits as extra digits after a space. 
 * By only taking the FIRST part of the number before a space, we avoid junk.
 */
function parsePrice(line, ocrMethod = 'tesseract') {
  const cleanLine = line.replace(/[⌀øØ|!]/g, '').trim()

  const priceRegex = /(?:^|[^0-9])(\d+(?:[.,]\d+)?)\s*(k|m|aUEC)?\s*[/\\]\s*S[A-Z]{2,3}/gi
  const matches = [...cleanLine.matchAll(priceRegex)]

  if (matches.length > 0) {
    const bestMatch = matches.find(m => m[2]) || matches[matches.length - 1]
    const rawNum = bestMatch[1]
    const suffix = (bestMatch[2] || '').toLowerCase()
    const hasDecimal = rawNum.includes('.') || rawNum.includes(',')

    // Si el número ya tiene punto decimal, calcular directamente
    if (hasDecimal) {
      let value = parseFloat(rawNum.replace(',', '.'))
      if (suffix === 'k') value *= 1_000
      if (suffix === 'm') value *= 1_000_000
      if (value > 0.1 && value < 500_000) return Math.round(value * 100) / 100
    }

    // Sin punto decimal — Tesseract perdió el punto
    // Intentar insertar el punto en distintas posiciones hasta encontrar un valor en rango
    // Rango válido por sufijo:
    //   k → número antes del punto debe dar value*1000 <= 500,000 → intPart <= 500
    //   m → intPart <= 0.5
    //   sin sufijo → valor directo <= 500,000
    const maxValue = suffix === 'k' ? 500_000 : suffix === 'm' ? 500_000 : 500_000
    const maxSplit = suffix === 'k' ? 3 : suffix === 'm' ? 1 : 6

    for (let split = 1; split <= Math.min(maxSplit, rawNum.length - 1); split++) {
      const intPart = rawNum.slice(0, split)
      const decPart = rawNum.slice(split)
      if (!intPart || !decPart) continue
      let candidate = parseFloat(`${intPart}.${decPart}`)
      if (suffix === 'k') candidate *= 1_000
      if (suffix === 'm') candidate *= 1_000_000
      if (candidate >= 1 && candidate <= maxValue) {
        console.log(`[OCR:Price] Decimal recovery: "${rawNum}"${suffix} → ${intPart}.${decPart}${suffix} = ${Math.round(candidate * 100) / 100}`)
        return Math.round(candidate * 100) / 100
      }
    }

    // Si no encontramos split válido, intentar el valor directo
    let value = parseFloat(rawNum)
    if (suffix === 'k') value *= 1_000
    if (suffix === 'm') value *= 1_000_000
    if (value > 0.1 && value < 500_000) return Math.round(value * 100) / 100
  }

  // Fallback: número con sufijo k/m al final de línea (cuando /SCU está cortado)
  const fbMatch = cleanLine.match(/(?:^|[^0-9])(\d+(?:[.,]\d+)?)\s*(k|m)\s*$/i)
  if (fbMatch) {
    const rawNum = fbMatch[1]
    const suffix = (fbMatch[2] || '').toLowerCase()
    const hasDecimal = rawNum.includes('.') || rawNum.includes(',')

    if (hasDecimal) {
      let val = parseFloat(rawNum.replace(',', '.'))
      if (suffix === 'k') val *= 1_000
      if (suffix === 'm') val *= 1_000_000
      if (val > 1 && val < 500_000) return Math.round(val * 100) / 100
    }

    for (let split = 1; split <= Math.min(3, rawNum.length - 1); split++) {
      const intPart = rawNum.slice(0, split)
      const decPart = rawNum.slice(split)
      if (!intPart || !decPart) continue
      let candidate = parseFloat(`${intPart}.${decPart}`)
      if (suffix === 'k') candidate *= 1_000
      if (suffix === 'm') candidate *= 1_000_000
      if (candidate >= 1 && candidate <= 500_000) {
        console.log(`[OCR:Price] Decimal recovery fallback: "${rawNum}"${suffix} → ${intPart}.${decPart}${suffix} = ${Math.round(candidate * 100) / 100}`)
        return Math.round(candidate * 100) / 100
      }
    }
  }

  return null
}
function extractPricesFromTesseract(tessText) {
  // TEST DIRECTO
  const testLine = "Out of Stock B3307500076k/SCU"
  const testRegex = /(?:^|[^0-9])(\d+(?:[.,]\d+)?)\s*(k|m|aUEC)?\s*[/\\]\s*S[A-Z]{2,3}/gi
  const testMatches = [...testLine.matchAll(testRegex)]
  console.log(`[OCR:RegexTest] line: "${testLine}"`)
  console.log(`[OCR:RegexTest] matches: ${JSON.stringify(testMatches.map(m => ({ full: m[0], num: m[1], suf: m[2] })))}`)

  const prices = []
  for (const line of tessText.split('\n')) {
    const price = parsePrice(line, 'tesseract')
    if (price !== null && price > 100) {
      console.log(`[OCR:SectorB] Tesseract price extracted: ${price} from "${line.trim()}"`)
      prices.push(price)
    }
  }
  return prices
}

// #endregion

// #region Item Shop Parsing

/** Detects mode for Item Shops using relative brightness.
 */
/**
 * Detecta si el tab activo es BUY o SELL comparando brillo relativo.
 * @param {object} profile — perfil resuelto por getProfileForSubtype()
 */
async function detectItemShopMode(buffer, width, height, profile) {
  const buyBox = {
    left: Math.floor(width * profile.buyTab.left),
    top: Math.floor(height * profile.buyTab.top),
    width: Math.floor(width * profile.buyTab.width),
    height: Math.floor(height * profile.buyTab.height),
  }
  const sellBox = {
    left: Math.floor(width * profile.sellTab.left),
    top: Math.floor(height * profile.sellTab.top),
    width: Math.floor(width * profile.sellTab.width),
    height: Math.floor(height * profile.sellTab.height),
  }

  const getBrightness = async (box) => {
    const b = await sharp(buffer).extract(box).grayscale().stats()
    return b.channels[0].mean
  }

  const buyBri = await getBrightness(buyBox)
  const sellBri = await getBrightness(sellBox)
  const diff = Math.abs(buyBri - sellBri)
  const MIN_CONFIDENCE = 10.0

  console.log(`[OCR:ItemMode] BUY: ${buyBri.toFixed(1)}, SELL: ${sellBri.toFixed(1)}, Diff: ${diff.toFixed(1)}`)

  if (diff < MIN_CONFIDENCE) {
    console.log(`[OCR:ItemMode] Uncertain, returning NULL`)
    return null
  }

  return buyBri > sellBri ? 'BUY' : 'SELL'
}

async function preprocessItemPrice(buffer, subtype) {
  let pipeline = sharp(buffer).grayscale();

  if (subtype === 'teachs') {
    // Ajustes específicos para la fuente naranja/gris de Levski
    pipeline = pipeline
      .resize({ width: 1600 }) // Mayor upscale para mejorar separación de dígitos
      .modulate({ brightness: 1.15, contrast: 2.0 }) // Más contraste para el símbolo ⌀
      .sharpen({ sigma: 0.8, m1: 2, m2: 0 }) // Sharpen más agresivo en bordes
      .threshold(145); // Umbral más bajo para capturar el símbolo de moneda
  } else {
    pipeline = pipeline.threshold(128);
  }

  return await pipeline.toBuffer();
}

function detectItemShopSubtype(raw) {
  const up = raw.toUpperCase().replace(/[^A-Z0-9\s_]/g, ' ')

  // Stanton
  if (/CENTER\s*MASS/.test(up)) return 'center_mass'
  if (/CUBBY\s*BLAST/.test(up)) return 'cubby_blast'
  if (/CASABA/.test(up)) return 'casaba'
  if (/DUMPER/.test(up)) return 'dumpers_depot'
  if (/PHARMACY/.test(up)) return 'pharmacy'
  if (/OMEGA\s*PRO|Ω/.test(up)) return 'omega_pro'
  if (/PLATINUM\s*BAY/.test(up)) return 'platinum_bay'
  if (/LIVE\s*FIRE|WEAPONS/.test(up)) return 'weapons_shop'  // ✅ Detecta Live Fire
  if (/KEL[\s\-]?TO/.test(up)) return 'kel_to'  // ✅ Detecta Kel-To (con o sin espacio)
  if (/ARMOR/.test(up) && !/WEAPON/.test(up)) return 'armor_shop'
  if (/GARRITY/.test(up)) return 'garrity_defense'
  if (/CONSCIENTIOUS/.test(up)) return 'conscientious_objects'

  // Pyro
  if (/REFINERY\s*SHOP/.test(up)) return 'pyro_refinery_shop'
  if (/WEAPONS_SHOP|WEAPONS\s+SHOP/.test(up)) return 'pyro_weapon_shop'
  if (/MEDICAL_SHOP|MEDICAL\s+SHOP/.test(up)) return 'pyro_medical_shop'
  if (/SHOP_TERMINAL|SHOP\s+TERMINAL/.test(up)) return 'pyro_item_shop'

  // Legacy
  if (/TEACH|EACHS|DALLET|SWR\s*AS|ITEM\s*SHOP|TEACH\s*S/.test(up)) return 'teachs'
  if (/SKUTTERS/.test(up)) return 'skutters'

  return 'generic_item'
}

function fuzzyMatchItemTerminal(shopSubtype, destination, terminals) {
  if (!terminals?.length) return null; const company = SHOP_SUBTYPE_COMPANY[shopSubtype]; let subset = terminals.filter(t => t.type === 'item' || t.is_shop_fps)
  if (company) {
    const byComp = subset.filter(t => t.company_name && levenshtein(t.company_name.toUpperCase(), company.toUpperCase()) <= 2)
    if (byComp.length > 0) subset = byComp; else { subset = subset.filter(t => (t.name || '').toUpperCase().includes(company.toUpperCase().replace(/'/g, ''))) }
  }
  if (!destination || destination.length < 2) return subset.length === 1 ? { terminal: subset[0], similarity: 0.8 } : null
  const dc = destination.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim(); let best = null, bestS = -1
  for (const t of subset) {
    const cands = [t.city_name, t.displayname, t.space_station_name, t.outpost_name, t.nickname, t.name].filter(Boolean).map(s => s.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim())
    for (const cand of cands) {
      let sim = dc.includes(cand) && cand.length >= 4 ? 0.9 : (cand.includes(dc) && dc.length >= 4 ? 0.8 : (1 - levenshtein(dc, cand) / Math.max(dc.length, cand.length)))
      if (sim > bestS) { bestS = sim; best = t }
    }
  }
  if (best && bestS >= 0.50) {
    const same = subset.filter(t => [t.city_name, t.displayname, t.space_station_name, t.outpost_name].filter(Boolean).some(d => d.toUpperCase().includes(dc) || dc.includes(d.toUpperCase())))
    if (same.length > 1 && shopSubtype === 'teachs') { const itm = same.find(t => t.name.toUpperCase().includes('ITEM SHOP')); if (itm) return { terminal: itm, similarity: 0.95 } }
    return { terminal: best, similarity: bestS }
  }
  return null
}
function getP(l) {
  if (!l || typeof l !== 'string') return null;

  // Paso 1: Eliminar símbolos de moneda y basura inicial
  let normalized = l
    .replace(/^[^0-9A-Za-z]*/, '') // Eliminar prefijos corruptos
    .replace(/[⌀øØ¤₳ɑ@~\uFFFD\u0000-\u001F?]/g, '') // Símbolos de moneda y basura
    .trim();

  // Paso 2: Correcciones específicas de caracteres (orden importa)
  normalized = normalized
    // Letras que se confunden con dígitos en la fuente de Star Citizen
    .replace(/[mM]/g, '1')      // m → 1 (visto en "mx" que es "12")
    .replace(/[xX]/g, '2')      // x → 2 (visto en "mx" que es "12")
    .replace(/[B]/g, '8')       // B mayúscula → 8 (pero puede ser 4 si es seguido de otro B...)
    .replace(/[b]/g, '6')       // b minúscula → 6
    .replace(/[t]/g, '4')       // t → 4 (MUY común en esta fuente)
    .replace(/[T]/g, '4')       // T mayúscula → 4
    .replace(/[L]/g, '6')       // L → 6 (visto en "LtO" → "640")
    .replace(/[l]/g, '1')       // l → 1
    .replace(/[I]/g, '1')       // I → 1
    .replace(/[O]/g, '0')       // O → 0
    .replace(/[o]/g, '0')       // o → 0
    .replace(/[S]/g, '5')       // S → 5 (visto en "27S" → "275")
    .replace(/[s]/g, '5')       // s → 5
    .replace(/[G]/g, '9')       // G → 9
    .replace(/[Z]/g, '2')       // Z → 2
    .replace(/[z]/g, '2')       // z → 2
    .replace(/[A]/g, '4')       // A → 4 (visto en "94,5BO" donde 9 debería ser 4)
    .replace(/[n]/g, '1')       // n → 1
    .replace(/[r]/g, '1');      // r → 1

  // Paso 3: Manejar separadores de miles
  // En Star Citizen: "8,640" y "10.780" usan separador de miles (no decimal)

  // Caso A: número con coma como separador de miles (formato correcto)
  const commaMatch = normalized.match(/(\d{1,3}),(\d{3})\b/);
  if (commaMatch) {
    const val = parseInt(commaMatch[1] + commaMatch[2]);
    if (val >= 100 && val < 10000000) return val;
  }

  // Caso B: número con punto como separador de miles (OCR error común)
  const dotMatch = normalized.match(/(\d{1,3})\.(\d{3})\b/);
  if (dotMatch) {
    const val = parseInt(dotMatch[1] + dotMatch[2]);
    if (val >= 100 && val < 10000000) return val;
  }

  // Caso C: número con punto como separador pero sin \b (más permisivo)
  const looseDotMatch = normalized.match(/(\d{1,3})\.(\d{3})/);
  if (looseDotMatch) {
    const val = parseInt(looseDotMatch[1] + looseDotMatch[2]);
    if (val >= 100 && val < 10000000) return val;
  }

  // Paso 4: Fallback - extraer todos los dígitos consecutivos
  const digitsOnly = normalized.replace(/[^0-9]/g, '');
  if (digitsOnly.length >= 3 && digitsOnly.length <= 7) {
    const val = parseInt(digitsOnly);
    // Validación de rango realista para precios de items en SC
    if (val >= 100 && val < 10000000) return val;
  }

  // Paso 5: Último recurso - buscar cualquier secuencia de 3-7 dígitos
  const looseMatch = normalized.match(/(\d{3,7})/);
  if (looseMatch) {
    const val = parseInt(looseMatch[1]);
    if (val >= 100 && val < 10000000) return val;
  }

  return null;
}
// ----- getV: extrae el volumen de una línea "Volume: XXXXX µSCU" -----
const getV = (l) => {
  if (!l || typeof l !== 'string') return null;

  const normalized = l
    .replace(/[Oo]/g, '0')
    .replace(/[lLI]/g, '1')
    .replace(/[S]/g, '5')       // S → 5
    .replace(/[s]/g, '5')       // s → 5
    .replace(/[m]/g, '3')       // m → 3 (visto en "Volune2S2000")
    .replace(/[n]/g, '1')       // n → 1
    .replace(/[u]/g, 'µ')      // normalizar micro
    .replace(/[p]/g, 'µ')       // p → µ (confusión común en pSCU)
    .replace(/[r]/g, '1')       // r → 1
    .replace(/[t]/g, '4')       // t → 4
    .replace(/[B]/g, '8')       // B → 8
    .replace(/[b]/g, '6')       // b → 6
    .toLowerCase();

  // Patrón flexible para "volume" seguido de dígitos
  // Maneja: "volume: 84000", "volune: 89000", "vol: 300", etc.
  const m = normalized.match(/vol[uo0]?n?[ue]?[e.]?\s*[:\-]?\s*[a-z]?(\d[\d,]*)/i);
  if (!m) return null;

  // Limpiar comas y convertir
  const cleanNum = m[1].replace(/,/g, '');
  const v = parseInt(cleanNum);

  // Validar rango razonable para µSCU (1 - 10,000,000)
  return (!isNaN(v) && v > 0 && v < 10000000) ? v : null;
};
function parseItemShopColumn(rawText, colLabel, ocrSource = 'winocr', shopSubtype = 'generic') {
  // Separar secciones si viene de pipeline dual
  let namesSection = rawText;
  let pricesSection = rawText;

  if (rawText.includes('---PRICES---')) {
    const parts = rawText.split('---PRICES---');
    namesSection = parts[0];
    pricesSection = parts[1] || parts[0];
    ocrSource = 'dual';
  }

  const QB = /quick\s*buy|qu?ick\s*buy|ouick\s*buy|ijick\s*buy|uick\s*buy/i;
  const JUNK = /^(choose|search|item\s*name|all\s+cat|all\s+opt|subcate|wallet|gories|ategories|uptions|rch$|m\s*name|first|prior|last|next|\d+\/\d+)$/i;
  const PRICE_LINE = /^[\s⌀øØ¤₳ɑ@~\?\d\.,\s]*$/;

  const lines = namesSection.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  console.log(`[OCR:ItemShop:${colLabel}] Raw lines (${lines.length}):`);
  lines.forEach((l, i) => console.log(`  [${i}] "${l}"`));

  // ========== PRE-PROCESAMIENTO: UNIR LÍNEAS FRAGMENTADAS ==========
  // Buscar patrones como "10-SERIES" + "GREATSWORD CANNON" -> unir

  const mergedLines = [];
  let skipNext = false;

  for (let i = 0; i < lines.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const current = lines[i];
    const next = lines[i + 1];

    // Detectar si current es prefijo de un nombre (termina en número o guión)
    // y next es la continuación (empieza con letra mayúscula)
    const isPrefix = /(\d+|[\-'])$/.test(current) || // termina en número, guión o apóstrofe
      (current.length < 20 && /[A-Z\s\-']{3,}$/.test(current) && !current.includes(' '));

    const isContinuation = next &&
      /^[A-Z]/.test(next) && // empieza con mayúscula
      !JUNK.test(next) &&
      !QB.test(next) &&
      !/^volume/i.test(next) &&
      !PRICE_LINE.test(next);

    // Caso especial: "10-SERIES" + "GREATSWORD CANNON"
    const isModelNumber = /^\d+\-/.test(current) && next && /[A-Z]{4,}/.test(next);

    // Caso: nombre entrecomillado "'CHAOS'" + "III MISSILE"
    const isQuoted = current.includes("'") && !current.includes("MISSILE") &&
      next && next.includes("MISSILE");

    if ((isPrefix && isContinuation) || isModelNumber || isQuoted) {
      mergedLines.push(current + ' ' + next);
      skipNext = true;
      console.log(`[OCR:ItemShop:${colLabel}] Merged: "${current}" + "${next}" -> "${current} ${next}"`);
    } else {
      mergedLines.push(current);
    }
  }

  console.log(`[OCR:ItemShop:${colLabel}] Merged lines (${mergedLines.length}):`);
  mergedLines.forEach((l, i) => console.log(`  [M${i}] "${l}"`));

  // ========== HELPERS ==========
  const getV = (l) => {
    if (!l) return null;
    const normalized = l
      .replace(/[Oo]/g, '0')
      .replace(/[lLI]/g, '1')
      .replace(/[S]/g, '5')
      .replace(/[s]/g, '5')
      .replace(/[m]/g, '3')
      .replace(/[n]/g, '1')
      .replace(/[u]/g, 'µ')
      .replace(/[p]/g, 'µ')
      .replace(/[r]/g, '1')
      .replace(/[t]/g, '4')
      .replace(/[B]/g, '8')
      .replace(/[b]/g, '6')
      .toLowerCase();

    const m = normalized.match(/vol[uo0]?n?[ue]?[e.]?\s*[:\-]?\s*[a-z]?(\d[\d,\.]*)/i);
    if (!m) return null;

    const cleanNum = m[1].replace(/[,\.]/g, '');
    const v = parseInt(cleanNum);
    return (!isNaN(v) && v > 0 && v < 10000000) ? v : null;
  };

  const extractPriceFromLine = (line) => {
    if (!line || typeof line !== 'string') return null;

    let normalized = line
      .replace(/^[^0-9A-Za-z⌀]*/, '')
      .replace(/[⌀øØ¤₳ɑ@~\uFFFD\u0000-\u001F?]/g, '')
      .trim();

    normalized = normalized
      .replace(/[mM]/g, '1')
      .replace(/[xX]/g, '2')
      .replace(/[B]/g, '8')
      .replace(/[b]/g, '6')
      .replace(/[t]/g, '4')
      .replace(/[T]/g, '4')
      .replace(/[L]/g, '6')
      .replace(/[l]/g, '1')
      .replace(/[I]/g, '1')
      .replace(/[O]/g, '0')
      .replace(/[o]/g, '0')
      .replace(/[S]/g, '5')
      .replace(/[s]/g, '5')
      .replace(/[G]/g, '9')
      .replace(/[Z]/g, '2')
      .replace(/[z]/g, '2')
      .replace(/[A]/g, '4')
      .replace(/[n]/g, '1')
      .replace(/[r]/g, '1');

    const commaMatch = normalized.match(/(\d{1,3}),(\d{3})\b/);
    if (commaMatch) {
      const val = parseInt(commaMatch[1] + commaMatch[2]);
      if (val >= 100 && val < 10000000) return val;
    }

    const dotMatch = normalized.match(/(\d{1,3})\.(\d{3})\b/);
    if (dotMatch) {
      const val = parseInt(dotMatch[1] + dotMatch[2]);
      if (val >= 100 && val < 10000000) return val;
    }

    const digitsOnly = normalized.replace(/[^0-9]/g, '');
    if (digitsOnly.length >= 2 && digitsOnly.length <= 7) {
      const val = parseInt(digitsOnly);
      if (val >= 10 && val < 10000000) return val;
    }

    return null;
  };

  const getP = (l, preferTesseract = false) => {
    if (!l || typeof l !== 'string') return null;

    if (preferTesseract && ocrSource === 'dual') {
      const priceLines = pricesSection.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      for (const pl of priceLines) {
        if (/volume/i.test(pl)) continue;
        const p = extractPriceFromLine(pl);
        if (p && p >= 100) return p;
      }
    }

    return extractPriceFromLine(l);
  };

  // ========== DETECTAR ITEMS ==========
  const items = [];
  let i = 0;

  while (i < mergedLines.length) {
    const line = mergedLines[i];

    // Saltar UI noise
    if (JUNK.test(line) || QB.test(line) || PRICE_LINE.test(line)) {
      i++;
      continue;
    }

    // Detectar inicio de item: tiene letras significativas
    const alphaCount = (line.match(/[A-Za-z]/g) || []).length;
    if (alphaCount < 3) {
      i++;
      continue;
    }

    // Saltar líneas de volumen puras
    if (/^volume/i.test(line)) {
      i++;
      continue;
    }

    // ===== INICIO DE ITEM =====
    let name = line
      .replace(/volume.*$/i, '') // Quitar volumen si está en misma línea
      .replace(/[^A-Za-z0-9\s\-'()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    // Limpiar sufijos
    name = name.replace(/\s+(QUICK\s*BUY|FIRST|PRIOR|LAST|NEXT|BUY|SELL|\d+\/\d+)\s*$/i, '').trim();

    if (!name || name.length < 5 || JUNK.test(name)) {
      i++;
      continue;
    }

    // ===== BUSCAR VOLUMEN =====
    let volume = null;

    // En línea actual
    const volInLine = line.match(/volume[:\s]+(\d[\d,\.]*)/i);
    if (volInLine) {
      const cleanVol = volInLine[1].replace(/[,\.]/g, '');
      volume = parseInt(cleanVol);
    }

    // En siguiente línea
    if (!volume && i + 1 < mergedLines.length && /^volume/i.test(mergedLines[i + 1])) {
      volume = getV(mergedLines[i + 1]);
      i++; // Consumir
    }

    // ===== BUSCAR PRECIO =====
    let price = null;

    // Buscar en siguientes líneas (hasta 3)
    for (let k = 1; k <= 3 && (i + k) < mergedLines.length; k++) {
      const candidate = mergedLines[i + k];

      if (QB.test(candidate) || /^volume/i.test(candidate) || JUNK.test(candidate)) continue;

      const p = getP(candidate, true);
      if (p && p >= 100) {
        price = p;
        i += k; // Avanzar
        break;
      }
    }

    // Si no encontramos precio, buscar en Tesseract
    if (!price && ocrSource === 'dual') {
      const priceLines = pricesSection.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !/volume/i.test(l));

      for (const pl of priceLines) {
        const p = extractPriceFromLine(pl);
        if (p && p >= 100 && p < 500000) {
          price = p;
          break;
        }
      }
    }

    console.log(`[OCR:ItemShop:${colLabel}] Item: "${name}" | Vol: ${volume}, Price: ${price}`);
    items.push({ name, volumeUSCU: volume, price });

    i++;
  }

  return items;
}
function parseItemShopGrid(raw1, raw2, ocrSource = 'winocr', shopSubtype = 'generic') {
  const c1 = parseItemShopColumn(raw1, 'col1', ocrSource, shopSubtype);
  const c2 = parseItemShopColumn(raw2, 'col2', ocrSource, shopSubtype);
  const res = [];
  const max = Math.max(c1.length, c2.length);

  for (let i = 0; i < max; i++) {
    if (c1[i]) res.push(c1[i]);
    if (c2[i]) res.push(c2[i]);
  }

  // ========== DEDUPLICACIÓN INTELIGENTE ==========
  const seen = new Map();
  const unique = [];

  for (const item of res) {
    // Normalizar para comparación
    const normalizedName = item.name
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();

    // Clave compuesta: nombre + precio (si hay)
    const key = item.price ? `${normalizedName}_${item.price}` : normalizedName;

    if (!seen.has(key)) {
      seen.set(key, item);
      unique.push(item);
    } else {
      // Si ya existe, quedarnos con el que tenga más datos
      const existing = seen.get(key);
      const existingScore = (existing.price ? 1 : 0) + (existing.volumeUSCU ? 1 : 0);
      const newScore = (item.price ? 1 : 0) + (item.volumeUSCU ? 1 : 0);

      if (newScore > existingScore) {
        // Reemplazar con el más completo
        const idx = unique.indexOf(existing);
        unique[idx] = item;
        seen.set(key, item);
      }

      console.log(`[OCR:ItemShop] Duplicate removed/merged: "${item.name}"`);
    }
  }

  console.log(`[OCR:ItemShop] Total: ${res.length}, Unique: ${unique.length}`);
  return unique;
}
async function extractItemShop(buffer, colorScheme, triageTabText = '', uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()

  // ========== HEADER — se cropea con perfil genérico porque aún no sabemos el subtipo ==========
  const header = await cropItemShop_header(buffer)
  const hm = await sharp(header).metadata()
  console.log(`[OCR:ItemShop] Analyzing header... (Triage: "${triageTabText}")`)
  await saveDebugImage(header, '20-itemshop-header.png')

  // ========== HEADER OCR ==========
  const ocrH = async (p, label) => {
    const processedBuffer = await p(sharp(header).resize({ width: hm.width * 3 })).toBuffer()
    const rawText = await runOCRPass(processedBuffer, 6)
    console.log(`[OCR:ItemShop] Header Pass (${label}): "${rawText.trim().replace(/\n/g, ' \\ ')}"`)
    return rawText
  }

  const h1 = await ocrH(s => s.grayscale().normalize().sharpen(), 'normal')
  const h2 = await ocrH(s => s.grayscale().negate().normalize().threshold(130), 'negated')
  const h3 = await ocrH(s => s.grayscale().normalize().threshold(colorScheme === 'light' ? 160 : 100), 'threshold')
  const rawH = h1 + '\n' + h2 + '\n' + h3

  // ========== DETECTAR SUBTIPO ==========
  let shopSubtype = detectItemShopSubtype(triageTabText ? triageTabText + '\n' + rawH : rawH)

  if (shopSubtype === 'generic_item' || shopSubtype === 'unknown') {
    if (/center\s*mass|center\-mass/i.test(rawH) ||
      /area\s*18|area18/i.test(rawH) ||
      /center.*mass/i.test(triageTabText)) {
      shopSubtype = 'center_mass'
      console.log(`[OCR:ItemShop] Forced subtype: CENTER_MASS (detected in header)`)
    }
  }

  console.log(`[OCR:ItemShop] Final subtype: ${shopSubtype.toUpperCase()}`)

  // ========== RESOLVER PERFIL — única vez, se pasa a todo lo demás ==========
  const profile = getProfileForSubtype(shopSubtype)
  console.log(`[OCR:ItemShop] Profile resolved: colorScheme=${profile.colorScheme}`)

  // ========== DESTINATION ==========
  const destBuf = await cropItemShop_destination(buffer, profile)
  const dm = await sharp(destBuf).metadata()
  await saveDebugImage(destBuf, '21-itemshop-destination.png')
  const dProc = await sharp(destBuf).resize({ width: dm.width * 3 }).grayscale().normalize().sharpen().toBuffer()
  const rawD = await runOCRPass(dProc, 6)

  // ========== DESTINATION — extracción robusta ==========
  let destination = null

  // Método 1: regex de nombres de ubicaciones conocidas
  const destMatch = rawD.match(/(AREA\s*18|AREA18|NEW\s*BABBAGE|ORISON|LORVILLE|LEVSKI|GRIM\s*HEX|MIC\s*L1|ARC\s*L1)/i)
  if (destMatch) {
    destination = destMatch[1].replace(/\s+/g, ' ').trim().toUpperCase()
    console.log(`[OCR:ItemShop] Destination (regex): "${destination}"`)
  }

  // Método 2: dropdown con coordenadas del perfil
  if (!destination) {
    try {
      const p = profile.destination
      const ddBuf = await sharp(buffer).extract({
        left: Math.floor(width * p.left),
        top: Math.floor(height * p.top),
        width: Math.floor(width * p.width),
        height: Math.floor(height * p.height),
      }).toBuffer()
      await saveDebugImage(ddBuf, '22-itemshop-dropdown.png')

      const ddm = await sharp(ddBuf).metadata()
      const ddp = await sharp(ddBuf)
        .resize({ width: ddm.width * 4 })
        .grayscale()
        .normalize()
        .threshold(140)
        .toBuffer()

      let rdd = await runOCRPass(ddp, 7)
      let val = rdd.trim()
        .replace(/CHOOSE\s+DESTINATION/gi, '')
        .replace(/ALL\s+CATEGORIES/gi, '')
        .replace(/[^A-Za-z0-9\s\-]/g, ' ')
        .trim()

      if (val.length >= 3 && !/volume/i.test(val) && !/category/i.test(val)) {
        destination = val
        console.log(`[OCR:ItemShop] Dropdown Destination: "${destination}"`)
      }
    } catch (e) {
      console.warn(`[OCR:ItemShop] Dropdown failed: ${e.message}`)
    }
  }

  // Método 3: fallback desde líneas del header
  if (!destination) {
    const headerLines = rawH.split(/\r?\n/)
    for (const line of headerLines) {
      const clean = line.replace(/[^A-Za-z0-9\s\-]/g, ' ').trim()
      if (/^(AREA|NEW|ORISON|LORVILLE|LEVSKI)/i.test(clean) && clean.length < 30) {
        destination = clean
        console.log(`[OCR:ItemShop] Destination (header): "${destination}"`)
        break
      }
    }
  }

  // ========== MODE — usa coordenadas del perfil ==========
  const mode = await detectItemShopMode(buffer, width, height, profile)
  console.log(`[OCR:ItemShop] Processing Columns...`)

  // ========== COLUMNA 1 — crop desde perfil ==========
  const col1Buf = await cropItemShop_col1(buffer, profile)
  await saveDebugImage(col1Buf, '24-itemshop-col1-raw.png')
  const col1m = await sharp(col1Buf).metadata()

  const col1ProcNames = await sharp(col1Buf)
    .resize({ width: col1m.width * 3, kernel: 'lanczos3' })
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer()
  await saveDebugImage(col1ProcNames, '25-itemshop-col1-names.png')
  const raw1Names = await runOCRPass(col1ProcNames, 6)
  console.log(`[OCR:ItemShop:col1] WinOCR Names: "${raw1Names.trim().replace(/\n/g, ' \\ ')}"`)

  const col1ProcPrices = await sharp(col1Buf)
    .resize({ width: col1m.width * 4, kernel: 'lanczos3' })
    .grayscale()
    .normalize()
    .linear(2.5, -50)
    .threshold(135)
    .toBuffer()
  await saveDebugImage(col1ProcPrices, '25b-itemshop-col1-tesseract.png')
  const raw1Prices = await runTesseractPass(col1ProcPrices, 6)

  const raw1 = raw1Names + '\n---PRICES---\n' + (raw1Prices.text || raw1Prices)

  // ========== COLUMNA 2 — crop desde perfil ==========
  const col2Buf = await cropItemShop_col2(buffer, profile)
  await saveDebugImage(col2Buf, '26-itemshop-col2-raw.png')
  const col2m = await sharp(col2Buf).metadata()

  const col2ProcNames = await sharp(col2Buf)
    .resize({ width: col2m.width * 3, kernel: 'lanczos3' })
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer()
  await saveDebugImage(col2ProcNames, '27-itemshop-col2-names.png')
  const raw2Names = await runOCRPass(col2ProcNames, 6)
  console.log(`[OCR:ItemShop:col2] WinOCR Names: "${raw2Names.trim().replace(/\n/g, ' \\ ')}"`)

  const col2ProcPrices = await sharp(col2Buf)
    .resize({ width: col2m.width * 4, kernel: 'lanczos3' })
    .grayscale()
    .normalize()
    .linear(2.5, -50)
    .threshold(135)
    .toBuffer()
  await saveDebugImage(col2ProcPrices, '27b-itemshop-col2-tesseract.png')
  const raw2Prices = await runTesseractPass(col2ProcPrices, 6)

  const raw2 = raw2Names + '\n---PRICES---\n' + (raw2Prices.text || raw2Prices)

  // ========== PARSING ==========
  const items = parseItemShopGrid(raw1, raw2, 'dual', shopSubtype)
  console.log(`[OCR:ItemShop] Found ${items.length} unique items in grid`)

  return {
    shopSubtype,
    destination,
    mode,
    items,
    rawHeader: rawH,
    rawGrid: `[col1-winocr]\n${raw1Names}\n[col1-tesseract]\n${raw1Prices.text || raw1Prices}\n[col2-winocr]\n${raw2Names}\n[col2-tesseract]\n${raw2Prices.text || raw2Prices}`,
  }
}

// #endregion

// #region Vehicles

function parseVehicleList(rawText) {
  let namesSection = rawText;
  let pricesSection = rawText;
  const vehicles = [];

  if (rawText.includes('---PRICES---')) {
    const parts = rawText.split('---PRICES---');
    namesSection = parts[0];
    pricesSection = parts[1] || parts[0];
  }

  const lines = namesSection.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 3);
  const JUNK = /^(choose|search|vehicle\s*name|all\s+cat|uptions|next|\d+\/\d+)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (JUNK.test(line) || /^[\s⌀øØ¤₳ɑ@~\?\d\.,\s]*$/.test(line)) continue;

    // Limpiar nombre del vehículo (Ej: "AEGIS GLADIUS", "ANVIL CARRACK")
    let name = line
      .replace(/[^A-Za-z0-9\s\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    // Buscar precio en la misma línea
    let price = extractPriceFromVehicleLine(line);

    // Si no está en la misma línea, buscar en las siguientes 2
    if (!price) {
      for (let k = 1; k <= 2 && (i + k) < lines.length; k++) {
        const p = extractPriceFromVehicleLine(lines[i + k]);
        if (p && p > 1000) { // Las naves cuestan más de 1000 aUEC
          price = p;
          i += k; // Saltar las líneas ya consumidas
          break;
        }
      }
    }

    // Fallback al Tesseract si WinOCR falló
    if (!price) {
      const priceLines = pricesSection.split(/\r?\n/).map(l => l.trim());
      // Lógica similar para buscar el precio en la sección de Tesseract
    }

    if (name.length > 4) {
      console.log(`[OCR:Vehicle] Parsed: "${name}" | Price: ${price}`);
      vehicles.push({ name, price });
    }
  }

  return vehicles;
}

// Helper robusto para precios de naves (maneja millones)
function extractPriceFromVehicleLine(line) {
  let normalized = line.replace(/[^\d,\.]/g, '').trim();

  // Extraer secuencias de números que puedan incluir comas/puntos
  const match = normalized.match(/(\d{1,3}(?:[.,]\d{3})+)/);
  if (match) {
    const cleanNum = match[1].replace(/[.,]/g, '');
    const val = parseInt(cleanNum);
    // Rango realista para naves: de 10k a 50M aUEC
    if (val >= 10000 && val < 100000000) return val;
  }

  // Fallback a dígitos contiguos
  const digitsOnly = normalized.replace(/[^0-9]/g, '');
  if (digitsOnly.length >= 5 && digitsOnly.length <= 8) {
    return parseInt(digitsOnly);
  }
  return null;
}

/** Busca un vehículo en el caché comparando el nombre detectado por OCR.
 */
function fuzzyMatchVehicle(detectedName, vehicles) {
  if (!detectedName || detectedName.length < 3) return null
  
  const search = detectedName.toUpperCase().replace(/[^A-Z0-9]/g, '')
  let bestMatch = null
  let maxScore = 0

  for (const v of vehicles) {
    const target = v.name.toUpperCase().replace(/[^A-Z0-9]/g, '')
    
    // Coincidencia exacta post-normalización
    if (search === target) return v

    // Coincidencia parcial (Levenshtein simplificado o contenedores)
    if (target.includes(search) || search.includes(target)) {
      const score = Math.min(search.length, target.length) / Math.max(search.length, target.length)
      if (score > maxScore) {
        maxScore = score
        bestMatch = v
      }
    }
  }
  return maxScore > 0.7 ? bestMatch : null
}

function extractPriceRobust(line) {
  // Regex para capturar números con posibles separadores de miles
  const match = line.match(/(\d{1,3}(?:[.,\s]\d{3})+|\d{4,9})/);
  if (match) {
    const clean = match[0].replace(/[^\d]/g, '');
    const val = parseInt(clean);
    return (val > 100) ? val : null; // Si es muy bajo, sospechamos del OCR
  }
  return null;
}

async function extractVehicleTerminal(buffer, profile, triageTabText = '', uiBounds = null) {
  const start = Date.now()
  
  // 1. HEADER & TERMINAL IDENTIFICATION
  const headerBuf = await cropVehicleHeader(buffer, profile)
  // Guardamos para que verifiques si el logo sale en la imagen
  await saveDebugImage(headerBuf, '30-vehicle-header.png') 

  const headerProc = await sharp(headerBuf)
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer()

  const rawHeader = await runOCRPass(headerProc, 6)
  
  // A. Detectar subtipo (Asegúrate que detectVehicleShopSubtype acepte rawHeader)
  const shopSubtype = detectVehicleShopSubtype(rawHeader)
  console.log(`[OCR:Vehicle] Detected Subtype from Header: ${shopSubtype.toUpperCase()}`)

  // B. Obtener configuración del terminal
  const terminalConfig = VEHICLE_SUBTYPE_TO_TERMINAL[shopSubtype] || VEHICLE_SUBTYPE_TO_TERMINAL['generic_vehicle']
  
  // C. Buscar en caché
  const terminals = uexCache.get('terminals')?.data || uexCache.get('terminals') || []
  
  // Buscamos coincidencia parcial (ej: "Buy & Fly" en "Orison - Cloudview - Buy & Fly")
  const realTerminal = terminals.find(t => 
    t.name && t.name.toLowerCase().includes(terminalConfig.name.toLowerCase())
  )
  
  const id_terminal = realTerminal ? realTerminal.id : terminalConfig.id
  const terminalName = realTerminal ? realTerminal.name : terminalConfig.name

  // 2. TIPO (Buy vs Rent)
  const isRent = /RENT|ALQUILER/i.test(triageTabText + rawHeader)
  const type = isRent ? 'vehicle_rent' : 'vehicle_buy'
  const priceKey = isRent ? 'price_rent' : 'price_buy'

  // 3. PROCESAMIENTO DE LISTA (Detección de naves)
  const listBuf = await cropVehicleList(buffer, profile)
  await saveDebugImage(listBuf, '31-vehicle-list.png')

  const procNames = await sharp(listBuf).grayscale().normalize().toBuffer()
  const procPrices = await sharp(listBuf).grayscale().threshold(150).toBuffer()

  const [rawNames, rawPrices] = await Promise.all([
    runOCRPass(procNames, 6),
    runTesseractPass(procPrices, 6)
  ])

  const priceText = (rawPrices.text || rawPrices)
  const vehiclesCache = uexCache.get('vehicles') || []
  const prices = []
  const nameLines = rawNames.split('\n').map(l => l.trim()).filter(l => l.length > 3)

  for (let i = 0; i < nameLines.length; i++) {
    const line = nameLines[i]
    if (/MANUFACTURER|SELECT|VEHICLE|NAME|PRICE/i.test(line)) continue

    const vehicle = fuzzyMatchVehicle(line.replace(/[\d,.]/g, '').trim(), vehiclesCache)
    if (!vehicle) continue

    let finalPrice = null
    const match = line.match(/(\d{1,3}(?:[.,\s]\d{3})+|\d{4,9})/)
    if (match) finalPrice = parseInt(match[0].replace(/[^\d]/g, ''))

    prices.push({
      id_vehicle: vehicle.id,
      name_detected: vehicle.name,
      [priceKey]: finalPrice 
    })
  }

  // --- EL FIX DEL ERROR ESTÁ AQUÍ ---
  return {
    id_terminal,
    type,
    is_production: 0,
    prices,
    details: `Terminal: ${terminalName}. Subtype: ${shopSubtype}`,
    game_version: "4.0",
    rawText: `[HEADER]\n${rawHeader}\n[NAMES]\n${rawNames}`
  }
}

// #endregion

// #region Main OCR Process & Orchestration

async function extractSectorA(imageBuffer, colorScheme = 'blue', uiBounds = null, ocrMethod = 'tesseract') {
  const { width, height } = await sharp(imageBuffer).metadata(), { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  console.log(`[OCR:SectorA] Analyzing Sector A — scheme: ${colorScheme} | Engine: ${ocrMethod}`)

  const tBuf = await cropSectorA_tipo(imageBuffer, uiBounds, colorScheme)
  await saveDebugImage(tBuf, '00-tipo-raw.png')

  const nBuf = await cropSectorA_nombre(imageBuffer, colorScheme, uiBounds)
  await saveDebugImage(nBuf, '02-nombre-raw.png')

  let rawT = '', rawS = '', allLines = [], stationName = null, type = 'unknown';

  if (ocrMethod === 'win-ocr') {
    // --- FAST TRACK PARA WINDOWS OCR ---
    const mTipo = await sharp(tBuf).metadata();
    const tProc = await sharp(tBuf).resize({ width: mTipo.width * 2 }).grayscale().toBuffer();
    rawT = await runOCRPass(tProc, 6);
    type = detectTypeFromRaw(rawT);
    console.log(`[OCR:SectorA] WinOCR Fast Pass Tipo: ${type.toUpperCase()} (raw: "${rawT.trim().replace(/\n/g, ' ')}")`);

    const mNom = await sharp(nBuf).metadata();
    const nProc = await sharp(nBuf).resize({ width: mNom.width * 2 }).grayscale().toBuffer();
    rawS = await runOCRPass(nProc, 6);
    console.log(`[OCR:SectorA] WinOCR Fast Pass Nombre: "${rawS.trim().replace(/\n/g, ' ')}"`);

    allLines = extractValidLines(rawS, 'win-ocr-pass');
    stationName = allLines.find(isReasonableCandidate) || allLines[0] || null;

  } else {
    // --- LEGACY TRACK PARA TESSERACT ---
    const tProc = await preprocessPass2(tBuf)
    rawT = await runOCRPass(tProc, 6)
    type = detectTypeFromRaw(rawT)
    console.log(`[OCR:SectorA] Type: ${type.toUpperCase()} (raw: "${rawT.trim().replace(/\n/g, ' ')}")`)

    const nSoft = await preprocessNombreSoft(nBuf)
    rawS = await runOCRPass(nSoft, 6)

    const nThresh = await preprocessPass1(nBuf)
    const rawA = await runOCRPass(nThresh, 6)

    const nNeg = await preprocessPass2(nBuf)
    const rawB = await runOCRPass(nNeg, 6)
    console.log(`[OCR:SectorA] Pass-Negate: "${rawB.trim().replace(/\n/g, ' ')}"`)

    // R-Channel exclusivo de Tesseract
    let rawRB = ''
    if (colorScheme === 'orange') {
      try {
        const { data, info } = await sharp(nBuf).raw().toBuffer({ resolveWithObject: true })
        const ch = info.channels
        const rOnly = Buffer.allocUnsafe(info.width * info.height)
        for (let i = 0; i < rOnly.length; i++) rOnly[i] = data[i * ch]
        const rInv = Buffer.allocUnsafe(info.width * info.height)
        for (let i = 0; i < rOnly.length; i++) rInv[i] = 255 - rOnly[i]

        const makeRBuf = async (src, label) => {
          const buf = await sharp(src, { raw: { width: info.width, height: info.height, channels: 1 } })
            .resize({ width: info.width * 3, kernel: 'lanczos3' })
            .normalize()
            .sharpen({ sigma: 1.5 })
            .png()
            .toBuffer()
          await saveDebugImage(buf, `06-nombre-rchannel-${label}.png`)
          return buf
        }

        const rNormBuf = await makeRBuf(rOnly, 'normal')
        const rInvBuf = await makeRBuf(rInv, 'inverted')

        const runOCR = async (buf, label) => {
          const r = await runOCRPass(buf, 6)
          console.log(`[OCR:SectorA] R-channel (${label}): "${r.trim().replace(/\n/g, ' ')}"`)
          return r
        }

        const rawRC = await runOCR(rNormBuf, 'normal')
        const rawRCInv = await runOCR(rInvBuf, 'inverted')
        rawRB = rawRC + '\n' + rawRCInv
      } catch (e) {
        console.warn(`[OCR:SectorA] R-channel pass failed: ${e.message}`)
      }
    }

    let orangeStationName = null
    if (colorScheme === 'orange') {
      const BL = /^(YOUR|SELECT|CHOOSE|IN\s*DEMAND|NO\s*DEMAND|CANNOT|INVENTORI|IN DEMANO|NO DEMANO)/
      const dropdownFromRaw = (raw, label) => {
        const lines = raw.split(/\r?\n/)
          .map(l => l.replace(/[^A-Za-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase())
          .filter(l => {
            if (l.length < 5) return false
            if (BL.test(l)) return false
            const words = l.split(/\s+/).filter(w => w.length >= 3)
            return words.length >= 2
          })
          .sort((a, b) => b.length - a.length)
        const best = lines[0] || null
        if (best) console.log(`[OCR:SectorA] Dropdown candidate (${label}): "${best}"`)
        return best
      }

      orangeStationName = dropdownFromRaw(rawRB, 'R-channel')
      if (!orangeStationName) orangeStationName = dropdownFromRaw(rawA, 'threshold')
      if (!orangeStationName) orangeStationName = dropdownFromRaw(rawS, 'soft')
      if (!orangeStationName) orangeStationName = dropdownFromRaw(rawB, 'negate')

      if (orangeStationName) {
        rawRB += `\nYOUR INVENTORIES\n${orangeStationName}\nSELECT SUB-CATEGORY\n`
        console.log(`[OCR:SectorA] ✅ Orange station name: "${orangeStationName}"`)
      }
    }

    // Unificamos líneas solo para Tesseract, sobreescribiendo el let de arriba sin usar const
    allLines = [...new Set([
      ...extractValidLines(rawS, 'soft'),
      ...extractValidLines(rawA, 'threshold'),
      ...extractValidLines(rawB, 'negate'),
      ...(rawRB ? extractValidLines(rawRB, 'RB') : []),
    ])]
    console.log(`[OCR:SectorA] All valid lines (${allLines.length}): ${JSON.stringify(allLines)}`)

    stationName = allLines.find(isReasonableCandidate) || allLines[0] || null

    if (colorScheme === 'orange' && orangeStationName) {
      stationName = orangeStationName
      console.log(`[OCR:SectorA] Orange station name (R-channel): "${stationName}"`)
    } else if (colorScheme !== 'orange') {
      const pName = extractPyroStationName([rawRB, rawS, rawA, rawB].filter(Boolean))
      if (pName) {
        stationName = pName
        console.log(`[OCR:SectorA] Pyro anchor override: "${stationName}"`)
      }
    }
  } // <--- AQUI CERRAMOS CORRECTAMENTE EL ELSE DE TESSERACT

  // --- LIMPIEZA FINAL COMPARTIDA (WinOCR y Tesseract) ---
  if (stationName) {
    const original = stationName
    for (const noise of NOMBRE_NOISE_TOKENS) stationName = stationName.replace(noise, '').trim()
    if (stationName !== original) console.log(`[OCR:SectorA] Noise cleanup: "${original}" => "${stationName}"`)
  }

  console.log(`[OCR:SectorA] Final station name: "${stationName}"`)
  return { type, stationName, validLines: allLines, rawTipo: rawT, rawNombre: rawS }
}

async function extractSectorB(imageBuffer, colorScheme, commodities = [], uiBounds = null, ocrMethod = 'tesseract') {
  const { width, height } = await sharp(imageBuffer).metadata()
  const mode = await detectModeByBrightness(imageBuffer, width, height, uiBounds)

  const tabs = await cropSectorB_tabs(imageBuffer, uiBounds)
  await saveDebugImage(tabs, '10-tabs.png')

  const itemsCrop = await cropSectorB_items(imageBuffer, uiBounds)
  await saveDebugImage(itemsCrop, '11-items-raw.png')

  const deskewed = await deskewBuffer(itemsCrop)

  let rawText
  let tessResult = null

  if (ocrMethod === 'win-ocr') {
    const m = await sharp(deskewed).metadata()
    const processed = await sharp(deskewed)
      .resize({ width: m.width * 2, kernel: 'lanczos3' })
      .grayscale()
      .normalize()
      .linear(1.8, -30)
      .toBuffer()
    await saveDebugImage(processed, '12-items-processed.png')

    const ocrResult = await runOCRFull(processed, 6)
    console.log(`[OCR:SectorB] WinOCR raw lines: ${ocrResult.lines?.length ?? 0} | source: ${ocrResult.source}`)
    ocrResult.lines?.forEach((l, i) => {
      const y = l.words?.[0]?.y ?? '?'
      const x = l.words?.[0]?.x ?? '?'
      console.log(`  [${i}] x:${x} y:${y} → "${l.text}"`)
    })

    if (ocrResult.source === 'windows' && ocrResult.lines?.length > 0) {
      rawText = reconstructLines(ocrResult.lines, 25)
      console.log(`[OCR:SectorB] Reconstructed ${ocrResult.lines.length} positioned lines into grid text`)
    } else {
      rawText = ocrResult.text
      console.warn(`[OCR:SectorB] WinOCR returned no positioned lines — using flat text fallback`)
    }

    // Para orange: segunda pasada con Tesseract para rescatar precios
    let tesseractPrices = []
    if (colorScheme === 'orange') {
      console.log(`[OCR:SectorB] Running Tesseract price pass for orange scheme...`)
      tessResult = await runTesseractPass(processed, 6)
      console.log(`[OCR:SectorB:TESS_RAW] type:${typeof tessResult} keys:${Object.keys(tessResult).join(',')}`)
      console.log(`[OCR:SectorB:TESS_RAW]\n${tessResult.text ?? tessResult}\n[/OCR:SectorB:TESS_RAW]`)
      tesseractPrices = extractPricesFromTesseract(tessResult.text ?? tessResult)
      console.log(`[OCR:SectorB] Tesseract prices found: ${JSON.stringify(tesseractPrices)}`)
    }

    // Comparación WinOCR vs Tesseract para precios
    if (tessResult) {
      console.log(`[OCR:SectorB:COMPARE] ── Precio WinOCR vs Tesseract ──`)
      const winLines = rawText.split('\n').filter(l => l.trim().length > 3)
      const tessLines = (tessResult.text ?? '').split('\n').filter(l => l.trim().length > 3)
      const winPrices = winLines.map(l => ({ raw: l.trim(), price: parsePrice(l, 'win-ocr') })).filter(l => l.price !== null)
      const tessPrices = tessLines.map(l => ({ raw: l.trim(), price: parsePrice(l, 'tesseract') })).filter(l => l.price !== null)
      console.log(`[OCR:SectorB:COMPARE] WinOCR prices (${winPrices.length}):`)
      winPrices.forEach(p => console.log(`  → ${p.price} | raw: "${p.raw}"`))
      console.log(`[OCR:SectorB:COMPARE] Tesseract prices (${tessPrices.length}):`)
      tessPrices.forEach(p => console.log(`  → ${p.price} | raw: "${p.raw}"`))
    }

    return { mode, items: parseSectorBItems(rawText, commodities, ocrMethod, tesseractPrices), rawItems: rawText }

  } else {
    const processed = colorScheme === 'orange'
      ? await preprocessSectorB_orange(deskewed)
      : await preprocessSectorB_blue(deskewed)
    await saveDebugImage(processed, '12-items-processed.png')
    rawText = await runOCRPass(processed, 6)
  }

  return { mode, items: parseSectorBItems(rawText, commodities, ocrMethod), rawItems: rawText }
}

async function processOCR({ base64, ocrMethod = 'tesseract' }) {
  const start = Date.now()
  console.log(`--- START OCR PROCESS (${ocrMethod.toUpperCase()}) ---`)

  try {
    const buffer = Buffer.from(base64, 'base64')
    const { width, height } = await sharp(buffer).metadata()
    
    // 1. Detecciones iniciales de UI (TU LÓGICA)
    const uiBounds = await detectUIBounds(buffer, width, height)
    const colorScheme = await detectUIColorScheme(buffer, width, height, uiBounds.uiTop)

    // 2. Extraer Sector A
    const { type, stationName, validLines, rawTipo, rawNombre } = 
      await extractSectorA(buffer, colorScheme, uiBounds, ocrMethod)

    // 3. Resolución de TIPO basada en keywords (TU LÓGICA)
    let resolvedType = type
    let triageTab = ''
    const rawTipoUpper = (rawTipo || "").toUpperCase()
    
    // MEJORA: Añadimos "ALL MANUFACTURERS" que es lo que leyó tu OCR en el fallo
    const isVehicleTerminal = /VEHICLE|SHIP|MANUFACTURER|PASSENGER|RENTAL|ASTRO|FLY|ALL MANUFACTURERS/i.test(rawTipoUpper)

    if (isVehicleTerminal) {
      resolvedType = 'vehicle'
      console.log(`[OCR] Forced type to VEHICLE due to keywords: "${rawTipo}"`)
    } else if (/ITEM|EQUIPMENT|WEAPON|ARMOR/i.test(rawTipoUpper)) {
      resolvedType = 'item'
      console.log(`[OCR] Forced type to ITEM due to keywords: "${rawTipo}"`)
    }

    // Triage si es unknown (TU LÓGICA ORIGINAL intacta)
    if (resolvedType === 'unknown') {
      console.log('[OCR] Type unknown, performing triage...')
      try {
        if (colorScheme === 'orange') {
          if (!/YOUR\s*INVENTOR|IN\s*DEMAND|NO\s*DEMAND/i.test((rawNombre || '').toUpperCase())) {
            resolvedType = 'item'
            console.log('[OCR:Triage] Orange scheme + no inventory header => ITEM shop')
          }
        } else {
          // Lógica de recorte de pestañas que ya tenías
          const tabX = Math.floor(width * 0.716), tabW = Math.floor(width * 0.230), 
                tabY = uiBounds.uiTop + Math.floor(uiBounds.uiHeight * 0.135), 
                tabH = Math.floor(uiBounds.uiHeight * 0.055)
          const crop = await sharp(buffer).extract({ left: tabX, top: tabY, width: tabW, height: tabH }).toBuffer()
          const scale = Math.min(4, Math.floor(800 / tabW))
          
          const tryT = async (p, label) => {
            const pr = await p(sharp(crop).resize({ width: tabW * scale })).toBuffer()
            const res = await runOCRPass(pr, 7)
            const cleaned = res.trim().toUpperCase().replace(/[^A-Z\s]/g, '').trim()
            console.log(`[OCR:Triage] Pass (${label}): "${cleaned}"`)
            return cleaned
          }
          
          let txt = await tryT(s => s.grayscale().normalize().threshold(140), 'normal')
          if (txt && txt.length >= 3 && !/\b(BUY|SELL|RENT|LOCAL|MARKET)\b/.test(txt)) {
            resolvedType = 'item'
            triageTab = txt
            console.log(`[OCR:Triage] Detected ITEM tab text: "${txt}"`)
          }
        }
      } catch (e) {
        console.warn(`[OCR:Triage] Triage failed: ${e.message}`)
      }
    }

    // Si después de todo sigue unknown, asumimos commodity
    if (resolvedType === 'unknown') resolvedType = 'commodity'

    // Preparar cachés
    const terminals = uexCache.get('terminals')?.data || uexCache.get('terminals') || []
    const commodities = uexCache.get('commodities')?.data || uexCache.get('commodities') || []
    const cachedItems = uexCache.get('items') || []

    // ========== FLUJO A: COMMODITIES ==========
    if (resolvedType === 'commodity') {
      console.log('[OCR] Routing to COMMODITIES processing...')
      const profile = getCommoditiesProfile(colorScheme)
      
      // Imagen de debug para commodities
      if (IS_DEV) {
          const bCrop = await extractSectorB(buffer, colorScheme, commodities, uiBounds, ocrMethod, true) // flag para solo crop
          await saveDebugImage(bCrop.buffer, 'c-11-items-raw.png')
      }

      const { stationName: commStationName, rawTipo: cTipo, rawNombre: cNombre } =
        await extractCommoditiesSectorA(buffer, profile, uiBounds, ocrMethod)

      const { mode, items: rawItems, rawItems: rawItemsText } =
        await extractCommoditiesSectorB(buffer, profile, commodities, uiBounds, ocrMethod)

      let bestMatch = null
      for (const line of [commStationName, stationName, ...validLines].filter(isReasonableCandidate)) {
        const m = fuzzyMatchTerminal(line, terminals)
        if (m?.similarity >= 0.65 && (!bestMatch || m.similarity > bestMatch.similarity)) bestMatch = m
      }

      return {
        success: true, type: 'commodity', mode,
        stationName: bestMatch?.terminal.name || commStationName || null,
        items: rawItems, terminalId: bestMatch?.terminal.id || null,
        rawText: `[TIPO]\n${cTipo}\n[NOMBRE]\n${cNombre}\n[ITEMS]\n${rawItemsText}`
      }
    }

    // ========== FLUJO B: VEHICULOS (Aquí estaba el error) ==========
    if (resolvedType === 'vehicle') {
      console.log('[OCR] Routing to VEHICLE processing...')
      const profile = UI_PROFILES.vehicles_default
      
      if (IS_DEV) {
        // CORRECCIÓN: Usar funciones de crop específicas de vehículos
        const headerCrop = await cropVehicleHeader(buffer, profile)
        await saveDebugImage(headerCrop, 'v-30-header.png')
        const listCrop = await cropVehicleList(buffer, profile)
        await saveDebugImage(listCrop, 'v-31-list.png')
      }

      const result = await extractVehicleTerminal(buffer, profile, rawTipo, uiBounds)
      return { success: true, type: 'vehicle', payload: result }
    }

    // ========== FLUJO C: ITEMS ==========
    if (resolvedType === 'item') {
      console.log('[OCR] Routing to ITEM SHOP processing...')
      const { shopSubtype, destination, mode, items, rawHeader, rawGrid } = 
        await extractItemShop(buffer, colorScheme, triageTab, uiBounds)
      
      let dest = destination
      if (!dest || /choose|destination|ee|null/i.test(dest)) {
        dest = validLines.find(l => /^(AREA|ARC|MIC|CRU|HUR|GRI|ORI)/i.test(l)) || validLines[0]
      }

      const match = fuzzyMatchItemTerminal(shopSubtype, dest, terminals)
      const resTerminal = match?.terminal || null
      const resItems = resolveItemNames(items, cachedItems)

      // Imagen de debug para items
      if (IS_DEV) {
         // Aquí podrías guardar el rawGrid si lo tuvieras en buffer
         console.log('[OCR:Debug] Item shop processed')
      }

      return { 
        success: true, type: 'item', shopSubtype, mode, 
        stationName: resTerminal?.name || null, items: resItems, 
        terminalId: resTerminal?.id || null,
        rawText: `[TIPO]\n${rawTipo}\n[HEADER]\n${rawHeader}\n[GRID]\n${rawGrid}` 
      }
    }

  } catch (err) {
    console.error('[OCR] CRITICAL ERROR:', err)
    return { success: false, error: err.message }
  }
}

// #endregion

module.exports = { processOCR, extractItemShop }