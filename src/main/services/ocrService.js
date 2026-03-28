// src/main/services/ocrService.js

// #region Imports & Constants

const { app } = (() => { try { return require('electron') } catch { return {} } })()
const { execFile } = require('child_process')
const fs   = require('fs')
const os   = require('os')
const path = require('path')
const sharp = require('sharp')
const uexCache = require('../helpers/uexCache')
const { runOCRPass, runOCRFull, runTesseractPass } = require('../helpers/ocrHelper')

const TMP_DIR = os.tmpdir()

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

const IS_DEV = !app?.isPackaged
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
  try { await fs.promises.writeFile(path.join(DEBUG_DIR, name), buffer) } catch (e) {}
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
  else if (rgRatio > 1.4) scheme = 'orange'
  else if (avgB > avgR + 10 && avgB > avgG + 5) scheme = 'blue'
  
  console.log(`[OCR:Color] Avg RGB: (${avgR.toFixed(1)}, ${avgG.toFixed(1)}, ${avgB.toFixed(1)}), Brightness: ${avgBrightness.toFixed(1)}, RG Ratio: ${rgRatio.toFixed(2)} => Scheme: ${scheme.toUpperCase()}`)
  return scheme
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
  console.log(`[OCR:Mode] Positional fallback: peak at ${(maxCol/panelW*100).toFixed(1)}% => ${fallbackMode.toUpperCase()}`)
  return fallbackMode
}

/** Detects mode for Item Shops using relative brightness.
 */
async function detectItemShopMode(buffer, width, height, uiBounds = null) {
  const { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const tabY = uiTop + Math.floor(uiHeight * 0.135), tabH = Math.floor(uiHeight * 0.045), buyX = Math.floor(width * 0.08), buyW = Math.floor(width * 0.08), selX = Math.floor(width * 0.17), selW = Math.floor(width * 0.08)
  const getAvg = async (x, label) => {
    const raw = await sharp(buffer).extract({ left: x, top: tabY, width: buyW, height: tabH }).grayscale().raw().toBuffer()
    const avg = raw.reduce((a, b) => a + b, 0) / raw.length
    console.log(`[OCR:ItemMode] ${label} button avg brightness: ${avg.toFixed(1)}`)
    return avg
  }
  const buyAvg = await getAvg(buyX, 'BUY'), sellAvg = await getAvg(selX, 'SELL'), diff = Math.abs(buyAvg - sellAvg)
  console.log(`[OCR:ItemMode] Diff: ${diff.toFixed(1)} (Threshold: 20)`)
  if (diff < 20) {
    console.warn('[OCR:ItemMode] Difference too small, mode uncertain.')
    return null
  }
  const mode = buyAvg > sellAvg ? 'buy' : 'sell'
  console.log(`[OCR:ItemMode] BUY crop: x=${buyX} y=${tabY} w=${buyW} h=${tabH}`)
  console.log(`[OCR:ItemMode] SELL crop: x=${selX} y=${tabY} w=${buyW} h=${tabH}`)
  console.log(`[OCR:ItemMode] Result: ${mode.toUpperCase()}`)
  return mode
}

// #endregion

// #region Image Preprocessing
async function preprocessNombreSoft(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().normalize().sharpen().toBuffer() }
async function preprocessPass1(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().normalize().threshold(100).sharpen().toBuffer() }
async function preprocessPass2(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().negate().normalize().sharpen().toBuffer() }
async function preprocessSectorB_orange(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().normalize().sharpen({ sigma: 1.5 }).toBuffer() }
async function preprocessSectorB_blue(buffer) { const m = await sharp(buffer).metadata(); return await sharp(buffer).resize({ width: m.width * 3 }).grayscale().normalize().sharpen({ sigma: 1.5 }).toBuffer() }
// #endregion

// #region Crop Functions

async function cropSectorA_tipo(buffer, uiBounds = null, colorScheme = 'blue') {
  const { width, height } = await sharp(buffer).metadata(), { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  // Generous crop: start early and go tall enough to always catch the type label
  // regardless of resolution, distance, or slight tilt.
  // Orange UI: label is lower (~6%) due to decorative top border.
  // All schemes: 14% height gives plenty of margin.
  const topPct = colorScheme === 'orange' ? 0.04 : 0.01
  const crop = {
    left:   Math.floor(width * 0.02),
    top:    Math.max(0, uiTop + Math.floor(uiHeight * topPct)),
    width:  Math.floor(width * 0.45),
    height: Math.floor(uiHeight * 0.14),
  }
  console.log(`[OCR:Crop] SectorA_tipo (${colorScheme}): ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}
async function cropSectorA_nombre(buffer, colorScheme = 'blue', uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata(), { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  // Generous crop: covers from ~12% to ~38% of panel height.
  // This ensures the dropdown row (station name) is always included regardless of
  // resolution, zoom level, or slight vertical offset between screenshots.
  // The blacklist in extractValidLines handles the extra UI labels (YOUR INVENTORIES, etc.).
  const tops = { dark: 0.10, blue: 0.13, orange: 0.13, light: 0.13 }
  const hts  = { dark: 0.28, blue: 0.28, orange: 0.30, light: 0.28 }
  const crop = {
    left:   Math.floor(width * 0.04),
    top:    uiTop + Math.floor(uiHeight * (tops[colorScheme] ?? 0.13)),
    width:  Math.floor(width * 0.44),
    height: Math.floor(uiHeight * (hts[colorScheme]  ?? 0.28)),
  }
  console.log(`[OCR:Crop] SectorA_nombre (${colorScheme}): ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
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
    left:   Math.floor(width * 0.61),
    top:    uiTop + Math.floor(uiHeight * 0.22),
    width:  Math.floor(width * 0.39),
    height: Math.floor(uiHeight * 0.75)
  }
  console.log(`[OCR:Crop] SectorB_items: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}
async function cropItemShop_header(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata(), { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const crop = { left: Math.floor(width * 0.20), top: uiTop, width: Math.floor(width * 0.60), height: Math.floor(uiHeight * 0.20) }
  console.log(`[OCR:Crop] ItemShop_header: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}
async function cropItemShop_destination(buffer, colorScheme = 'blue', uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata(), { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const topPct = { dark: 0.13, blue: 0.18, orange: 0.18, light: 0.18 }[colorScheme] ?? 0.18
  const crop = { left: Math.floor(width * 0.05), top: uiTop + Math.floor(uiHeight * topPct), width: Math.floor(width * 0.50), height: Math.floor(uiHeight * 0.18) }
  console.log(`[OCR:Crop] ItemShop_destination (${colorScheme}): ${JSON.stringify(crop)}`)
  const rawBuf = await sharp(buffer).extract(crop).toBuffer()
  if (colorScheme === 'orange') {
    const { data, info } = await sharp(rawBuf).raw().toBuffer({ resolveWithObject: true }), ch = info.channels, rb = Buffer.alloc(info.width * info.height)
    for (let i = 0; i < rb.length; i++) rb[i] = Math.max(0, Math.min(255, data[i * ch] - data[i * ch + 2]))
    return await sharp(rb, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer()
  }
  return rawBuf
}
async function cropItemShop_col1(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata(), { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const crop = { left: Math.floor(width * 0.09), top: uiTop + Math.floor(uiHeight * 0.25), width: Math.floor(width * 0.29), height: Math.floor(uiHeight * 0.70) }
  console.log(`[OCR:Crop] ItemShop_col1: ${JSON.stringify(crop)}`)
  return await sharp(buffer).extract(crop).toBuffer()
}
async function cropItemShop_col2(buffer, uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata(), { uiTop, uiHeight } = uiBounds ?? { uiTop: 0, uiHeight: height }
  const crop = { left: Math.floor(width * 0.39), top: uiTop + Math.floor(uiHeight * 0.25), width: Math.floor(width * 0.23), height: Math.floor(uiHeight * 0.70) }
  console.log(`[OCR:Crop] ItemShop_col2: ${JSON.stringify(crop)}`)
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

// #region Commodity Sector Parsing (Sector B)


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
function parseSectorBItems(rawText, commodities = [], ocrMethod = 'tesseract', tessarctPrices = []) {
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
    if (!price && tessarctPrices.length > priceIndex) {
      price = tessarctPrices[priceIndex]
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
function mergeWinOcrWithTesseractPrices(winText, tessText) {
  // No concatenar — devolver solo winText, los precios se inyectan aparte
  return winText
}

// #endregion

// #region Item Shop Parsing

function detectItemShopSubtype(raw) {
  const up = raw.toUpperCase().replace(/[^A-Z0-9\s_]/g, ' ')
  if (/CENTER\s*MASS/.test(up)) return 'center_mass'; if (/CUBBY\s*BLAST/.test(up)) return 'cubby_blast'
  if (/CASABA/.test(up)) return 'casaba'; if (/REFINERY\s*SHOP/.test(up)) return 'refinery_shop'
  if (/TEACH|EACHS|DALLET|SWR\s*AS|ITEM\s*SHOP|TEACH\s*S/.test(up)) return 'teachs'; if (/PHARMACY/.test(up)) return 'pharmacy'
  if (/WEAPONS[\s_]*SHOP/.test(up)) return 'weapons_shop'; if (/\bARMOR\b/.test(up)) return 'armor_shop'
  if (/SKUTTERS/.test(up)) return 'skutters'; if (/DUMPER/.test(up)) return 'dumpers_depot'
  if (/PLATINUM/.test(up)) return 'platinum_bay'; if (/GARRITY/.test(up)) return 'garrity_defense'
  if (/CONSCIENTIOUS/.test(up)) return 'conscientious_objects'
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
function parseItemShopColumn(rawText, colLabel) {
  const VOL = /vol[uo]n[ue][e.]?\s*[:\-.]?\s*[\w,µuypwv»]{1,15}\s*[µuypwv»]?[Pp]?[Ss][Cc][Uu]/i
  const QB  = /quick\s*buy|juick\s*buy|auick\s*buy|ouick\s*buy|2uick\s*buy/i
  const JUNK = /^(choose|search|item\s*name|all\s+cat|all\s+opt|subcate|wallet|gories|ategories|uptions|rch$|m\s*name|levski|area18|orison|everus|port\s*ol|new\s*bab)/i

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)

  console.log(`[OCR:ItemShop:${colLabel}] Lines (${lines.length}):`)
  lines.forEach((l, i) => console.log(`  [${i}] "${l}"`))

  const getV = (l) => {
    const normalized = l
      .replace(/[Oo]/g, '0')
      .replace(/[lLI]/g, '1')
      .replace(/[Ss](?=\d)/g, '5')
      .replace(/[Bb]/g, '8')
    const m = normalized.match(/vol[uo0]n[ue][e.]?\s*[:\-.]?\s*[A-Za-z]?(\d[\d,]*)/i)
    if (!m) return null
    const v = parseInt(m[1].replace(/,/g, ''))
    return (!isNaN(v) && v > 0) ? v : null
  }

  const getP = (l) => {
    const normalized = l
      .replace(/[⌀øØ¤]/g, '')
      .replace(/[Oo]/g, '0')
      .replace(/[lLI]/g, '1')
      .replace(/[Ss](?=\d|\b)/g, '5')
      .replace(/[Bb]/g, '8')
      .replace(/[tT](?=\d)/g, '1')
      .replace(/\?/g, '')
      .trim()

    // Número con coma como separador de miles: 10,780 → 10780
    const withComma = normalized.match(/(\d{1,3}(?:,\d{3})+)/)
    if (withComma) return parseInt(withComma[1].replace(/,/g, ''))

    // Número con punto como separador de miles: 8.640 → 8640
    const withDot = normalized.match(/(\d+)\.(\d{3})\b/)
    if (withDot) return parseInt(withDot[1] + withDot[2])

    // Número simple >= 10
    const nums = [...normalized.matchAll(/\b(\d{2,7})\b/g)]
    if (!nums.length) return null
    const vals = nums.map(m => parseInt(m[1])).filter(v => v >= 10 && v < 10_000_000)
    return vals.length ? Math.max(...vals) : null
  }

  const items = []

  // Encontrar dónde empiezan los items reales — después de los QB de UI
  const qIdxs = lines.reduce((a, l, i) => { if (QB.test(l)) a.push(i); return a }, [])

  let itemsStart = 0
  for (let qi = 0; qi < qIdxs.length; qi++) {
    const nextIdx = qIdxs[qi] + 1
    if (nextIdx < lines.length) {
      const nextLine = lines[nextIdx]
      if (!JUNK.test(nextLine) && !QB.test(nextLine) && /[A-Za-z]{3,}/.test(nextLine)) {
        itemsStart = nextIdx
        break
      }
    }
  }
  if (itemsStart === 0 && qIdxs.length > 0) {
    itemsStart = qIdxs[qIdxs.length - 1] + 1
  }

  console.log(`[OCR:ItemShop:${colLabel}] Items start at line ${itemsStart}: "${lines[itemsStart] ?? ''}"`)

  const itemLines = lines.slice(itemsStart)
  const vIdxs = itemLines.reduce((a, l, i) => {
    if (/vol[uo]n[ue]/i.test(l)) a.push(i)
    return a
  }, [])

  if (vIdxs.length > 0) {
    for (let vi = 0; vi < vIdxs.length; vi++) {
      const vIdx = vIdxs[vi]
      const prevVIdx = vi > 0 ? vIdxs[vi - 1] : -1
      const nameParts = []

      for (let k = prevVIdx + 1; k < vIdx; k++) {
        const l = itemLines[k]
        if (!l || QB.test(l) || /vol[uo]n[ue]/i.test(l) || JUNK.test(l)) continue
        // Saltar líneas de precio/basura
        if (l.startsWith('⌀') || l.startsWith('?') || /^[^A-Za-z]*$/.test(l)) continue
        const alphaRatio = (l.match(/[A-Za-z]/g) || []).length / Math.max(l.length, 1)
        if (alphaRatio < 0.5) continue
        if (/[A-Za-z]{3,}/.test(l)) nameParts.push(l.replace(/[^A-Za-z0-9\s\-'()]/g, ' ').trim())
      }

      let name = nameParts.join(' ').toUpperCase().trim()
      if (!name || JUNK.test(name)) continue

      // Precio después del Volume
      const nextVIdx = vIdxs[vi + 1] ?? itemLines.length
      let price = null
      for (let j = vIdx + 1; j < Math.min(nextVIdx, vIdx + 4); j++) {
        if (QB.test(itemLines[j])) break
        const p = getP(itemLines[j])
        if (p && p >= 10) { price = p; break }
      }
      // Precio antes del Volume si no encontramos después
      if (!price) {
        for (let k = prevVIdx + 1; k < vIdx; k++) {
          const p = getP(itemLines[k])
          if (p && p >= 10) { price = p; break }
        }
      }

      const vol = getV(itemLines[vIdx])
      console.log(`[OCR:ItemShop:${colLabel}] Found: "${name}" | Vol: ${vol}, Price: ${price}`)
      items.push({ name, volumeUSCU: vol, price })
    }
  } else {
    // Fallback sin Volume: parsear alternando nombres y precios
    let currentName = null
    for (let k = 0; k < itemLines.length; k++) {
      const l = itemLines[k]
      if (!l || QB.test(l) || JUNK.test(l)) continue
      if (l.startsWith('⌀') || /^[^A-Za-z]*$/.test(l)) {
        const p = getP(l)
        if (p && currentName) {
          console.log(`[OCR:ItemShop:${colLabel}] Found (no-vol): "${currentName}" | Vol: null, Price: ${p}`)
          items.push({ name: currentName.toUpperCase(), volumeUSCU: null, price: p })
          currentName = null
        }
        continue
      }
      const alphaRatio = (l.match(/[A-Za-z]/g) || []).length / Math.max(l.length, 1)
      if (alphaRatio >= 0.5 && /[A-Za-z]{3,}/.test(l)) {
        if (currentName) {
          console.log(`[OCR:ItemShop:${colLabel}] Found (no-vol): "${currentName}" | Vol: null, Price: null`)
          items.push({ name: currentName.toUpperCase(), volumeUSCU: null, price: null })
        }
        currentName = l.replace(/[^A-Za-z0-9\s\-'()]/g, ' ').trim()
      } else {
        const p = getP(l)
        if (p && currentName) {
          console.log(`[OCR:ItemShop:${colLabel}] Found (no-vol): "${currentName}" | Vol: null, Price: ${p}`)
          items.push({ name: currentName.toUpperCase(), volumeUSCU: null, price: p })
          currentName = null
        }
      }
    }
    if (currentName) items.push({ name: currentName.toUpperCase(), volumeUSCU: null, price: null })
  }

  return items
}
function parseItemShopGrid(raw1, raw2) { const c1 = parseItemShopColumn(raw1, 'col1'), c2 = parseItemShopColumn(raw2, 'col2'), res = [], max = Math.max(c1.length, c2.length); for (let i = 0; i < max; i++) { if (c1[i]) res.push(c1[i]); if (c2[i]) res.push(c2[i]) }; return res }

async function extractItemShop(buffer, colorScheme, triageTabText = '', uiBounds = null) {
  const { width, height } = await sharp(buffer).metadata()
  const header = await cropItemShop_header(buffer, uiBounds)
  const hm = await sharp(header).metadata()
  console.log(`[OCR:ItemShop] Analyzing header... (Triage: "${triageTabText}")`)
  await saveDebugImage(header, '20-itemshop-header.png')

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
  const shopSubtype = detectItemShopSubtype(triageTabText ? triageTabText + '\n' + rawH : rawH)
  console.log(`[OCR:ItemShop] Subtype detected: ${shopSubtype.toUpperCase()}`)

  const destBuf = await cropItemShop_destination(buffer, colorScheme, uiBounds)
  const dm = await sharp(destBuf).metadata()
  await saveDebugImage(destBuf, '21-itemshop-destination.png')
  const dProc = await sharp(destBuf).resize({ width: dm.width * 3 }).grayscale().normalize().sharpen().toBuffer()
  const rawD = await runOCRPass(dProc, 6)

  let destination = null
  try {
    const ddTop = (shopSubtype === 'teachs' ? 0.245 : 0.225)
    console.log(`[OCR:ItemShop] Trying Dropdown at Top=${ddTop.toFixed(3)}`)
    const ddBuf = await sharp(buffer).extract({
      left: Math.floor(width * 0.08),
      top: (uiBounds?.uiTop ?? 0) + Math.floor((uiBounds?.uiHeight ?? height) * ddTop),
      width: Math.floor(width * 0.28),
      height: Math.floor((uiBounds?.uiHeight ?? height) * 0.035)
    }).toBuffer()
    await saveDebugImage(ddBuf, '22-itemshop-dropdown.png')
    const ddm = await sharp(ddBuf).metadata()
    const ddp = await sharp(ddBuf).resize({ width: ddm.width * 4 }).grayscale().negate().normalize().threshold(160).toBuffer()
    await saveDebugImage(ddp, '23-itemshop-dropdown-processed.png')
    let rdd = await runOCRPass(ddp, 7)
    if (!rdd.trim()) rdd = await runOCRPass(ddp, 6)
    let val = rdd.trim()
      .replace(/CHOOSE\s+DESTINATION/gi, '')
      .replace(/[^A-Za-z0-9\s\-']/g, ' ')
      .trim()
    if (val.includes('-')) val = val.split('-').pop().trim()
    if (val.length >= 3) {
      destination = val
      console.log(`[OCR:ItemShop] Dropdown Destination: "${destination}"`)
    }
  } catch (e) {
    console.warn(`[OCR:ItemShop] Dropdown extraction failed: ${e.message}`)
  }

  if (!destination) {
    for (const l of rawD.split(/\r?\n/)) {
      const c = l.replace(/[^A-Za-z0-9\s\-]/g, ' ').trim()
      if (c.length >= 3 && !/^(sell|buy|wallet|choose|search)/i.test(c)) { destination = c; break }
    }
    console.log(`[OCR:ItemShop] Fallback Destination: "${destination}"`)
  }

  const mode = await detectItemShopMode(buffer, width, height, uiBounds)
  console.log(`[OCR:ItemShop] Processing Columns...`)

  const col1Buf = await cropItemShop_col1(buffer, uiBounds)
  await saveDebugImage(col1Buf, '24-itemshop-col1-raw.png')
  const col1m = await sharp(col1Buf).metadata()
  const col1Proc = await sharp(col1Buf).resize({ width: col1m.width * 3 }).grayscale().normalize().sharpen().toBuffer()
  await saveDebugImage(col1Proc, '25-itemshop-col1-processed.png')
  const raw1 = await runOCRPass(col1Proc, 6)
  console.log(`[OCR:ItemShop:col1] Raw text: "${raw1.trim().replace(/\n/g, ' \\ ')}"`)

  const col2Buf = await cropItemShop_col2(buffer, uiBounds)
  await saveDebugImage(col2Buf, '26-itemshop-col2-raw.png')
  const col2m = await sharp(col2Buf).metadata()
  const col2Proc = await sharp(col2Buf).resize({ width: col2m.width * 3 }).grayscale().normalize().sharpen().toBuffer()
  await saveDebugImage(col2Proc, '27-itemshop-col2-processed.png')
  const raw2 = await runOCRPass(col2Proc, 6)
  console.log(`[OCR:ItemShop:col2] Raw text: "${raw2.trim().replace(/\n/g, ' \\ ')}"`)

  const items = parseItemShopGrid(raw1, raw2)
  console.log(`[OCR:ItemShop] Found ${items.length} items in grid`)

  return { shopSubtype, destination, mode, items, rawHeader: rawH, rawGrid: raw1 + '\n' + raw2 }
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
    console.log(`[OCR:SectorA] WinOCR Fast Pass Tipo: ${type.toUpperCase()} (raw: "${rawT.trim().replace(/\n/g,' ')}")`);

    const mNom = await sharp(nBuf).metadata();
    const nProc = await sharp(nBuf).resize({ width: mNom.width * 2 }).grayscale().toBuffer();
    rawS = await runOCRPass(nProc, 6);
    console.log(`[OCR:SectorA] WinOCR Fast Pass Nombre: "${rawS.trim().replace(/\n/g,' ')}"`);

    allLines = extractValidLines(rawS, 'win-ocr-pass');
    stationName = allLines.find(isReasonableCandidate) || allLines[0] || null;

  } else {
    // --- LEGACY TRACK PARA TESSERACT ---
    const tProc = await preprocessPass2(tBuf)
    rawT = await runOCRPass(tProc, 6)
    type = detectTypeFromRaw(rawT)
    console.log(`[OCR:SectorA] Type: ${type.toUpperCase()} (raw: "${rawT.trim().replace(/\n/g,' ')}")`)

    const nSoft = await preprocessNombreSoft(nBuf)
    rawS = await runOCRPass(nSoft, 6)
    
    const nThresh = await preprocessPass1(nBuf)
    const rawA = await runOCRPass(nThresh, 6)
    
    const nNeg = await preprocessPass2(nBuf)
    const rawB = await runOCRPass(nNeg, 6)
    console.log(`[OCR:SectorA] Pass-Negate: "${rawB.trim().replace(/\n/g,' ')}"`)

    // R-Channel exclusivo de Tesseract
    let rawRB = ''
    if (colorScheme === 'orange') {
      try {
        const { data, info } = await sharp(nBuf).raw().toBuffer({ resolveWithObject: true })
        const ch = info.channels 
        const rOnly = Buffer.alloc(info.width * info.height)
        for (let i = 0; i < rOnly.length; i++) rOnly[i] = data[i * ch]
        const rInv = Buffer.alloc(info.width * info.height)
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

        const rNormBuf  = await makeRBuf(rOnly, 'normal')
        const rInvBuf   = await makeRBuf(rInv,  'inverted')

        const runOCR = async (buf, label) => {
          const r = await runOCRPass(buf, 6)
          console.log(`[OCR:SectorA] R-channel (${label}): "${r.trim().replace(/\n/g,' ')}"`)
          return r
        }

        const rawRC    = await runOCR(rNormBuf,  'normal')
        const rawRCInv = await runOCR(rInvBuf,   'inverted')
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
      ...extractValidLines(rawS,  'soft'),
      ...extractValidLines(rawA,  'threshold'),
      ...extractValidLines(rawB,  'negate'),
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
      .normalise()
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
    let tessarctPrices = []
    if (colorScheme === 'orange') {
      console.log(`[OCR:SectorB] Running Tesseract price pass for orange scheme...`)
      tessResult = await runTesseractPass(processed, 6)
      console.log(`[OCR:SectorB:TESS_RAW] type:${typeof tessResult} keys:${Object.keys(tessResult).join(',')}`)
      console.log(`[OCR:SectorB:TESS_RAW]\n${tessResult.text ?? tessResult}\n[/OCR:SectorB:TESS_RAW]`)
      tessarctPrices = extractPricesFromTesseract(tessResult.text ?? tessResult)
      console.log(`[OCR:SectorB] Tesseract prices found: ${JSON.stringify(tessarctPrices)}`)
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

    return { mode, items: parseSectorBItems(rawText, commodities, ocrMethod, tessarctPrices), rawItems: rawText }

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
    const buffer = Buffer.from(base64, 'base64'), { width, height } = await sharp(buffer).metadata()
    const uiBounds = await detectUIBounds(buffer, width, height)
    const colorScheme = await detectUIColorScheme(buffer, width, height, uiBounds.uiTop)
    
    // 👇 Pasamos ocrMethod
    const { type, stationName, validLines, rawTipo, rawNombre } = await extractSectorA(buffer, colorScheme, uiBounds, ocrMethod)
    let resolvedType = type, triageTab = ''
    
    if (type === 'unknown') {
      console.log('[OCR] Type unknown, performing triage...')
      try {
        if (colorScheme === 'orange') {
          if (!/YOUR\s*INVENTOR|IN\s*DEMAND|NO\s*DEMAND/i.test((rawNombre || '').toUpperCase())) {
            resolvedType = 'item'
            console.log('[OCR:Triage] Orange scheme + no inventory header => ITEM shop')
          }
        } else {
          const tabX = Math.floor(width * 0.716), tabW = Math.floor(width * 0.230), tabY = uiBounds.uiTop + Math.floor(uiBounds.uiHeight * 0.135), tabH = Math.floor(uiBounds.uiHeight * 0.055), crop = await sharp(buffer).extract({ left: tabX, top: tabY, width: tabW, height: tabH }).toBuffer(), scale = Math.min(4, Math.floor(800 / tabW))
          const tryT = async (p, label) => {
            const pr = await p(sharp(crop).resize({ width: tabW * scale })).toBuffer(); const res = await runOCRPass(pr, 7);
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
    
    const terminals = uexCache.get('terminals')?.data || [], commodities = uexCache.get('commodities')?.data || [], cachedItems = uexCache.get('items') || []
    
    if (resolvedType === 'item' || resolvedType === 'vehicle') {
      console.log('[OCR] Routing to ITEM SHOP processing...')
      const { shopSubtype, destination, mode, items, rawHeader, rawGrid } = await extractItemShop(buffer, colorScheme, triageTab, uiBounds)
      let dest = destination; if (!dest || /choose|destination|ee|null/i.test(dest)) dest = validLines.find(l => /^(AREA|ARC|MIC|CRU|HUR|GRI|ORI)/i.test(l)) || validLines[0]
      
      console.log(`[OCR:ItemShop] Resolving terminal for subtype ${shopSubtype} at "${dest}"`)
      const match = fuzzyMatchItemTerminal(shopSubtype, dest, terminals), resTerminal = match?.terminal || null
      const resItems = resolveItemNames(items, cachedItems)
      
      console.log(`[OCR:ItemShop] Terminal resolved: ${resTerminal?.name || 'NONE'}`)
      console.log(`[OCR] Total time: ${Date.now() - start}ms`)
      return { success: true, type: 'item', shopSubtype, mode, stationName: resTerminal?.name || null, items: resItems, terminalId: resTerminal?.id || null, terminal: resTerminal, rawText: `[TIPO]\n${rawTipo}\n[HEADER]\n${rawHeader}\n[GRID]\n${rawGrid}` }
    }
    
    console.log('[OCR] Routing to COMMODITY processing...')
    const { mode, items: rawItems, rawItems: rawItemsText } = await extractSectorB(buffer, colorScheme, commodities, uiBounds, ocrMethod)
    let bestMatch = null; for (const line of [stationName, ...validLines].filter(isReasonableCandidate)) { const m = fuzzyMatchTerminal(line, terminals); if (m?.similarity >= 0.65 && (!bestMatch || m.similarity > bestMatch.similarity)) bestMatch = m }
    
    console.log(`[OCR] Final Result: ${bestMatch?.terminal.name || 'UNKNOWN'} | Mode: ${mode?.toUpperCase() || 'UNKNOWN'} | Items: ${rawItems.length}`)
    console.log(`[OCR] Total time: ${Date.now() - start}ms`)
    return { success: true, type, mode, stationName: bestMatch?.terminal.name || null, items: rawItems, terminalId: bestMatch?.terminal.id || null, terminal: bestMatch?.terminal || null, rawText: `[TIPO]\n${rawTipo}\n[NOMBRE]\n${rawNombre}\n[ITEMS]\n${rawItemsText}` }
  } catch (err) {
    console.error('[OCR] CRITICAL ERROR:', err)
    return { success: false, error: err.message }
  }
}
// #endregion

module.exports = { processOCR, extractItemShop }