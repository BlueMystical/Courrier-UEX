<!-- src/renderer/views/BuySell/CommoditiesRoutes.vue -->
<template>
    <div class="routes-container">

        <!-- Header -->
        <div class="page-header">
            <div class="header-title">
                <i class="pi pi-map"></i>
                <div>
                    <h1>Trade Routes</h1>
                    <p class="header-sub">{{ headerSubtitle }}</p>
                </div>
            </div>

            <!-- Global Stats / Data Extract -->
            <div class="header-controls">
                <div class="data-extract" v-if="dataExtract">                    
                    <marquee scrollamount="5" class="extract-text">{{ dataExtract }}</marquee>
                </div>
                <Button icon="pi pi-list" text rounded severity="secondary" class="extract-expand-btn"
                    aria-label="View full list" title="View full list" @click="showExtractPanel = true" />
            </div>
        </div>

        <!-- Search bar (Filters) -->
        <Toolbar class="search-toolbar">
            <template #start>
            <div class="filter-group">
<!-- TreeSelect de Planeta, agrupado por sistema estelar -->
<TreeSelect
        v-model="selectedPlanet"
        :options="planetTree"
        :expandedKeys="expandedKeys"
        selectionMode="single"
        placeholder="Origin Planet..."
        showClear
        filter
        filterPlaceholder="Search planet..."
        class="filter-select"
        @show="focusTreeSelectFilter"
        @update:modelValue="onFilterChange">
        <template #option="{ node }">
            <div v-if="node.children" class="filter-option-system">
                <span class="option-name">{{ node.label }}</span>
            </div>
            <div v-else class="filter-option">
                <span class="option-name">{{ node.label }}</span>
                <span class="option-sub">{{ node.data?.star_system_name }}</span>
            </div>
        </template>
    </TreeSelect>

<!-- Select de Commodity -->
    <Select 
        v-model="selectedCommodity" 
        :options="commodities" 
        optionLabel="name" 
        optionValue="id"
        placeholder="Commodity..." 
        showClear 
        filter 
        autoFilterFocus
        filterPlaceholder="Search commodity..."
        class="filter-select" 
        @change="onFilterChange">
        <template #option="{ option }">
            <div class="filter-option">
                <span class="option-name">{{ option.name }}</span>
                <span class="option-sub">{{ option.kind }}</span>
            </div>
        </template>
    </Select>

<!-- Select de Nave: filtra rutas por capacidad de carga real de la nave elegida -->
    <Select 
        v-model="selectedVehicle" 
        :options="vehicles" 
        optionLabel="name_full" 
        optionValue="id"
        placeholder="Any ship (no cargo limit)..." 
        showClear 
        filter 
        autoFilterFocus
        filterPlaceholder="Search ship..."
        class="filter-select" 
        @change="onFilterChange">
        <template #option="{ option }">
            <div class="filter-option">
                <span class="option-name">{{ option.name_full }}</span>
                <span class="option-sub">{{ option.scu }} SCU</span>
            </div>
        </template>
    </Select>

                <!-- NUEVO INPUT DE INVERSIÓN -->
                <InputNumber v-model="maxInvestment" placeholder="Max Investment (aUEC)" 
                    mode="decimal" class="filter-input" :useGrouping="false" clearable />

                <Button label="Search" icon="pi pi-search" :loading="loading" @click="fetchRoutes" 
                    :disabled="!canSearch" />
            </div>
            </template>

            <template #end>
                <SelectButton v-model="sortBy" :options="sortOptions" optionLabel="label" optionValue="value"
                    class="sort-toggle" :allowEmpty="false" v-if="hasSearched && !loading">
                    <template #option="{ option }">
                        <span v-tooltip.top="option.tooltip">{{ option.label }}</span>
                    </template>
                </SelectButton>
            </template>
        </Toolbar>

        <!-- Scrollable content area -->
        <ScrollPanel class="content-scroll">

            <!-- Initial State -->
            <div v-if="!hasSearched && !loading && !error" class="empty-state">
                <i class="pi pi-search"></i>
                <p>Select an Origin Planet or a Commodity to find routes.</p>
            </div>

            <!-- Loading -->
            <div v-else-if="loading" class="loading-state">
                <ProgressSpinner />
                <p>Calculating trade routes...</p>
            </div>

            <!-- Error -->
            <Message v-else-if="error" severity="error" class="error-msg">{{ error }}</Message>

            <!-- Routes list -->
            <div v-else-if="routes.length > 0" class="routes-grid">
                <div v-for="route in sortedRoutes" :key="route.id" class="route-card"
                    :class="{ 'selected': selectedRoute?.id === route.id }" @click="selectRoute(route)">
                    
                    <div class="route-header">
                        <div class="header-tags">
                            <Tag severity="info" class="commodity-tag">
                                <i class="pi pi-box mr-1"></i> {{ route.commodity_name }}
                            </Tag>
                            <Tag v-if="route.calc.limitedByShip" severity="warn" class="ship-limit-tag"
                                v-tooltip.top="'The market has more stock than your ship can carry — quantity is capped by your ship\'s cargo grid, not by supply.'">
                                <i class="pi pi-truck mr-1"></i> Ship-limited
                            </Tag>
                        </div>
                        <span class="margin-badge">ROI: {{ route.calc.roi.toFixed(1) }}%</span>
                    </div>

                    <div class="route-path">
                        <!-- Origin -->
                        <div class="path-node origin">
                            <div class="node-system" :title="formatLocation(route, 'origin')">{{ truncateText(formatLocation(route, 'origin'), 24) }}</div>
                            <div class="node-terminal" :title="route.origin_terminal_name">{{ route.origin_terminal_name }}</div>
                            <div class="node-price">Buy Price: <strong>{{ formatAUEC(route.price_origin) }} aUEC</strong></div>
                        </div>

                        <!-- Arrow -->
                        <div class="path-arrow">
                            <i class="pi pi-arrow-right"></i>
                            <span class="distance" v-if="route.distance > 0">{{ formatDistance(route.distance) }} GM</span>
                        </div>

                        <!-- Destination -->
                        <div class="path-node destination">
                            <div class="node-system" :title="formatLocation(route, 'destination')">{{ truncateText(formatLocation(route, 'destination'), 24) }}</div>
                            <div class="node-terminal" :title="route.destination_terminal_name">{{ route.destination_terminal_name }}</div>
                            <div class="node-price">Sell Price: <strong>{{ formatAUEC(route.price_destination) }} aUEC</strong></div>
                        </div>
                    </div>

                    <!-- Financials -->
                    <div class="route-financials">
                        <!-- Fila 1 -->
                        <div class="metric">
                            <span class="metric-label">Investment</span>
                            <span class="metric-value">{{ formatAUEC(route.calc.investment) }} aUEC</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Selling</span>
                            <span class="metric-value">{{ formatAUEC(route.calc.selling) }} aUEC</span>
                        </div>
                        <div class="metric profit">
                            <span class="metric-label">Profit</span>
                            <span class="metric-value text-success">+{{ formatAUEC(route.calc.profit) }} aUEC</span>
                        </div>

                        <!-- Fila 2 -->
                        <div class="metric">
                            <span class="metric-label">Quantity Buy</span>
                            <span class="metric-value">{{ route.calc.usableScu }} SCU</span>
                        </div>
                        <div class="metric metric-empty"></div>
                        <div class="metric">
                            <span class="metric-label">ROI</span>
                            <span class="metric-value">{{ route.calc.roi.toFixed(1) }}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Empty state (No results) -->
            <div v-else class="empty-state">
                <i class="pi pi-map"></i>
                <p>No routes found for the selected criteria</p>
                <Button label="Clear filters" icon="pi pi-times" text @click="clearFilters" />
            </div>

        </ScrollPanel>

        <!-- Route Detail Drawer -->
        <Drawer v-model:visible="showDetailsPanel" position="right" :style="{ width: '480px' }" :modal="false">
            <template #header>
                <div class="drawer-header">
                    <i class="pi pi-map drawer-icon"></i>
                    <div>
                        <div class="drawer-manufacturer">{{ selectedRoute?.commodity_name }}</div>
                        <h2 class="drawer-title">Route Details</h2>
                    </div>
                </div>
            </template>

            <!-- Route Info -->
            <div class="drawer-content" v-if="selectedRoute">
                <div class="prices-section">
                    <h3 class="prices-title"><i class="pi pi-upload"></i> Origin Details</h3>
                    <div class="detail-specs">
                        <div class="detail-spec full-width">
                            <span class="spec-label">Terminal</span>
                            <span class="spec-value">{{ selectedRoute.origin_terminal_name }} ({{ selectedRoute.origin_terminal_code }})</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Location</span>
                            <span class="spec-value">{{ selectedRoute.origin_star_system_name }} / {{ selectedRoute.origin_planet_name }}</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Faction</span>
                            <span class="spec-value">{{ selectedRoute.origin_faction_name || 'N/A' }}</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Freight Elevator</span>
                            <span class="spec-value">{{ selectedRoute.has_freight_elevator_origin ? '✓ Yes' : '✗ No' }}</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Monitored Zone</span>
                            <span class="spec-value">{{ selectedRoute.is_monitored_origin ? '✓ Yes' : '✗ No' }}</span>
                        </div>
                        <div class="detail-spec full-width">
                            <span class="spec-label">Container Sizes Accepted</span>
                            <span class="spec-value">{{ selectedRoute.container_sizes_origin || 'Unknown' }} SCU</span>
                        </div>
                    </div>
                </div>

                <Divider />

                <div class="prices-section">
                    <h3 class="prices-title"><i class="pi pi-download"></i> Destination Details</h3>
                    <div class="detail-specs">
                        <div class="detail-spec full-width">
                            <span class="spec-label">Terminal</span>
                            <span class="spec-value">{{ selectedRoute.destination_terminal_name }} ({{ selectedRoute.destination_terminal_code }})</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Location</span>
                            <span class="spec-value">{{ selectedRoute.destination_star_system_name }} / {{ selectedRoute.destination_planet_name }}</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Faction</span>
                            <span class="spec-value">{{ selectedRoute.destination_faction_name || 'N/A' }}</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Freight Elevator</span>
                            <span class="spec-value">{{ selectedRoute.has_freight_elevator_destination ? '✓ Yes' : '✗ No' }}</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Monitored Zone</span>
                            <span class="spec-value">{{ selectedRoute.is_monitored_destination ? '✓ Yes' : '✗ No' }}</span>
                        </div>
                        <div class="detail-spec full-width">
                            <span class="spec-label">Container Sizes Accepted</span>
                            <span class="spec-value">{{ selectedRoute.container_sizes_destination || 'Unknown' }} SCU</span>
                        </div>
                    </div>
                </div>

                <Divider />
                
                <div class="prices-section">
                    <h3 class="prices-title"><i class="pi pi-chart-line"></i> Market Financials</h3>
                    <div class="detail-specs">
                        <div class="detail-spec">
                            <span class="spec-label">Buy Price</span>
                            <span class="spec-value">{{ formatAUEC(selectedRoute.price_origin) }} aUEC</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Sell Price</span>
                            <span class="spec-value">{{ formatAUEC(selectedRoute.price_destination) }} aUEC</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Total Investment</span>
                            <span class="spec-value">{{ formatAUEC(selectedRoute.calc.investment) }} aUEC</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Total Selling</span>
                            <span class="spec-value">{{ formatAUEC(selectedRoute.calc.selling) }} aUEC</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Total Profit</span>
                            <span class="spec-value text-success">+{{ formatAUEC(selectedRoute.calc.profit) }} aUEC</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">SCU to Carry {{ selectedRoute.calc.limitedByShip ? '(ship-limited)' : '(market-limited)' }}</span>
                            <span class="spec-value">{{ selectedRoute.calc.usableScu }} SCU</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">ROI (own calc)</span>
                            <span class="spec-value">{{ selectedRoute.calc.roi.toFixed(1) }}%</span>
                        </div>
                    </div>
                </div>
                
            </div>
        </Drawer>

        <!-- Data Extract Drawer: desglose completo del ticker -->
        <Drawer v-model:visible="showExtractPanel" position="right" :style="{ width: '460px' }" :modal="false">
            <template #header>
                <div class="drawer-header">
                    <i class="pi pi-sparkles drawer-icon"></i>
                    <div>
                        <div class="drawer-manufacturer">UEX Data Extract</div>
                        <h2 class="drawer-title">Best Commodities Routes</h2>
                    </div>
                </div>
            </template>

            <div class="extract-drawer-content">
                <!-- Caso 1: todavía no llegó nada del endpoint (ej. bloqueado por CSP, o falló el fetch) -->
                <div v-if="!dataExtract" class="empty-state">
                    <i class="pi pi-inbox"></i>
                    <p>Data extract not loaded yet.</p>
                </div>

                <template v-else>
                    <p class="extract-updated" v-if="parsedExtract.updated">{{ parsedExtract.updated }}</p>

                    <!-- Caso 2: sí llegó texto y se pudo parsear en rutas -->
                    <div class="extract-list" v-if="parsedExtract.routes.length > 0">
                        <div v-for="(item, idx) in parsedExtract.routes" :key="idx" class="extract-item">
                            <Tag :value="item.code" severity="info" class="extract-code" />
                            <div class="extract-route">
                                <span class="extract-origin">{{ item.origin }}</span>
                                <i class="pi pi-arrow-right"></i>
                                <span class="extract-destination">{{ item.destination }}</span>
                            </div>
                            <span class="extract-amount">{{ item.amount }}</span>
                        </div>
                    </div>

                    <!-- Caso 3: llegó texto pero el parser no reconoció el formato (fallback, no se pierde info) -->
                    <p v-else class="extract-raw">{{ dataExtract }}</p>

                    <Divider v-if="parsedExtract.disclaimer" />
                    <p class="extract-disclaimer" v-if="parsedExtract.disclaimer">{{ parsedExtract.disclaimer }}</p>
                </template>
            </div>
        </Drawer>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import Select from 'primevue/select'
import TreeSelect from 'primevue/treeselect'
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Drawer from 'primevue/drawer'
import Divider from 'primevue/divider'
import ScrollPanel from 'primevue/scrollpanel'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Tooltip from 'primevue/tooltip'
// Registro local: en <script setup>, una variable vXxx habilita v-xxx en el template
const vTooltip = Tooltip
import { useNotify } from '@/components/Notificaciones/Notify'
import { useAppStore } from '@/AppStore'

const notify = useNotify()
const appStore = useAppStore()

const API_BASE = 'https://api.uexcorp.uk/2.0'
const API_PLANETS = `${API_BASE}/planets`
const API_ROUTES = `${API_BASE}/commodities_routes`
const API_EXTRACT = `${API_BASE}/data_extract?data=commodities_routes`
// commodities y vehicles ya NO se fetchean acá: viven en el cache central de
// main (uexCache/itemCacheService), gateados por versión del juego — ver
// helpers/uexSync.js. Se leen por IPC más abajo (fetchCommodities/fetchVehicles).

let stopSyncWatch = null

// Sistemas habilitados para el filtro de planetas (por ahora, restringido a estos 3)
const STAR_SYSTEMS = [
    { id: 68, name: 'Stanton' },
    { id: 64, name: 'Pyro' },
    { id: 55, name: 'Nyx' },
]

// --- STATE ---
const planetTree = ref([])
const expandedKeys = ref({})
const commodities = ref([])
const vehicles = ref([])
const routes = ref([])
const dataExtract = ref('')

const selectedPlanet = ref(null)
const selectedCommodity = ref(null)
const selectedVehicle = ref(null) // id_vehicle elegido, o null = "sin nave / sin límite de carga"
const selectedRoute = ref(null)
const maxInvestment = ref(null) 

const loading = ref(false)
const error = ref(null)
const hasSearched = ref(false)
const showDetailsPanel = ref(false)
const showExtractPanel = ref(false)

// Criterio de orden de resultados: se aplica en el cliente, sin re-fetch
const sortBy = ref('profit') // 'profit' | 'roi'
const sortOptions = [
    { label: 'Profit', value: 'profit', tooltip: 'Highest total aUEC profit per trip. Best when your cargo capacity is the limiting factor.' },
    { label: 'ROI', value: 'roi', tooltip: 'Return on investment. Highest profit per aUEC invested. Best when your budget is the limiting factor, since you could repeat the trip or split it across ships.' },
]


// --- COMPUTED ---
// El TreeSelect (a pesar de lo que dice la doc oficial) no siempre entrega la key
// "pelada" en modo single: según la versión puede llegar como string, o como el
// objeto de selección interno { [key]: true }, o como el nodo completo. Esta
// función normaliza cualquiera de esas formas al id de planeta real.
function extractPlanetId(value) {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'string' || typeof value === 'number') return value
    if (typeof value === 'object') {
        if (value.key !== undefined) return value.key // nodo completo { key, label, data, ... }
        const keys = Object.keys(value)
        return keys.length ? keys[0] : null // { [key]: true }
    }
    return null
}

const selectedPlanetId = computed(() => extractPlanetId(selectedPlanet.value))

// Objeto completo de la nave elegida (o null si "Cualquier nave")
const selectedVehicleObj = computed(() => {
    if (!selectedVehicle.value) return null
    return vehicles.value.find(v => v.id === selectedVehicle.value) || null
})

// Reordena en el cliente según el criterio elegido, sin volver a pegarle a la API
const sortedRoutes = computed(() => {
    return [...routes.value].sort((a, b) => b.calc[sortBy.value] - a.calc[sortBy.value])
})

// Subtítulo del header: texto genérico por defecto, conteo de resultados tras buscar
const headerSubtitle = computed(() => {
    if (loading.value) return 'Calculating trade routes...'
    if (hasSearched.value) {
        return `${routes.value.length} route${routes.value.length !== 1 ? 's' : ''} found`
    }
    return 'Find the most profitable commodities routes'
})

// La API requiere al menos un parámetro (id_planet_origin o id_commodity)
const canSearch = computed(() => {
    return selectedPlanetId.value !== null || selectedCommodity.value !== null || maxInvestment.value !== null
})

// --- CÁLCULO PROPIO DE ECONOMÍA DE RUTA ---
// La API tiene un parámetro `investment` opcional, pero no permite limitar por
// capacidad de carga de una nave puntual, y sus campos `investment`/`profit`/`score`
// no siempre son confiables (mezclan datos de usuarios, promedios, etc.).
// Por eso recalculamos todo nosotros a partir de los campos crudos de precio y SCU.

// Convierte "1,2,4,8" -> [1,2,4,8] (ints). Devuelve [] si viene vacío/null.
function parseContainerSizes(csv) {
    if (!csv) return []
    return String(csv)
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n))
}

// La nave solo puede operar la ruta si al menos un tamaño de contenedor que carga
// es aceptado TANTO en origen como en destino. Si a algún lado le falta el dato,
// le damos el beneficio de la duda (no bloqueamos por falta de info).
function isContainerCompatible(route, vehicle) {
    if (!vehicle) return true
    const shipSizes = parseContainerSizes(vehicle.container_sizes)
    if (shipSizes.length === 0) return true // nave sin data de contenedores, no filtramos

    const originSizes = parseContainerSizes(route.container_sizes_origin)
    const destSizes = parseContainerSizes(route.container_sizes_destination)

    const fitsOrigin = originSizes.length === 0 || shipSizes.some(s => originSizes.includes(s))
    const fitsDest = destSizes.length === 0 || shipSizes.some(s => destSizes.includes(s))

    return fitsOrigin && fitsDest
}

// Recalcula SCU realmente transportable, inversión, ganancia y ROI para una ruta,
// dada una nave (o null = sin límite de carga, solo limitado por stock del mercado).
function computeRouteEconomics(route, vehicle) {
    const marketScu = Math.max(0, Number(route.scu_reachable) || 0)
    const shipScu = vehicle ? Math.max(0, Number(vehicle.scu) || 0) : Infinity
    const usableScu = Math.max(0, Math.min(marketScu, shipScu))

    const priceOrigin = Number(route.price_origin) || 0
    const priceDestination = Number(route.price_destination) || 0

    const investment = usableScu * priceOrigin
    const revenue = usableScu * priceDestination
    const profit = revenue - investment
    const roi = investment > 0 ? (profit / investment) * 100 : 0

    return {
        usableScu,
        investment,
        selling: revenue,
        profit,
        roi,
        limitedByShip: vehicle ? shipScu < marketScu : false,
        compatible: isContainerCompatible(route, vehicle),
    }
}

// Parsea el string plano del ticker (separado por "•") en algo mostrable en el Drawer.
// Formato esperado por ítem de ruta: "CODE: Origin ▶ Destination = Up to XXM UEC"
const parsedExtract = computed(() => {
    const result = { updated: '', routes: [], disclaimer: '' }
    if (!dataExtract.value) return result

    // Normalizamos separador de items (•, ·) y flecha (▶, →, ->) por si la API
    // devuelve alguna variante levemente distinta.
    const normalized = dataExtract.value.replace(/\uFEFF/g, '').replace(/->|→/g, '▶')
    const parts = normalized.split(/[•·]/).map(p => p.trim()).filter(Boolean)
    const routeRegex = /^([A-Za-z0-9]+):\s*(.+?)\s*▶\s*(.+?)\s*=\s*(.+)$/

    for (const part of parts) {
        const match = part.match(routeRegex)
        if (match) {
            result.routes.push({ code: match[1], origin: match[2], destination: match[3], amount: match[4] })
        } else if (/^updated/i.test(part)) {
            result.updated = part
        } else if (/estimated/i.test(part)) {
            result.disclaimer = part
        }
        // El resto (fuente "UEX", título "Best Commodities Routes") es el encabezado, se ignora
    }

    if (parts.length > 0 && result.routes.length === 0) {
        // Ayuda a diagnosticar rápido si la API cambia el formato del extract
        console.warn('[CommoditiesRoutes] No se pudo parsear ninguna ruta del data extract. Partes detectadas:', parts)
    }

    return result
})


// El panel del TreeSelect se monta con teleport a <body>, por lo que buscamos
// el input del filtro a nivel documento en vez de a través de un template ref.
function focusTreeSelectFilter() {
    nextTick(() => {
        setTimeout(() => {
            const input = document.querySelector('.p-treeselect-overlay input[type="text"]')
            if (input) input.focus()
        }, 50)
    })
}

// --- LIFECYCLE ---
onMounted(async () => {
    fetchDataExtract()
    await Promise.all([fetchPlanetTree(), fetchCommodities(), fetchVehicles()])

    // Si la view montó antes de que termine el sync inicial gateado por
    // versión (primer arranque, o backfill de una key nueva), commodities/
    // vehicles pueden llegar vacíos acá arriba. Se releen solos cuando el
    // sync global (store.isSyncing) termina.
    if (!commodities.value.length || !vehicles.value.length) {
        stopSyncWatch = watch(() => appStore.isSyncing, (isSyncing, wasSyncing) => {
            if (wasSyncing && !isSyncing) Promise.all([fetchCommodities(), fetchVehicles()])
        })
    }
})

onUnmounted(() => {
    if (stopSyncWatch) stopSyncWatch()
})

// --- API CALLS ---
async function fetchPlanetTree() {
    try {
        const results = await Promise.all(
            STAR_SYSTEMS.map(system =>
                fetch(`${API_PLANETS}?id_star_system=${system.id}`).then(r => r.json())
            )
        )

        planetTree.value = STAR_SYSTEMS.map((system, index) => {
            const systemPlanets = (results[index]?.data || [])
                .sort((a, b) => a.name.localeCompare(b.name))

            return {
                key: `system-${system.id}`,
                label: system.name,
                selectable: false,
                data: { isSystem: true, id: system.id, name: system.name },
                children: systemPlanets.map(planet => ({
                    key: String(planet.id),
                    label: planet.name,
                    data: planet,
                })),
            }
        })
        // Colapsados por defecto: el usuario expande el sistema que le interesa
        // (o los encuentra directo tipeando en el filtro, que auto-expande el match).
    } catch (e) {
        console.error('Error fetching planet tree:', e)
    }
}

// Catálogo de commodities: vive en uexCache (main), gateado por versión del
// juego — se lee por IPC, ya no se fetchea acá en cada montaje.
async function fetchCommodities() {
    try {
        const cache = await window.api.UEX.getCache()
        commodities.value = (cache.commodities?.data || []).sort((a, b) => a.name.localeCompare(b.name))
    } catch (e) {
        console.error('Error loading cached commodities:', e)
    }
}

// Catálogo de vehículos: ídem, vía itemCacheService/uexCache (main).
async function fetchVehicles() {
    try {
        const allVehicles = await window.api.Items.getVehicles()
        // Solo naves con capacidad de carga real (excluye caza, exploración sin bodega, etc.)
        vehicles.value = (allVehicles || [])
            .filter(v => Number(v.scu) > 0)
            .sort((a, b) => a.name_full.localeCompare(b.name_full))
    } catch (e) {
        console.error('Error loading cached vehicles:', e)
    }
}

async function fetchDataExtract() {
    try {
        const res = await fetch(API_EXTRACT)
        const text = await res.text()
        // Asignamos el texto directamente, limpiando espacios sobrantes al inicio/final
        dataExtract.value = text.trim() 
    } catch (e) {
        console.error('Error fetching data extract:', e)
    }
}

async function fetchRoutes() {
    if (!canSearch.value) return

    loading.value = true
    error.value = null
    hasSearched.value = true
    routes.value = []
    
    try {
        const params = new URLSearchParams()
        if (selectedPlanetId.value) params.append('id_planet_origin', selectedPlanetId.value)
        if (selectedCommodity.value) params.append('id_commodity', selectedCommodity.value)

        // NOTA: ya no mandamos `investment` a la API. Su cálculo interno no
        // considera la capacidad de la nave y no es confiable, así que traemos
        // el set completo (limitado por la propia API a 500 filas) y hacemos
        // el filtrado/orden por inversión y capacidad de carga nosotros mismos.

        const res = `${API_ROUTES}?${params.toString()}`
        const response = await fetch(res)
        const json = await response.json()
        
        if (json.status === 'error') {
            throw new Error(json.message || 'Error from API')
        }

        const vehicle = selectedVehicleObj.value
        const maxInv = (maxInvestment.value !== null && maxInvestment.value !== '') ? Number(maxInvestment.value) : null

        const enriched = (json.data || [])
            .map(route => ({ ...route, calc: computeRouteEconomics(route, vehicle) }))
            // Sin SCU útil (mercado vacío o nave sin la bodega mínima) no sirve
            .filter(route => route.calc.usableScu > 0)
            // Compatibilidad de tamaño de contenedor con la nave elegida
            .filter(route => route.calc.compatible)
            // Presupuesto máximo, calculado con NUESTRA inversión real, no la de la API
            .filter(route => maxInv === null || route.calc.investment <= maxInv)

        routes.value = enriched
        
    } catch (e) {
        error.value = 'Failed to load routes. ' + e.message
        notify.error('Failed to load trade routes')
        console.error(e)
    } finally {
        loading.value = false
    }
}

// --- HANDLERS ---
function onFilterChange() {
    // Podrías hacer auto-fetch aquí, pero al ser una operación pesada 
    // y requerir al menos 1 parametro, preferimos botón o auto-fetch si canSearch = true
    if (canSearch.value) {
        // Opcional: auto-fetch on change
        // fetchRoutes()
    }
}

function selectRoute(route) {
    selectedRoute.value = route
    showDetailsPanel.value = true
}

function clearFilters() {
    selectedPlanet.value = null
    selectedCommodity.value = null
    selectedVehicle.value = null
    maxInvestment.value = null // <--- RESETEAR AQUÍ
    routes.value = []
    hasSearched.value = false
}

// El orbit_name de la API ya identifica el cuerpo real (planeta o luna),
// así que alcanza con combinarlo con el sistema estelar.
function formatLocation(route, side) {
    const system = route[`${side}_star_system_name`]
    const orbit = route[`${side}_orbit_name`]
    return [system, orbit].filter(Boolean).join(' / ')
}

// La API expresa la distancia en Giga Metros (GM), no en km.
function formatDistance(value) {
    if (value === undefined || value === null) return '0'
    const num = Number(value)
    return Number.isInteger(num) ? num.toString() : num.toFixed(2)
}

// Corta un texto a `max` caracteres agregando "…"; el texto completo se
// muestra vía tooltip (atributo title) donde se usa esta función.
function truncateText(text, max) {
    if (!text) return ''
    return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
}

function formatAUEC(value) {
    if (value === undefined || value === null) return '—'
    // Formatea con comas y 0 decimales
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
}
/** Formatea los números con comas de separación de miles */
function formatCurrency(value) {
    if (value === null || value === undefined) return '0'
    return Number(value).toLocaleString('en-US')
}
</script>

<style scoped>
.routes-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    height: 100%;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    box-sizing: border-box;
    position: relative;
    background-color: var(--color-background-tertiary);
    isolation: isolate;
}

/* Mismo patrón que Home.vue (.home-bg), y por la misma razón: el pseudo-
   elemento absoluto vive fuera del flujo del flex layout, así no depende de
   min-height (que App.vue pisa con `.card.mt-2 > * { min-height: 0 }`) y no
   se pierde al desmontar/remontar esta vista al navegar entre rutas — antes
   esta view no tenía patrón (background: transparent a secas), lo que además
   dejaba ver el color plano de fondo en vez del patrón del resto de la app. */
.routes-container::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-image:
        repeating-linear-gradient(0deg,
            rgba(80, 50, 0, 0.04) 0px, rgba(80, 50, 0, 0.04) 1px,
            transparent 1px, transparent 4px),
        repeating-linear-gradient(90deg,
            rgba(0, 40, 100, 0.016) 0px, rgba(0, 40, 100, 0.016) 1px,
            transparent 1px, transparent 80px);
    background-size: 100% 4px, 80px 100%;
}

/* Modo oscuro — más intenso porque el fondo es oscuro */
:global(.app-dark) .routes-container::before {
    background-image:
        repeating-linear-gradient(0deg,
            rgba(255, 200, 80, 0.07) 0px, rgba(255, 200, 80, 0.07) 1px,
            transparent 1px, transparent 4px),
        repeating-linear-gradient(90deg,
            rgba(100, 180, 255, 0.03) 0px, rgba(100, 180, 255, 0.03) 1px,
            transparent 1px, transparent 80px);
    background-size: 100% 4px, 80px 100%;
}

/* ── HEADER ── */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    flex-shrink: 0;
}

.header-title {
    display: flex;
    align-items: center;
    gap: 0.85rem;
}

.header-title i {
    font-size: 2rem;
    color: var(--p-primary-color);
}

.header-title h1 {
    font-size: 1.6rem;
    font-weight: 700;
    margin: 0;
    line-height: 1.1;
}

.header-sub {
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
    margin: 0;
}

.header-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
}

/* Ticker estilo Data Extract */
.data-extract {
    background: var(--p-highlight-background);
    border: 1px solid var(--p-primary-color);
    border-radius: 8px;
    padding: 0.4rem 1rem;
    max-width: 500px;
    flex: 1;
    color: var(--p-primary-color);
    font-size: 0.85rem;
    font-weight: 600;
    overflow: hidden;
}
.extract-text {
    white-space: nowrap;
    flex: 1;
    min-width: 0;
}

.extract-expand-btn {
    flex-shrink: 0;
    color: var(--p-primary-color);
}

/* ── DATA EXTRACT DRAWER ── */
.extract-drawer-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.extract-updated {
    font-size: 0.8rem;
    color: var(--p-text-muted-color);
    margin: 0;
}

.extract-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.extract-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--p-content-border-color);
    border-radius: 8px;
}

.extract-code {
    flex-shrink: 0;
}

.extract-route {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
    font-size: 0.85rem;
}

.extract-origin,
.extract-destination {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.extract-route i {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
}

.extract-amount {
    flex-shrink: 0;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--p-primary-color);
    white-space: nowrap;
}

.extract-disclaimer {
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
    margin: 0;
    font-style: italic;
}

.extract-raw {
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--p-text-color);
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--p-surface-100);
    border-radius: 8px;
    padding: 0.75rem;
    margin: 0;
}

:deep(.app-dark) .extract-raw {
    background: var(--p-surface-900);
}

/* ── SEARCH ── */
/* Despojamos al Toolbar de su fondo/borde por defecto para que se vea como
   la barra de búsqueda original, y forzamos una sola fila. */
.search-toolbar {
    background: transparent;
    border: none;
    padding: 0;
    flex-shrink: 0;
    gap: 0.75rem;
}

.search-toolbar :deep(.p-toolbar-start) {
    flex: 1;
    min-width: 0;
}

.filter-group {
    display: grid;
    grid-template-columns: minmax(160px, 1.1fr) minmax(160px, 1.1fr) minmax(160px, 1.1fr) 150px auto;
    align-items: center;
    gap: 0.75rem;
    /* Si en pantallas angostas ni así entra, se scrollea en vez de romper el layout */
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
}

/* Cada control ocupa su propia celda de grilla: no pueden superponerse por más
   ancho "natural" que traiga el input interno de PrimeVue. */
.filter-select,
.filter-input {
    min-width: 0;
}

.filter-group :deep(.p-treeselect),
.filter-group :deep(.p-select),
.filter-group :deep(.p-inputnumber) {
    width: 100%;
}

.filter-group :deep(.p-inputnumber-input) {
    width: 100%;
    box-sizing: border-box;
}

/* El botón nunca debe achicarse: si se comprime, su label desborda
   y "flota" encima de los demás controles (el overlap reportado). */
.filter-group :deep(.p-button) {
    flex-shrink: 0;
    white-space: nowrap;
}

.search-toolbar :deep(.p-toolbar-end) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.sort-toggle :deep(.p-togglebutton) {
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
}



.filter-option {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
}

.option-name {
    font-size: 0.9rem;
    font-weight: 500;
}

.option-sub {
    font-size: 0.72rem;
    color: var(--p-text-muted-color);
}

.filter-option-system .option-name {
    font-weight: 600;
}

/* ── SCROLLABLE CONTENT AREA ── */
.content-scroll {
    flex: 1;
    min-height: 0;
    width: 100%;
    min-width: 0;
    background: transparent;
}

.content-scroll :deep(.p-scrollpanel-wrapper) {
    height: 100%;
    width: 100%;
}

.content-scroll :deep(.p-scrollpanel-content) {
    width: 100%;
    box-sizing: border-box;
    padding-right: 0.75rem;
}

/* ── STATES ── */
.loading-state,
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    min-height: 300px;
    color: var(--p-text-muted-color);
}

.empty-state i {
    font-size: 3rem;
    opacity: 0.3;
}

.error-msg {
    margin: 0;
}

/* ── ROUTES GRID ── */
.routes-grid {
    display: grid;
    /* Cards mas anchas porque hay mucha informacion horizontal (origen -> flecha -> destino) */
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1rem;
    align-content: start;
}

.route-card {
    border: 1px solid var(--p-content-border-color);
    border-radius: 10px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--p-content-background);
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.route-card:hover {
    border-color: var(--p-primary-color);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
}

.route-card.selected {
    border-color: var(--p-primary-color);
    box-shadow: 0 0 0 2px var(--p-primary-color);
}

.route-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header-tags {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.margin-badge {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--p-primary-color);
    background: var(--p-highlight-background);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
}

/* Route Path Visualization */
.route-path {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    background: var(--p-surface-100);
    border: 1px solid var(--p-content-border-color);
    border-radius: 8px;
    padding: 0.75rem 1rem;
}

:global(.app-dark) .route-path {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
}
:deep(.app-dark) .route-path {
    background: var(--p-surface-900);
}

.path-node {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 40%;
}

.path-node.destination {
    text-align: right;
}

.node-system {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--p-text-muted-color);
}

.node-terminal {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0.15rem 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.node-price {
    font-size: 0.8rem;
    color: var(--p-text-color);
}

.path-arrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--p-text-muted-color);
    padding: 0 0.5rem;
}

.distance {
    font-size: 0.65rem;
    margin-top: 0.2rem;
    white-space: nowrap;
}

/* Route Financials */
.route-financials {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: auto auto;
    border: 1px solid var(--p-content-border-color);
    border-radius: 8px;
    overflow: hidden;
}

.metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    padding: 0.55rem 0.5rem;
    text-align: center;
    border-right: 1px solid var(--p-content-border-color);
    border-bottom: 1px solid var(--p-content-border-color);
}

/* Sin borde derecho en la última columna, sin borde inferior en la última fila */
.metric:nth-child(3n) {
    border-right: none;
}

.metric:nth-child(n+4) {
    border-bottom: none;
}

.metric-empty {
    background: rgba(0, 0, 0, 0.02);
}

:deep(.app-dark) .metric-empty {
    background: rgba(255, 255, 255, 0.03);
}

.metric.profit .metric-value {
    font-weight: 700;
}

.text-success {
    color: var(--p-teal-400, #2dd4bf);
}

.metric-label {
    font-size: 0.68rem;
    color: var(--p-text-muted-color);
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.metric-value {
    font-size: 0.9rem;
    font-weight: 500;
}

/* ── DRAWER ── */
.drawer-header {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.drawer-icon {
    font-size: 2rem;
    color: var(--p-primary-color);
    background: var(--p-highlight-background);
    padding: 0.8rem;
    border-radius: 8px;
}

.drawer-manufacturer {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--p-primary-color);
    margin-bottom: 0.15rem;
}

.drawer-title {
    font-size: 1.2rem;
    font-weight: 700;
    margin: 0;
    line-height: 1.2;
}

.drawer-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

/* Detail specs grid */
/* Detail specs grid */
.prices-section {
    margin-bottom: 1rem;
}

.prices-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: var(--p-primary-color);
}

/* Contenedor con fondo adaptable */
.detail-specs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem 1rem;
    background: var(--p-surface-100);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid var(--p-surface-200);
}

/* Modo oscuro para los detalles */
:deep(.app-dark) .detail-specs {
    background: rgba(255, 255, 255, 0.03);
    border-color: rgba(255, 255, 255, 0.1);
}

.detail-spec {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
}

.detail-spec.full-width {
    grid-column: span 2;
}

.spec-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--p-text-muted-color); /* Automático gris claro en dark, gris oscuro en light */
}

.spec-value {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--p-text-color); /* Fuerza a que sea blanco en dark mode y negro en light mode */
}
</style>
<style>
/* 
   Estilos GLOBALES para el Drawer. 
   Como el Drawer hace "teleport" al <body>, escapa del <style scoped>.
*/
.app-dark .detail-specs {
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
}

.app-dark .detail-specs .spec-label {
    color: rgba(255, 255, 255, 0.6) !important;
}

.app-dark .detail-specs .spec-value {
    color: rgba(255, 255, 255, 0.95) !important;
}

.app-dark .route-path {
    background: rgba(255, 255, 255, 0.05) !important;
}
</style>