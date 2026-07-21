<!-- src/renderer/views/BuySell/CommoditiesRoutes.vue -->
<template>
    <div class="routes-container">

        <!-- Header -->
        <div class="page-header">
            <div class="header-title">
                <i class="pi pi-map"></i>
                <div>
                    <h1>Trade Routes</h1>
                    <p class="header-sub">Find the most profitable commodities routes</p>
                </div>
            </div>

            <!-- Global Stats / Data Extract -->
            <div class="header-controls data-extract" v-if="dataExtract">
                <i class="pi pi-sparkles"></i>
                <marquee scrollamount="5" class="extract-text">{{ dataExtract }}</marquee>
            </div>
        </div>

        <!-- Search bar (Filters) -->
        <div class="search-bar">
            <div class="filter-group">
<!-- Select de Planeta con plantilla personalizada -->
<Select 
        v-model="selectedPlanet" 
        :options="planets" 
        optionLabel="name" 
        optionValue="id"
        placeholder="Origin Planet..." 
        showClear 
        filter 
        autoFilterFocus
        filterPlaceholder="Search planet..."
        class="filter-select" 
        @change="onFilterChange">
        <template #option="{ option }">
            <div class="filter-option">
                <span class="option-name">{{ option.name }}</span>
                <span class="option-sub">{{ option.star_system_name }}</span>
            </div>
        </template>
    </Select>

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
                
                <!-- NUEVO INPUT DE INVERSIÓN -->
                <InputNumber v-model="maxInvestment" placeholder="Max Investment (aUEC)" 
                    mode="decimal" class="filter-input" :useGrouping="false" clearable />

                <Button label="Search Routes" icon="pi pi-search" :loading="loading" @click="fetchRoutes" 
                    :disabled="!canSearch" />
            </div>

            <span class="route-count" v-if="hasSearched && !loading">
                {{ routes.length }} route{{ routes.length !== 1 ? 's' : '' }} found
            </span>
        </div>

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
                <div v-for="route in routes" :key="route.id" class="route-card"
                    :class="{ 'selected': selectedRoute?.id === route.id }" @click="selectRoute(route)">
                    
                    <div class="route-header">
                        <Tag severity="info" class="commodity-tag">
                            <i class="pi pi-box mr-1"></i> {{ route.commodity_name }}
                        </Tag>
                        <span class="margin-badge">Margin: {{ route.price_margin }}%</span>
                    </div>

                    <div class="route-path">
                        <!-- Origin -->
                        <div class="path-node origin">
                            <div class="node-system">{{ route.origin_planet_name }}</div>
                            <div class="node-terminal" :title="route.origin_terminal_name">{{ route.origin_terminal_name }}</div>
                            <div class="node-price">Buy: <strong>{{ formatAUEC(route.price_origin) }}</strong></div>
                        </div>

                        <!-- Arrow -->
                        <div class="path-arrow">
                            <i class="pi pi-arrow-right"></i>
                            <span class="distance" v-if="route.distance > 0">{{ route.distance }} km</span>
                        </div>

                        <!-- Destination -->
                        <div class="path-node destination">
                            <div class="node-system">{{ route.destination_planet_name }}</div>
                            <div class="node-terminal" :title="route.destination_terminal_name">{{ route.destination_terminal_name }}</div>
                            <div class="node-price">Sell: <strong>{{ formatAUEC(route.price_destination) }}</strong></div>
                        </div>
                    </div>

                    <!-- Financials -->
                    <div class="route-financials">
                        <div class="metric">
                            <span class="metric-label">Investment</span>
                            <span class="metric-value">{{ formatAUEC(route.investment) }} aUEC</span>
                        </div>
                        <div class="metric profit">
                            <span class="metric-label">Est. Profit</span>
                            <span class="metric-value text-success">+{{ formatAUEC(route.profit) }} aUEC</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">ROI</span>
                            <span class="spec-value">{{ Number(route.price_roi).toFixed(1) }}%</span>
                        </div>
                        <div class="metric">
                            <span class="spec-label">Quantity to Buy</span>
                            <span class="spec-value">{{ route.scu_origin }} SCU</span>
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
                            <span class="spec-value">{{ formatAUEC(selectedRoute.investment) }} aUEC</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Total Profit</span>
                            <span class="spec-value text-success">+{{ formatAUEC(selectedRoute.profit) }} aUEC</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Max SCU Available</span>
                            <span class="spec-value">{{ selectedRoute.scu_reachable }} SCU</span>
                        </div>
                        <div class="detail-spec">
                            <span class="spec-label">Route Score</span>
                            <span class="spec-value">{{ formatAUEC(selectedRoute.score) }} pts</span>
                        </div>
                    </div>
                </div>
                
            </div>
        </Drawer>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Drawer from 'primevue/drawer'
import Divider from 'primevue/divider'
import ScrollPanel from 'primevue/scrollpanel'
import InputNumber from 'primevue/inputnumber'
import { useNotify } from '@/components/Notificaciones/Notify'

const notify = useNotify()

const API_BASE = 'https://api.uexcorp.uk/2.0'
const API_PLANETS = `${API_BASE}/planets`
const API_COMMODITIES = `${API_BASE}/commodities`
const API_ROUTES = `${API_BASE}/commodities_routes`
const API_EXTRACT = 'https://api.uexcorp.space/2.0/data_extract?data=commodities_routes'

// --- STATE ---
const planets = ref([])
const commodities = ref([])
const routes = ref([])
const dataExtract = ref('')

const selectedPlanet = ref(null)
const selectedCommodity = ref(null)
const selectedRoute = ref(null)
const maxInvestment = ref(null) 

const planetSelectRef = ref(null)
const commoditySelectRef = ref(null)

const loading = ref(false)
const error = ref(null)
const hasSearched = ref(false)
const showDetailsPanel = ref(false)


// --- COMPUTED ---
// La API requiere al menos un parámetro (id_planet_origin o id_commodity)
const canSearch = computed(() => {
    return selectedPlanet.value !== null || selectedCommodity.value !== null || maxInvestment.value !== null
})

// Función genérica para enfocar el buscador interno del Select de PrimeVue
async function focusSelectFilter(componentRef) {
    await nextTick()
    setTimeout(() => {
        const el = componentRef?.$el
        if (el) {
            const input = el.querySelector('.p-select-filter, .p-dropdown-filter, input')
            if (input) input.focus()
        }
    }, 50)
}

// --- LIFECYCLE ---
onMounted(async () => {
    fetchDataExtract()
    await Promise.all([fetchPlanets(), fetchCommodities()])
})

// --- API CALLS ---
async function fetchPlanets() {
    try {
        const res = await fetch(API_PLANETS)
        const json = await res.json()
        planets.value = (json.data || []).sort((a, b) => a.name.localeCompare(b.name))
    } catch (e) {
        console.error('Error fetching planets:', e)
    }
}

async function fetchCommodities() {
    try {
        const res = await fetch(API_COMMODITIES)
        const json = await res.json()
        commodities.value = (json.data || []).sort((a, b) => a.name.localeCompare(b.name))
    } catch (e) {
        console.error('Error fetching commodities:', e)
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
        if (selectedPlanet.value) params.append('id_planet_origin', selectedPlanet.value)
        if (selectedCommodity.value) params.append('id_commodity', selectedCommodity.value)
        
        // --- NUEVO PARÁMETRO DE INVERSIÓN ---
        if (maxInvestment.value !== null && maxInvestment.value !== '') {
            params.append('investment', maxInvestment.value)
        }
        // ------------------------------------

        const res = `${API_ROUTES}?${params.toString()}`
        const response = await fetch(res)
        const json = await response.json()
        
        if (json.status === 'error') {
            throw new Error(json.message || 'Error from API')
        }
        
        routes.value = (json.data || []).sort((a, b) => b.profit - a.profit)
        
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
    maxInvestment.value = null // <--- RESETEAR AQUÍ
    routes.value = []
    hasSearched.value = false
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
.filter-input {
    width: 200px;
}
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
}

/* ── SEARCH ── */
.search-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    flex-shrink: 0;
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.filter-select {
    min-width: 240px;
}

.route-count {
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
    white-space: nowrap;
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

/* ── SCROLLABLE CONTENT AREA ── */
.content-scroll {
    flex: 1;
    min-height: 0;
    width: 100%;
    min-width: 0;
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
    border-radius: 8px;
    padding: 0.75rem;
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
    gap: 0.5rem;
    border-top: 1px solid var(--p-content-border-color);
    padding-top: 0.75rem;
}

.metric {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}

.metric.profit .metric-value {
    font-weight: 700;
}

.text-success {
    color: var(--p-teal-400, #2dd4bf);
}

.metric-label {
    font-size: 0.7rem;
    color: var(--p-text-muted-color);
    text-transform: uppercase;
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
.filter-group {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap; /* Permite adaptarse si la pantalla es muy pequeña, pero mantiene la línea si cabe */
}

.filter-select {
    flex: 1;
    min-width: 200px;
}

.filter-input {
    width: 180px; /* Ancho controlado para que no rompa la fila */
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