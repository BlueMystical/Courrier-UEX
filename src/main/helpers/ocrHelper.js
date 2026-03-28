// src/main/helpers/ocrHelper.js
//
// Wrapper for Windows.Media.OCR (WinRT) via PowerShell.
// Falls back to Tesseract CLI on Linux/macOS automatically.

'use strict'

const { app } = require('electron');
const { execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')


// ── Path resolution ──────────────────────────────────────────────────────────
// The PS1 script lives next to this file in dev, but is copied to dist/main/scripts
// when building (build-main.js already copies src/main/** recursively).
// Variables para "cachear" las rutas y no recalcularlas en cada pasada de OCR

let cachedTesseractPath = null;
let cachedTessdataPath = null;

function getScriptPath() {
  // In packaged app → dist/main/scripts/windows-ocr.ps1
  // In dev          → src/main/scripts/windows-ocr.ps1  (same relative position)
  const candidates = [
    path.join(__dirname, '../scripts/windows-ocr.ps1'),   // dev + built
    path.join(__dirname, 'scripts/windows-ocr.ps1'),       // fallback
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0] // will fail gracefully later
}

function getTesseractPath() {
  if (cachedTesseractPath) return cachedTesseractPath;

  const winPath = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
  cachedTesseractPath = (process.platform === 'win32' && fs.existsSync(winPath)) 
    ? winPath 
    : 'tesseract'; // En Linux/macOS, debe estar en PATH
    
  return cachedTesseractPath;
}

function getTessdataPath() {
  if (cachedTessdataPath) return cachedTessdataPath;

  if (app.isPackaged) {
    cachedTessdataPath = path.join(process.resourcesPath, 'tessdata');
    return cachedTessdataPath;
  }

  const candidates = [
    path.join(__dirname, '../../../tessdata'),
    path.join(app.getAppPath(), 'tessdata'),
    path.join(__dirname, '../../tessdata'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'eng.traineddata'))) {
      cachedTessdataPath = c;
      return cachedTessdataPath;
    }
  }

  cachedTessdataPath = candidates[0];
  return cachedTessdataPath;
}

// ── Windows OCR ──────────────────────────────────────────────────────────────

/** Runs Windows.Media.OCR on an image buffer via PowerShell.
 *
 * @param {Buffer} imageBuffer  - PNG/JPEG image data
 * @param {string} [lang]       - BCP-47 language tag (default: 'en-US')
 * @returns {Promise<{text: string, lines: Array, source: 'windows'}>}
 * @throws if PowerShell fails or language pack is missing */
async function runWindowsOCR(imageBuffer, lang = 'en-US') {
  const scriptPath = getScriptPath()

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`[WindowsOCR] PS1 script not found at: ${scriptPath}`)
  }

  // Write buffer to a temp PNG (WinRT needs a real file path)
  const tmpPath = path.join(os.tmpdir(), `wocr-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
  await fs.promises.writeFile(tmpPath, imageBuffer)

  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy', 'Bypass',
          '-File', scriptPath,
          tmpPath,
          lang,
        ],
        {
          maxBuffer: 20 * 1024 * 1024,  // 20 MB — generous for large results
          timeout: 20_000,             // 20s max
          windowsHide: true,
        },
        (err, stdout, stderr) => {
          if (err) {
            console.error('[WindowsOCR] Full Error Object:', err);
            console.error('[WindowsOCR] PowerShell stderr:', stderr); // ESTO TE DARÁ LA CLAVE
            return reject(err);
          }
          resolve(stdout);
        }
      )
    })

    // 1. Limpiamos caracteres de control (rango 00-1F y 7F) antes de parsear
    const sanitizedOutput = stdout.replace(/[\x00-\x1F\x7F]/g, "").trim();

    const trimmed = sanitizedOutput.trim()
    if (!trimmed) throw new Error('[WindowsOCR] Empty response from PowerShell')

    const parsed = JSON.parse(trimmed)
    if (parsed.error) throw new Error(`[WindowsOCR] ${parsed.error}`)

    // Build a flat text string (same contract as Tesseract output)
    const text = (parsed.lines || []).map(l => l.text).join('\n')
    const lineCount = parsed.lines?.length ?? 0

    console.log(`[WindowsOCR] ✅ ${lineCount} lines, angle: ${parsed.angle?.toFixed(2) ?? '?'}°`)

    return {
      text,
      lines: parsed.lines || [],
      angle: parsed.angle ?? 0,
      source: 'windows',
    }

  } finally {
    // Always clean up the temp file
    fs.promises.unlink(tmpPath).catch(() => { })
  }
}

// ── Tesseract fallback ───────────────────────────────────────────────────────

/** Tesseract CLI fallback — used on Linux/macOS or when Windows OCR fails. *
 * @param {Buffer} imageBuffer
 * @param {string} tesseractPath - Path to tesseract binary
 * @param {string} tessdataPath  - Path to tessdata directory
 * @param {number} [psm]         - Page Segmentation Mode (default: 6)
 * @returns {Promise<{text: string, lines: null, source: 'tesseract'}>}  */
async function runTesseractOCR(imageBuffer, tesseractPath, tessdataPath, psm = 6) {
  const tmpPath = path.join(os.tmpdir(), `tess-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
  await fs.promises.writeFile(tmpPath, imageBuffer)

  try {
    const text = await new Promise((resolve, reject) => {
      const start = Date.now()
      execFile(
        tesseractPath,
        [tmpPath, 'stdout', '-l', 'eng', '--psm', String(psm), '--tessdata-dir', tessdataPath],
        { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
        (err, stdout) => {
          const ms = Date.now() - start
          if (err) {
            console.error(`[Tesseract] Error (${ms}ms):`, err.message)
            return reject(err)
          }
          console.log(`[Tesseract] ✅ Done (PSM ${psm}, ${ms}ms, ${stdout.length} chars)`)
          resolve(stdout)
        }
      )
    })

    return { text, lines: null, source: 'tesseract' }
  } finally {
    fs.promises.unlink(tmpPath).catch(() => { })
  }
}

// ── Unified entry point ──────────────────────────────────────────────────────

/** Runs OCR on an image buffer.
 * - Windows: tries Windows.Media.OCR first, falls back to Tesseract on failure.
 * - Linux / macOS: always uses Tesseract.
 *
 * @param {Buffer} imageBuffer
 * @param {object} opts
 * @param {string}  opts.tesseractPath - Tesseract binary path
 * @param {string}  opts.tessdataPath  - tessdata directory
 * @param {number}  [opts.psm]         - Tesseract PSM (default: 6)
 * @param {string}  [opts.lang]        - Windows OCR language (default: 'en-US')
 * @param {boolean} [opts.forceWindows]- Skip Windows OCR even on Windows (for testing)
 * @returns {Promise<{text: string, lines: Array|null, source: 'windows'|'tesseract'}>} */
async function runOCR(imageBuffer, opts = {}) {
  const {
    tesseractPath,
    tessdataPath,
    psm = 6,
    lang = 'en-US',
    forceWindows = false,
  } = opts

  const isWindows = process.platform === 'win32'

  if (isWindows || forceWindows) {
    try {
      const result = await runWindowsOCR(imageBuffer, lang)
      if (result.lines?.length > 0) return result
      console.warn('[OCR] Windows OCR returned 0 lines — falling back to Tesseract')
    } catch (e) {
      console.warn(`[OCR] Windows OCR failed (${e.message}) — falling back to Tesseract`)
    }
  }

  // Tesseract path is required on non-Windows
  if (!tesseractPath || !tessdataPath) {
    throw new Error('[OCR] Tesseract path not provided and Windows OCR unavailable')
  }

  return runTesseractOCR(imageBuffer, tesseractPath, tessdataPath, psm)
}

/**  Unified OCR runner. Drop-in replacement for runTesseract().
 * @param {Buffer} imageBuffer - Image data (PNG preferred)
 * @param {number} [psm]       - Tesseract PSM mode
 * @returns {Promise<string>}  - Raw OCR text  */
async function runOCRPass(imageBuffer, psm = 6) {
  const result = await runOCR(imageBuffer, {
    tesseractPath: getTesseractPath(),
    tessdataPath: getTessdataPath(),
    psm,
    lang: 'en-US', // O el idioma que necesites
  });
  return result.text;
}

/** Como runOCRPass pero devuelve el resultado completo {text, lines, source}
 * Necesario cuando el caller quiere usar las coordenadas X/Y de Windows OCR.
 * @param {Buffer} imageBuffer
 * @param {number} [psm]
 * @returns {Promise<{text: string, lines: Array|null, source: 'windows'|'tesseract'}>}
 */
async function runOCRFull(imageBuffer, psm = 6) {
  return runOCR(imageBuffer, {
    tesseractPath: getTesseractPath(),
    tessdataPath: getTessdataPath(),
    psm,
    lang: 'en-US',
  });
}

async function runTesseractPass(imageBuffer, psm = 6) {
  return runTesseractOCR(imageBuffer, getTesseractPath(), getTessdataPath(), psm)
}

module.exports = { runOCRPass, runOCRFull, runTesseractPass }