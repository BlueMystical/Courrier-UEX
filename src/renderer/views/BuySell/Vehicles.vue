<!-- src/renderer/views/BuySell/Vehicles.vue -->
<template>
    <div class="vehicles-container">

        <!-- Header -->
        <div class="page-header">
            <div class="header-title">
                <i class="pi pi-car"></i>
                <div>
                    <h1>Vehicle Market</h1>
                    <p class="header-sub">Purchase prices across the 'verse</p>
                </div>
            </div>

            <!-- Manufacturer filter -->
            <div class="header-controls">
                <Select v-model="selectedCompany" :options="companies" optionLabel="name" optionValue="id"
                    placeholder="All manufacturers" showClear filter filterPlaceholder="Search manufacturer..."
                    class="company-select" @change="onCompanyChange" @show="onSelectShow">
                    <template #option="{ option }">
                        <div class="company-option">
                            <span class="company-name">{{ option.name }}</span>
                            <span class="company-industry">{{ option.industry }}</span>
                        </div>
                    </template>
                </Select>

                <span class="vehicle-count" v-if="!loading">
                    {{ filteredVehicles.length }} vehicle{{ filteredVehicles.length !== 1 ? 's' : '' }}
                </span>
            </div>
        </div>

        <!-- Search bar -->
        <div class="search-bar">
            <IconField>
                <InputIcon class="pi pi-search" />
                <InputText v-model="searchQuery" placeholder="Search vehicles..." class="search-input" />
            </IconField>

            <!-- Tag filters -->
            <div class="tag-filters">
                <Button v-for="tag in availableTags" :key="tag.key" :label="tag.label" :icon="tag.icon"
                    :severity="activeTag === tag.key ? 'primary' : 'secondary'" :outlined="activeTag !== tag.key"
                    size="small" @click="toggleTag(tag.key)" />
            </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="loading-state">
            <ProgressSpinner />
            <p>Loading vehicles...</p>
        </div>

        <!-- Error -->
        <Message v-else-if="error" severity="error" class="error-msg">{{ error }}</Message>

        <!-- Vehicle grid -->
        <div v-else-if="filteredVehicles.length > 0" class="vehicles-grid">
            <div v-for="vehicle in filteredVehicles" :key="vehicle.id" class="vehicle-card"
                :class="{ 'selected': selectedVehicle?.id === vehicle.id }" @click="selectVehicle(vehicle)">
                <!-- Vehicle image -->
                <div class="vehicle-image-wrapper">
                    <img :src="vehicle.url_photo" :alt="vehicle.name_full" class="vehicle-image"
                        @error="onImageError($event)" />
                    <div class="vehicle-badges">
                        <Tag v-if="vehicle.is_starter" value="Starter" severity="success" class="badge" />
                        <Tag v-if="vehicle.is_concept" value="Concept" severity="warn" class="badge" />
                        <Tag v-if="vehicle.is_military" value="Military" severity="danger" class="badge" />
                    </div>
                    <div class="vehicle-pad">{{ vehicle.pad_type }}</div>
                </div>

                <!-- Vehicle info -->
                <div class="vehicle-info">
                    <div class="vehicle-header">
                        <span class="vehicle-manufacturer">{{ vehicle.company_name }}</span>
                        <span class="vehicle-version">{{ vehicle.game_version }}</span>
                    </div>
                    <h3 class="vehicle-name">{{ vehicle.name_full }}</h3>

                    <!-- Specs row -->
                    <div class="vehicle-specs">
                        <div class="spec" v-if="vehicle.crew">
                            <i class="pi pi-users"></i>
                            <span>{{ vehicle.crew }}</span>
                        </div>
                        <div class="spec" v-if="vehicle.scu">
                            <i class="pi pi-box"></i>
                            <span>{{ vehicle.scu }} SCU</span>
                        </div>
                        <div class="spec">
                            <i class="pi pi-arrows-alt"></i>
                            <span>{{ vehicle.length }}m</span>
                        </div>
                    </div>

                    <!-- Role tags -->
                    <div class="role-tags">
                        <span v-if="vehicle.is_cargo" class="role-tag">Cargo</span>
                        <span v-if="vehicle.is_mining" class="role-tag">Mining</span>
                        <span v-if="vehicle.is_exploration" class="role-tag">Exploration</span>
                        <span v-if="vehicle.is_medical" class="role-tag">Medical</span>
                        <span v-if="vehicle.is_salvage" class="role-tag">Salvage</span>
                        <span v-if="vehicle.is_racing" class="role-tag">Racing</span>
                        <span v-if="vehicle.is_refuel" class="role-tag">Refuel</span>
                        <span v-if="vehicle.is_repair" class="role-tag">Repair</span>
                        <span v-if="vehicle.is_passenger" class="role-tag">Passenger</span>
                        <span v-if="vehicle.is_ground_vehicle" class="role-tag">Ground</span>
                    </div>

                    <!-- Price preview -->
                    <div class="price-preview" v-if="vehicle._priceMin">
                        <i class="pi pi-tag"></i>
                        <span>From <strong>{{ formatAUEC(vehicle._priceMin) }}</strong> aUEC</span>
                    </div>
                    <div class="price-preview no-price" v-else>
                        <i class="pi pi-question-circle"></i>
                        <span>No price data</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else class="empty-state">
            <i class="pi pi-car"></i>
            <p>No vehicles found</p>
            <Button label="Clear filters" icon="pi pi-times" text @click="clearFilters" />
        </div>

        <!-- Price detail drawer / side panel -->
        <Drawer v-model:visible="showPricePanel" position="right" :style="{ width: '480px' }" :modal="false">
            <template #header>
                <div class="drawer-header">
                    <img :src="selectedVehicle?.url_photo" class="drawer-thumb" @error="onImageError($event)" />
                    <div>
                        <div class="drawer-manufacturer">{{ selectedVehicle?.company_name }}</div>
                        <h2 class="drawer-title">{{ selectedVehicle?.name_full }}</h2>
                    </div>
                </div>
            </template>

            <!-- Vehicle details -->
            <div class="drawer-content" v-if="selectedVehicle">

                <!-- Specs grid -->
                <div class="detail-specs">
                    <div class="detail-spec">
                        <span class="spec-label">Crew</span>
                        <span class="spec-value">{{ selectedVehicle.crew || '—' }}</span>
                    </div>
                    <div class="detail-spec">
                        <span class="spec-label">Cargo</span>
                        <span class="spec-value">{{ selectedVehicle.scu ? selectedVehicle.scu + ' SCU' : '—' }}</span>
                    </div>
                    <div class="detail-spec">
                        <span class="spec-label">Length</span>
                        <span class="spec-value">{{ selectedVehicle.length }}m</span>
                    </div>
                    <div class="detail-spec">
                        <span class="spec-label">Width</span>
                        <span class="spec-value">{{ selectedVehicle.width }}m</span>
                    </div>
                    <div class="detail-spec">
                        <span class="spec-label">Height</span>
                        <span class="spec-value">{{ selectedVehicle.height }}m</span>
                    </div>
                    <div class="detail-spec">
                        <span class="spec-label">Pad size</span>
                        <span class="spec-value">{{ selectedVehicle.pad_type || '—' }}</span>
                    </div>
                    <div class="detail-spec">
                        <span class="spec-label">Version</span>
                        <span class="spec-value">{{ selectedVehicle.game_version }}</span>
                    </div>
                    <div class="detail-spec">
                        <span class="spec-label">Quantum</span>
                        <span class="spec-value">{{ selectedVehicle.is_quantum_capable ? '✓ Yes' : '✗ No' }}</span>
                    </div>
                </div>

                <Divider />

                <!-- Purchase prices -->
                <div class="prices-section">
                    <h3 class="prices-title">
                        <i class="pi pi-shopping-cart"></i>
                        Purchase Locations
                    </h3>

                    <div v-if="loadingPrices" class="prices-loading">
                        <ProgressSpinner style="width:32px;height:32px" />
                        <span>Loading prices...</span>
                    </div>

                    <div v-else-if="prices.length === 0" class="no-prices">
                        <i class="pi pi-info-circle"></i>
                        <span>No purchase locations found for this vehicle</span>
                    </div>

                    <div v-else>
                        <!-- Best price highlight -->
                        <div class="best-price-card" v-if="bestPrice">
                            <div class="best-label">
                                <i class="pi pi-star-fill"></i>
                                Best price
                            </div>
                            <div class="best-location">{{ bestPrice.terminal_name }}</div>
                            <div class="best-system">{{ bestPrice.star_system_name }} · {{ bestPrice.planet_name }}
                            </div>
                            <div class="best-amount">{{ formatAUEC(bestPrice.price_buy) }} <span>aUEC</span></div>
                        </div>

                        <!-- All locations -->
                        <div class="price-list">
                            <div v-for="price in prices" :key="price.id" class="price-row"
                                :class="{ 'is-best': price.id === bestPrice?.id }">
                                <div class="price-location">
                                    <span class="terminal-name">{{ price.terminal_name }}</span>
                                    <span class="terminal-location">
                                        {{ price.star_system_name }}
                                        <template v-if="price.planet_name"> · {{ price.planet_name }}</template>
                                        <template v-if="price.city_name"> · {{ price.city_name }}</template>
                                    </span>
                                </div>
                                <div class="price-amounts">
                                    <span class="price-current">{{ formatAUEC(price.price_buy) }}</span>
                                    <span class="price-unit">aUEC</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Rental prices -->
                <Divider />
                <div class="prices-section">
                    <h3 class="prices-title">
                        <i class="pi pi-clock"></i>
                        Rental Locations
                    </h3>

                    <div v-if="loadingRentals" class="prices-loading">
                        <ProgressSpinner style="width:32px;height:32px" />
                        <span>Loading rentals...</span>
                    </div>

                    <div v-else-if="rentals.length === 0" class="no-prices">
                        <i class="pi pi-info-circle"></i>
                        <span>No rental locations found for this vehicle</span>
                    </div>

                    <div v-else>
                        <!-- Best rental highlight -->
                        <div class="best-price-card rental" v-if="bestRental">
                            <div class="best-label">
                                <i class="pi pi-star-fill"></i>
                                Best rental price
                            </div>
                            <div class="best-location">{{ bestRental.terminal_name }}</div>
                            <div class="best-system">
                                {{ bestRental.star_system_name }}
                                <template v-if="bestRental.planet_name"> · {{ bestRental.planet_name }}</template>
                                <template v-if="bestRental.city_name"> · {{ bestRental.city_name }}</template>
                            </div>
                            <div class="best-amount">{{ formatAUEC(bestRental.price_rent) }} <span>aUEC / day</span>
                            </div>
                        </div>

                        <!-- All rental locations -->
                        <div class="price-list">
                            <div v-for="rental in rentals" :key="rental.id" class="price-row"
                                :class="{ 'is-best': rental.id === bestRental?.id }">
                                <div class="price-location">
                                    <span class="terminal-name">{{ rental.terminal_name }}</span>
                                    <span class="terminal-location">
                                        {{ rental.star_system_name }}
                                        <template v-if="rental.planet_name"> · {{ rental.planet_name }}</template>
                                        <template v-if="rental.city_name"> · {{ rental.city_name }}</template>
                                    </span>
                                </div>
                                <div class="price-amounts">
                                    <span class="price-current">{{ formatAUEC(rental.price_rent) }}</span>
                                    <span class="price-unit">aUEC/day</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- External links -->
                <Divider />
                <div class="external-links">
                    <Button v-if="selectedVehicle.url_store" label="RSI Store" icon="pi pi-external-link" text
                        size="small" @click="openUrl(selectedVehicle.url_store)" />
                    <Button v-if="selectedVehicle.url_brochure" label="Brochure" icon="pi pi-file-pdf" text size="small"
                        @click="openUrl(selectedVehicle.url_brochure)" />
                    <Button v-if="selectedVehicle.url_video" label="Video" icon="pi pi-youtube" text size="small"
                        @click="openUrl(selectedVehicle.url_video)" />
                </div>
            </div>
        </Drawer>

    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Drawer from 'primevue/drawer'
import Divider from 'primevue/divider'
import { useNotify } from '@/components/Notificaciones/Notify'

const notify = useNotify()

const API_VEHICLES = 'https://api.uexcorp.uk/2.0/vehicles'
const API_COMPANIES = 'https://api.uexcorp.uk/2.0/companies?is_vehicle_manufacturer=1'
const API_PRICES = 'https://api.uexcorp.uk/2.0/vehicles_purchases_prices'
const API_RENTALS = 'https://api.uexcorp.uk/2.0/vehicles_rentals_prices'

// --- STATE ---
const vehicles = ref([])
const companies = ref([])
const prices = ref([])
const rentals = ref([])
const loading = ref(false)
const loadingPrices = ref(false)
const loadingRentals = ref(false)
const error = ref(null)
const selectedCompany = ref(null)
const selectedVehicle = ref(null)
const showPricePanel = ref(false)
const searchQuery = ref('')
const activeTag = ref(null)

const availableTags = [
    { key: 'is_cargo', label: 'Cargo', icon: 'pi pi-box' },
    { key: 'is_mining', label: 'Mining', icon: 'pi pi-wrench' },
    { key: 'is_exploration', label: 'Exploration', icon: 'pi pi-compass' },
    { key: 'is_military', label: 'Military', icon: 'pi pi-shield' },
    { key: 'is_medical', label: 'Medical', icon: 'pi pi-heart' },
    { key: 'is_salvage', label: 'Salvage', icon: 'pi pi-cog' },
    { key: 'is_racing', label: 'Racing', icon: 'pi pi-bolt' },
    { key: 'is_ground_vehicle', label: 'Ground', icon: 'pi pi-car' },
    { key: 'is_starter', label: 'Starter', icon: 'pi pi-star' },
]

// --- COMPUTED ---
const filteredVehicles = computed(() => {
    let list = vehicles.value

    if (searchQuery.value.trim()) {
        const q = searchQuery.value.toLowerCase()
        list = list.filter(v =>
            v.name_full.toLowerCase().includes(q) ||
            v.company_name?.toLowerCase().includes(q)
        )
    }

    if (activeTag.value) {
        list = list.filter(v => v[activeTag.value] === 1)
    }

    return list
})

const bestPrice = computed(() =>
    prices.value.length > 0
        ? prices.value.reduce((a, b) => a.price_buy < b.price_buy ? a : b)
        : null
)

const bestRental = computed(() =>
    rentals.value.length > 0
        ? rentals.value.reduce((a, b) => a.price_rent < b.price_rent ? a : b)
        : null
)

// --- LIFECYCLE ---
onMounted(async () => {
    await Promise.all([fetchCompanies(), fetchVehicles()])
})

// --- API CALLS ---
async function fetchCompanies() {
    try {
        const res = await fetch(API_COMPANIES)
        const json = await res.json()
        companies.value = (json.data || []).sort((a, b) => a.name.localeCompare(b.name))
    } catch (e) {
        console.error('Error fetching companies:', e)
    }
}

async function fetchVehicles(companyId = null) {
    loading.value = true
    error.value = null
    try {
        const url = companyId
            ? `${API_VEHICLES}?id_company=${companyId}`
            : API_VEHICLES
        const res = await fetch(url)
        const json = await res.json()

        // Pre-compute min price per vehicle (will be filled lazily or can be done in batch)
        vehicles.value = (json.data || []).map(v => ({ ...v, _priceMin: null }))
    } catch (e) {
        error.value = 'Failed to load vehicles. Please check your connection.'
        console.error(e)
    } finally {
        loading.value = false
    }
}

async function fetchPrices(vehicleId) {
    loadingPrices.value = true
    prices.value = []
    try {
        const res = await fetch(`${API_PRICES}?id_vehicle=${vehicleId}`)
        const json = await res.json()
        prices.value = (json.data || []).sort((a, b) => a.price_buy - b.price_buy)

        // Cache min price on the vehicle object for the card preview
        const v = vehicles.value.find(x => x.id === vehicleId)
        if (v && prices.value.length > 0) {
            v._priceMin = prices.value[0].price_buy
        }
    } catch (e) {
        notify.error('Failed to load prices')
        console.error(e)
    } finally {
        loadingPrices.value = false
    }
}

async function fetchRentals(vehicleId) {
    loadingRentals.value = true
    rentals.value = []
    try {
        const res = await fetch(`${API_RENTALS}?id_vehicle=${vehicleId}`)
        const json = await res.json()
        rentals.value = (json.data || []).sort((a, b) => a.price_rent - b.price_rent)
    } catch (e) {
        console.error('Failed to load rentals:', e)
    } finally {
        loadingRentals.value = false
    }
}

// --- HANDLERS ---
function onSelectShow() {
    nextTick(() => {
        const filterInput = document.querySelector('.p-select-overlay .p-select-filter')
        if (filterInput) filterInput.focus()
    })
}

function onCompanyChange() {
    fetchVehicles(selectedCompany.value || null)
}

async function selectVehicle(vehicle) {
    selectedVehicle.value = vehicle
    showPricePanel.value = true
    // Fetch both in parallel
    await Promise.all([fetchPrices(vehicle.id), fetchRentals(vehicle.id)])
}

function toggleTag(key) {
    activeTag.value = activeTag.value === key ? null : key
}

function clearFilters() {
    searchQuery.value = ''
    activeTag.value = null
    selectedCompany.value = null
    fetchVehicles()
}

function onImageError(event) {
    event.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"%3E%3Crect width="200" height="120" fill="%23222"%2F%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23555" font-size="14"%3ENo image%3C%2Ftext%3E%3C%2Fsvg%3E'
}

function openUrl(url) {
    console.log('Opening URL:', url)
    window.api?.System?.openUrlInBrowser(url)
}

function formatAUEC(value) {
    if (!value && value !== 0) return '—'
    return value.toLocaleString('en-US')
}
</script>

<style scoped>
.vehicles-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    height: 100%;
    overflow: hidden;
}

/* ── HEADER ── */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
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

.company-select {
    min-width: 220px;
}

.vehicle-count {
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
    white-space: nowrap;
}

/* ── SEARCH ── */
.search-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.search-input {
    width: 280px;
}

.tag-filters {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
}

/* ── STATES ── */
.loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    flex: 1;
    color: var(--p-text-muted-color);
}

.error-msg {
    margin: 0;
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex: 1;
    color: var(--p-text-muted-color);
}

.empty-state i {
    font-size: 3rem;
    opacity: 0.3;
}

/* ── VEHICLE GRID ── */
.vehicles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1rem;
    overflow-y: auto;
    padding-right: 0.25rem;
    flex: 1;
}

.vehicle-card {
    border: 1px solid var(--p-content-border-color);
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--p-content-background);
    display: flex;
    flex-direction: column;
}

.vehicle-card:hover {
    border-color: var(--p-primary-color);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
}

.vehicle-card.selected {
    border-color: var(--p-primary-color);
    box-shadow: 0 0 0 2px var(--p-primary-color);
}

/* Vehicle image */
.vehicle-image-wrapper {
    position: relative;
    height: 140px;
    background: var(--p-surface-800, #111);
    overflow: hidden;
}

.vehicle-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s;
}

.vehicle-card:hover .vehicle-image {
    transform: scale(1.04);
}

.vehicle-badges {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.badge {
    font-size: 0.7rem;
    padding: 0.15rem 0.4rem;
}

.vehicle-pad {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    background: rgba(0, 0, 0, 0.7);
    color: #aaa;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-family: monospace;
    letter-spacing: 0.05em;
}

/* Vehicle info */
.vehicle-info {
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 1;
}

.vehicle-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.vehicle-manufacturer {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--p-primary-color);
}

.vehicle-version {
    font-size: 0.68rem;
    color: var(--p-text-muted-color);
    font-family: monospace;
}

.vehicle-name {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    line-height: 1.2;
}

.vehicle-specs {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.spec {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: var(--p-text-muted-color);
}

.spec i {
    font-size: 0.75rem;
}

.role-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.15rem;
}

.role-tag {
    font-size: 0.68rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--p-highlight-background);
    color: var(--p-text-color);
    border: 1px solid var(--p-content-border-color);
}

.price-preview {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
    color: var(--p-text-muted-color);
    margin-top: auto;
    padding-top: 0.4rem;
    border-top: 1px solid var(--p-content-border-color);
}

.price-preview i {
    font-size: 0.8rem;
}

.price-preview strong {
    color: var(--p-primary-color);
}

.price-preview.no-price {
    color: var(--p-text-muted-color);
    opacity: 0.6;
}

/* ── DRAWER ── */
.drawer-header {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.drawer-thumb {
    width: 80px;
    height: 50px;
    object-fit: cover;
    border-radius: 6px;
    background: #111;
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
.detail-specs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 1rem;
}

.detail-spec {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
}

.spec-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--p-text-muted-color);
}

.spec-value {
    font-size: 0.9rem;
    font-weight: 500;
}

/* Prices */
.prices-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
}

.prices-loading {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--p-text-muted-color);
    font-size: 0.9rem;
}

.no-prices {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--p-text-muted-color);
    font-size: 0.9rem;
}

/* Best price */
.best-price-card {
    background: var(--p-highlight-background);
    border: 1px solid var(--p-primary-color);
    border-radius: 8px;
    padding: 0.85rem 1rem;
    margin-bottom: 0.75rem;
}

.best-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--p-primary-color);
    margin-bottom: 0.3rem;
}

.best-location {
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.3;
}

.best-system {
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
    margin-bottom: 0.4rem;
}

.best-amount {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--p-primary-color);
}

.best-amount span {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--p-text-muted-color);
}

/* Price list */
.price-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}

.price-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    border: 1px solid var(--p-content-border-color);
    gap: 0.5rem;
    transition: background 0.15s;
}

.price-row:hover {
    background: var(--p-highlight-background);
}

.price-row.is-best {
    border-color: var(--p-primary-color);
    background: var(--p-highlight-background);
}

.price-location {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    flex: 1;
    min-width: 0;
}

.terminal-name {
    font-size: 0.82rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.terminal-location {
    font-size: 0.7rem;
    color: var(--p-text-muted-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.price-amounts {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    white-space: nowrap;
}

.price-current {
    font-size: 0.9rem;
    font-weight: 600;
}

.price-unit {
    font-size: 0.7rem;
    color: var(--p-text-muted-color);
}

/* Rental best price card — teal accent instead of primary */
.best-price-card.rental {
    border-color: var(--p-teal-400, #2dd4bf);
}

.best-price-card.rental .best-label,
.best-price-card.rental .best-amount {
    color: var(--p-teal-400, #2dd4bf);
}

/* External links */
.external-links {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
}

/* Company option in dropdown */
.company-option {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
}

.company-name {
    font-size: 0.9rem;
    font-weight: 500;
}

.company-industry {
    font-size: 0.72rem;
    color: var(--p-text-muted-color);
}
</style>
