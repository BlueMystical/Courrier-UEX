<!-- src/renderer/views/Datarunner/DatarunnerHeatmap.vue -->
<template>
  <div class="hm-shell">

    <!-- ── Header bar ──────────────────────────────────────────────── -->
    <div class="hm-header">
      <div class="hm-header-left">
        <span class="hm-tag">// DATA_STALENESS</span>
        <h1 class="hm-title">Terminal Heatmap</h1>
        <span class="hm-subtitle">Terminals that need a Courrier visit</span>
      </div>
      <div class="hm-header-right">
        <span v-if="lastFetch" class="hm-last-fetch">
          <i class="pi pi-clock"></i> fetched {{ lastFetchAgo }}
        </span>
        <button class="hm-help-btn" @click="showHelp = true" title="How does this work?">
          <i class="pi pi-question-circle"></i>
        </button>
        <Button icon="pi pi-refresh" :loading="isLoading" label="Refresh" size="small"
          class="hm-refresh-btn" @click="fetchAll(true)" :disabled="isLoading" />
      </div>
    </div>

    <!-- ── Help popup ────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showHelp" class="hm-help-overlay" @click.self="showHelp = false">
        <div class="hm-help-modal">
          <div class="hm-help-header">
            <span class="hm-help-title"><i class="pi pi-info-circle"></i> How to read the Terminal Heatmap</span>
            <button class="hm-help-close" @click="showHelp = false"><i class="pi pi-times"></i></button>
          </div>
          <div class="hm-help-body">

            <section class="hm-help-section">
              <h3>What is this?</h3>
              <p>This view shows which terminals in the Star Citizen universe have <strong>stale price data</strong> — meaning nobody has submitted an update in a long time. As a Data Courrier, these are the terminals you should visit first.</p>
            </section>

            <section class="hm-help-section">
              <h3>How is the order determined?</h3>
              <p>Terminals are sorted by a <strong>Priority Score</strong> — a weighted sum of how old the data is across all categories:</p>
              <div class="hm-help-formula">
                Score = (COM age × 3) + (ITM age × 1) + (VEH BUY age × 1) + (VEH RENT age × 1)
              </div>
              <p>Commodities have <strong>3× weight</strong> because they change constantly. Items and vehicles are updated much less frequently (usually only after game patches), so they count less.</p>
              <p>The terminal with the highest score appears at the top — that is the one most in need of a visit.</p>
            </section>

            <section class="hm-help-section">
              <h3>What do the age values mean?</h3>
              <p>Each data column (<span class="hm-help-tag com">COM</span> <span class="hm-help-tag itm">ITM</span> <span class="hm-help-tag veh">VEH BUY</span> <span class="hm-help-tag veh">VEH RENT</span>) shows how many days have passed since the last submitted update for that terminal.</p>
              <div class="hm-help-legend">
                <span class="age-pill age-ok">3d</span> Fresh — updated within the threshold
                <span class="age-pill age-warning">10d</span> Warning — older than the threshold
                <span class="age-pill age-critical">45d</span> Critical — older than 30 days
                <span class="no-data">—</span> No data for this category at this terminal
              </div>
            </section>

            <section class="hm-help-section">
              <h3>Threshold</h3>
              <p>The <strong>7d / 15d / 30d</strong> buttons change what counts as "stale". At 7d, any terminal not updated in a week is highlighted. This affects the warning color and the <em>Stale only</em> filter, but critical (≥30d) is always red regardless.</p>
            </section>

            <section class="hm-help-section">
              <h3>Data Sources</h3>
              <p>The data is fetched live from the UEX Corp API when you open this view. It is cached locally for 30 minutes so re-opening the view is fast. Hit <strong>Refresh</strong> to force a new fetch. Items can take longer to load — the other columns will appear while Items is still loading.</p>
            </section>

            <section class="hm-help-section">
              <h3>Column reference</h3>
              <div class="hm-help-cols">

                <div class="hm-help-col-row">
                  <span class="col-tag com">COM</span>
                  <div>
                    <strong>Commodities</strong> — raw materials and trade goods (Aluminum, Hydrogen, Laranite…).
                    These prices are submitted by players at kiosks and change constantly with supply &amp; demand.
                    This is the most time-sensitive column; it carries <strong>3× weight</strong> in the Priority Score.
                  </div>
                </div>

                <div class="hm-help-col-row">
                  <span class="col-tag itm">ITM</span>
                  <div>
                    <strong>Items</strong> — FPS gear, armor, weapons, ship components sold at shops.
                    Item prices are stable and only change after a game patch, so staleness here is less urgent.
                    Carries <strong>1× weight</strong> in the Priority Score.
                  </div>
                </div>

                <div class="hm-help-col-row">
                  <span class="col-tag veh">VEH BUY</span>
                  <div>
                    <strong>Vehicle Purchases</strong> — ships and ground vehicles available for permanent purchase at this terminal.
                    Like items, these prices rarely change outside of patches.
                    Carries <strong>1× weight</strong> in the Priority Score.
                  </div>
                </div>

                <div class="hm-help-col-row">
                  <span class="col-tag veh">VEH RENT</span>
                  <div>
                    <strong>Vehicle Rentals</strong> — ships and ground vehicles available for temporary rental.
                    Same stability as purchases. Not all terminals offer rentals, so many will show <span class="no-data">—</span> here.
                    Carries <strong>1× weight</strong> in the Priority Score.
                  </div>
                </div>

                <div class="hm-help-col-row">
                  <span class="col-tag pri">PRIORITY</span>
                  <div>
                    <strong>Priority Score</strong> — the weighted total described above, shown as a bar + number.
                    The bar is normalized: the terminal with the highest score gets a full bar, all others are proportional.
                    Use this column to sort when you want to consider <em>all</em> data types together.
                  </div>
                </div>

              </div>
            </section>

          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Filters row 1: THRESHOLD + DATA SOURCE + stats chips ──────── -->
    <div class="hm-filters hm-filters-row1">
      <div class="hm-filter-group">
        <span class="hm-filter-label">THRESHOLD</span>
        <div class="hm-threshold-pills">
          <button v-for="d in [7, 15, 30]" :key="d"
            :class="['hm-pill', { active: threshold === d }]"
            @click="threshold = d">
            {{ d }}d
          </button>
        </div>
      </div>

      <div class="hm-filter-group">
        <span class="hm-filter-label">DATA SOURCE</span>
        <div class="hm-threshold-pills">
          <button v-for="src in sourceOptions" :key="src.key"
            :class="['hm-pill', { active: activeSource === src.key }, `pill-${src.key}`]"
            @click="activeSource = src.key">
            <i :class="src.icon"></i> {{ src.label }}
          </button>
        </div>
      </div>

      <div class="hm-filter-spacer"></div>

      <div class="hm-stat-chip critical">
        <span class="hm-stat-num">{{ criticalCount }}</span>
        <span class="hm-stat-lbl">CRITICAL</span>
      </div>
      <div class="hm-stat-chip warning">
        <span class="hm-stat-num">{{ warningCount }}</span>
        <span class="hm-stat-lbl">WARNING</span>
      </div>
      <div class="hm-stat-chip ok">
        <span class="hm-stat-num">{{ freshCount }}</span>
        <span class="hm-stat-lbl">FRESH</span>
      </div>
    </div>

    <!-- ── Filters row 2: search + SHOW controls + row count ─────────── -->
    <div class="hm-filters hm-filters-row2">
      <div class="hm-filter-group hm-filter-search">
        <span class="pi pi-search hm-search-icon"></span>
        <input v-model="searchQuery" class="hm-search" placeholder="Filter terminal or location..." />
      </div>

      <div class="hm-filter-group hm-filter-system">
        <i class="pi pi-map-marker hm-system-icon"></i>
        <Select v-model="selectedSystem" :options="systemOptions" optionLabel="label" optionValue="value"
          placeholder="All Systems" showClear class="hm-system-select" />
      </div>

      <div class="hm-filter-group">
        <span class="hm-filter-label">SHOW</span>
        <div class="hm-threshold-pills">
          <button :class="['hm-pill', { active: showStaleOnly }]" @click="showStaleOnly = !showStaleOnly">
            Stale only
          </button>
          <button :class="['hm-pill', { active: showNoData }]" @click="showNoData = !showNoData">
            Hide no-data
          </button>
        </div>
      </div>

      <span class="hm-row-count">{{ filteredRows.length }} terminals</span>
    </div>

    <!-- ── Loading skeleton ────────────────────────────────────────── -->
    <div v-if="isLoading && !terminalRows.length" class="hm-loading">
      <div v-for="i in 8" :key="i" class="hm-skeleton-row">
        <div class="sk-block sk-name"></div>
        <div class="sk-block sk-loc"></div>
        <div class="sk-block sk-cell"></div>
        <div class="sk-block sk-cell"></div>
        <div class="sk-block sk-cell"></div>
        <div class="sk-block sk-cell"></div>
      </div>
    </div>

    <!-- ── Progress bar (fetch in progress) ───────────────────────── -->
    <div v-if="isLoading && fetchProgress < 100" class="hm-progress-bar">
      <div class="hm-progress-fill" :style="{ width: fetchProgress + '%' }"></div>
      <span class="hm-progress-label">{{ fetchProgressLabel }}</span>
    </div>

    <!-- ── Error state ─────────────────────────────────────────────── -->
    <div v-if="fetchError" class="hm-error">
      <i class="pi pi-exclamation-triangle"></i>
      {{ fetchError }}
      <Button label="Retry" size="small" text @click="fetchAll(true)" />
    </div>

    <!-- ── Table ───────────────────────────────────────────────────── -->
    <div v-if="filteredRows.length" class="hm-scroll">
      <table class="hm-table">
        <thead>
          <tr>
            <th class="col-rank">#</th>
            <th class="col-name" @click="sortBy('name')" :class="sortClass('name')">
              Terminal <i class="pi pi-sort-alt"></i>
            </th>
            <th class="col-loc">Location</th>
            <th class="col-data" @click="sortBy('commodities')" :class="sortClass('commodities')">
              <span class="col-tag com">COM</span> <i class="pi pi-sort-alt"></i>
            </th>
            <th class="col-data" @click="sortBy('items')" :class="sortClass('items')">
              <span class="col-tag itm">ITM</span> <i class="pi pi-sort-alt"></i>
            </th>
            <th class="col-data" @click="sortBy('vehiclesBuy')" :class="sortClass('vehiclesBuy')">
              <span class="col-tag veh">VEH BUY</span> <i class="pi pi-sort-alt"></i>
            </th>
            <th class="col-data" @click="sortBy('vehiclesRent')" :class="sortClass('vehiclesRent')">
              <span class="col-tag veh">VEH RENT</span> <i class="pi pi-sort-alt"></i>
            </th>
            <th class="col-priority" @click="sortBy('priorityScore')" :class="sortClass('priorityScore')">
              PRIORITY <i class="pi pi-sort-alt"></i>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in filteredRows" :key="row.id_terminal"
            :class="['hm-row', `urgency-${row.urgency}`]">
            <td class="col-rank">
              <span class="rank-badge" :class="`rank-${row.urgency}`">{{ idx + 1 }}</span>
            </td>
            <td class="col-name">
              <span class="terminal-name">{{ row.terminal_name }}</span>
            </td>
            <td class="col-loc">
              <div v-if="row.location" class="loc-stack">
                <span class="loc-system">{{ row.location.system }}</span>
                <span class="loc-detail">{{ row.location.detail }}</span>
              </div>
              <span v-else class="no-data">—</span>
            </td>
            <td class="col-data">
              <span v-if="row.commodities !== null" class="age-pill" :class="ageClass(row.commodities)">
                {{ formatAge(row.commodities) }}
              </span>
              <span v-else class="no-data">—</span>
            </td>
            <td class="col-data">
              <span v-if="row.items !== null" class="age-pill" :class="ageClass(row.items)">
                {{ formatAge(row.items) }}
              </span>
              <span v-else class="no-data">—</span>
            </td>
            <td class="col-data">
              <span v-if="row.vehiclesBuy !== null" class="age-pill" :class="ageClass(row.vehiclesBuy)">
                {{ formatAge(row.vehiclesBuy) }}
              </span>
              <span v-else class="no-data">—</span>
            </td>
            <td class="col-data">
              <span v-if="row.vehiclesRent !== null" class="age-pill" :class="ageClass(row.vehiclesRent)">
                {{ formatAge(row.vehiclesRent) }}
              </span>
              <span v-else class="no-data">—</span>
            </td>
            <td class="col-priority">
              <div class="priority-bar-wrap">
                <div class="priority-bar" :style="{ width: row.priorityPct + '%' }"
                  :class="`pbar-${row.urgency}`"></div>
                <span class="priority-score">{{ row.priorityScore }}d</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Empty states ────────────────────────────────────────────── -->
    <div v-if="!isLoading && !fetchError && !filteredRows.length && terminalRows.length" class="hm-empty">
      <i class="pi pi-check-circle"></i>
      <p>All terminals are fresh within {{ threshold }} days.</p>
    </div>
    <div v-if="!isLoading && !fetchError && !terminalRows.length" class="hm-empty">
      <i class="pi pi-database"></i>
      <p>No data yet. Hit Refresh to load terminal staleness data.</p>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'

// ── Constants ──────────────────────────────────────────────────────────────
const BASE_URL    = 'https://api.uexcorp.uk/2.0'
const CACHE_KEY   = 'heatmap_cache_v1'
const CACHE_TTL_MS = 30 * 60 * 1000  // 30 min

const ENDPOINTS = {
  commodities:  `${BASE_URL}/commodities_prices_all`,
  items:        `${BASE_URL}/items_prices_all`,
  vehiclesBuy:  `${BASE_URL}/vehicles_purchases_prices_all`,
  vehiclesRent: `${BASE_URL}/vehicles_rentals_prices_all`,
}

// Commodities weight 3× — most dynamic data source
const WEIGHTS = { commodities: 3, items: 1, vehiclesBuy: 1, vehiclesRent: 1 }

// ── State ──────────────────────────────────────────────────────────────────
const isLoading          = ref(false)
const fetchProgress      = ref(0)
const fetchProgressLabel = ref('')
const fetchError         = ref(null)
const lastFetch          = ref(null)
const rawData            = ref({})
const terminalRows       = ref([])
const terminalIndex      = ref(new Map())   // Map<id, terminal> from app cache

const threshold    = ref(7)
const activeSource = ref('all')
const searchQuery  = ref('')
const showStaleOnly = ref(true)
const showNoData    = ref(false)
const showHelp      = ref(false)
const selectedSystem = ref(null)
const sortKey      = ref('commodities')
const sortDir      = ref(1)

const sourceOptions = [
  { key: 'all',         label: 'All',         icon: 'pi pi-th-large' },
  { key: 'commodities', label: 'Commodities',  icon: 'pi pi-dollar'   },
  { key: 'items',       label: 'Items',        icon: 'pi pi-box'      },
  { key: 'vehicles',    label: 'Vehicles',     icon: 'pi pi-car'      },
]

// ── Computed: available star systems from terminal index ──────────────────
const systemOptions = computed(() => {
  const systems = new Set()
  for (const t of terminalIndex.value.values()) {
    if (t.star_system_name) systems.add(t.star_system_name)
  }
  return [...systems].sort().map(s => ({ label: s, value: s }))
})

// ── Location builder from cached terminal object ───────────────────────────
// Returns { system, detail } — two lines shown stacked in the cell
function buildLocation(t) {
  if (!t) return null
  const system = t.star_system_name || null
  // Detail: prefer the most specific known location
  const detail = [
    t.city_name,
    t.space_station_name,
    t.moon_name,
    t.orbit_name,
    t.planet_name,
  ].find(v => v && v !== system) || null

  if (!system && !detail) return null
  return { system: system || '—', detail: detail || '' }
}

// ── Computed: last fetch label ─────────────────────────────────────────────
const lastFetchAgo = computed(() => {
  if (!lastFetch.value) return ''
  const mins = Math.floor((Date.now() - lastFetch.value) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
})

// ── Computed: filtered + sorted rows ──────────────────────────────────────
const filteredRows = computed(() => {
  let rows = terminalRows.value

  if (showStaleOnly.value) {
    rows = rows.filter(r => r.urgency !== 'ok')
  }

  if (showNoData.value) {
    // Hide terminals where ALL data columns are null
    rows = rows.filter(r =>
      r.commodities !== null || r.items !== null ||
      r.vehiclesBuy !== null || r.vehiclesRent !== null
    )
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    rows = rows.filter(r =>
      r.terminal_name.toLowerCase().includes(q) ||
      (r.location?.system || '').toLowerCase().includes(q) ||
      (r.location?.detail || '').toLowerCase().includes(q)
    )
  }

  if (selectedSystem.value) {
    rows = rows.filter(r => r.location?.system === selectedSystem.value)
  }

  if (activeSource.value !== 'all') {
    rows = rows.filter(r => {
      if (activeSource.value === 'commodities') return r.commodities !== null
      if (activeSource.value === 'items')       return r.items !== null
      if (activeSource.value === 'vehicles')    return r.vehiclesBuy !== null || r.vehiclesRent !== null
      return true
    })
  }

  rows = [...rows].sort((a, b) => {
    if (sortKey.value === 'name') {
      return sortDir.value * a.terminal_name.localeCompare(b.terminal_name)
    }
    let va = a[sortKey.value] ?? -Infinity
    let vb = b[sortKey.value] ?? -Infinity
    return sortDir.value * (vb - va)
  })

  return rows
})

// ── Computed: stat chips ───────────────────────────────────────────────────
const criticalCount = computed(() => terminalRows.value.filter(r => r.urgency === 'critical').length)
const warningCount  = computed(() => terminalRows.value.filter(r => r.urgency === 'warning').length)
const freshCount    = computed(() => terminalRows.value.filter(r => r.urgency === 'ok').length)

// ── Sort ───────────────────────────────────────────────────────────────────
function sortBy(key) {
  if (sortKey.value === key) sortDir.value *= -1
  else { sortKey.value = key; sortDir.value = 1 }
}
function sortClass(key) {
  return sortKey.value === key ? (sortDir.value === 1 ? 'sort-desc' : 'sort-asc') : ''
}

// ── Age formatting ─────────────────────────────────────────────────────────
function formatAge(days) {
  if (days === null) return '—'
  if (days < 1) return '< 1d'
  return `${Math.round(days)}d`
}
function ageClass(days) {
  if (days === null) return 'age-unknown'
  if (days >= 30) return 'age-critical'
  if (days >= threshold.value) return 'age-warning'
  return 'age-ok'
}

// ── Urgency + priority ─────────────────────────────────────────────────────
function computeUrgency(row) {
  const vals = ['commodities', 'items', 'vehiclesBuy', 'vehiclesRent']
    .map(k => row[k]).filter(v => v !== null)
  if (!vals.length) return 'unknown'
  const max = Math.max(...vals)
  if (max >= 30) return 'critical'
  if (max >= threshold.value) return 'warning'
  return 'ok'
}
function computePriorityScore(row) {
  let score = 0
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (row[k] !== null) score += row[k] * w
  }
  return Math.round(score)
}

// ── Data processing ────────────────────────────────────────────────────────
const nowSec = Math.floor(Date.now() / 1000)

function processEndpointData(data) {
  // Returns Map<id_terminal, { terminal_name, ageDays }>
  // Location is NOT stored here — we cross-reference terminalIndex instead
  const map = new Map()
  for (const item of data) {
    const tid     = item.id_terminal
    const ageDays = item.date_modified
      ? (nowSec - item.date_modified) / 86400
      : null

    if (!map.has(tid)) {
      map.set(tid, {
        terminal_name: item.terminal_name || `Terminal ${tid}`,
        ageDays,
      })
    } else {
      // Keep MAX age per terminal (oldest update = most stale)
      const ex = map.get(tid)
      if (ageDays !== null && (ex.ageDays === null || ageDays > ex.ageDays)) {
        ex.ageDays = ageDays
      }
    }
  }
  return map
}

function mergeAllData(raw) {
  const maps = {}
  for (const [key, data] of Object.entries(raw)) {
    if (data?.length) maps[key] = processEndpointData(data)
  }

  const allIds = new Set(Object.values(maps).flatMap(m => [...m.keys()]))
  const rows   = []

  for (const tid of allIds) {
    const first = Object.values(maps).find(m => m.has(tid))?.get(tid)
    if (!first) continue

    // Cross-reference with app terminal cache for location + availability check
    const cached = terminalIndex.value.get(tid)

    // Skip terminals not in the cache (removed from game) or marked unavailable/hidden
    if (terminalIndex.value.size > 0) {
      if (!cached) continue                          // not in active terminal list → removed
      if (!cached.is_available)                continue  // disabled
      if (!cached.is_available_live)           continue  // not live
      if (!cached.is_visible)                  continue  // hidden
    }

    const location = buildLocation(cached)

    const row = {
      id_terminal:   tid,
      terminal_name: cached?.name || first.terminal_name,
      location,
      commodities:   maps.commodities?.get(tid)?.ageDays  ?? null,
      items:         maps.items?.get(tid)?.ageDays         ?? null,
      vehiclesBuy:   maps.vehiclesBuy?.get(tid)?.ageDays   ?? null,
      vehiclesRent:  maps.vehiclesRent?.get(tid)?.ageDays  ?? null,
    }

    row.urgency       = computeUrgency(row)
    row.priorityScore = computePriorityScore(row)
    rows.push(row)
  }

  const maxScore = Math.max(...rows.map(r => r.priorityScore), 1)
  for (const r of rows) r.priorityPct = Math.round((r.priorityScore / maxScore) * 100)

  return rows
}

// ── Cache (localStorage) ───────────────────────────────────────────────────
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch { /* quota */ }
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) return null
    return { ts, data }
  } catch { return null }
}

// ── Fetch ──────────────────────────────────────────────────────────────────
async function fetchEndpoint(key, url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`)
  const json = await res.json()
  return json?.data || []
}

async function fetchAll(force = false) {
  if (isLoading.value) return

  if (!force) {
    const cached = loadCache()
    if (cached) {
      rawData.value      = cached.data
      terminalRows.value = mergeAllData(cached.data)
      lastFetch.value    = new Date(cached.ts)
      return
    }
  }

  isLoading.value      = true
  fetchError.value     = null
  fetchProgress.value  = 0

  // Order: Commodities first (fastest + most important), Items last (slowest)
  const order = [
    { key: 'commodities',  url: ENDPOINTS.commodities,  label: 'Commodities'                     },
    { key: 'vehiclesBuy',  url: ENDPOINTS.vehiclesBuy,  label: 'Vehicle Purchases'               },
    { key: 'vehiclesRent', url: ENDPOINTS.vehiclesRent, label: 'Vehicle Rentals'                 },
    { key: 'items',        url: ENDPOINTS.items,         label: 'Items (large — may take a moment)' },
  ]

  const results = {}

  for (let i = 0; i < order.length; i++) {
    const { key, url, label } = order[i]
    fetchProgressLabel.value = `Fetching ${label}...`
    fetchProgress.value      = Math.round((i / order.length) * 90)

    try {
      results[key]       = await fetchEndpoint(key, url)
      rawData.value      = { ...rawData.value, ...results }
      terminalRows.value = mergeAllData(rawData.value)   // partial render
    } catch (err) {
      console.warn(`[Heatmap] Failed to fetch ${key}:`, err.message)
      results[key] = []
    }
  }

  fetchProgress.value      = 100
  fetchProgressLabel.value = 'Done'
  lastFetch.value          = new Date()
  rawData.value            = results
  terminalRows.value       = mergeAllData(results)
  saveCache(results)

  setTimeout(() => { isLoading.value = false }, 300)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  // Load terminal cache from app (for location data)
  try {
    const res = await window.api.UEX.getCache()
    const terminals = res?.terminals?.data || []
    // Build Map<id, terminal> for O(1) lookup during mergeAllData
    terminalIndex.value = new Map(terminals.map(t => [t.id, t]))
    console.log(`[Heatmap] Terminal index loaded: ${terminalIndex.value.size} terminals`)
  } catch (e) {
    console.warn('[Heatmap] Could not load terminal cache:', e.message)
  }

  fetchAll(false)
})
</script>

<style scoped>
/* ── Shell ─────────────────────────────────────────────────────────────── */
.hm-shell {
  background: #0b0f14;
  color: #e6e6e6;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: sans-serif;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.hm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 10px; border-bottom: 1px solid #1e2a35; flex-shrink: 0;
}
.hm-header-left  { display: flex; align-items: baseline; gap: 12px; }
.hm-tag          { color: #00ffcc; font-size: 11px; font-family: monospace; opacity: 0.6; }
.hm-title        { font-size: 1.1rem; font-weight: 700; color: #e6e6e6; margin: 0; letter-spacing: 0.03em; }
.hm-subtitle     { font-size: 0.75rem; color: #556; }
.hm-header-right { display: flex; align-items: center; gap: 12px; }
.hm-last-fetch   { font-size: 0.72rem; color: #445; display: flex; align-items: center; gap: 5px; }
.hm-refresh-btn  { background: #003a3a !important; color: #00ffcc !important; border: none !important; }

/* ── Filters ───────────────────────────────────────────────────────────── */
.hm-filters {
  display: flex; align-items: center; gap: 20px;
  padding: 8px 20px; flex-shrink: 0; flex-wrap: wrap;
}
.hm-filters-row1 { border-bottom: 1px solid #131d26; }
.hm-filters-row2 { border-bottom: 1px solid #1e2a35; padding-top: 6px; padding-bottom: 6px; }
.hm-filter-spacer { flex: 1; }
.hm-filter-group  { display: flex; align-items: center; gap: 8px; }
.hm-filter-label  { font-size: 10px; color: #445; letter-spacing: 0.08em; font-family: monospace; white-space: nowrap; }
.hm-row-count     { font-size: 10px; color: #334; font-family: monospace; margin-left: auto; }

.hm-filter-system { gap: 6px; }
.hm-system-icon   { color: #445; font-size: 12px; flex-shrink: 0; }
.hm-system-select { width: 160px; }
:deep(.hm-system-select .p-select) {
  background: #111821 !important; border: 1px solid #1e2a35 !important;
  color: #e6e6e6 !important; font-size: 12px !important; height: 28px !important;
  border-radius: 3px !important;
}
:deep(.hm-system-select .p-select-label) { font-size: 12px !important; padding: 4px 8px !important; color: #e6e6e6 !important; }
:deep(.hm-system-select .p-select-dropdown) { width: 28px !important; }
:deep(.hm-system-select .p-select:hover) { border-color: #00ffcc44 !important; }
:deep(.hm-system-select .p-select-clear-icon) { color: #445 !important; }

.hm-filter-search { position: relative; }
.hm-search-icon   { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: #445; font-size: 12px; pointer-events: none; }
.hm-search {
  background: #111821; border: 1px solid #1e2a35; color: #e6e6e6;
  padding: 4px 8px 4px 26px; font-size: 12px; border-radius: 3px; width: 220px;
  outline: none; transition: border-color 0.2s;
}
.hm-search:focus { border-color: #00ffcc44; }

.hm-threshold-pills { display: flex; gap: 4px; }
.hm-pill {
  background: #111821; border: 1px solid #1e2a35; color: #778;
  font-size: 11px; padding: 3px 10px; border-radius: 3px; cursor: pointer;
  transition: all 0.15s; font-family: monospace;
}
.hm-pill:hover         { border-color: #00ffcc44; color: #aaa; }
.hm-pill.active        { background: #003a3a; border-color: #00ffcc66; color: #00ffcc; }
.hm-pill.pill-commodities.active { background: #00261a; border-color: #00cc7766; color: #00cc77; }
.hm-pill.pill-items.active       { background: #1a1a00; border-color: #ccaa0066; color: #ccaa00; }
.hm-pill.pill-vehicles.active    { background: #001a26; border-color: #0077cc66; color: #4db8ff; }

/* ── Stat chips ────────────────────────────────────────────────────────── */
.hm-stat-chip {
  display: flex; flex-direction: column; align-items: center;
  padding: 3px 10px; border-radius: 3px; min-width: 52px; border: 1px solid;
}
.hm-stat-chip.critical { background: #2a0a0a; border-color: #ff444433; }
.hm-stat-chip.warning  { background: #261a00; border-color: #ffaa0033; }
.hm-stat-chip.ok       { background: #00260d; border-color: #00cc5533; }
.hm-stat-num  { font-size: 1rem; font-weight: 700; line-height: 1; font-family: monospace; }
.hm-stat-lbl  { font-size: 9px; letter-spacing: 0.08em; opacity: 0.6; }
.critical .hm-stat-num { color: #ff6666; }
.warning  .hm-stat-num { color: #ffaa44; }
.ok       .hm-stat-num { color: #00cc66; }

/* ── Progress bar ──────────────────────────────────────────────────────── */
.hm-progress-bar  { position: relative; height: 3px; background: #1e2a35; flex-shrink: 0; overflow: visible; }
.hm-progress-fill { height: 100%; background: #00ffcc; transition: width 0.4s ease; box-shadow: 0 0 6px #00ffcc88; }
.hm-progress-label { position: absolute; right: 12px; top: 4px; font-size: 10px; color: #00ffcc88; font-family: monospace; }

/* ── Error ─────────────────────────────────────────────────────────────── */
.hm-error {
  padding: 12px 20px; background: #2a0a0a; border-bottom: 1px solid #ff444433;
  color: #ff8888; font-size: 13px; display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}

/* ── Skeleton ──────────────────────────────────────────────────────────── */
.hm-loading { padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
.hm-skeleton-row { display: flex; gap: 12px; align-items: center; }
.sk-block { background: #111821; border-radius: 3px; height: 28px; animation: sk-pulse 1.4s ease-in-out infinite; }
.sk-name { width: 180px; } .sk-loc { width: 140px; } .sk-cell { width: 70px; }
@keyframes sk-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }

/* ── Table container ───────────────────────────────────────────────────── */
.hm-scroll { flex: 1; overflow-y: auto; overflow-x: auto; padding: 0 8px 16px; }
.hm-scroll::-webkit-scrollbar       { width: 6px; height: 6px; }
.hm-scroll::-webkit-scrollbar-track { background: #0b0f14; }
.hm-scroll::-webkit-scrollbar-thumb { background: #1e2a35; border-radius: 3px; }

/* ── Table ─────────────────────────────────────────────────────────────── */
.hm-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.hm-table thead th {
  background: #0d1219; color: #445; font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase; padding: 8px 10px;
  border-bottom: 1px solid #1e2a35; white-space: nowrap;
  cursor: pointer; user-select: none;
  position: sticky; top: 0; z-index: 1; transition: color 0.15s;
}
.hm-table thead th:hover        { color: #00ffcc88; }
.hm-table thead th.sort-desc,
.hm-table thead th.sort-asc     { color: #00ffcc; }
.hm-table thead th .pi-sort-alt { opacity: 0.3; font-size: 9px; margin-left: 3px; }
.hm-table td { padding: 7px 10px; border-bottom: 1px solid #0f1520; vertical-align: middle; }

/* Row urgency */
.hm-row { transition: background 0.1s; }
.hm-row:hover         { background: #111821 !important; }
.urgency-critical     { border-left: 2px solid #ff444455; }
.urgency-warning      { border-left: 2px solid #ffaa0033; }
.urgency-ok           { border-left: 2px solid transparent; }
.urgency-unknown      { border-left: 2px solid transparent; }

/* Columns */
.col-rank     { width: 36px; text-align: center; }
.col-name     { min-width: 160px; }
.col-loc      { min-width: 150px; }
.col-data     { width: 82px; text-align: center; }
.col-priority { width: 130px; }

.col-tag {
  display: inline-block; padding: 1px 6px; border-radius: 2px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
}
.col-tag.com { background: #002a1a; color: #00cc77; border: 1px solid #00cc7733; }
.col-tag.itm { background: #1a1a00; color: #ccaa00; border: 1px solid #ccaa0033; }
.col-tag.veh { background: #001a26; color: #4db8ff; border: 1px solid #0077cc33; }

.rank-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 3px;
  font-size: 10px; font-weight: 700; font-family: monospace;
}
.rank-critical { background: #2a0a0a; color: #ff6666; border: 1px solid #ff444433; }
.rank-warning  { background: #261a00; color: #ffaa44; border: 1px solid #ffaa0033; }
.rank-ok       { background: #00260d; color: #00cc66; border: 1px solid #00cc5533; }
.rank-unknown  { background: #1a1a1a; color: #555;   border: 1px solid #33333333; }

.terminal-name { color: #ccd; font-weight: 500; }
.no-data       { color: #334; font-size: 11px; }

/* Location — two lines stacked */
.loc-stack  { display: flex; flex-direction: column; gap: 1px; }
.loc-system { font-size: 12px; color: #7a9ab5; font-weight: 500; }
.loc-detail { font-size: 10px; color: #445; }

/* Age pills */
.age-pill {
  display: inline-block; padding: 2px 8px; border-radius: 3px;
  font-family: monospace; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.age-critical { background: #2a0a0a; color: #ff6666; border: 1px solid #ff444433; }
.age-warning  { background: #261a00; color: #ffaa44; border: 1px solid #ffaa0033; }
.age-ok       { background: #00260d; color: #00cc66; border: 1px solid #00cc5533; }
.age-unknown  { background: #1a1a1a; color: #445;   border: 1px solid #22222233; }

/* Priority bar */
.priority-bar-wrap { display: flex; align-items: center; gap: 6px; }
.priority-bar { height: 6px; border-radius: 3px; min-width: 2px; transition: width 0.4s ease; }
.pbar-critical { background: linear-gradient(90deg, #ff4444, #ff6666); }
.pbar-warning  { background: linear-gradient(90deg, #ff8800, #ffaa44); }
.pbar-ok       { background: linear-gradient(90deg, #006633, #00cc66); }
.pbar-unknown  { background: #1e2a35; }
.priority-score { font-size: 10px; font-family: monospace; color: #445; white-space: nowrap; }

/* ── Empty state ────────────────────────────────────────────────────────── */
.hm-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #334; }
.hm-empty .pi { font-size: 2.5rem; }
.hm-empty p   { font-size: 0.875rem; margin: 0; }
/* ── Help button ────────────────────────────────────────────────────── */
.hm-help-btn {
  background: #001f1f; border: 1px solid #00ffcc55; color: #00ffcc99;
  width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; transition: all 0.2s; flex-shrink: 0;
  box-shadow: 0 0 8px #00ffcc22;
}
.hm-help-btn:hover {
  background: #003a3a; border-color: #00ffcc; color: #00ffcc;
  box-shadow: 0 0 14px #00ffcc44;
}

/* ── Help overlay + modal ────────────────────────────────────────────── */
.hm-help-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; backdrop-filter: blur(2px);
}
.hm-help-modal {
  background: #0d1219; border: 1px solid #1e2a35;
  border-radius: 6px; width: 540px; max-width: 92vw; max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px #00ffcc11;
}
.hm-help-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid #1e2a35; flex-shrink: 0;
}
.hm-help-title { font-size: 13px; font-weight: 600; color: #00ffcc; display: flex; align-items: center; gap: 8px; }
.hm-help-close {
  background: transparent; border: 1px solid #1e2a35; color: #556;
  width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 11px;
  transition: all 0.15s;
}
.hm-help-close:hover { border-color: #ff444466; color: #ff6666; }
.hm-help-body { overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 20px; }
.hm-help-body::-webkit-scrollbar       { width: 4px; }
.hm-help-body::-webkit-scrollbar-track { background: #0b0f14; }
.hm-help-body::-webkit-scrollbar-thumb { background: #1e2a35; border-radius: 2px; }

.hm-help-section h3 {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: #00ffcc99; margin: 0 0 8px; font-family: monospace;
}
.hm-help-section p  { font-size: 13px; color: #9aafbe; line-height: 1.65; margin: 0 0 6px; }
.hm-help-section strong { color: #ccd; }
.hm-help-section em     { color: #7a9ab5; font-style: normal; }

.hm-help-formula {
  background: #080c11; border: 1px solid #1e2a35; border-left: 3px solid #00ffcc44;
  padding: 10px 14px; border-radius: 3px; font-family: monospace; font-size: 12px;
  color: #00ffcc99; margin: 8px 0; letter-spacing: 0.02em;
}

.hm-help-legend {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-top: 8px; font-size: 12px; color: #556;
}

.hm-help-tag {
  display: inline-block; padding: 1px 6px; border-radius: 2px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
}
.hm-help-tag.com { background: #002a1a; color: #00cc77; border: 1px solid #00cc7733; }
.hm-help-tag.itm { background: #1a1a00; color: #ccaa00; border: 1px solid #ccaa0033; }
.hm-help-tag.veh { background: #001a26; color: #4db8ff; border: 1px solid #0077cc33; }
.hm-help-tag.pri { background: #1a0a26; color: #cc88ff; border: 1px solid #9944cc33; }

/* ── Help column reference ─────────────────────────────────────────────── */
.hm-help-cols { display: flex; flex-direction: column; gap: 12px; margin-top: 6px; }
.hm-help-col-row {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 10px 12px; background: #080c11;
  border: 1px solid #1e2a35; border-radius: 4px;
}
.hm-help-col-row .col-tag { flex-shrink: 0; margin-top: 2px; min-width: 58px; text-align: center; }
.hm-help-col-row div { font-size: 12.5px; color: #7a9ab5; line-height: 1.6; }
.hm-help-col-row strong { color: #ccd; }
.hm-help-col-row em     { color: #7a9ab5; font-style: normal; }
</style>