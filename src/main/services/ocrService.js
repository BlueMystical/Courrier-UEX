// src/main/services/ocrService.js

const { app } = (() => { try { return require('electron') } catch { return {} } })()
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')
const uexCache = require('../helpers/uexCache')

const TMP_DIR = os.tmpdir()

const SECTOR_A_BLACKLIST = [
  'YOUR INVENTORIES',
  'YOUR INVENTORIE',
  'YOUR INVENTOR',
  'IN DEMAND',
  'IN DEMANO',
  'NO DEMAND',
  'NO DEMANO',
  'CANNOT SELL',
  'CANNO SELL',
  'SELECT SUB-CATEGORY',
  'SELECT SUB CATEGORY',
  'SELECT SUB',
  'COMMODITIES',
  'ITEMS',
  'VEHICLES',
  // Item shop UI navigation labels — present in orange/Pyro UI
  'CHOOSE DESTINATION',
  'CHOOSE CATEGORY',
  'CHOOSE SUBCATEGORY',
  'CHOOSE SUB-DESTINATION',
  'CHOOSE SUB DESTINATION',
  'ALL OPTIONS',
  'ALL CATEGORIES',
  'SUBCATEGORY',
  'ITEM NAME',
]

const NOMBRE_NOISE_TOKENS = [
  / VV\s*$/,
  / V\s*$/,
  / IP\s*$/,
  / [A-Z]{1,2}\s*$/,
  /^\s*\|\s*/,
  /\s*\|\s*$/,
]

const MIN_LINE_LENGTH = 5

// ─────────────────────────────────────────────
// Stock statuses — aligned with UEX API /commodities_status
// ─────────────────────────────────────────────
const STOCK_STATUS_MAP = [
  {
    code: 1, name: 'Out of Stock (Empty)', short: 'Out Stock', abbr: 'OS',
    patterns: ['OUT OF STOCK', 'OUT OF STOC', 'OUT STOCK', 'OUT OF STECK', 'OUT OF STEK', 'OUT OF STUCK']
  },
  {
    code: 2, name: 'Very Low Inventory', short: 'Very Low', abbr: 'VL',
    patterns: ['VERY LOW']
  },
  {
    code: 3, name: 'Low Inventory', short: 'Low', abbr: 'LO',
    patterns: ['LOW INV', 'LOW']
  },
  {
    code: 4, name: 'Medium Inventory', short: 'Medium', abbr: 'ME',
    patterns: ['MEDIUM', 'NEDIUN', 'MEDIUN', 'NEDIUM']
  },
  {
    code: 5, name: 'High Inventory', short: 'High', abbr: 'HI',
    patterns: ['HIGH INV', 'HIGH']
  },
  {
    code: 6, name: 'Very High Inventory', short: 'Very High', abbr: 'VH',
    patterns: ['VERY HIGH']
  },
  {
    code: 7, name: 'Maximum Inventory (Full)', short: 'Maximum', abbr: 'MA',
    patterns: ['MAXIMUM', 'MAX INV', 'MAK INV', 'MAX INV']
  },
]

// ──────── TESSERACT OCR ─────────────────────────────────────
// ── Tesseract paths ─────────────────────────
function getTesseractPath() {
  const defaultPath = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
  if (require('fs').existsSync(defaultPath)) return defaultPath
  return 'tesseract'
}

function getTessdataPath() {
  const { app } = require('electron')
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tessdata')
  }
  // En dev: __dirname = src/main/services/ → subir 3 niveles llega a la raíz
  const candidates = [
    path.join(__dirname, '../../../tessdata'),  // ✅ src/main/services → raíz
    path.join(app.getAppPath(), 'tessdata'),    // ✅ Electron siempre resuelve la raíz
    path.join(__dirname, '../../tessdata'),     // fallback anterior
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'eng.traineddata'))) {
      console.log(`[getTessdataPath] ✅ tessdata en: ${candidate}`)
      return candidate
    }
  }
  console.warn(`[getTessdataPath] ⚠️  eng.traineddata no encontrado en:`, candidates)
  return candidates[0]
}

const TESSERACT_PATH = getTesseractPath()

function runTesseract(imagePath, psm = 6) {
  const tessdataPath = getTessdataPath()

  console.log(`[Tesseract] bin: ${TESSERACT_PATH}`)
  console.log(`[Tesseract] tessdata: ${tessdataPath}`)
  console.log(`[Tesseract] imagen: ${imagePath} (psm:${psm})`)

  return new Promise((resolve, reject) => {
    execFile(
      TESSERACT_PATH,
      [imagePath, 'stdout', '-l', 'eng', '--psm', String(psm), '--tessdata-dir', tessdataPath],
      (error, stdout) => {
        if (error) { console.error('[Tesseract] ERROR:', error.message); return reject(error) }
        console.log(`[Tesseract] OK. Caracteres leídos: ${stdout.length}`)
        console.log(`[Tesseract] Raw output:\n${stdout}`)
        resolve(stdout)
      }
    )
  })
}

// ─────────────────────────────────────────────
// Levenshtein + fuzzy match
// ─────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function fuzzyMatchTerminal(ocrText, terminals) {
  if (!ocrText || !terminals?.length) return null
  const query = ocrText.toUpperCase().trim()
  console.log(`[fuzzyMatch] Buscando coincidencia para: "${query}"`)
  console.log(`[fuzzyMatch] Total terminales disponibles: ${terminals.length}`)

  let bestMatch = null, bestScore = Infinity, bestSimilarity = 0
  for (const terminal of terminals) {
    const candidates = [
      terminal.nickname, terminal.displayname,
      terminal.space_station_name, terminal.name,
    ].filter(Boolean).map(s => s.toUpperCase().trim())
    for (const name of candidates) {
      const dist = levenshtein(query, name)
      const maxLen = Math.max(query.length, name.length)
      const similarity = maxLen > 0 ? 1 - dist / maxLen : 0
      if (dist < bestScore) { bestScore = dist; bestMatch = terminal; bestSimilarity = similarity }
    }
  }
  console.log(`[fuzzyMatch] Mejor match: "${bestMatch?.name}" (similarity: ${(bestSimilarity * 100).toFixed(1)}% dist:${bestScore})`)
  if (bestSimilarity < 0.65) { console.log(`[fuzzyMatch] ⚠️  Similitud muy baja, descartando`); return null }
  return { terminal: bestMatch, similarity: bestSimilarity }
}

function fuzzyMatchCommodity(ocrName, commodities) {
  if (!ocrName || !commodities?.length) return null
  const query = ocrName.toUpperCase().trim()
  if (query.length < 2) return null
  let bestMatch = null, bestScore = Infinity, bestSimilarity = 0
  for (const commodity of commodities) {
    const candidates = [commodity.name, commodity.name_short, commodity.code]
      .filter(Boolean).map(s => s.toUpperCase().trim())
    for (const name of candidates) {
      const dist = levenshtein(query, name)
      const maxLen = Math.max(query.length, name.length)
      const similarity = maxLen > 0 ? 1 - dist / maxLen : 0
      if (dist < bestScore) { bestScore = dist; bestMatch = commodity; bestSimilarity = similarity }
    }
  }
  if (bestSimilarity < 0.55) return null
  return { commodity: bestMatch, similarity: bestSimilarity }
}

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
  const pct = (bestSimilarity * 100).toFixed(1)
  if (bestSimilarity >= 0.65) {
    console.log(`[fuzzyMatchItemName] ✅ "${query}" → "${bestMatch.name}" (${pct}% dist:${bestScore})`)
    return { item: bestMatch, similarity: bestSimilarity }
  }
  console.log(`[fuzzyMatchItemName] ⚠️  "${query}" → best:"${bestMatch?.name}" (${pct}%) — below threshold`)
  return null
}

function resolveItemNames(gridItems, cachedItems) {
  if (!cachedItems?.length) {
    console.log('[resolveItemNames] ⚠️  Cache empty — itemCacheService has not synced yet')
    return gridItems.map(it => ({ ...it, id_resolved: null, name_resolved: null, category: null, section: null, matchSimilarity: 0 }))
  }
  console.log(`\n[resolveItemNames] Resolving ${gridItems.length} items against ${cachedItems.length} cached`)
  const result = []
  for (const item of gridItems) {
    console.log(`[resolveItemNames] Matching: "${item.name}"`)
    const match = fuzzyMatchItemName(item.name, cachedItems)
    if (match) {
      result.push({
        ...match.item,
        price: item.price,
        matchSimilarity: match.similarity,
        ocr_name: item.name,
        volumeUSCU: item.volumeUSCU
      })
    } else {
      result.push({
        ...item,
        id_resolved: null, name_resolved: null,
        category: null, section: null, matchSimilarity: 0
      })
    }
  }
  const resolved = result.filter(i => i.id != null).length
  console.log(`[resolveItemNames] ✅ ${resolved}/${result.length} resolved\n`)
  return result
}

function isReasonableCandidate(text) {
  if (!text || text.length < 8) return false
  const words = text.split(' ').filter(w => w.length > 2)
  if (words.length < 2) return false
  const letters = (text.match(/[A-Z]/g) || []).length
  const numbers = (text.match(/[0-9]/g) || []).length
  return numbers <= letters
}

// ─────────────────────────────────────────────
// Debug helpers
// FIX 4: En PROD las imágenes van a carpeta temporal, no al Desktop
// ─────────────────────────────────────────────
const IS_DEV = !app?.isPackaged
const DEBUG_SAVE_IMAGES = IS_DEV
const DEBUG_DIR = IS_DEV
  ? path.join(os.homedir(), 'Desktop', 'ocr-debug')   // dev → Desktop (fácil de ver)
  : path.join(os.tmpdir(), 'sc-courrier-ocr-debug')   // prod → carpeta temporal

async function ensureDebugDir() {
  if (!DEBUG_SAVE_IMAGES) return
  try {
    // Limpiar carpeta al inicio de cada proceso para evitar confusión con imágenes anteriores
    await fs.promises.rm(DEBUG_DIR, { recursive: true, force: true })
    await fs.promises.mkdir(DEBUG_DIR, { recursive: true })
    console.log(`[DEBUG] Carpeta limpiada y recreada: ${DEBUG_DIR}`)
  } catch (e) { }
}

async function saveDebugImage(buffer, name) {
  if (!DEBUG_SAVE_IMAGES) return
  const filepath = path.join(DEBUG_DIR, name)
  await fs.promises.writeFile(filepath, buffer)
  console.log(`[DEBUG] 🖼️  Imagen guardada: ${filepath}`)
}

// ─────────────────────────────────────────────
// UI Bounds Detection
// ─────────────────────────────────────────────
async function detectUIBounds(buffer, width, height) {
  const stripX = Math.floor(width * 0.15)
  const stripW = Math.floor(width * 0.10)
  const raw = await sharp(buffer)
    .extract({ left: stripX, top: 0, width: stripW, height })
    .grayscale()
    .raw()
    .toBuffer()

  const rowBrightness = []
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = 0; x < stripW; x++) sum += raw[y * stripW + x]
    rowBrightness.push(sum / stripW)
  }

  const DARK_THRESHOLD = 60
  const MIN_DARK_ROWS = 40

  let uiTop = 0, uiBottom = height - 1

  for (let y = 0; y < height - MIN_DARK_ROWS; y++) {
    if (rowBrightness[y] < DARK_THRESHOLD) {
      let darkCount = 0
      for (let dy = 0; dy < MIN_DARK_ROWS; dy++) {
        if (rowBrightness[y + dy] < DARK_THRESHOLD + 20) darkCount++
      }
      if (darkCount >= MIN_DARK_ROWS * 0.7) {
        uiTop = y
        break
      }
    }
  }

  for (let y = height - 1; y > uiTop + MIN_DARK_ROWS; y--) {
    if (rowBrightness[y] < DARK_THRESHOLD) {
      uiBottom = y
      break
    }
  }

  const uiHeight = uiBottom - uiTop
  console.log(`[detectUIBounds] uiTop:${uiTop} uiBottom:${uiBottom} uiHeight:${uiHeight} (${((uiHeight / height) * 100).toFixed(1)}% of frame)`)

  if (uiHeight < height * 0.5) {
    console.log(`[detectUIBounds] ⚠️  Detected region too small — falling back to full image`)
    return { uiTop: 0, uiBottom: height - 1, uiHeight: height }
  }

  return { uiTop, uiBottom, uiHeight }
}

// ─────────────────────────────────────────────
// Color scheme detection
// ─────────────────────────────────────────────
async function detectUIColorScheme(buffer, width, height, uiTop = null) {
  const top = uiTop !== null ? uiTop + Math.floor((height - (uiTop ?? 0)) * 0.10) : Math.floor(height * 0.15)
  const x = Math.floor(width * 0.10), y = top
  const w = Math.floor(width * 0.35), h = Math.floor(height * 0.35)
  const safeH = Math.min(h, height - y)
  if (safeH < 10) return 'dark'
  const raw = await sharp(buffer).extract({ left: x, top: y, width: w, height: safeH }).raw().toBuffer()
  const meta = await sharp(buffer).metadata()
  const channels = meta.channels ?? 3
  let rSum = 0, gSum = 0, bSum = 0, count = 0
  for (let i = 0; i < raw.length; i += channels) {
    rSum += raw[i]; gSum += raw[i + 1]; bSum += raw[i + 2]; count++
  }
  const avgR = rSum / count, avgG = gSum / count, avgB = bSum / count
  const avgBrightness = (avgR + avgG + avgB) / 3
  const rgRatio = avgR / Math.max(avgG, 1)

  let scheme
  if (avgBrightness > 140) {
    scheme = 'light'
  } else if (rgRatio > 1.4) {
    scheme = 'orange'
  } else if (avgB > avgR + 10 && avgB > avgG + 5) {
    scheme = 'blue'
  } else {
    scheme = 'dark'
  }

  console.log(`[detectUIColorScheme] RGB=(${avgR.toFixed(0)},${avgG.toFixed(0)},${avgB.toFixed(0)}) brightness:${avgBrightness.toFixed(0)} ratio:${rgRatio.toFixed(2)} → ${scheme}`)
  return scheme
}

// ─────────────────────────────────────────────
// Sector A crops — all relative to uiBounds
// ─────────────────────────────────────────────
async function cropSectorA_tipo(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const left = Math.floor(width * 0.03)
  const top = uiTop + Math.floor(uiHeight * 0.03)
  const cropWidth = Math.floor(width * 0.40)
  const cropHeight = Math.floor(uiHeight * 0.09)
  console.log(`[cropSectorA_tipo] ${width}x${height}px uiTop:${uiTop} → left:${left} top:${top} w:${cropWidth} h:${cropHeight}`)
  return await sharp(buffer).extract({ left, top, width: cropWidth, height: cropHeight }).toBuffer()
}

async function cropSectorA_nombre(buffer, colorScheme = 'blue', uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const topByScheme = { dark: 0.12, blue: 0.17, orange: 0.15, light: 0.17 }
  const heightByScheme = { dark: 0.20, blue: 0.20, orange: 0.22, light: 0.20 }
  const topPct = topByScheme[colorScheme] ?? 0.17
  const heightPct = heightByScheme[colorScheme] ?? 0.20
  const left = Math.floor(width * 0.05)
  const top = uiTop + Math.floor(uiHeight * topPct)
  const cropWidth = Math.floor(width * 0.42)
  const cropHeight = Math.floor(uiHeight * heightPct)
  console.log(`[cropSectorA_nombre] colorScheme:${colorScheme} top:${(topPct * 100).toFixed(0)}% uiTop:${uiTop} → left:${left} top:${top} w:${cropWidth} h:${cropHeight}`)
  return await sharp(buffer).extract({ left, top, width: cropWidth, height: cropHeight }).toBuffer()
}

// ─────────────────────────────────────────────
// Sector B crops — all relative to uiBounds
// ─────────────────────────────────────────────
async function cropSectorB_tabs(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const left = Math.floor(width * 0.64)
  const top = uiTop + Math.floor(uiHeight * 0.13)
  const cropWidth = Math.floor(width * 0.36)
  const cropHeight = Math.floor(uiHeight * 0.12)
  console.log(`[cropSectorB_tabs] uiTop:${uiTop} → left:${left} top:${top} w:${cropWidth} h:${cropHeight}`)
  return await sharp(buffer).extract({ left, top, width: cropWidth, height: cropHeight }).toBuffer()
}

async function cropSectorB_items(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const left = Math.floor(width * 0.69)
  const top = uiTop + Math.floor(uiHeight * 0.22)
  const cropWidth = Math.floor(width * 0.31)
  const cropHeight = Math.floor(uiHeight * 0.75)
  console.log(`[cropSectorB_items] uiTop:${uiTop} → left:${left} top:${top} w:${cropWidth} h:${cropHeight}`)
  return await sharp(buffer).extract({ left, top, width: cropWidth, height: cropHeight }).toBuffer()
}

// ─────────────────────────────────────────────
// Preprocessing — Sector A
// ─────────────────────────────────────────────
async function preprocessNombreSoft(buffer) {
  console.log('[preprocessNombreSoft] resize 3x → grayscale → normalize → sharpen')
  const meta = await sharp(buffer).metadata()
  return await sharp(buffer).resize({ width: meta.width * 3, kernel: 'lanczos3' }).grayscale().normalize().sharpen().toBuffer()
}

async function preprocessPass1(buffer) {
  console.log('[preprocessPass1] resize 3x → grayscale → normalize → threshold(100) → sharpen')
  const meta = await sharp(buffer).metadata()
  return await sharp(buffer).resize({ width: meta.width * 3, kernel: 'lanczos3' }).grayscale().normalize().threshold(100).sharpen().toBuffer()
}

async function preprocessPass2(buffer) {
  console.log('[preprocessPass2] resize 3x → grayscale → negate → normalize → sharpen')
  const meta = await sharp(buffer).metadata()
  return await sharp(buffer).resize({ width: meta.width * 3, kernel: 'lanczos3' }).grayscale().negate().normalize().sharpen().toBuffer()
}

// ─────────────────────────────────────────────
// Preprocessing — Sector B
// ─────────────────────────────────────────────
async function preprocessSectorB_orange(buffer) {
  const meta = await sharp(buffer).metadata()
  console.log('[preprocessSectorB_orange] 3x → grayscale → normalize → sharpen')
  return await sharp(buffer).resize({ width: meta.width * 3, kernel: 'lanczos3' }).grayscale().normalize().sharpen({ sigma: 1.5 }).toBuffer()
}

async function preprocessSectorB_blue(buffer) {
  const meta = await sharp(buffer).metadata()
  console.log('[preprocessSectorB_blue] 3x → grayscale → normalize → sharpen')
  return await sharp(buffer).resize({ width: meta.width * 3, kernel: 'lanczos3' }).grayscale().normalize().sharpen({ sigma: 1.5 }).toBuffer()
}

// ─────────────────────────────────────────────
// Text helpers — Sector A
// ─────────────────────────────────────────────
function cleanLine(line) {
  return line.toUpperCase().replace(/[^A-Z0-9\-\s]/g, '').replace(/\s+/g, ' ').trim()
}

function isBlacklisted(line) {
  const match = SECTOR_A_BLACKLIST.some(b => line.includes(b))
  if (match) console.log(`[isBlacklisted] ❌ Descartada: "${line}"`)
  return match
}

function extractValidLines(rawText, label) {
  console.log(`\n[extractValidLines:${label}] Procesando texto...`)
  const rawLines = rawText.split(/\r?\n/)
  console.log(`[extractValidLines:${label}] Total líneas raw: ${rawLines.length}`)
  rawLines.forEach((l, i) => console.log(`  [raw ${i}] ${JSON.stringify(l)}`))
  const valid = []
  for (const line of rawLines) {
    const cleaned = cleanLine(line)
    if (!cleaned || cleaned.length < MIN_LINE_LENGTH) continue
    if (isBlacklisted(cleaned)) continue
    console.log(`  → ✅ Aceptada: "${cleaned}"`)
    valid.push(cleaned)
  }
  console.log(`[extractValidLines:${label}] Líneas válidas (${valid.length}):`, valid)
  return valid
}

function detectTypeFromRaw(rawText) {
  const upper = rawText.toUpperCase().replace(/[^A-Z]/g, ' ').replace(/\s+/g, ' ')
  console.log(`[detectTypeFromRaw] Buscando keywords...`)

  if (upper.includes('COMMODITIES')) { console.log(`[detectTypeFromRaw] ✅ commodity`); return 'commodity' }
  if (upper.includes('ITEMS')) { console.log(`[detectTypeFromRaw] ✅ item`); return 'item' }
  if (upper.includes('VEHICLES')) { console.log(`[detectTypeFromRaw] ✅ vehicle`); return 'vehicle' }

  // FIX: umbral ampliado a 5 y mínimo de chars bajado a 6
  // "riMMONDTTTEC" (12 chars) → dist 5 de "COMMODITIES" — antes se descartaba con umbral 3
  const words = upper.split(' ').filter(w => w.length >= 6)
  for (const w of words) {
    const d = levenshtein(w, 'COMMODITIES')
    if (d <= 6) { console.log(`[detectTypeFromRaw] ✅ commodity (fuzzy "${w}" dist:${d})`); return 'commodity' }
    const dv = levenshtein(w, 'VEHICLES')
    if (dv <= 3) { console.log(`[detectTypeFromRaw] ✅ vehicle (fuzzy "${w}" dist:${dv})`); return 'vehicle' }
  }

  console.log(`[detectTypeFromRaw] ⚠️  unknown`)
  return 'unknown'
}

// ─────────────────────────────────────────────
// Item shop subtype detection
// ─────────────────────────────────────────────
function detectItemShopSubtype(rawHeaderText) {
  const up = rawHeaderText.toUpperCase().replace(/[^A-Z0-9\s_]/g, ' ').replace(/\s+/g, ' ')
  console.log(`[detectItemShopSubtype] OCR header: "${up.slice(0, 120)}"`)

  if (/CENTER\s*MASS/.test(up)) return 'center_mass'
  if (/CUBBY\s*BLAST/.test(up)) return 'cubby_blast'
  if (/CASABA/.test(up)) return 'casaba'
  if (/REFINERY\s*SHOP/.test(up)) return 'refinery_shop'
  // Teach's: logo rojo estilizado → OCR corrompe a variantes como
  // "TEACH", "EACHS", "DALLET", "SWR AS" (S=T, W=E, R=A, A=C, S=H)
  if (/TEACH|EACHS|DALLET|SWR\s*AS/.test(up)) return 'teachs'
  if (/PHARMACY/.test(up)) return 'pharmacy'
  if (/WEAPONS[\s_]*SHOP/.test(up)) return 'weapons_shop'
  if (/\bARMOR\b/.test(up)) return 'armor_shop'
  if (/SKUTTERS/.test(up)) return 'skutters'
  if (/DUMPER/.test(up)) return 'dumpers_depot'
  if (/PLATINUM/.test(up)) return 'platinum_bay'
  if (/GARRITY/.test(up)) return 'garrity_defense'
  if (/CONSCIENTIOUS/.test(up)) return 'conscientious_objects'
  return 'generic_item'
}

const SHOP_SUBTYPE_COMPANY = {
  center_mass: 'Center Mass',
  cubby_blast: 'Cubby Blast',
  casaba: 'Casaba Outlet',
  refinery_shop: 'Refinery Shop',
  teachs: "Teach's",
  pharmacy: 'Pharmacy',
  weapons_shop: 'Weapons Shop',
  armor_shop: 'Armor Shop',
  skutters: 'Skutters',
  dumpers_depot: "Dumper's Depot",
  platinum_bay: 'Platinum Bay',
  garrity_defense: 'Garrity Defense',
  conscientious_objects: 'Conscientious Objects',
}

function fuzzyMatchItemTerminal(shopSubtype, destination, terminals) {
  console.log(`[fuzzyMatchItem] shopSubtype:"${shopSubtype}" destination:"${destination}"`)
  if (!terminals?.length) return null

  const companyName = SHOP_SUBTYPE_COMPANY[shopSubtype]

  let subset = terminals.filter(t => t.type === 'item' || t.is_shop_fps)
  if (companyName) {
    const byCompany = subset.filter(t =>
      t.company_name && levenshtein(t.company_name.toUpperCase(), companyName.toUpperCase()) <= 2
    )
    console.log(`[fuzzyMatchItem] Filtrado por company "${companyName}": ${byCompany.length} terminales`)
    if (byCompany.length > 0) subset = byCompany
    // FIX: si company_name no matchea, intentar por nombre de terminal
    // (ej: "Teach's" puede estar en t.name como "Teach's - Levski")
    else {
      const byName = terminals.filter(t => {
        const name = (t.name || '').toUpperCase()
        return levenshtein(name.slice(0, companyName.length + 3), companyName.toUpperCase()) <= 3 ||
               name.includes(companyName.toUpperCase().replace(/'/g, ''))
      })
      console.log(`[fuzzyMatchItem] Fallback por nombre "${companyName}": ${byName.length} terminales`)
      if (byName.length > 0) subset = byName
    }
  }

  if (!destination || destination.length < 2) {
    if (subset.length === 1) {
      console.log(`[fuzzyMatchItem] ✅ único match: "${subset[0].name}"`)
      return { terminal: subset[0], similarity: 0.8 }
    }
    console.log(`[fuzzyMatchItem] ⚠️  sin destination, ${subset.length} candidatos → no resuelto`)
    return null
  }

  const destClean = destination.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim()
  let bestMatch = null, bestScore = -1

  for (const t of subset) {
    const candidates = [
      t.city_name, t.displayname, t.space_station_name,
      t.outpost_name, t.nickname, t.name
    ].filter(Boolean).map(s => s.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim())

    for (const cand of candidates) {
      const dist = levenshtein(destClean, cand)
      const maxLen = Math.max(destClean.length, cand.length)
      const sim = maxLen > 0 ? 1 - dist / maxLen : 0
      if (sim > bestScore) { bestScore = sim; bestMatch = t }
    }
  }

  if (bestMatch && bestScore >= 0.55) {
    console.log(`[fuzzyMatchItem] ✅ "${bestMatch.name}" (dest sim:${(bestScore*100).toFixed(1)}%)`)
    return { terminal: bestMatch, similarity: bestScore }
  }

  console.log(`[fuzzyMatchItem] ⚠️  mejor match "${bestMatch?.name}" sim:${(bestScore*100).toFixed(1)}% < umbral 55%`)
  return null
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Mode detection by tab brightness — versión robusta sin coordenadas fijas
// Escanea dinámicamente la franja de tabs del panel derecho para encontrar
// cuál de los dos tabs (Buy / Local Market Value) está activo.
// En vez de hardcodear coordenadas, busca el pico de brillo en toda la franja.
// ─────────────────────────────────────────────
async function detectModeByBrightness(buffer, width, height, uiBounds = null) {
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }

  // La franja de tabs está en ~17-22% de la altura del panel, en el tercio derecho
  // Tabs están en la parte baja del header: ~21-25% de la altura del panel
  const tabY = uiTop + Math.floor(uiHeight * 0.210)
  const tabH = Math.floor(uiHeight * 0.040)
  // El panel derecho ocupa aprox x=0.64-1.0 del frame
  const panelX = Math.floor(width * 0.640)
  const panelW = width - panelX

  // Leer la franja completa de tabs como raw grayscale
  const tabStrip = await sharp(buffer)
    .extract({ left: panelX, top: tabY, width: panelW, height: tabH })
    .grayscale().raw().toBuffer()
  await saveDebugImage(
    await sharp(buffer).extract({ left: panelX, top: tabY, width: panelW, height: tabH }).toBuffer(),
    '10-sectorB-tabs-raw.png'
  )

  // Calcular brightness promedio por columna
  const colBrightness = new Float32Array(panelW)
  for (let x = 0; x < panelW; x++) {
    let sum = 0
    for (let y = 0; y < tabH; y++) sum += tabStrip[y * panelW + x]
    colBrightness[x] = sum / tabH
  }

  // Suavizar con ventana de 20px para encontrar zonas brillantes
  const smoothed = new Float32Array(panelW)
  const WIN = 20
  for (let x = 0; x < panelW; x++) {
    let s = 0, cnt = 0
    for (let dx = -WIN; dx <= WIN; dx++) {
      const xi = x + dx
      if (xi >= 0 && xi < panelW) { s += colBrightness[xi]; cnt++ }
    }
    smoothed[x] = s / cnt
  }

  // Encontrar el máximo de brillo → esa es la zona del tab activo
  let maxBrightness = 0, maxCol = 0
  for (let x = 0; x < panelW; x++) {
    if (smoothed[x] > maxBrightness) { maxBrightness = smoothed[x]; maxCol = x }
  }

  // El tab activo cubre ±15% del panel alrededor del pico
  const tabZoneW = Math.max(80, Math.floor(panelW * 0.15))
  const activeX = panelX + Math.max(0, maxCol - tabZoneW)
  const activeW = Math.min(tabZoneW * 2, width - activeX)

  // ¿El pico está en la mitad izquierda (Buy ~0-30%) o derecha (Local Market Value ~30-70%)?
  const peakPct = maxCol / panelW
  console.log(`[detectModeByBrightness] peak col:${maxCol}/${panelW} (${(peakPct * 100).toFixed(1)}%) brightness:${maxBrightness.toFixed(1)}`)

  // OCR sobre la zona del tab activo
  const tabCrop = await sharp(buffer)
    .extract({ left: activeX, top: tabY, width: activeW, height: tabH })
    .toBuffer()
  await saveDebugImage(tabCrop, '11a-tab-activo-zone.png')

  const scale = Math.min(4, Math.floor(800 / activeW))
  const tryOCR = async (pipeline, suffix) => {
    const proc = await pipeline(sharp(tabCrop).resize({ width: activeW * scale, kernel: 'lanczos3' })).toBuffer()
    await saveDebugImage(proc, `11b-tab-activo-${suffix}.png`)
    const tmp = path.join(TMP_DIR, `ocr-tab-active-${suffix}-${Date.now()}.png`)
    await fs.promises.writeFile(tmp, proc)
    const text = await runTesseract(tmp, 7)
    await fs.promises.unlink(tmp)
    const clean = text.trim().toUpperCase().replace(/[^A-Z\s]/g, '').trim()
    console.log(`[detectModeByBrightness:ocr:${suffix}] "${clean}"`)
    return clean
  }

  let activeText = await tryOCR(s => s.grayscale().normalize().threshold(140), 'thr')
  if (!/BUY|SELL|LOCAL|MARKET|RENT/.test(activeText))
    activeText = await tryOCR(s => s.grayscale().negate().normalize().threshold(130), 'neg')
  if (!/BUY|SELL|LOCAL|MARKET|RENT/.test(activeText))
    activeText = await tryOCR(s => s.grayscale().normalize().sharpen({ sigma: 3, m1: 0, m2: 6 }), 'shrp')

  console.log(`[detectModeByBrightness] activeText:"${activeText}"`)

  if (activeText.includes('SELL')) return 'sell'
  if (activeText.includes('LOCAL')) return 'sell'   // "Local Market Value" tab = modo venta
  if (activeText.includes('MARKET')) return 'sell'
  if (activeText.includes('RENT')) return 'rent'
  if (activeText.includes('BUY')) return 'buy'

  // Fallback por posición: Buy es siempre el primer tab (~0-30% del panel),
  // Local Market Value / Sell es siempre el segundo (~30%+).
  const fallback = peakPct > 0.30 ? 'sell' : 'buy'
  console.log(`[detectModeByBrightness] ⚠️  OCR sin resultado → fallback por posición: "${fallback}" (peak ${(peakPct * 100).toFixed(1)}%)`)
  return fallback
}

// ─────────────────────────────────────────────
// FIX 2: Deskew — detecta y corrige inclinación de la imagen
// Usa proyección horizontal para encontrar el ángulo que maximiza
// la varianza entre filas (texto alineado = filas con picos claros).
// ─────────────────────────────────────────────
async function deskewBuffer(buffer, maxAngleDeg = 12, stepDeg = 1.0) {
  const meta = await sharp(buffer).metadata()
  const w = meta.width, h = meta.height

  // Trabajar en escala reducida para velocidad
  const scale = Math.min(1, 400 / w)
  const sw = Math.round(w * scale), sh = Math.round(h * scale)

  const gray = await sharp(buffer)
    .resize(sw, sh, { kernel: 'lanczos3' })
    .grayscale()
    .threshold(100)
    .raw()
    .toBuffer()

  let bestAngle = 0, bestScore = -1

  for (let deg = -maxAngleDeg; deg <= maxAngleDeg; deg += stepDeg) {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    const cx = sw / 2, cy = sh / 2

    const rowSums = new Float32Array(sh).fill(0)
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const srcX = Math.round((x - cx) * cos + (y - cy) * sin + cx)
        const srcY = Math.round(-(x - cx) * sin + (y - cy) * cos + cy)
        if (srcX >= 0 && srcX < sw && srcY >= 0 && srcY < sh) {
          rowSums[y] += gray[srcY * sw + srcX] > 128 ? 1 : 0
        }
      }
    }
    const mean = rowSums.reduce((a, b) => a + b, 0) / sh
    const variance = rowSums.reduce((a, v) => a + (v - mean) ** 2, 0) / sh
    if (variance > bestScore) { bestScore = variance; bestAngle = deg }
  }

  if (Math.abs(bestAngle) < 0.5) {
    console.log(`[deskew] ángulo: ${bestAngle}° — sin corrección necesaria`)
    return buffer
  }

  console.log(`[deskew] ✅ Corrigiendo ${bestAngle}° (score:${bestScore.toFixed(1)})`)
  return await sharp(buffer)
    .rotate(-bestAngle, { background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .toBuffer()
}

// ─────────────────────────────────────────────
// Sector B — Price parser
// ─────────────────────────────────────────────
function parsePrice(text) {
  let s = text.replace(/[¤₤£€$¥]/g, '')

  // Patrón original: requiere /SCU explícito — seguro contra falsos positivos
  const pricePattern = /([0-9][0-9.,]*)([KkMm]?)\/\s*S[A-Z]/gi
  const allMatches = [...s.matchAll(pricePattern)]
  if (allMatches.length === 0) return null

  for (const match of allMatches) {
    let rawNum = match[1]
    const mult = match[2].toUpperCase()

    rawNum = rawNum.replace(/,/g, '.')
    const parts = rawNum.split('.')
    let value = parts.length > 2
      ? parseFloat(parts[0] + '.' + parts.slice(1).join(''))
      : parseFloat(rawNum)
    if (isNaN(value)) continue

    if (mult === 'K') value *= 1_000
    else if (mult === 'M') value *= 1_000_000

    if (value > 10_000_000) {
      console.log(`[parsePrice] ⚠️  Precio sospechoso descartado: ${value} (rawNum:"${rawNum}" mult:"${mult}")`)
      continue
    }

    return Math.round(value * 1_000_000) / 1_000_000
  }

  console.log(`[parsePrice] ⚠️  Todos los candidatos descartados en: "${text}"`)
  return null
}

// ─────────────────────────────────────────────
// Sector B — Stock status resolver
// ─────────────────────────────────────────────
function resolveStockStatus(text) {
  const up = text.toUpperCase()
  for (const s of STOCK_STATUS_MAP) {
    if (s.patterns.some(p => up.includes(p))) {
      return { code: s.code, name: s.name, short: s.short, abbr: s.abbr }
    }
  }
  const words = up.replace(/[^A-Z\s]/g, '').trim().split(/\s+/).slice(0, 3).join(' ')
  let best = null, bestDist = Infinity
  for (const s of STOCK_STATUS_MAP) {
    const d = levenshtein(words, s.short.toUpperCase())
    if (d < bestDist) { bestDist = d; best = s }
  }
  if (best && bestDist <= 4) {
    console.log(`[resolveStockStatus] fuzzy "${words}" → "${best.short}" (dist:${bestDist})`)
    return { code: best.code, name: best.name, short: best.short, abbr: best.abbr }
  }
  return null
}

// ─────────────────────────────────────────────
// Sector B — Name extractor from header line
// ─────────────────────────────────────────────
function extractNameFromHeader(line) {
  let s = line
    .replace(/[|'`\[\](){}'"\\]/g, ' ')
    .replace(/\s+/g, ' ').trim()
  s = s.replace(/\s+[\d,]+\s+S[A-Z]{2,3}\b.*/i, '').trim()
  s = s.replace(/^[^A-Za-z]+/, '')
  s = s.replace(/^(?:[A-Za-z0-9%]{1,4}\s+)+(?=[A-Za-z]{4})/, '').trim()
  s = s.replace(/[^A-Za-z0-9\s\-']/g, ' ').replace(/\s+/g, ' ').trim()
  return s
}

// ─────────────────────────────────────────────
// Sector B — Main item parser
// ─────────────────────────────────────────────
function parseSectorBItems(rawText, commodities = []) {
  console.log('\n[parseSectorBItems] ── INICIO ──')

  const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !(l.length > 35 && !/\s/.test(l)))
  console.log('[parseSectorBItems] líneas raw:', rawLines)

  // FIX: SCU_RE ampliado — captura corrupciones OCR frecuentes en UI naranja inclinada:
  // "0 sty" / "0 seu" / "0 scu" / "0 SCY" — antes solo matcheaba " SCU" literal
  const SCU_RE = /\b\d+\s+s[cteuy][uyw]?\b|\s+SCU\b/i
  const CARGO_RE = /AVAI?[LA]{1,2}BLE\s+CARGO|AVATLABLE\s+CARGO/i
  const JUNK_RE = /^[\[\]|\\\/\-\s]*$|^[^A-Za-z]{0,3}$|^e[0-9]+$/
  const SHOPQ_RE = /SHOP\s*QUAN[TI]{2}[TY]{2}|SHOP\s*QUANT/i

  const hasShopQuantity = rawLines.some(l => SHOPQ_RE.test(l))
  console.log(`[parseSectorBItems] anchor: ${hasShopQuantity ? 'SHOP QUANTITY (primario)' : 'SCU (fallback)'}`)

  const items = []

  if (hasShopQuantity) {
    const anchorIdxs = rawLines.reduce((acc, l, i) => {
      if (SHOPQ_RE.test(l)) acc.push(i)
      return acc
    }, [])
    console.log(`[parseSectorBItems] ${anchorIdxs.length} anchors SHOP QUANTITY en índices:`, anchorIdxs)

    for (const ai of anchorIdxs) {
      const anchorLine = rawLines[ai]
      console.log(`\n[parseSectorBItems] ── Anchor[${ai}]: ${JSON.stringify(anchorLine)}`)

      const namePart1Raw = anchorLine.replace(SHOPQ_RE, '').trim()
      const namePart1 = namePart1Raw.replace(/[^A-Za-z0-9\s\-']/g, ' ').replace(/\s+/g, ' ').trim()
      console.log(`[parseSectorBItems]   namePart1: "${namePart1}"`)

      let namePart2 = ''
      let quantity = 0
      const nextLine = rawLines[ai + 1] ?? ''
      const qtyMatch = nextLine.match(/([\d,]+)\s+SCU/i)
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1].replace(/,/g, ''))
        const before = nextLine.slice(0, nextLine.search(/[\d,]+\s+SCU/i)).trim()
        namePart2 = before.replace(/[^A-Za-z0-9\s\-']/g, ' ').replace(/\s+/g, ' ').trim()
      }
      console.log(`[parseSectorBItems]   namePart2: "${namePart2}"  qty:${quantity}`)

      const fullName = [namePart1, namePart2].filter(Boolean).join(' ').trim()
      console.log(`[parseSectorBItems]   fullName: "${fullName}"`)

      if (!fullName || fullName.length < 2) {
        console.log(`[parseSectorBItems] ⚠️  nombre vacío, saltando`)
        continue
      }

      let price = null, stockStatus = null
      const nextAnchorIdx = anchorIdxs.find(x => x > ai) ?? rawLines.length
      for (let j = ai + 2; j < nextAnchorIdx; j++) {
        const l = rawLines[j].trim()
        if (!l || JUNK_RE.test(l) || CARGO_RE.test(l)) continue

        const p = parsePrice(l)
        if (p !== null && price === null) price = p

        const s = resolveStockStatus(l)
        if (s && !stockStatus) stockStatus = s

        console.log(`[parseSectorBItems]   line[${j}]: ${JSON.stringify(l)} → price:${p} status:${JSON.stringify(s)}`)
      }

      console.log(`[parseSectorBItems]   → price:${price}  status:${JSON.stringify(stockStatus)}`)

      const item = {
        name: fullName, ocr_name: fullName, quantity, price, stockStatus,
        commodityId: null, commodityName: null, commodityCode: null
      }

      if (commodities.length > 0) {
        const match = fuzzyMatchCommodity(fullName, commodities)
        if (match) {
          console.log(`[parseSectorBItems] 🔍 "${fullName}" → "${match.commodity.name}" (${(match.similarity * 100).toFixed(1)}%)`)
          item.name = match.commodity.name
          item.commodityId = match.commodity.id
          item.commodityName = match.commodity.name
          item.commodityCode = match.commodity.code
        } else {
          console.log(`[parseSectorBItems] ⚠️  "${fullName}" → sin match en commodities`)
        }
      }

      console.log(`[parseSectorBItems] ✅ "${item.name}" qty:${item.quantity} price:${item.price} status:${JSON.stringify(item.stockStatus)}`)
      items.push(item)
    }

  } else {
    console.log('[parseSectorBItems] Usando estrategia fallback SCU')
    const UI_RE = /SHOP\s+QUANTITY|LOCAL\s+MARKET|AVAILABLE\s+CARGO/i

    const lines = []
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]
      if (SCU_RE.test(line) && !CARGO_RE.test(line)) {
        const prev = lines[lines.length - 1]
        if (prev && !UI_RE.test(prev) && !SCU_RE.test(prev) && !JUNK_RE.test(prev) && !CARGO_RE.test(prev)) {
          const realWords = (prev.match(/[A-Za-z]{3,}/g) || [])
          const totalTokens = prev.split(/\s+/).length
          const isCleanEnough = realWords.length >= 1 && totalTokens <= 5 && realWords.length >= totalTokens * 0.3
          if (isCleanEnough) {
            console.log(`[parseSectorBItems] 🔗 Merge: "${prev}" + "${line}"`)
            lines[lines.length - 1] = prev + ' ' + line
            continue
          } else {
            console.log(`[parseSectorBItems] ⛔ No merge (línea previa muy ruidosa): "${prev}"`)
          }
        }
      }
      lines.push(line)
    }

    console.log('[parseSectorBItems] líneas tras merge:', lines)

    const headerIdxs = lines.reduce((acc, l, i) => {
      if (SCU_RE.test(l) && !CARGO_RE.test(l)) acc.push(i)
      return acc
    }, [])
    console.log(`[parseSectorBItems] ${headerIdxs.length} headers SCU en índices:`, headerIdxs)

    for (const hi of headerIdxs) {
      const headerLine = lines[hi]
      console.log(`\n[parseSectorBItems] ── Header[${hi}]: ${JSON.stringify(headerLine)}`)

      const qtyMatch = headerLine.match(/([\d,]+)\s+SCU/i)
      const quantity = qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, '')) : 0
      let name = extractNameFromHeader(headerLine)
      // FIX: strip prefijo basura — si el nombre tiene tokens corruptos antes de un
      // nombre real (ej: "EAERE W - Titanium"), eliminar tokens iniciales no-alpha
      // hasta encontrar un token que matchee con un commodity conocido
      if (name && commodities.length > 0) {
        // FIX: buscar si algún sufijo del nombre matchea un commodity conocido.
        // "DEWEGEEYE R T Tin" → probar "Tin", "T Tin", "R T Tin"... el primero que matchee gana.
        // Esto es más robusto que la regex de prefijo que fallaba con tokens largos.
        // Limpiar números sueltos y corrupciones de SCU antes de buscar sufijos
        const nameForSearch = name
          .replace(/[^A-Za-z0-9\s\-]/g, ' ')
          .replace(/\b\d+\b/g, ' ')
          .replace(/\b(sty|seu|scu|sy|su)\b/gi, ' ')
          .replace(/\s+/g, ' ').trim()
        const tokens = nameForSearch.split(/\s+/).filter(t => t.length > 0)
        let bestSuffix = null, bestSim = 0
        for (let ti = tokens.length - 1; ti >= 0; ti--) {
          const suffix = tokens.slice(ti).join(' ')
          if (suffix.length < 2) continue
          const m = fuzzyMatchCommodity(suffix, commodities)
          if (m && m.similarity > bestSim) { bestSim = m.similarity; bestSuffix = suffix }
          if (bestSim >= 0.85) break  // suficiente confianza, no seguir buscando
        }
        if (bestSuffix && bestSuffix !== name && bestSuffix.length >= 2) {
          console.log(`[parseSectorBItems] 🧹 nombre limpiado por sufijo: "${name}" → "${bestSuffix}" (${(bestSim * 100).toFixed(0)}%)`)
          name = bestSuffix
        } else if (name) {
          // Fallback: regex original para casos sin commodities conocidos
          const cleanedName = name.replace(/^[^A-Za-z]*(?:[A-Z]{1,5}[^A-Za-z]+){1,4}/i, '').trim()
          if (cleanedName.length >= 3 && cleanedName.length < name.length) {
            console.log(`[parseSectorBItems] 🧹 nombre limpiado por regex: "${name}" → "${cleanedName}"`)
            name = cleanedName
          }
        }
      } else if (name) {
        const cleanedName = name.replace(/^[^A-Za-z]*(?:[A-Z]{1,5}[^A-Za-z]+){1,4}/i, '').trim()
        if (cleanedName.length >= 3 && cleanedName.length < name.length) {
          console.log(`[parseSectorBItems] 🧹 nombre limpiado regex: "${name}" → "${cleanedName}"`)
          name = cleanedName
        }
      }

      if (!name || name.length < 2) {
        console.log(`[parseSectorBItems] ⚠️  nombre vacío, saltando`)
        continue
      }

      let price = null, stockStatus = null
      for (let j = hi + 1; j < lines.length; j++) {
        const l = lines[j].trim()
        if (!l || JUNK_RE.test(l) || CARGO_RE.test(l)) continue
        if (SCU_RE.test(l) && !CARGO_RE.test(l)) break
        price = parsePrice(l)
        // Nota: precios en imágenes inclinadas (Pyro) quedan null — la corrupción OCR
        // (ej: "HL7280000MSCY" de "₡1.728k/SCU") no permite reconstrucción confiable.
        stockStatus = resolveStockStatus(l)
        console.log(`[parseSectorBItems]   status+price[${j}]: ${JSON.stringify(l)} → price:${price} status:${JSON.stringify(stockStatus)}`)
        break
      }

      const item = {
        name, ocr_name: name, quantity, price, stockStatus,
        commodityId: null, commodityName: null, commodityCode: null
      }

      if (commodities.length > 0) {
        const match = fuzzyMatchCommodity(name, commodities)
        if (match) {
          console.log(`[parseSectorBItems] 🔍 "${name}" → "${match.commodity.name}" (${(match.similarity * 100).toFixed(1)}%)`)
          item.name = match.commodity.name
          item.commodityId = match.commodity.id
          item.commodityName = match.commodity.name
          item.commodityCode = match.commodity.code
        } else {
          console.log(`[parseSectorBItems] ⚠️  "${name}" → sin match en commodities`)
        }
      }

      console.log(`[parseSectorBItems] ✅ "${item.name}" qty:${item.quantity} price:${item.price} status:${JSON.stringify(item.stockStatus)}`)
      items.push(item)
    }
  }

  console.log(`\n[parseSectorBItems] Total: ${items.length}`)
  return items
}


// ─────────────────────────────────────────────
// FIX 1: Extrae el nombre de estación del panel izquierdo Pyro
// Acepta los raws POR SEPARADO para poder priorizar rawRB (contiene
// la inyección estructurada YOUR INVENTORIES\nGASLIGHT\nSELECT SUB-CATEGORY)
// sobre rawSoft/rawA/rawB que pueden tener basura OCR antes del nombre real.
// ─────────────────────────────────────────────
function extractPyroStationName(rawTexts) {
  // rawTexts puede ser string (legacy) o array ordenado por prioridad
  const sources = Array.isArray(rawTexts) ? rawTexts : [rawTexts]

  const INVENTORIES_RE = /YOUR\s*INVENTOR|JUR\s+INVENTOR|OUR\s+INVENTOR/i
  const SUBCATEGORY_RE = /SELECT\s+SUB|ELECT\s+SUB/i
  const SNAP_BLACKLIST = /^(YOUR|SELECT|CHOOSE|IN.DEMAND|NO.DEMAND|CANNOT|INVENTORI)/

  for (const rawText of sources) {
    if (!rawText) continue
    const rawLines = rawText.split(/\r?\n/)

    // Pasada 1: líneas limpias con umbral ratio 0.5
    // FIX calidad: el candidato debe tener tokens largos — rechaza sopa de letras
    // como "TR E T T T T E MR T T E T TR TRV VIR"
    const cleanLines = rawLines.map(l =>
      l.toUpperCase().replace(/[^A-Z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim()
    )
    for (let i = 0; i < cleanLines.length; i++) {
      if (INVENTORIES_RE.test(cleanLines[i])) {
        for (let j = i + 1; j < Math.min(i + 5, cleanLines.length); j++) {
          const candidate = cleanLines[j]
          if (!candidate || candidate.length < 3) continue
          if (SUBCATEGORY_RE.test(candidate)) break
          if (SNAP_BLACKLIST.test(candidate)) continue
          const wordChars = (candidate.match(/[A-Z]/g) || []).length
          const total = candidate.replace(/\s/g, '').length
          // FIX calidad: exigir que al menos el 40% de los tokens sean largos (>=3 chars)
          // y que haya máximo 6 tokens — evita "TR E T T T T E MR..." (16 tokens, pocos largos)
          const allTokens = candidate.split(/\s+/).filter(t => t.length > 0)
          const longTokens = allTokens.filter(t => t.length >= 3)
          const isQualityName = longTokens.length >= 1 &&
            longTokens.length >= allTokens.length * 0.40 &&
            allTokens.length <= 6
          if (
            wordChars / Math.max(total, 1) >= 0.5 &&
            candidate.length >= 5 &&
            candidate.length <= 40 &&
            isQualityName
          ) {
            console.log(`[extractPyroStationName] ✅ pasada1 (source ${sources.indexOf(rawText)}): "${candidate}"`)
            return candidate
          }
        }
      }
    }

    // Pasada 2: tokens de letras entre YOUR INVENTORIES y SELECT SUB
    for (let i = 0; i < rawLines.length; i++) {
      const upper = rawLines[i].toUpperCase()
      if (INVENTORIES_RE.test(upper)) {
        for (let j = i + 1; j < Math.min(i + 5, rawLines.length); j++) {
          const raw = rawLines[j]
          const upperRaw = raw.toUpperCase()
          if (SUBCATEGORY_RE.test(upperRaw)) break
          const tokens = raw.match(/[A-Za-z]{3,}/g) || []
          if (tokens.length >= 1 && tokens.length <= 4) {
            const filtered = tokens.filter(t => !/^(YOUR|THE|AND|FOR|SEL|INV|CAT)/i.test(t))
            if (filtered.length >= 1) {
              const candidate = filtered.join(' ').toUpperCase()
              console.log(`[extractPyroStationName] ✅ pasada2 tokens (source ${sources.indexOf(rawText)}): "${candidate}"`)
              return candidate
            }
          }
        }
      }
    }
  }

  console.log(`[extractPyroStationName] ⚠️  No encontrado`)
  return null
}

// ─────────────────────────────────────────────
// Sector A extraction
// ─────────────────────────────────────────────
async function extractSectorA(imageBuffer, colorScheme = 'blue', uiBounds = null) {
  console.log('\n══════════════════════════════════')
  console.log('[extractSectorA] INICIO — Crops separados + triple pasada')
  await ensureDebugDir()

  const tipoCropBuffer = await cropSectorA_tipo(imageBuffer, uiBounds)
  await saveDebugImage(tipoCropBuffer, '00-crop-tipo-raw.png')
  const tipoProcessed = await preprocessPass2(tipoCropBuffer)
  await saveDebugImage(tipoProcessed, '01-crop-tipo-negate.png')
  const tmpTipo = path.join(TMP_DIR, `ocr-tipo-${Date.now()}.png`)
  await fs.promises.writeFile(tmpTipo, tipoProcessed)
  const rawTipo = await runTesseract(tmpTipo, 6)
  await fs.promises.unlink(tmpTipo)
  const type = detectTypeFromRaw(rawTipo)

  const nombreCropBuffer = await cropSectorA_nombre(imageBuffer, colorScheme, uiBounds)
  await saveDebugImage(nombreCropBuffer, '02-crop-nombre-raw.png')

  const nombreSoft = await preprocessNombreSoft(nombreCropBuffer)
  await saveDebugImage(nombreSoft, '03-crop-nombre-soft.png')
  const tmpSoft = path.join(TMP_DIR, `ocr-nombre-soft-${Date.now()}.png`)
  await fs.promises.writeFile(tmpSoft, nombreSoft)
  const rawSoft = await runTesseract(tmpSoft, 6)
  await fs.promises.unlink(tmpSoft)
  console.log('[NOMBRE SOFT]:\n' + rawSoft)

  const nombrePassA = await preprocessPass1(nombreCropBuffer)
  await saveDebugImage(nombrePassA, '04-crop-nombre-passA-threshold.png')
  const tmpA = path.join(TMP_DIR, `ocr-nombre-A-${Date.now()}.png`)
  await fs.promises.writeFile(tmpA, nombrePassA)
  const rawA = await runTesseract(tmpA, 6)
  await fs.promises.unlink(tmpA)
  console.log('[NOMBRE PASS-A]:\n' + rawA)

  const nombrePassB = await preprocessPass2(nombreCropBuffer)
  await saveDebugImage(nombrePassB, '05-crop-nombre-passB-negate.png')
  const tmpB = path.join(TMP_DIR, `ocr-nombre-B-${Date.now()}.png`)
  await fs.promises.writeFile(tmpB, nombrePassB)
  const rawB = await runTesseract(tmpB, 6)
  await fs.promises.unlink(tmpB)
  console.log('[NOMBRE PASS-B]:\n' + rawB)

  // ─────────────────────────────────────────────
  // Pasada extra R-B para UI naranja
  // FIX 3: Guard contra dimensiones inválidas antes de cualquier crop
  // ─────────────────────────────────────────────
  let rawRB = ''
  if (colorScheme === 'orange') {
    try {
      const { width: iw, height: ih } = await sharp(imageBuffer).metadata()

      // FIX 3: Validar dimensiones antes de proceder — evita "Expected positive integer for width"
      if (!iw || !ih || iw < 100 || ih < 100) {
        console.warn(`[extractSectorA] ⚠️  FIX3: dimensiones inválidas (${iw}x${ih}) — saltando pasada RB`)
      } else {
        const { uiTop: ut, uiHeight: uh } = uiBounds ?? { uiTop: 0, uiHeight: ih }

        // Validar también uiHeight — si es 0 o negativo el crop fallaría
        if (!uh || uh < 50) {
          console.warn(`[extractSectorA] ⚠️  FIX3: uiHeight inválido (${uh}) — saltando pasada RB`)
        } else {

          // ── FIX E: Crop dedicado para fila del nombre de estación Pyro commodity ──
          // "GASLIGHT" (o cualquier nombre) aparece en fila naranja brillante entre
          // YOUR INVENTORIES (~19%) y SELECT SUB-CATEGORY (~25%) del panel izquierdo.
          try {
            const snLeft = Math.floor(iw * 0.05)
            const snTop = ut + Math.floor(uh * 0.195)
            const snWidth = Math.max(1, Math.floor(iw * 0.35))
            const snHeight = Math.max(1, Math.floor(uh * 0.055))
            const snBuf = await sharp(imageBuffer)
              .extract({ left: snLeft, top: snTop, width: snWidth, height: snHeight })
              .toBuffer()
            await saveDebugImage(snBuf, '06e-crop-station-name-row.png')
            const snMeta = await sharp(snBuf).metadata()
            // FIX: texto naranja brillante sobre fondo naranja — threshold lo destruye.
            // Usar normalize + sharpen (sin threshold), igual que para ddProc.
            // Intentar también R-channel que resalta bien el texto naranja claro.
            const trySnOCR = async (pipeline, suffix) => {
              const proc = await pipeline(
                sharp(snBuf).resize({ width: Math.max(1, snMeta.width * 4), kernel: 'lanczos3' })
              ).toBuffer()
              await saveDebugImage(proc, `06f-crop-station-name-row-${suffix}.png`)
              const tmp = path.join(TMP_DIR, `ocr-stname-${suffix}-${Date.now()}.png`)
              await fs.promises.writeFile(tmp, proc)
              const raw = await runTesseract(tmp, 7)
              await fs.promises.unlink(tmp)
              return raw.replace(/[^A-Za-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
            }
            // "GASLIGHT" = texto naranja oscuro sobre fondo naranja claro.
            // Estrategia: negate hace que el texto (oscuro) se vuelva claro sobre oscuro.
            // PSM 11 (sparse text) es más tolerante que PSM 7 (single line).
            // Intentamos 4 pipelines en orden de efectividad esperada.
            const trySnPSM = async (pipeline, suffix, psm = 11) => {
              const proc = await pipeline(
                sharp(snBuf).resize({ width: Math.max(1, snMeta.width * 4), kernel: 'lanczos3' })
              ).toBuffer()
              await saveDebugImage(proc, `06f-crop-station-name-row-${suffix}.png`)
              const tmp = path.join(TMP_DIR, `ocr-stname-${suffix}-${Date.now()}.png`)
              await fs.promises.writeFile(tmp, proc)
              const raw = await runTesseract(tmp, psm)
              await fs.promises.unlink(tmp)
              // Filtrar blacklist y tomar la línea más corta válida (el nombre de estación
              // es siempre más corto que las etiquetas UI como SELECT SUB-CATEGORY)
              const SNAP_BLACKLIST = /SELECT|SUBCATEGOR|CHOOSE|IN DEMAND|NO DEMAND|CANNOT|INVENTORI/
              const lines = raw.split(/\r?\n/)
                .map(l => l.replace(/[^A-Za-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase())
                .filter(l => l.length >= 3 && /[A-Z]{3}/.test(l) && !SNAP_BLACKLIST.test(l))
              // Preferir la línea más corta limpia — el nombre de estación es conciso
              return lines.sort((a, b) => a.length - b.length)[0] || ''
            }
            // Pipeline 1: negate → texto oscuro se vuelve blanco, fondo naranja → gris oscuro
            let snVal = await trySnPSM(s => s.grayscale().negate().normalize().sharpen({ sigma: 2 }), 'neg11', 11)
            console.log(`[extractSectorA] station-name-row neg11: "${snVal}"`)
            // Pipeline 2: negate con threshold más agresivo
            if (!snVal || snVal.length < 3) {
              snVal = await trySnPSM(s => s.grayscale().negate().normalize().threshold(110), 'neg-thr', 7)
              console.log(`[extractSectorA] station-name-row neg-thr: "${snVal}"`)
            }
            // Pipeline 3: grayscale normalize sin negate, psm 11
            if (!snVal || snVal.length < 3) {
              snVal = await trySnPSM(s => s.grayscale().normalize().sharpen({ sigma: 2 }), 'norm11', 11)
              console.log(`[extractSectorA] station-name-row norm11: "${snVal}"`)
            }
            // Pipeline 4: contraste máximo mediante linear stretch
            if (!snVal || snVal.length < 3) {
              snVal = await trySnPSM(s => s.grayscale().linear(3, -200).normalize(), 'linear', 7)
              console.log(`[extractSectorA] station-name-row linear: "${snVal}"`)
            }
            console.log(`[extractSectorA] station-name-row OCR: "${snVal}"`)
            if (snVal.length >= 3 && !/^(YOUR|SELECT|CHOOSE|IN.DEMAND|NO.DEMAND|CANNOT)/i.test(snVal)) {
              rawRB = (rawRB || '') + `\nYOUR INVENTORIES\n${snVal}\nSELECT SUB-CATEGORY\n`
              console.log(`[extractSectorA] ✅ station name injected: "${snVal}"`)
            }
          } catch (snErr) {
            console.warn('[extractSectorA] station-name-row falló:', snErr.message)
          }

          // ── Dedicated crop: CHOOSE DESTINATION dropdown value row ──
          const ddLeft = Math.floor(iw * 0.09)
          const ddTop = ut + Math.floor(uh * 0.225)
          const ddWidth = Math.max(1, Math.floor(iw * 0.42))   // FIX 3: Math.max(1, ...) como segunda línea de defensa
          const ddHeight = Math.max(1, Math.floor(uh * 0.035))  // FIX 3: ídem
          const ddBuf = await sharp(imageBuffer)
            .extract({ left: ddLeft, top: ddTop, width: ddWidth, height: ddHeight })
            .toBuffer()
          await saveDebugImage(ddBuf, '06c-crop-dest-dropdown.png')

          const ddMeta = await sharp(ddBuf).metadata()
          const ddScale = Math.min(6, Math.floor(600 / Math.max(ddMeta.width, 1)))
          const ddProc = await sharp(ddBuf)
            .resize({ width: Math.max(1, ddMeta.width * ddScale), kernel: 'lanczos3' })
            .grayscale()
            .normalize()
            .sharpen({ sigma: 1.5 })
            .toBuffer()
          await saveDebugImage(ddProc, '06d-crop-dest-dropdown-proc.png')
          const tmpDD = path.join(TMP_DIR, `ocr-dest-dd-${Date.now()}.png`)
          await fs.promises.writeFile(tmpDD, ddProc)
          const rawDD = await runTesseract(tmpDD, 7)
          await fs.promises.unlink(tmpDD)
          const ddClean = rawDD
            .replace(/[^A-Za-z0-9\s\-']/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          const ddValue = ddClean.replace(/\s*(all\s+options?|all\s+opt|v\s*$)/gi, '').trim()
            .replace(/^[a-z]{1,3}\s+/i, '')
            .replace(/(\s+[a-z]{1,3}){1,3}$/i, '')
            .trim()
          console.log(`[NOMBRE DEST-DROPDOWN]: raw="${ddClean}" → value="${ddValue}"`)
          if (ddValue.length >= 3 && !/^(choose|all\s|search|item\s*name)/i.test(ddValue)) {
            rawRB = `CHOOSE DESTINATION\n${ddValue}\n`
            console.log(`[extractSectorA] ✅ dropdown directo: "${ddValue.toUpperCase()}"`)
          }

          // R-B pass on the nombre crop
          const { data, info } = await sharp(nombreCropBuffer).raw().toBuffer({ resolveWithObject: true })
          const ch = info.channels
          const rb = Buffer.alloc(info.width * info.height)
          for (let i = 0; i < rb.length; i++) {
            rb[i] = Math.max(0, Math.min(255, data[i * ch] - data[i * ch + 2]))
          }
          const rbBuf = await sharp(rb, { raw: { width: info.width, height: info.height, channels: 1 } })
            .resize({ width: Math.max(1, info.width * 3), kernel: 'lanczos3' })
            .normalize()
            .sharpen({ sigma: 1.5 })
            .png()
            .toBuffer()
          await saveDebugImage(rbBuf, '06-crop-nombre-rb.png')
          const tmpRB = path.join(TMP_DIR, `ocr-nombre-rb-${Date.now()}.png`)
          await fs.promises.writeFile(tmpRB, rbBuf)
          rawRB += '\n' + await runTesseract(tmpRB, 6)
          await fs.promises.unlink(tmpRB)
          console.log('[NOMBRE RB]:\n' + rawRB)

          // R-channel only with threshold
          const rOnly = Buffer.alloc(info.width * info.height)
          for (let i = 0; i < rOnly.length; i++) rOnly[i] = data[i * ch]
          const rBuf = await sharp(rOnly, { raw: { width: info.width, height: info.height, channels: 1 } })
            .resize({ width: Math.max(1, info.width * 3), kernel: 'lanczos3' })
            .normalize()
            .threshold(180)
            .png()
            .toBuffer()
          await saveDebugImage(rBuf, '06b-crop-nombre-rchannel.png')
          const tmpRC = path.join(TMP_DIR, `ocr-nombre-rc-${Date.now()}.png`)
          await fs.promises.writeFile(tmpRC, rBuf)
          const rawRC = await runTesseract(tmpRC, 6)
          await fs.promises.unlink(tmpRC)
          console.log('[NOMBRE R-CHANNEL]:\n' + rawRC)
          rawRB = rawRB + '\n' + rawRC

        } // end uiHeight guard
      } // end iw/ih guard
    } catch (e) {
      console.warn('[extractSectorA] ⚠️  Pasada RB falló, continuando sin ella:', e.message)
    }
  }

  const allLines = [...new Set([
    ...extractValidLines(rawSoft, 'nombre-soft'),
    ...extractValidLines(rawA, 'nombre-A'),
    ...extractValidLines(rawB, 'nombre-B'),
    ...(rawRB ? extractValidLines(rawRB, 'nombre-RB') : []),
  ])]

  const CHOOSE_LABEL_RE = /^choose\s+(destination|category|sub.?dest|subcategory)/i
  const extractDropdownValues = (rawText, label) => {
    const lines = rawText.split(/\r?\n/).map(l => l.trim())
    const vals = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const inlineMatch = line.match(/DEST[A-Z]*\s+(.+?)\s+CHOOSE\s+SUB/i)
      if (inlineMatch) {
        const candidate = inlineMatch[1].replace(/[^A-Za-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim()
        if (candidate.length >= 3 && !/^(choose|all\s|search|item\s*name|ee|sub|ual|sie|iil|re|a$)/i.test(candidate)) {
          const up = candidate.toUpperCase()
          console.log(`[extractDropdownValues:${label}] inline between DEST…SUB: "${up}"`)
          vals.push(up)
        }
      }

      if (CHOOSE_LABEL_RE.test(line)) {
        for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
          const next = lines[j]?.replace(/[^A-Za-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim()
          if (!next || next.length < 3) continue
          if (/^(choose|all\s|search|item\s*name)/i.test(next)) break
          const up = next.toUpperCase()
          console.log(`[extractDropdownValues:${label}] next-line after CHOOSE: "${up}"`)
          vals.push(up)
          break
        }
      }
    }
    return vals
  }

  const dropdownCandidates = colorScheme === 'orange' ? [
    ...extractDropdownValues(rawSoft, 'soft'),
    ...extractDropdownValues(rawA, 'A'),
    ...extractDropdownValues(rawB, 'B'),
    ...(rawRB ? extractDropdownValues(rawRB, 'RB') : []),
  ] : []
  const allCandidates = [...new Set([...dropdownCandidates, ...allLines])]
  console.log(`[extractSectorA] Total candidatos: ${allCandidates.length} → ${JSON.stringify(allCandidates)}`)

  const solidDropdowns = dropdownCandidates.filter(l => {
    if (l.length < 3) return false
    if (/^(choose|all\s|search|item\s*name|teemneme)/i.test(l)) return false
    if ((l.match(/choose/gi) ?? []).length >= 2) return false
    if (/subcategor|chouse|chduse|tnoosee/i.test(l)) return false
    if (/\S{20,}/.test(l)) return false
    return true
  })
  const solidCandidates = allCandidates.filter(isReasonableCandidate)
  let stationName = solidDropdowns[0]
    ?? (solidCandidates.length > 0
      ? solidCandidates.reduce((best, l) => l.length > best.length ? l : best, solidCandidates[0])
      : (allCandidates[0] ?? null))
  if (stationName) {
    const original = stationName
    for (const noise of NOMBRE_NOISE_TOKENS) stationName = stationName.replace(noise, '').trim()
    if (stationName !== original) console.log(`[extractSectorA] Limpieza: "${original}" → "${stationName}"`)
  }

  // FIX 1: Para UI orange, buscar SIEMPRE el nombre entre YOUR INVENTORIES y SELECT SUB-CATEGORY.
  // No solo cuando stationName es null — los candidatos anteriores suelen ser basura OCR
  // (ej: 'WEMDH DLOD B2 S W') mientras que el nombre real (ej: 'GASLIGHT') está claramente
  // entre esas dos etiquetas. Sobreescribe cualquier candidato basura.
  if (colorScheme === 'orange') {
    // FIX: pasar raws separados con rawRB PRIMERO — contiene la inyección
    // estructurada (YOUR INVENTORIES\nGASLIGHT\nSELECT SUB-CATEGORY) que es
    // más confiable que rawSoft/rawA/rawB donde la basura OCR puede aparecer antes.
    const pyroName = extractPyroStationName([rawRB, rawSoft, rawA, rawB].filter(Boolean))
    if (pyroName) {
      stationName = pyroName
      console.log(`[extractSectorA] ✅ Nombre Pyro extraído (override): "${stationName}"`)
    }
  }

  console.log('\n[extractSectorA] ── RESULTADO ──')
  console.log(`  type:        "${type}"`)
  console.log(`  stationName: "${stationName}"`)
  console.log('══════════════════════════════════\n')

  return { type, stationName, validLines: allCandidates, rawTipo, rawNombre: rawSoft }
}

// ─────────────────────────────────────────────
// Sector B extraction
// ─────────────────────────────────────────────
async function extractSectorB(imageBuffer, colorScheme, commodities = [], uiBounds = null) {
  console.log('\n══════════════════════════════════')
  console.log('[extractSectorB] INICIO colorScheme:', colorScheme)

  const { width, height } = await sharp(imageBuffer).metadata()

  console.log('\n[extractSectorB] ── DETECCIÓN MODO POR BRILLO ──')
  const mode = await detectModeByBrightness(imageBuffer, width, height, uiBounds)
  console.log(`[extractSectorB] mode: "${mode}"`)

  const tabsCrop = await cropSectorB_tabs(imageBuffer, uiBounds)
  await saveDebugImage(tabsCrop, '10-sectorB-tabs-raw.png')

  console.log('\n[extractSectorB] ── CROP ITEMS ──')
  const itemsCrop = await cropSectorB_items(imageBuffer, uiBounds)
  await saveDebugImage(itemsCrop, '12-sectorB-items-raw.png')

  // FIX 2: Corregir inclinación antes del OCR
  console.log('\n[extractSectorB] ── DESKEW ──')
  const itemsCropDeskewed = await deskewBuffer(itemsCrop)
  await saveDebugImage(itemsCropDeskewed, '12b-sectorB-items-deskewed.png')

  const itemsProcessed = colorScheme === 'orange'
    ? await preprocessSectorB_orange(itemsCropDeskewed)
    : await preprocessSectorB_blue(itemsCropDeskewed)

  await saveDebugImage(itemsProcessed, '13-sectorB-items-processed.png')

  const tmpItems = path.join(TMP_DIR, `ocr-items-${Date.now()}.png`)
  await fs.promises.writeFile(tmpItems, itemsProcessed)
  const rawItemsText = await runTesseract(tmpItems, 6)
  await fs.promises.unlink(tmpItems)

  console.log('[extractSectorB] rawItems:\n' + rawItemsText)

  const items = parseSectorBItems(rawItemsText, commodities)

  console.log('\n[extractSectorB] ── RESULTADO ──')
  console.log(`  mode:  "${mode}"`)
  console.log(`  items: ${items.length}`)
  console.log('══════════════════════════════════\n')

  return { mode, items, rawItems: rawItemsText }
}

// ─────────────────────────────────────────────
// Main OCR Process
// ─────────────────────────────────────────────
async function processOCR({ base64 }) {
  console.log('\n████████████████████████████████████')
  console.log('[processOCR] INICIO')
  console.log(`[processOCR] base64 length: ${base64?.length ?? 0}`)

  try {
    const buffer = Buffer.from(base64, 'base64')
    const metadata = await sharp(buffer).metadata()
    console.log(`[processOCR] Imagen: ${metadata.width}x${metadata.height}px formato:${metadata.format}`)

    let terminals = [], commodities = []
    try { terminals = uexCache.get('terminals')?.data || []; console.log(`[processOCR] Terminales: ${terminals.length}`) } catch (e) { console.warn('[processOCR] ⚠️ No terminales:', e.message) }
    try { commodities = uexCache.get('commodities')?.data || []; console.log(`[processOCR] Commodities: ${commodities.length}`) } catch (e) { console.warn('[processOCR] ⚠️ No commodities:', e.message) }

    let cachedItems = []
    try { cachedItems = uexCache.get('items') || []; console.log(`[processOCR] Items cache: ${cachedItems.length}`) } catch (e) { console.warn('[processOCR] ⚠️ No items cache:', e.message) }

    const { width, height } = await sharp(buffer).metadata()
    const uiBounds = await detectUIBounds(buffer, width, height)
    const colorScheme = await detectUIColorScheme(buffer, width, height, uiBounds.uiTop)

    console.log('\n[processOCR] ── SECTOR A ──')
    const { type, stationName, validLines, rawTipo, rawNombre } = await extractSectorA(buffer, colorScheme, uiBounds)

    let resolvedType = type
    let triageTabText = ''
    if (type === 'unknown') {
      console.log('[processOCR] type=unknown — triage por tab derecho...')
      try {
        const { width: w2, height: h2 } = await sharp(buffer).metadata()
        const { uiTop, uiHeight } = uiBounds

        if (colorScheme === 'orange') {
          console.log('[processOCR] orange scheme — triage por rawNombre + header central')

          // ── Señal 1: rawNombre contiene keywords de commodity ──
          const rawNombreUpper = (rawNombre || '').toUpperCase().replace(/[^A-Z]/g, ' ')
          const COMMODITY_NOMBRE_SIGNALS = /YOUR\s*INVENTOR|IN\s*DEMAND|NO\s*DEMAND|CANNOT\s*SELL|INDEMAND|NODEMAND|SHOP\s*INVENTOR/
          if (COMMODITY_NOMBRE_SIGNALS.test(rawNombreUpper)) {
            console.log(`[processOCR] triage orange: rawNombre contiene señal commodity → flujo commodity`)
            // resolvedType queda 'unknown' → flujo commodity — NO cambiar a item
          } else {
            // ── Señal 2: leer header central ──
            try {
              const headerBuf = await cropItemShop_header(buffer, uiBounds)
              const scale = 3
              const { width: hw } = await sharp(headerBuf).metadata()

              const tryHeader = async (pipeline, suffix) => {
                const proc = await pipeline(sharp(headerBuf).resize({ width: hw * scale, kernel: 'lanczos3' })).toBuffer()
                const tmp = path.join(TMP_DIR, `ocr-triage-hdr-${suffix}-${Date.now()}.png`)
                await fs.promises.writeFile(tmp, proc)
                const text = (await runTesseract(tmp, 6)).toUpperCase().replace(/[^A-Z0-9_\s]/g, ' ').replace(/\s+/g, ' ').trim()
                await fs.promises.unlink(tmp)
                console.log(`[triage:hdr:${suffix}] "${text}"`)
                return text
              }

              const { data, info } = await sharp(headerBuf).raw().toBuffer({ resolveWithObject: true })
              const ch = info.channels
              const rb = Buffer.alloc(info.width * info.height)
              for (let i = 0; i < rb.length; i++) rb[i] = Math.max(0, Math.min(255, data[i * ch] - data[i * ch + 2]))
              const rbBuf = await sharp(rb, { raw: { width: info.width, height: info.height, channels: 1 } })
                .resize({ width: info.width * scale, kernel: 'lanczos3' }).normalize().png().toBuffer()
              const tmp = path.join(TMP_DIR, `ocr-triage-hdr-rb-${Date.now()}.png`)
              await fs.promises.writeFile(tmp, rbBuf)
              let hdrText = (await runTesseract(tmp, 6)).toUpperCase().replace(/[^A-Z0-9_\s]/g, ' ').replace(/\s+/g, ' ').trim()
              await fs.promises.unlink(tmp)
              console.log(`[triage:hdr:rb] "${hdrText}"`)

              if (!hdrText || hdrText.length < 3) hdrText = await tryHeader(s => s.grayscale().normalize().threshold(120), 'thr')
              if (!hdrText || hdrText.length < 3) hdrText = await tryHeader(s => s.grayscale().normalize().sharpen({ sigma: 2 }), 'shrp')

              // FIX: HOSTILE TERRITORY es una alerta del juego en commodity terminals,
              // NO es el nombre de una tienda — agregado a COMMODITY_HDR
              const COMMODITY_HDR = /COMMODIT|DITIES|ODITIES|YOUR\s*INVEN|HOSTILE\s*TERRITORY/
              if (hdrText.length >= 3 && !COMMODITY_HDR.test(hdrText)) {
                console.log(`[processOCR] ✅ triage orange: header="${hdrText}" → item shop`)
                resolvedType = 'item'
                triageTabText = hdrText
              } else {
                console.log(`[processOCR] triage orange: header="${hdrText}" → commodity o vacío → flujo commodity`)
              }
            } catch (e) {
              console.warn('[processOCR] ⚠️  triage orange header falló:', e.message)
            }
          }

        } else {
          // ── Triage no-orange: leer tab superior derecho ──
          const tabY = uiTop + Math.floor(uiHeight * 0.135)
          const tabH = Math.floor(uiHeight * 0.055)
          const tabX = Math.floor(w2 * 0.716), tabW = Math.floor(w2 * 0.230)
          const crop = await sharp(buffer).extract({ left: tabX, top: tabY, width: tabW, height: tabH }).toBuffer()
          const scale = Math.min(4, Math.floor(800 / tabW))

          const tryTab = async (pipeline, suffix) => {
            const proc = await pipeline(sharp(crop).resize({ width: tabW * scale, kernel: 'lanczos3' })).toBuffer()
            const tmp = path.join(TMP_DIR, `ocr-triage-${suffix}-${Date.now()}.png`)
            await fs.promises.writeFile(tmp, proc)
            const text = (await runTesseract(tmp, 7)).toUpperCase().replace(/[^A-Z\s]/g, '').trim()
            await fs.promises.unlink(tmp)
            console.log(`[triage:${suffix}] "${text}"`)
            return text
          }

          const COMMODITY_TAB = /\b(BUY|SELL|RENT|LOCAL|MARKET)\b/
          let tabText = await tryTab(s => s.grayscale().normalize().threshold(140), 'thr')
          if (!tabText || tabText.length < 3) tabText = await tryTab(s => s.grayscale().negate().normalize().threshold(130), 'neg')
          if (!tabText || tabText.length < 3) tabText = await tryTab(s => s.grayscale().normalize().sharpen({ sigma: 2 }), 'shrp')

          if (tabText.length >= 3 && !COMMODITY_TAB.test(tabText)) {
            console.log(`[processOCR] ✅ triage: tab="${tabText}" → no es commodity → item shop`)
            resolvedType = 'item'
            triageTabText = tabText
          } else {
            console.log(`[processOCR] triage: tab="${tabText}" → commodity o vacío → flujo commodity`)
          }
        }
      } catch (e) {
        console.warn('[processOCR] ⚠️  triage falló:', e.message)
      }
    }

    if (resolvedType === 'item' || resolvedType === 'vehicle') {
      console.log(`\n[processOCR] ── ITEM SHOP MODE (type:${resolvedType} original:${type}) ──`)
      const { shopSubtype, destination: destFromHeader, mode, items, rawHeader, rawGrid } = await extractItemShop(buffer, colorScheme, triageTabText, uiBounds)

      const NOISE_RE = /^(choose|destination|sub|all\s+(opt|cat)|search|item\s*name|ee|null)$/i

      let destination = destFromHeader
      if (!destination || NOISE_RE.test(destination)) {
        const sectorACandidates = (validLines || []).filter(l =>
          l && l.length >= 3 && !NOISE_RE.test(l) &&
          !/^(JOSE|REALS|TT|SL|AREFEAIR|AREAIR)$/.test(l.toUpperCase())
        )
        const placeCandidate = sectorACandidates.find(l => /^(AREA|ARC|MIC|CRU|HUR|ABE|GRI|TER|ORI|OCE|MAG|ITO|ARC)/i.test(l))
          ?? sectorACandidates[0]
        if (placeCandidate) {
          destination = placeCandidate
          console.log(`[processOCR] destination fallback desde SectorA: "${destination}"`)
        }
      }

      let terminalMatch = null
      if (shopSubtype !== 'generic_item' || destination) {
        terminalMatch = fuzzyMatchItemTerminal(shopSubtype, destination, terminals)
      }

      if (!terminalMatch && destination && !NOISE_RE.test(destination)) {
        console.log(`[processOCR] ⚠️  item: reintentando fuzzy clásico con destination "${destination}"`)
        const classicMatch = fuzzyMatchTerminal(destination, terminals.filter(t => t.type === 'item' || t.is_shop_fps))
        if (classicMatch?.similarity >= 0.60) terminalMatch = classicMatch
      }

      const resolvedTerminal = terminalMatch?.terminal ?? null
      const resolvedName = resolvedTerminal?.name ?? null
      const terminalId = resolvedTerminal?.id ?? null

      const rawText = `[TIPO]\n${rawTipo}\n[HEADER]\n${rawHeader}\n[GRID]\n${rawGrid}`

      const resolvedItems = resolveItemNames(items, cachedItems)

      console.log('\n[processOCR] ── RESULTADO FINAL (item) ──')
      console.log(`  type:        "item"`)
      console.log(`  shopSubtype: "${shopSubtype}"`)
      console.log(`  mode:        "${mode}"`)
      console.log(`  terminal:    "${resolvedName}"`)
      console.log(`  destination: "${destination}"`)
      console.log(`  items:       ${resolvedItems.length}`)
      resolvedItems.forEach((it, idx) =>
        console.log(`    [${idx}] name:"${it.name}" id:${it.id ?? 'null'} sim:${it.matchSimilarity ? (it.matchSimilarity * 100).toFixed(1) + '%' : '-'} price:${it.price ?? 'null'}`)
      )
      console.log('████████████████████████████████████\n')

      return {
        success: true,
        rawText,
        type: 'item',
        shopSubtype,
        mode,
        stationName: resolvedName,
        items: resolvedItems,
        terminalId,
        terminal: resolvedTerminal
      }
    }

    // Commodity terminal (type === 'commodity') o unknown → flujo commodity
    console.log(`\n[processOCR] ── COMMODITY MODE (type:${type}) ──`)
    const { mode, items: rawItems, rawItems: rawItemsText } = await extractSectorB(buffer, colorScheme, commodities, uiBounds)

    const filteredLines = (validLines || []).filter(isReasonableCandidate)
    let resolvedName = null, terminalId = null, matchedTerminal = null

    // FIX: stationName extraído por extractPyroStationName es el candidato más
    // confiable — siempre incluirlo PRIMERO en linesToMatch, antes que filteredLines
    // que suele contener basura OCR en imágenes naranja/Pyro.
    let stationNameForMatch = stationName
    if (!stationNameForMatch && colorScheme === 'orange') {
      const allRaw = [rawNombre].filter(Boolean).join('\n')
      stationNameForMatch = extractPyroStationName(allRaw)
      if (stationNameForMatch) console.log(`[processOCR] ✅ stationName fallback Pyro: "${stationNameForMatch}"`)
    }

    const linesToMatch = [
      ...(stationNameForMatch ? [stationNameForMatch] : []),
      ...filteredLines,
    ]

    if (terminals.length > 0 && linesToMatch.length > 0) {
      let bestMatch = null, bestMatchLine = null
      for (const line of linesToMatch) {
        const match = fuzzyMatchTerminal(line, terminals)
        if (match?.similarity >= 0.65 && (!bestMatch || match.similarity > bestMatch.similarity)) {
          bestMatch = match; bestMatchLine = line
        }
      }
      if (bestMatch) {
        matchedTerminal = bestMatch.terminal
        resolvedName = matchedTerminal.name || null
        terminalId = matchedTerminal.id || null
        console.log(`[processOCR] ✅ Terminal: "${bestMatchLine}" → "${resolvedName}" (${(bestMatch.similarity * 100).toFixed(1)}%)`)
      } else {
        console.log('[processOCR] ⚠️ Ningún match superó el umbral 0.65')
      }
    }

    const rawText = `[TIPO]\n${rawTipo}\n[NOMBRE]\n${rawNombre}\n[ITEMS]\n${rawItemsText}`

    console.log('\n[processOCR] ── RESULTADO FINAL ──')
    console.log(`  type:    "${type}"`)
    console.log(`  mode:    "${mode}"`)
    console.log(`  terminal:"${resolvedName}"`)
    console.log(`  items:   ${rawItems.length}`)
    rawItems.forEach((it, idx) => console.log(`    [${idx}] ${JSON.stringify(it)}`))
    console.log('████████████████████████████████████\n')

    return {
      success: true,
      rawText,
      type,
      mode,
      stationName: resolvedName,
      items: rawItems,
      terminalId,
      terminal: matchedTerminal
    }

  } catch (err) {
    console.error('[processOCR] ❌ ERROR:', err.message)
    console.error(err)
    return { success: false, error: err.message }
  }
}

module.exports = { processOCR, extractItemShop }

// ══════════════════════════════════════════════════════════
// ITEM SHOP EXTRACTION
// ══════════════════════════════════════════════════════════

async function cropItemShop_header(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const left = Math.floor(width * 0.20), top = uiTop
  const w = Math.floor(width * 0.60), h = Math.floor(uiHeight * 0.20)
  console.log(`[cropItemShop_header] uiTop:${uiTop} → left:${left} top:${top} w:${w} h:${h}`)
  return await sharp(buffer).extract({ left, top, width: w, height: h }).toBuffer()
}

async function cropItemShop_destination(buffer, colorScheme = 'blue', uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const topByScheme = { dark: 0.13, blue: 0.18, orange: 0.18, light: 0.18 }
  const topPct = topByScheme[colorScheme] ?? 0.18
  const left = Math.floor(width * 0.05)
  const top = uiTop + Math.floor(uiHeight * topPct)
  const w = Math.floor(width * 0.50), h = Math.floor(uiHeight * 0.18)
  console.log(`[cropItemShop_destination] colorScheme:${colorScheme} uiTop:${uiTop} → left:${left} top:${top} w:${w} h:${h}`)
  const rawBuf = await sharp(buffer).extract({ left, top, width: w, height: h }).toBuffer()

  if (colorScheme === 'orange') {
    const { data, info } = await sharp(rawBuf).raw().toBuffer({ resolveWithObject: true })
    const ch = info.channels
    const rb = Buffer.alloc(info.width * info.height)
    for (let i = 0; i < rb.length; i++) {
      const r = data[i * ch], b = data[i * ch + 2]
      rb[i] = Math.max(0, Math.min(255, r - b))
    }
    return await sharp(rb, { raw: { width: info.width, height: info.height, channels: 1 } })
      .png().toBuffer()
  }
  return rawBuf
}

async function cropItemShop_col1(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const left = Math.floor(width * 0.09), top = uiTop + Math.floor(uiHeight * 0.25)
  const w = Math.floor(width * 0.29), h = Math.floor(uiHeight * 0.70)
  console.log(`[cropItemShop_col1] uiTop:${uiTop} → left:${left} top:${top} w:${w} h:${h}`)
  return await sharp(buffer).extract({ left, top, width: w, height: h }).toBuffer()
}

async function cropItemShop_col2(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const left = Math.floor(width * 0.39), top = uiTop + Math.floor(uiHeight * 0.25)
  const w = Math.floor(width * 0.23), h = Math.floor(uiHeight * 0.70)
  console.log(`[cropItemShop_col2] uiTop:${uiTop} → left:${left} top:${top} w:${w} h:${h}`)
  return await sharp(buffer).extract({ left, top, width: w, height: h }).toBuffer()
}

async function detectItemShopMode(buffer, width, height, uiBounds = null) {
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }

  // Los tabs BUY/SELL están en la franja superior izquierda del panel
  // En dark UI: BUY está ~13-22% del ancho, SELL ~22-32%, altura ~3-10% del panel
  const tabY = uiTop + Math.floor(uiHeight * 0.03)
  const tabH = Math.floor(uiHeight * 0.075)
  const buyX = Math.floor(width * 0.130), buyW = Math.floor(width * 0.085)
  const selX = Math.floor(width * 0.220), selW = Math.floor(width * 0.090)

  const brightness = async (x, y, w, h) => {
    const safeY = Math.max(0, y), safeH = Math.min(h, height - safeY)
    if (safeH < 1 || w < 1) return 0
    const raw = await sharp(buffer)
      .extract({ left: x, top: safeY, width: w, height: safeH })
      .grayscale().raw().toBuffer()
    let s = 0; for (const v of raw) s += v; return s / raw.length
  }

  const buyB = await brightness(buyX, tabY, buyW, tabH)
  const selB = await brightness(selX, tabY, selW, tabH)
  console.log(`[detectItemShopMode] BUY:${buyB.toFixed(1)} SELL:${selB.toFixed(1)} tabY:${tabY} tabH:${tabH}`)

  if (buyB > selB + 5) return 'buy'
  if (selB > buyB + 5) return 'sell'

  // Fallback OCR sobre la zona combinada
  const combined = await sharp(buffer)
    .extract({ left: buyX, top: tabY, width: selX + selW - buyX, height: tabH })
    .toBuffer()
  const proc = await sharp(combined)
    .resize({ width: (selX + selW - buyX) * 4, kernel: 'lanczos3' })
    .grayscale().normalize().threshold(130).toBuffer()
  const tmp = path.join(TMP_DIR, `ocr-itemtab-${Date.now()}.png`)
  await fs.promises.writeFile(tmp, proc)
  const text = (await runTesseract(tmp, 7)).toUpperCase()
  await fs.promises.unlink(tmp)
  console.log(`[detectItemShopMode] OCR tabs: "${text}"`)
  if (text.includes('SELL')) return 'sell'
  return 'buy'
}

function parseItemShopColumn(rawText, colLabel) {
  const VOLUME_RE    = /volume\s*[:\-]?\s*[A-Za-z@]?[\d,A-Za-z@]{1,8}[^\n]{0,15}?[µuypwv»]?s?cu/i
  const QUICK_BUY_RE = /quick\s*buy|juick\s*buy|auick\s*buy|ouick\s*buy/i
  const UI_NAV_RE    = /choose\s+(dest|category|subcategor|sub)/i
  const JUNK_RE      = /^(first|prior|next|last|\d+\/\d+|choose|search|item\s*name|all\s+cat|all\s+opt|subcate|wallet|gories|ategories|yc$|ier$|rch$)/i
  const NOISE_ONLY_RE = /^[^A-Za-z0-9]{0,2}$|^[a-z]{1,2}(\s+[a-z0-9]{0,2})*\s*$|^\W+$/
  const COLUMN_HEADER_RE = /^(rch|m\s+name|item\s+name|search|earch)$/i
  const PRICE_NOISE_RE   = /^(hars|p$|>)/i

  const extractVolume = (line) => {
    const m = line.match(/volume\s*[:\-]?\s*([A-Za-z@]?[A-Za-z\d,@]{1,10})\s*[µuypwv»]?[Pp]?[Ss][Cc][Uu]/i)
    if (!m) return null
    const raw = m[1]
      .replace(/[Oo]/g, '0').replace(/[lLI@]/g, '1').replace(/[Ss](?=\d)/g, '5')
      .replace(/[Bb]/g, '8').replace(/,/g, '').replace(/^[A-Za-z]/, '')
    const v = parseInt(raw)
    return (!isNaN(v) && v > 0 && v < 10_000_000) ? v : null
  }

  const extractPrice = (line) => {
    let s = line.replace(/^[\s¤₤£€MmNnOo|]+/, '').trim()
    const dotThousands = s.match(/^(\d{1,2})\.(\d{3})\b/)
    if (dotThousands) {
      const val = parseInt(dotThousands[1] + dotThousands[2])
      if (!isNaN(val) && val >= 10 && val <= 10_000_000) return val
    }
    const splitThousands = s.match(/^(\d{1,2})\s+(\d{3})\b/)
    if (splitThousands) {
      const val = parseInt(splitThousands[1] + splitThousands[2])
      if (!isNaN(val) && val >= 1000 && val <= 10_000_000) return val
    }
    const nums = [...line.matchAll(/\b([\d]{1,3}(?:,[\d]{3})+|[\d]{2,7})\b/g)]
    if (!nums.length) return null
    const val = parseInt(nums[nums.length - 1][1].replace(/,/g, ''))
    return (!isNaN(val) && val >= 10 && val <= 10_000_000) ? val : null
  }

  const isPriceLine = (line) => {
    const tokens = line.replace(/[^A-Za-z0-9,]/g, ' ').trim().split(/\s+/).filter(Boolean)
    const hasNum  = tokens.some(t => /^\d/.test(t.replace(/,/g, '')) && t.replace(/,/g, '').length >= 2)
    const hasWord = tokens.some(t => t.length >= 3 && /[A-Za-z]{3}/.test(t) && !/^(pSCU|ypSCU|SCU|yps|PSCU|USCU)/i.test(t))
    return hasNum && !hasWord
  }

  const isNameLine = (line) => {
    if (QUICK_BUY_RE.test(line))  return false
    if (UI_NAV_RE.test(line))     return false
    if (JUNK_RE.test(line))       return false
    if (NOISE_ONLY_RE.test(line)) return false
    if (VOLUME_RE.test(line))     return false
    if (isPriceLine(line))        return false
    if (/\S{20,}/.test(line))     return false
    const clean = line.replace(/[^A-Za-z0-9\s\-'()]/g, ' ').trim()
    return /[A-Za-z]{3,}/.test(clean)
  }

  const rawLines = rawText.split(/\r?\n/).map(l => l.trim())
    .filter(l => l.length > 0 && !(l.length > 35 && !/\s/.test(l)))
  console.log(`[parseItemShopColumn:${colLabel}] ${rawLines.length} líneas raw`)

  const volumeIdxs   = rawLines.reduce((a, l, i) => { if (VOLUME_RE.test(l))    a.push(i); return a }, [])
  const quickBuyIdxs = rawLines.reduce((a, l, i) => { if (QUICK_BUY_RE.test(l)) a.push(i); return a }, [])
  console.log(`[parseItemShopColumn:${colLabel}] ${volumeIdxs.length} anchors VOLUME, ${quickBuyIdxs.length} anchors QUICK BUY`)

  const useQuickBuy = quickBuyIdxs.length > 0 && volumeIdxs.length < quickBuyIdxs.length
  console.log(`[parseItemShopColumn:${colLabel}] estrategia: ${useQuickBuy ? 'QUICK BUY' : 'VOLUME'}`)

  const items = []

  if (!useQuickBuy) {
    // ── Estrategia VOLUME ──
    for (let vi = 0; vi < volumeIdxs.length; vi++) {
      const vIdx     = volumeIdxs[vi]
      const prevVIdx = volumeIdxs[vi - 1] ?? -1
      const nextVIdx = volumeIdxs[vi + 1] ?? rawLines.length
      const volumeUSCU = extractVolume(rawLines[vIdx])

      const nameFrom = Math.max(prevVIdx + 1, vIdx - 3)
      const nameParts = []
      for (let k = nameFrom; k < vIdx; k++) {
        const l = rawLines[k]
        if (COLUMN_HEADER_RE.test(l.trim())) continue
        if (!isNameLine(l)) continue
        const clean = l.replace(/[^A-Za-z0-9\s\-'()]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
        if (/[A-Z]{3,}/.test(clean)) nameParts.push(clean)
      }
      let name = nameParts.join(' ').replace(/\s+/g, ' ').trim()
      name = name.replace(/^(QUICK\s+BUY|JUICK\s+BUY|AUICK\s+BUY)\s+/i, '').trim()
      name = name.replace(/^(CHOOSE\s+CATEGORY\s+CHOOSE\s+SUBCATEGORY\s+[A-Z]?\s*)/i, '').trim()
      name = name.replace(/^(?:[A-Z0-9"'`=]{1,2}\s+)+(?=[A-Z]{3})/, '').trim()
      for (let strip = 0; strip < 3; strip++) {
        const m = name.match(/^([A-Z0-9]{1,3})\s+(.+)$/)
        if (!m) break
        if (/[A-Z][A-Z0-9\-']{3,}/.test(m[2])) { name = m[2] } else break
      }

      let price = null
      for (let j = vIdx + 1; j < Math.min(nextVIdx, vIdx + 6); j++) {
        const l = rawLines[j]
        if (VOLUME_RE.test(l) || QUICK_BUY_RE.test(l)) break
        if (PRICE_NOISE_RE.test(l.trim())) continue
        const c = extractPrice(l)
        if (c !== null) {
          const wordTokens = l.replace(/[^A-Za-z]/g, ' ').trim().split(/\s+/).filter(w => w.length >= 4)
          if (wordTokens.length === 0) {
            price = c
            console.log(`[parseItemShopColumn:${colLabel}]   precio en "${l}" → ${price}`)
            break
          }
        }
      }

      if (!name || name.length < 3) { console.log(`[parseItemShopColumn:${colLabel}] ⚠️  nombre vacío vIdx:${vIdx}`); continue }
      console.log(`[parseItemShopColumn:${colLabel}] ✅ "${name}" vol:${volumeUSCU}µSCU price:${price}`)
      items.push({ name, volumeUSCU, price })
    }

  } else {
    // ── Estrategia QUICK BUY ──
    const boundaries = [-1, ...quickBuyIdxs]
    for (let bi = 0; bi < quickBuyIdxs.length; bi++) {
      const blockStart = boundaries[bi] + 1
      const blockEnd   = quickBuyIdxs[bi]
      console.log(`\n[parseItemShopColumn:${colLabel}] ── Bloque QB[${bi}]: líneas ${blockStart}–${blockEnd - 1}`)

      const blockLines = rawLines.slice(blockStart, blockEnd)

      const volLine    = blockLines.find(l => VOLUME_RE.test(l))
      const volumeUSCU = volLine ? extractVolume(volLine) : null
      const volIdx     = volLine ? blockLines.indexOf(volLine) : blockLines.length

      const nameParts = []
      for (let k = 0; k < volIdx; k++) {
        const l = blockLines[k]
        if (COLUMN_HEADER_RE.test(l.trim())) continue
        if (!isNameLine(l)) continue
        const clean = l.replace(/[^A-Za-z0-9\s\-'()]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
        if (/[A-Z]{3,}/.test(clean)) nameParts.push(clean)
      }
      let name = nameParts.join(' ').replace(/\s+/g, ' ').trim()
      name = name.replace(/^(QUICK\s+BUY|JUICK\s+BUY|AUICK\s+BUY)\s+/i, '').trim()
      name = name.replace(/^(?:[A-Z0-9"'`=]{1,2}\s+)+(?=[A-Z]{3})/, '').trim()
      for (let strip = 0; strip < 3; strip++) {
        const m = name.match(/^([A-Z0-9]{1,3})\s+(.+)$/)
        if (!m) break
        if (/[A-Z][A-Z0-9\-']{3,}/.test(m[2])) { name = m[2] } else break
      }

      // Precio: buscar en blockLines después del volume,
      // Y también en la línea inmediatamente ANTES del QUICK BUY actual
      // (a veces el precio queda fuera del bloque por corrupción OCR)
      let price = null
      const priceSearchFrom = volLine ? volIdx + 1 : 0

      // Búsqueda dentro del bloque
      for (let k = priceSearchFrom; k < blockLines.length; k++) {
        const l = blockLines[k]
        if (VOLUME_RE.test(l)) continue
        if (PRICE_NOISE_RE.test(l.trim())) continue
        const c = extractPrice(l)
        if (c !== null) {
          const wordTokens = l.replace(/[^A-Za-z]/g, ' ').trim().split(/\s+/).filter(w => w.length >= 4)
          if (wordTokens.length === 0) {
            price = c
            console.log(`[parseItemShopColumn:${colLabel}]   precio en "${l}" → ${price}`)
            break
          }
        }
      }

      // FIX: si no encontramos precio en el bloque, intentar extraerlo de líneas
      // ruidosas que contienen números mezclados con símbolos (ej: "> Hars = |" = "₡275")
      if (price === null) {
        for (let k = priceSearchFrom; k < blockLines.length; k++) {
          const l = blockLines[k]
          if (VOLUME_RE.test(l)) continue
          // Intentar extraer precio ignorando palabras cortas (ruido OCR del símbolo ₡)
          const stripped = l.replace(/^[^0-9]*/, '').trim()  // quitar prefijo no-numérico
          const c = extractPrice(stripped)
          if (c !== null) {
            price = c
            console.log(`[parseItemShopColumn:${colLabel}]   precio (stripped) en "${l}" → ${price}`)
            break
          }
        }
      }

      if (!name || name.length < 3) { console.log(`[parseItemShopColumn:${colLabel}] ⚠️  nombre vacío bloque QB[${bi}]`); continue }
      console.log(`[parseItemShopColumn:${colLabel}] ✅ "${name}" vol:${volumeUSCU ?? '?'}µSCU price:${price}`)
      items.push({ name, volumeUSCU, price })
    }
  }

  console.log(`\n[parseItemShopColumn:${colLabel}] Total: ${items.length}`)
  return items
}

function parseItemShopGrid(rawCol1, rawCol2) {
  console.log('\n[parseItemShopGrid] ── INICIO (2 columnas) ──')
  const col1Items = parseItemShopColumn(rawCol1, 'col1')
  const col2Items = parseItemShopColumn(rawCol2, 'col2')

  const items = []
  const maxLen = Math.max(col1Items.length, col2Items.length)
  for (let i = 0; i < maxLen; i++) {
    if (col1Items[i]) items.push(col1Items[i])
    if (col2Items[i]) items.push(col2Items[i])
  }

  console.log(`[parseItemShopGrid] Total combinado: ${items.length}`)
  return items
}

async function extractItemShop(imageBuffer, colorScheme, triageTabText = '', uiBounds = null) {
  console.log('\n==============================')
  console.log('[extractItemShop] INICIO colorScheme:', colorScheme)
  await ensureDebugDir()

  const { width, height } = await sharp(imageBuffer).metadata()

  const headerBuf = await cropItemShop_header(imageBuffer, uiBounds)
  await saveDebugImage(headerBuf, '20-item-header-raw.png')
  const hm = await sharp(headerBuf).metadata()

  const ocrHeaderPass = async (pipeline, suffix) => {
    const proc = await pipeline(sharp(headerBuf).resize({ width: hm.width * 3, kernel: 'lanczos3' })).toBuffer()
    await saveDebugImage(proc, `21-item-header-${suffix}.png`)
    const tmp = path.join(TMP_DIR, `ocr-itemhdr-${suffix}-${Date.now()}.png`)
    await fs.promises.writeFile(tmp, proc)
    const text = await runTesseract(tmp, 6)
    await fs.promises.unlink(tmp)
    return text
  }

  const h1 = await ocrHeaderPass(s => s.grayscale().normalize().sharpen({ sigma: 1.5 }), 'norm')
  const h2 = await ocrHeaderPass(s => s.grayscale().negate().normalize().threshold(130).sharpen({ sigma: 1 }), 'neg')
  const h3 = await ocrHeaderPass(s => s.grayscale().normalize().threshold(colorScheme === 'light' ? 160 : 100), 'thr')

  const rawHeader = [h1, h2, h3].join('\n')
  console.log('[extractItemShop] rawHeader (combinado):\n' + rawHeader)
  const subtypeSource = triageTabText ? triageTabText + '\n' + rawHeader : rawHeader
  const shopSubtype = detectItemShopSubtype(subtypeSource)
  console.log(`[extractItemShop] shopSubtype: "${shopSubtype}" (triageTab: "${triageTabText}")`)

  const destBuf = await cropItemShop_destination(imageBuffer, colorScheme, uiBounds)
  await saveDebugImage(destBuf, '22-item-destination-raw.png')
  const dm = await sharp(destBuf).metadata()
  const destProc = await sharp(destBuf).resize({ width: dm.width * 3, kernel: 'lanczos3' }).grayscale().normalize().sharpen({ sigma: 1.5 }).toBuffer()
  await saveDebugImage(destProc, '23-item-destination-processed.png')
  const tmpD = path.join(TMP_DIR, `ocr-itemdest-${Date.now()}.png`)
  await fs.promises.writeFile(tmpD, destProc)
  const rawDest = await runTesseract(tmpD, 6)
  await fs.promises.unlink(tmpD)
  const rawDestLines = rawDest.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  console.log(`[extractItemShop] rawDest líneas: ${JSON.stringify(rawDestLines)}`)

  // ── Pasada dedicada al dropdown "CHOOSE DESTINATION" ──
  // Crop preciso sobre la fila del valor seleccionado (~19-22% del panel)
  let destinationDirect = null
  try {
    const { width: iw, height: ih } = await sharp(imageBuffer).metadata()
    const { uiTop: ut = 0, uiHeight: uh = ih } = uiBounds ?? {}

    // La fila del dropdown de destination está ~19-22% del panel
    // Para dark UI está un poco más arriba que para orange
const ddTopPct = colorScheme === 'dark' ? 0.175 : 0.225
const ddLeft   = Math.floor(iw * 0.09)
const ddTop    = ut + Math.floor(uh * ddTopPct)
const ddWidth  = Math.max(1, Math.floor(iw * 0.42))   // FIX: guard contra 0
const ddHeight = Math.max(20, Math.floor(uh * 0.040))

    const ddBuf = await sharp(imageBuffer)
      .extract({ left: ddLeft, top: ddTop, width: ddWidth, height: ddHeight })
      .toBuffer()
    await saveDebugImage(ddBuf, '22b-item-dest-dropdown.png')

    const ddMeta = await sharp(ddBuf).metadata()
    const ddScale = Math.max(1, Math.min(6, Math.floor(600 / Math.max(ddMeta.width, 1))))

    // Para dark UI: threshold alto para texto blanco sobre fondo gris oscuro
    const ddPipeline = colorScheme === 'dark'
      ? sharp(ddBuf).resize({ width: ddMeta.width * ddScale, kernel: 'lanczos3' }).grayscale().normalize().threshold(120)
      : sharp(ddBuf).resize({ width: ddMeta.width * ddScale, kernel: 'lanczos3' }).grayscale().normalize().sharpen({ sigma: 1.5 })

    const ddProc = await ddPipeline.toBuffer()
    await saveDebugImage(ddProc, '22c-item-dest-dropdown-proc.png')
    const tmpDD = path.join(TMP_DIR, `ocr-itemdest-dd-${Date.now()}.png`)
    await fs.promises.writeFile(tmpDD, ddProc)
    const rawDD = await runTesseract(tmpDD, 7)
    await fs.promises.unlink(tmpDD)
    console.log(`[extractItemShop] dest-dropdown raw: "${rawDD.trim()}"`)

    let ddVal = rawDD
      .replace(/[^A-Za-z0-9\s\-']/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\s*(all\s+options?|all\s+opt)\s*$/gi, '').trim()
      .replace(/(\s+[a-z]{1,2}){1,3}$/i, '').trim()
      .replace(/^[a-z]{1,2}\s+/i, '').trim()

    if (ddVal.length >= 3 && !/^(choose|all\s|search|item\s*name)/i.test(ddVal)) {
      destinationDirect = ddVal
      console.log(`[extractItemShop] ✅ dest-dropdown directo: "${destinationDirect}"`)
    }
  } catch (e) {
    console.log(`[extractItemShop] dest-dropdown error: ${e.message}`)
  }

  const DEST_LABEL_RE = /^choose\s+(dest|sub|cat|subcat)/i
  const DEST_UI_RE = /^(all\s+(cat|opt|sub)|search|item\s*name|choose\s+sub)/i
  const DEST_JUNK_RE = /^[^A-Za-z0-9]+$/
  // FIX: línea válida de destination — debe tener al menos 3 chars reales
  // y al menos 1 token de longitud >= 3 (filtra "1 B e e", "R o", etc.)
  const isValidDestLine = (line) => {
    const cleaned = line.replace(/[^A-Za-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim()
    if (cleaned.length < 3) return false
    if (/^(sell|buy|wallet|all\s+opt|choose|search|item\s*name)/i.test(cleaned)) return false
    const longTokens = cleaned.split(/\s+/).filter(t => t.length >= 3)
    return longTokens.length >= 1
  }

  let destination = destinationDirect ?? null
  if (!destination) {
    for (const line of rawDestLines) {
      if (DEST_LABEL_RE.test(line)) continue
      if (DEST_UI_RE.test(line)) continue
      if (DEST_JUNK_RE.test(line)) continue
      if (!isValidDestLine(line)) continue   // FIX: filtra basura corta

      const cleaned = line
        .replace(/choose\s+(sub.?dest|dest|category|subcat).*/i, '')
        .replace(/\ball\s+options?\b.*/i, '')
        .replace(/\ball\s+opt\b.*/i, '')
        .replace(/\ball\s+cat.*/i, '')
        .replace(/[^A-Za-z0-9\s\-]/g, ' ')
        .replace(/\s+/g, ' ').trim()

      if (cleaned.length >= 3 && !/^(sell|buy|wallet|blue\s+inf|eee)/i.test(cleaned)) {
        destination = cleaned
        console.log(`[extractItemShop] destination candidate: "${cleaned}"`)
        break
      }
    }
  }

  if (!destination) {
    for (const line of rawDestLines) {
      const m = line.match(/choose\s+(?:sub.?)?dest(?:ination)?\s+(.+)/i)
      if (m) {
        const val = m[1].replace(/[^A-Za-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim()
        if (val.length >= 3 && !/^(all\s+(opt|cat)|choose)/i.test(val)) {
          destination = val
          console.log(`[extractItemShop] destination inline: "${destination}"`)
          break
        }
      }
    }
  }

  console.log(`[extractItemShop] destination: "${destination}"`)

  const mode = await detectItemShopMode(imageBuffer, width, height, uiBounds)
  console.log(`[extractItemShop] mode: "${mode}"`)

  const isCasaba = shopSubtype === 'casaba'

  const ocrCol = async (buf, label, debugIdx) => {
    await saveDebugImage(buf, `${debugIdx}-item-${label}-raw.png`)
    const m = await sharp(buf).metadata()
    const scale = Math.min(3, Math.floor(1800 / m.width))
    const proc = isCasaba
      ? await sharp(buf).resize({ width: m.width * scale, kernel: 'lanczos3' }).grayscale().normalize().threshold(160).toBuffer()
      : await sharp(buf).resize({ width: m.width * scale, kernel: 'lanczos3' }).grayscale().normalize().sharpen({ sigma: 1.5 }).toBuffer()
    await saveDebugImage(proc, `${debugIdx}b-item-${label}-processed.png`)
    const tmp = path.join(TMP_DIR, `ocr-item${label}-${Date.now()}.png`)
    await fs.promises.writeFile(tmp, proc)
    const raw = await runTesseract(tmp, 6)
    await fs.promises.unlink(tmp)
    console.log(`[extractItemShop] raw${label}:\n` + raw)
    return raw
  }

  const col1Buf = await cropItemShop_col1(imageBuffer, uiBounds)
  const col2Buf = await cropItemShop_col2(imageBuffer, uiBounds)
  const rawCol1 = await ocrCol(col1Buf, 'col1', '24')
  const rawCol2 = await ocrCol(col2Buf, 'col2', '25')

  const items = parseItemShopGrid(rawCol1, rawCol2)
  const rawGrid = `[COL1]\n${rawCol1}\n[COL2]\n${rawCol2}`

  console.log('\n[extractItemShop] ── RESULTADO ──')
  console.log(`  shopSubtype: "${shopSubtype}"`)
  console.log(`  destination: "${destination}"`)
  console.log(`  mode: "${mode}"`)
  console.log(`  items: ${items.length}`)
  items.forEach((it, idx) => console.log(`    [${idx}] ${JSON.stringify(it)}`))
  console.log('==============================\n')

  return { shopSubtype, destination, mode, items, rawHeader, rawGrid }
}