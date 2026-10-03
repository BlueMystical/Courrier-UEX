<!-- src/renderer/views/tools/ShipComponents.vue -->
<template>
  <div class="ship-components-container home-bg">

    <div class="page-header">
      <h1 class="page-title"><i class="pi pi-sitemap"></i> Ship Components Catalogue</h1>
      <p class="page-subtitle">
        Full ship catalogue with equipped Power Plant, Shields, Quantum Drive, Radar, Coolers and Weapons.
        Click a component name for details.
      </p>
    </div>

    <!-- Error banner (persists even after the toast fades) -->
    <div v-if="catalogError" class="error-banner">
      <i class="pi pi-exclamation-triangle"></i>
      <span>{{ catalogError }}</span>
      <Button label="Retry" icon="pi pi-refresh" text size="small" @click="fetchCatalog(true)" />
    </div>

    <!-- Estado de carga inicial (catálogo completo de naves) -->
    <div v-if="loadingCatalog" class="catalog-loading">
      <ProgressSpinner style="width: 48px; height: 48px" strokeWidth="4" />
      <p>Loading ship catalogue{{ catalogProgress ? ` (${catalogProgress})` : '' }}…</p>
    </div>

    <template v-else-if="!catalogError">
      <div class="toolbar">
        <FloatLabel variant="on" class="search-wrapper">
          <InputText v-model="search" inputId="ship-search" class="search-input" />
          <label for="ship-search">Search by ship, manufacturer, component, size, grade or class</label>
        </FloatLabel>

        <div class="filter-group">
          <FloatLabel variant="on" class="filter-wrapper">
            <Select v-model="sizeFilter" inputId="filter-size" :options="SIZE_OPTIONS" optionLabel="label"
              optionValue="value" showClear class="filter-select" />
            <label for="filter-size">Size</label>
          </FloatLabel>

          <FloatLabel variant="on" class="filter-wrapper">
            <Select v-model="gradeFilter" inputId="filter-grade" :options="GRADE_OPTIONS" optionLabel="label"
              optionValue="value" showClear class="filter-select" />
            <label for="filter-grade">Grade</label>
          </FloatLabel>

          <FloatLabel variant="on" class="filter-wrapper">
            <Select v-model="classFilter" inputId="filter-class" :options="CLASS_OPTIONS" optionLabel="label"
              optionValue="value" showClear class="filter-select" />
            <label for="filter-class">Class</label>
          </FloatLabel>

          <Button v-if="sizeFilter !== null || gradeFilter !== null || classFilter !== null" icon="pi pi-filter-slash"
            text rounded size="small" aria-label="Clear filters" @click="clearFilters" />
        </div>

        <FloatLabel variant="on" class="filter-wrapper columns-wrapper">
          <MultiSelect v-model="selectedExtraColumns" inputId="extra-columns" :options="EXTRA_COLUMNS"
            optionLabel="label" optionValue="key" :maxSelectedLabels="1" selectedItemsLabel="{0} columns"
            class="filter-select" />
          <label for="extra-columns">Extra columns</label>
        </FloatLabel>

        <span class="result-count">{{ filteredShips.length }} ship(s)</span>
        <Button icon="pi pi-refresh" label="Reload catalogue" outlined size="small"
          :loading="loadingCatalog || componentCacheLoading || weaponCacheLoading" @click="reloadAll" />
      </div>

      <!-- Tabla de naves con sus componentes equipados, usando DataTable de PrimeVue -->
      <DataTable :value="filteredShips" paginator :rows="100" :rowsPerPageOptions="[10, 25, 50, 100]" sortField="name"
        :sortOrder="1" scrollable scrollHeight="flex" stripedRows class="ship-table" dataKey="uuid">
        <Column field="name" header="Ship" sortable frozen style="min-width: 220px">
          <template #body="{ data }">
            <div class="ship-cell">

              <div class="ship-cell-text">
                <span class="ship-cell-name">{{ data.name }}</span>
                <span class="ship-cell-manufacturer">{{ data.manufacturer?.name }}</span>
              </div>
            </div>
          </template>
        </Column>

        <Column v-for="category in categories" :key="category.key" :header="category.label" style="min-width: 190px">
          <template #header>
            <i :class="['pi', category.icon]"></i>
          </template>
          <template #body="{ data }">
            <template v-if="getCellItems(data, category).length">
              <div v-for="(item, idx) in getCellItems(data, category)" :key="idx" class="comp-entry">
                <div class="comp-cell-text">
                  <span class="comp-cell-name-row">
                    <a v-if="item.link" href="#" class="comp-cell-name comp-name-link"
                      @click.prevent="showItemDetail(item)">{{ item.name }}</a>
                    <span v-else class="comp-cell-name">{{ item.name }}</span>
                    <span v-if="item.count > 1" class="comp-cell-count">&nbsp;×{{ item.count }}</span>
                  </span>
                  <span v-if="item.sizeGradeLine" class="comp-cell-meta">{{ item.sizeGradeLine }}</span>
                  <span v-if="item.statsLine" class="comp-cell-meta">{{ item.statsLine }}</span>
                  <span v-if="item.class" class="comp-cell-meta comp-cell-class">Class: {{ item.class }}</span>
                </div>
              </div>
            </template>
            <span v-else class="comp-none">—</span>
          </template>
        </Column>

        <!-- Columnas opcionales: se activan desde el selector "Extra columns" de la toolbar -->
        <Column v-for="col in visibleExtraColumns" :key="col.key" :field="col.field" :header="col.label" sortable
          style="min-width: 130px">
          <template #body="{ data }">
            <span class="extra-value">{{ formatExtra(data, col) }}</span>
          </template>
        </Column>
      </DataTable>
    </template>

    <!-- Drawer con el detalle del componente clickeado -->
    <Drawer v-model:visible="detailDrawerVisible" position="right" class="item-detail-drawer">
      <template #header>
        <span class="detail-drawer-title">
          <i class="pi pi-info-circle"></i>
          Component details
        </span>
      </template>

      <div v-if="detailLoading" class="detail-loading">
        <ProgressSpinner style="width: 32px; height: 32px" strokeWidth="5" />
      </div>
      <div v-else-if="detailError" class="detail-error">
        <i class="pi pi-exclamation-triangle"></i>
        <span>{{ detailError }}</span>
      </div>
      <div v-else-if="activeDetail" class="detail-content">
        <!-- Galería de imágenes -->
        <div v-if="detailImages.length" class="detail-gallery">
          <img v-for="(img, idx) in detailImages" :key="idx" :src="img" :alt="activeDetail.name" class="detail-image" />
        </div>

        <!-- Nombre y Clase Principal -->
        <div class="detail-name-row">
          <h4 class="detail-name">{{ activeDetail.name }}</h4>
          <Tag v-if="activeDetail.class" :value="activeDetail.class" :severity="classSeverity(activeDetail.class)" />
        </div>

        <!-- Fabricante -->
        <p class="detail-manufacturer">
          {{ activeDetail.manufacturer?.name }}
          <span v-if="activeDetail.manufacturer?.code">&nbsp;({{ activeDetail.manufacturer.code }})</span>
        </p>

        <!-- Badges de estado e información básica de PrimeVue -->
        <div class="detail-tags-row">
          <Tag v-if="activeDetail.grade" :value="'Grade ' + activeDetail.grade" severity="info" outlined />
          <Tag v-if="activeDetail.size != null" :value="'Size ' + activeDetail.size" severity="secondary" outlined />
          <Tag v-if="activeDetail.is_craftable" value="Craftable" severity="success" />
          <Tag v-if="activeDetail.is_lootable" value="Lootable" severity="warn" />
        </div>

        <!-- Descripción del componente -->
        <p v-if="activeDetail.description?.en_EN" class="detail-desc">
          {{ activeDetail.description.en_EN }}
        </p>

        <Divider />

        <!-- Especificaciones Principales -->
        <h5 class="detail-section-title"><i class="pi pi-sliders-h"></i> General Specifications</h5>
        <ul class="detail-specs">
          <li v-if="activeDetail.type_label"><strong>Type:</strong> {{ activeDetail.type_label }}</li>
          <li v-if="activeDetail.sub_type_label"><strong>Sub-type:</strong> {{ activeDetail.sub_type_label }}</li>
          <li v-if="activeDetail.classification_label"><strong>Classification:</strong> {{
            activeDetail.classification_label
          }}</li>
          <li v-if="activeDetail.mass != null"><strong>Mass:</strong> {{ activeDetail.mass.toLocaleString() }} kg</li>
          <li v-if="minBuyPrice(activeDetail) != null">
            <strong>Min. buy price:</strong> {{ minBuyPrice(activeDetail).toLocaleString() }} aUEC
          </li>
          <li v-if="activeDetail.base_variant?.name">
            <strong>Base Variant:</strong> {{ activeDetail.base_variant.name }}
          </li>
        </ul>

        <!-- Durabilidad y Salvamento -->
        <template v-if="activeDetail.durability">
          <Divider />
          <h5 class="detail-section-title"><i class="pi pi-shield"></i> Durability & Salvage</h5>
          <ul class="detail-specs">
            <li v-if="activeDetail.durability.health != null">
              <strong>Health Points:</strong> {{ activeDetail.durability.health.toLocaleString() }} HP
            </li>
            <li v-if="activeDetail.durability.repairable != null">
              <strong>Repairable:</strong> {{ activeDetail.durability.repairable ? 'Yes' : 'No' }}
            </li>
            <li v-if="activeDetail.durability.salvageable != null">
              <strong>Salvageable:</strong> {{ activeDetail.durability.salvageable ? 'Yes' : 'No' }}
            </li>
          </ul>

          <!-- Grid de Resistencias a Daño -->
          <div v-if="activeDetail.durability.resistance" class="resistance-section">
            <h6 class="detail-subsection-title">Damage Resistances</h6>
            <div class="res-grid">
              <div v-if="activeDetail.durability.resistance.physical != null" class="res-item">
                <span class="res-label">Physical</span>
                <span class="res-value">{{ formatResistance(activeDetail.durability.resistance.physical) }}</span>
              </div>
              <div v-if="activeDetail.durability.resistance.energy != null" class="res-item">
                <span class="res-label">Energy</span>
                <span class="res-value">{{ formatResistance(activeDetail.durability.resistance.energy) }}</span>
              </div>
              <div v-if="activeDetail.durability.resistance.thermal != null" class="res-item">
                <span class="res-label">Thermal</span>
                <span class="res-value">{{ formatResistance(activeDetail.durability.resistance.thermal) }}</span>
              </div>
              <div v-if="activeDetail.durability.resistance.distortion != null" class="res-item">
                <span class="res-label">Distortion</span>
                <span class="res-value">{{ formatResistance(activeDetail.durability.resistance.distortion) }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Dimensiones y Volumen -->
        <template v-if="activeDetail.dimension">
          <Divider />
          <h5 class="detail-section-title"><i class="pi pi-box"></i> Dimensions & Volume</h5>
          <ul class="detail-specs">
            <li v-if="getDimensionsString(activeDetail.dimension)">
              <strong>Dimensions (W×H×L):</strong> {{ getDimensionsString(activeDetail.dimension) }}
            </li>
            <li v-if="activeDetail.dimension.volume_converted != null">
              <strong>Volume:</strong> {{ activeDetail.dimension.volume_converted.toLocaleString() }} {{
                activeDetail.dimension.volume_converted_unit || 'µSCU' }}
            </li>
          </ul>
        </template>

        <!-- Temperatura y Distorsión -->
        <template v-if="activeDetail.temperature || activeDetail.distortion">
          <Divider />
          <h5 class="detail-section-title"><i class="pi pi-sun"></i> Thermal & Distortion</h5>
          <ul class="detail-specs">
            <li v-if="activeDetail.temperature?.max_temperature != null">
              <strong>Max Temperature:</strong> {{ activeDetail.temperature.max_temperature }} °C
            </li>
            <li v-if="activeDetail.temperature?.overheat_threshold != null">
              <strong>Overheat Threshold:</strong> {{ activeDetail.temperature.overheat_threshold }} °C
            </li>
            <li v-if="activeDetail.distortion?.max != null">
              <strong>Max Distortion:</strong> {{ activeDetail.distortion.max.toLocaleString() }}
            </li>
            <li v-if="activeDetail.distortion?.shutdown_time != null">
              <strong>Shutdown Time:</strong> {{ activeDetail.distortion.shutdown_time }} s
            </li>
            <li v-if="activeDetail.distortion?.decay_rate != null">
              <strong>Decay Rate:</strong> {{ activeDetail.distortion.decay_rate }} /s
            </li>
          </ul>
        </template>

        <!-- Red de Recursos y Emisiones -->
        <template v-if="activeDetail.resource_network || activeDetail.emission">
          <Divider />
          <h5 class="detail-section-title"><i class="pi pi-bolt"></i> Power & Emissions</h5>
          <ul class="detail-specs">
            <li v-if="activeDetail.resource_network?.generation?.power != null">
              <strong>Power Generation:</strong> {{ activeDetail.resource_network.generation.power }}
            </li>
            <li v-if="activeDetail.resource_network?.usage?.power?.max != null">
              <strong>Power Draw:</strong> {{ activeDetail.resource_network.usage.power.max }}
            </li>
            <li v-if="activeDetail.resource_network?.usage?.coolant?.max != null">
              <strong>Coolant Draw:</strong> {{ activeDetail.resource_network.usage.coolant.max }}
            </li>
            <li v-if="activeDetail.emission?.em_max != null">
              <strong>Max EM Emission:</strong> {{ activeDetail.emission.em_max.toLocaleString() }}
            </li>
            <li v-if="activeDetail.emission?.ir != null">
              <strong>IR Emission:</strong> {{ activeDetail.emission.ir.toLocaleString() }}
            </li>
          </ul>
        </template>

        <!-- Ubicaciones de compra utilizando DataTable de PrimeVue -->
        <template v-if="detailPurchaseLocations.length">
          <Divider />
          <h5 class="detail-section-title"><i class="pi pi-shopping-cart"></i> Buy Locations</h5>
          <DataTable :value="detailPurchaseLocations" size="small" stripedRows class="detail-price-table">
            <Column field="terminal" header="Terminal"></Column>
            <Column field="price" header="Price">
              <template #body="{ data }">
                {{ data.price.toLocaleString() }} aUEC
              </template>
            </Column>
          </DataTable>
        </template>

        <!-- Sub-puertos -->
        <template v-if="activeDetail.ports?.length">
          <Divider />
          <h5 class="detail-section-title"><i class="pi pi-sitemap"></i> Sub-ports</h5>
          <ul class="detail-subports">
            <li v-for="(p, idx) in activeDetail.ports" :key="idx">
              {{ p.name || p.type }}
              <span v-if="p.equipped_item?.name">— {{ p.equipped_item.name }}</span>
            </li>
          </ul>
        </template>

        <!-- Enlace externo a la Wiki oficial -->
        <div v-if="activeDetail.web_url" class="detail-actions">
          <Divider />
          <Button as="a" :href="activeDetail.web_url" target="_blank" rel="noopener" label="View on Star Citizen Wiki"
            icon="pi pi-external-link" outlined size="small" class="w-full" />
        </div>
      </div>
    </Drawer>


  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import FloatLabel from 'primevue/floatlabel';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Tag from 'primevue/tag';
import Drawer from 'primevue/drawer';
import { useNotify } from '@/components/Notificaciones/Notify';

const notify = useNotify();

const API_BASE = 'https://api.star-citizen.wiki/api/vehicles';
// Necesitamos 'ports' (para Power Plant / Shields / Quantum Drive / Radar /
// Coolers, filtrando por port.type) y 'components' (para Weapons, type
// 'weapons'). Esto es bastante más pesado que solo 'components' — el
// catálogo completo puede tardar más en bajar, por eso el progreso muestra
// cantidad de naves cargadas por página.
const API_QUERY = 'include=ports,components&filter[is_spaceship]=true';

const loadingCatalog = ref(true);
const catalogProgress = ref('');
const catalogError = ref('');
const ships = ref([]);
const search = ref('');
// El filtrado recorre ports+weapons de cada nave por cada tecla — con el
// catálogo completo eso puede sentirse pesado. Filtramos sobre una copia
// "debounced" del término, así la UI no se traba mientras se escribe.
const debouncedSearch = ref('');
const SEARCH_DEBOUNCE_MS = 300;
let searchDebounceTimer = null;

watch(search, (value) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    debouncedSearch.value = value;
  }, SEARCH_DEBOUNCE_MS);
});

onUnmounted(() => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
});

// Categorías mostradas como columnas. 'source' decide de dónde se leen:
// - 'port': filtra ship.ports por port.type === key (equipped_item, con link)
// - 'component': filtra ship.components por component.type === key (sin link)
const categories = [
  { key: 'PowerPlant', label: 'Power Plant', icon: 'pi-bolt', source: 'port' },
  { key: 'Shield', label: 'Shields', icon: 'pi-shield', source: 'port' },
  { key: 'QuantumDrive', label: 'Quantum Drive', icon: 'pi-compass', source: 'port' },
  { key: 'Radar', label: 'Radar', icon: 'pi-wifi', source: 'port' },
  { key: 'Cooler', label: 'Coolers', icon: 'pi-sun', source: 'port' },
  { key: 'weapons', label: 'Weapons', icon: 'pi-crosshair', source: 'component' },
];

// Filtros de la toolbar: Size / Grade / Class son independientes y se combinan
// con AND — así "Size 3" + "Class Military" trae naves con un componente que
// sea AMBAS cosas a la vez (no cualquier componente de tamaño 3 en un lado y
// cualquier componente militar en otro). Antes esto era un único CascadeSelect
// que solo dejaba elegir un atributo a la vez; con tres Select combinables se
// puede filtrar por varios atributos juntos.
const SIZE_OPTIONS = [0, 1, 2, 3, 4].map((v) => ({ label: `Size ${v}`, value: v }));
const GRADE_OPTIONS = ['A', 'B', 'C', 'D'].map((v) => ({ label: `Grade ${v}`, value: v }));
const CLASS_OPTIONS = ['Civilian', 'Military', 'Industrial', 'Stealth', 'Competition'].map((v) => ({
  label: v,
  value: v,
}));

const sizeFilter = ref(null);
const gradeFilter = ref(null);
const classFilter = ref(null);

function clearFilters() {
  sizeFilter.value = null;
  gradeFilter.value = null;
  classFilter.value = null;
}

// ── Columnas opcionales ─────────────────────────────────────────────────
// Se eligen desde el MultiSelect "Extra columns" de la toolbar y la selección
// queda guardada en localStorage. 'field' es la ruta (con puntos) dentro del
// registro de la nave: la usan tanto el sort de PrimeVue como formatExtra().
// Ojo: la deflexión vive en armor.deflection.*, no en la raíz de la nave.
const EXTRA_COLUMNS_KEY = 'shipComponents:extraColumns:v1';
const EXTRA_COLUMNS = [
  { key: 'cargo', label: 'Cargo (SCU)', field: 'cargo_capacity' },
  { key: 'fuel', label: 'Fuel capacity', field: 'fuel.capacity' },
  { key: 'armorHp', label: 'Armor HP', field: 'armor.health' },
  { key: 'deflPhysical', label: 'Deflection (Physical)', field: 'armor.deflection.physical' },
  { key: 'deflEnergy', label: 'Deflection (Energy)', field: 'armor.deflection.energy' },
];

function loadExtraColumns() {
  try {
    const raw = JSON.parse(localStorage.getItem(EXTRA_COLUMNS_KEY) || '[]');
    const valid = new Set(EXTRA_COLUMNS.map((c) => c.key));
    return Array.isArray(raw) ? raw.filter((k) => valid.has(k)) : [];
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return [];
  }
}

const selectedExtraColumns = ref(loadExtraColumns());

watch(selectedExtraColumns, (keys) => {
  try {
    localStorage.setItem(EXTRA_COLUMNS_KEY, JSON.stringify(keys));
  } catch (e) {
    console.error('Unexpected Error: ', e);
  }
});

// Se mantiene el orden de EXTRA_COLUMNS, no el orden en que se fueron tildando.
const visibleExtraColumns = computed(() =>
  EXTRA_COLUMNS.filter((c) => selectedExtraColumns.value.includes(c.key))
);

function formatExtra(ship, col) {
  try {
    const value = col.field.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), ship);
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return typeof value === 'number'
      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : String(value);
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return '—';
  }
}

// grade en ship.ports[].equipped_item viene como número (1-4); lo mostramos
// como letra (A-D). El endpoint de detalle del item (/items/{uuid}) en
// cambio ya devuelve el grade como letra directamente.
const GRADE_LETTERS = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };

function gradeLabel(grade) {
  try {
    if (grade === null || grade === undefined || grade === '') return null;
    if (typeof grade === 'string' && /^[A-D]$/i.test(grade)) return grade.toUpperCase();
    return GRADE_LETTERS[grade] || String(grade);
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return null;
  }
}

// Formatea los coeficientes de resistencia a porcentajes 
const formatResistance = (val) => {
  if (val == null) return 'N/A'
  return `${(val * 100).toFixed(0)}%`
};

// Extrae y formatea el ancho, alto y largo desde dimensions o true\_dimension 
const getDimensionsString = (dim) => {
  if (!dim) return null
  const d = dim.dimensions || dim.true_dimension
  if (!d) return null
  return `${d.width}m × ${d.height}m × ${d.length}m`
};

// "Size: 3, Grade: A" — primera línea secundaria bajo el nombre del componente.
// La clase (Civilian/Military/etc., o lo que termine viviendo en "class") se
// muestra aparte, en su propia línea, como "Class: ...".
function buildSizeGradeLine(item) {
  try {
    const parts = [];
    if (item.size !== null && item.size !== undefined && item.size !== '') {
      parts.push(`Size: ${item.size}`);
    }
    const g = gradeLabel(item.grade);
    if (g) parts.push(`Grade: ${g}`);
    return parts.join(', ');
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return '';
  }
}

// ── Cache de componentes (Shield / Cooler / PowerPlant / QuantumDrive) ──
// Sirve para dos cosas:
//   1) completar la propiedad "class" de cada componente equipado en las naves
//   2) poblar el Drawer de detalle al instante, sin volver a pegarle a la API
// Mismo criterio de expiración (24h) que itemCacheService.js usa para el
// cache de items del proceso main, pero acá no hace falta la vuelta por
// IPC + disco: esta API (star-citizen.wiki) ya se puede pedir directo desde
// el renderer via window.api.Net.fetchJson (igual que el resto de esta
// pantalla), así que persistimos con localStorage nomás.
const COMPONENT_CACHE_KEY = 'shipComponents:componentCache:v1';
const COMPONENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const COMPONENT_CACHE_URL =
  'https://api.star-citizen.wiki/api/vehicle-items?filter[type]=Shield,Cooler,PowerPlant,QuantumDrive&sort=type,-size,name';

const componentCache = ref([]); // recursos completos de item, tal cual los devuelve la API
const componentCacheLoading = ref(false);
const componentCacheError = ref('');

// Índices por uuid / class_name / name para matchear rápido contra los
// componentes equipados en cada nave. uuid es el más confiable; los otros
// dos son fallback por si algún equipped_item viniera con uuid distinto.
const componentIndex = computed(() => {
  const byUuid = new Map();
  const byClassName = new Map();
  const byName = new Map();
  for (const it of componentCache.value) {
    if (it.uuid) byUuid.set(it.uuid, it);
    if (it.class_name) byClassName.set(it.class_name, it);
    if (it.name) byName.set(it.name.toLowerCase(), it);
  }
  return { byUuid, byClassName, byName };
});

/** Busca el recurso completo cacheado para un item de nave (equipped_item o weapon). */
function lookupCachedComponent(item) {
  try {
    if (!item) return null;
    const idx = componentIndex.value;
    return (
      (item.uuid && idx.byUuid.get(item.uuid)) ||
      (item.class_name && idx.byClassName.get(item.class_name)) ||
      (item.name && idx.byName.get(item.name.toLowerCase())) ||
      null
    );
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return null;
  }
}

function loadComponentCacheFromStorage() {
  try {
    const raw = localStorage.getItem(COMPONENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !Array.isArray(parsed?.items)) return null;
    return parsed;
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return null;
  }
}

function saveComponentCacheToStorage(items) {
  try {
    localStorage.setItem(COMPONENT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items }));
  } catch (e) {
    console.error('Unexpected Error: ', e);
  }
}

function isComponentCacheFresh(savedAt) {
  return !!savedAt && Date.now() - savedAt < COMPONENT_CACHE_TTL_MS;
}

async function fetchComponentCache(force = false) {
  try {
    if (!force) {
      const cached = loadComponentCacheFromStorage();
      if (cached && isComponentCacheFresh(cached.savedAt)) {
        componentCache.value = cached.items;
        console.log(`[ShipComponents] Component cache loaded from storage: ${cached.items.length} items`);
        return;
      }
    }

    componentCacheLoading.value = true;
    componentCacheError.value = '';

    const all = [];
    let url = COMPONENT_CACHE_URL;
    const visitedUrls = new Set();
    let page = 1;
    const maxPages = 40;

    while (url && page <= maxPages) {
      if (visitedUrls.has(url)) {
        console.error('Unexpected Error: ', new Error(`Pagination loop detected at ${url}`));
        break;
      }
      visitedUrls.add(url);

      const json = await fetchJson(url);
      const pageData = Array.isArray(json?.data) ? json.data : [];
      all.push(...pageData);

      url = json?.links?.next || null;
      page += 1;
    }

    componentCache.value = all;
    saveComponentCacheToStorage(all);
    console.log(`[ShipComponents] Component cache fetched: ${all.length} items`);
  } catch (e) {
    console.error('Unexpected Error: ', e);
    componentCacheError.value = 'Could not load the component cache — Class enrichment will be limited.';
    notify.error(componentCacheError.value, 'Ship Components');
  } finally {
    componentCacheLoading.value = false;
  }
}

// ── Cache de armas (vehicle-weapons) ────────────────────────────────────
// Las armas de cada nave (ship.weaponry.fixed_weapons) traen nombre + dps/alpha
// pero NO size, grade, class ni link. Eso sale de /vehicle-weapons. En vez de
// pedir arma por arma con filter[name] + filter[size] (una request por arma
// distinta), bajamos la lista completa UNA vez, la guardamos "slim" (cada
// registro completo pesa varios KB) y matcheamos por nombre. Mismo TTL de 24h
// y mismo criterio stale-while-revalidate: se muestra lo guardado al instante
// y, si venció, se refresca por detrás.
const WEAPON_CACHE_KEY = 'shipComponents:weaponCache:v1';
const WEAPON_CACHE_URL = 'https://api.star-citizen.wiki/api/vehicle-weapons';

const weaponCache = ref([]); // registros slim, ver slimWeapon()
const weaponCacheLoading = ref(false);

function loadStoredCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !Array.isArray(parsed?.items)) return null;
    return parsed;
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return null;
  }
}

function saveStoredCache(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), items }));
  } catch (e) {
    console.error('Unexpected Error: ', e);
  }
}

/** Solo lo que usa la tabla; el detalle completo se pide por 'link' al abrir el Drawer. */
function slimWeapon(w) {
  return {
    uuid: w.uuid,
    name: w.name,
    class_name: w.class_name || null,
    size: w.size ?? null,
    grade: w.grade ?? null,
    class: w.class ?? null,
    link: w.link || null,
    // alpha sirve para desempatar si dos armas comparten nombre (ver lookupWeapon)
    alpha: w.vehicle_weapon?.damage?.alpha_total ?? null,
  };
}

/** Sigue links.next hasta agotar la paginación (con guarda contra loops). */
async function fetchAllPages(startUrl, maxPages = 40) {
  const all = [];
  const visitedUrls = new Set();
  let url = startUrl;
  let page = 1;

  while (url && page <= maxPages) {
    if (visitedUrls.has(url)) {
      console.error('Unexpected Error: ', new Error(`Pagination loop detected at ${url}`));
      break;
    }
    visitedUrls.add(url);

    const json = await fetchJson(url);
    if (Array.isArray(json?.data)) all.push(...json.data);

    url = json?.links?.next || null;
    page += 1;
  }
  return all;
}

async function fetchWeaponCache(force = false) {
  try {
    const cached = loadStoredCache(WEAPON_CACHE_KEY);
    if (cached) weaponCache.value = cached.items; // stale-while-revalidate
    if (cached && !force && isComponentCacheFresh(cached.savedAt)) {
      console.log(`[ShipComponents] Weapon cache loaded from storage: ${cached.items.length} items`);
      return;
    }

    weaponCacheLoading.value = true;
    const slim = (await fetchAllPages(WEAPON_CACHE_URL)).map(slimWeapon);
    weaponCache.value = slim;
    saveStoredCache(WEAPON_CACHE_KEY, slim);
    console.log(`[ShipComponents] Weapon cache fetched: ${slim.length} items`);
  } catch (e) {
    console.error('Unexpected Error: ', e);
    notify.error('Could not load the weapons list — weapons will show name, DPS and alpha only.', 'Ship Components');
  } finally {
    weaponCacheLoading.value = false;
  }
}

// nombre (minúsculas) -> [armas]. Es una lista porque el nombre no es único
// (el slug de la muestra es "revenant-gatling-2").
const weaponIndex = computed(() => {
  const byName = new Map();
  for (const w of weaponCache.value) {
    const key = (w.name || '').toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(w);
  }
  return byName;
});

/** Busca el arma por nombre; si hay varias con el mismo nombre, desempata por alpha. */
function lookupWeapon(name, alpha) {
  try {
    const list = weaponIndex.value.get((name || '').toLowerCase());
    if (!list?.length) return null;
    if (list.length === 1 || alpha == null) return list[0];
    return list.find((w) => w.alpha != null && Math.abs(w.alpha - alpha) < 0.1) || list[0];
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return null;
  }
}

/** "DPS 1,266 • Alpha 63.3" a partir del arma tal como viene en ship.weaponry. */
function weaponStatsLine(w) {
  const fmt = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const parts = [];
  if (typeof w?.dps === 'number') parts.push(`DPS ${fmt(w.dps)}`);
  if (typeof w?.alpha === 'number') parts.push(`Alpha ${fmt(w.alpha)}`);
  return parts.join(' • ');
}

function reloadAll() {
  fetchCatalog(true);
  fetchComponentCache(true);
  fetchWeaponCache(true);
}

/**
 * Fetch JSON vía IPC (window.api.Net.fetchJson → net:fetchJson en main),
 * mismo mecanismo que usa el proyecto para esquivar CORS/CSP con dominios
 * externos (ver avatar:fetchAsBase64 en ipcHandlers.js). Incluye un timeout
 * del lado del RENDERER (independiente del timeout de main): si el IPC
 * nunca contesta, esto corta solo en vez de quedar colgado para siempre.
 */
async function fetchJson(url, timeoutMs = 45000) {
  try {
    if (!window.api?.Net?.fetchJson) {
      throw new Error(
        'window.api.Net.fetchJson is not available — check preload.js wiring (and make sure the Electron app was fully restarted after editing it).'
      );
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Renderer-side timeout waiting for ${url}`)), timeoutMs)
    );

    const result = await Promise.race([window.api.Net.fetchJson(url), timeoutPromise]);

    if (!result?.success) {
      throw new Error(result?.error || 'Fetch failed');
    }
    return result.data;
  } catch (e) {
    console.error('Unexpected Error: ', e);
    throw e;
  }
}

async function fetchCatalog(force = false) {
  try {
    if (loadingCatalog.value && !force) return;
    loadingCatalog.value = true;
    catalogProgress.value = '';
    catalogError.value = '';

    const all = [];
    let url = `${API_BASE}?${API_QUERY}`;
    const visitedUrls = new Set(); // guarda contra loops de paginación mal formados
    let page = 1;
    const maxPages = 80; // el include de ports puede dar páginas más chicas -> más páginas

    while (url && page <= maxPages) {
      if (visitedUrls.has(url)) {
        console.error('Unexpected Error: ', new Error(`Pagination loop detected at ${url}`));
        break;
      }
      visitedUrls.add(url);
      catalogProgress.value = `page ${page} • ${all.length} ships loaded so far`;

      let json;
      try {
        json = await fetchJson(url);
      } catch (pageErr) {
        console.error('Unexpected Error: ', pageErr);
        throw pageErr; // una página fallida invalida todo el catálogo
      }

      const pageData = Array.isArray(json?.data) ? json.data : [];
      console.log(`[ShipComponents] Page ${page}: ${pageData.length} ships`);
      all.push(...pageData);

      // Soporta el esquema de paginación estilo Laravel (links.next).
      url = json?.links?.next || null;
      page += 1;
    }

    // Dedup por uuid, por las dudas.
    const byUuid = new Map();
    for (const ship of all) {
      if (ship?.uuid) byUuid.set(ship.uuid, ship);
    }
    ships.value = Array.from(byUuid.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    console.log(`[ShipComponents] Catalogue loaded: ${ships.value.length} ships total`);

    if (ships.value.length === 0) {
      notify.info('The ship catalogue came back empty.', 'Ship Components');
    }
  } catch (err) {
    console.error('Unexpected Error: ', err);
    catalogError.value = `Could not load the ship catalogue from star-citizen.wiki: ${err.message}`;
    notify.error(catalogError.value, 'Error');
  } finally {
    loadingCatalog.value = false;
    catalogProgress.value = '';
  }
}

const filteredShips = computed(() => {
  try {
    const term = debouncedSearch.value.trim().toLowerCase();
    return ships.value.filter((s) => {
      if (term && !shipMatchesTerm(s, term)) return false;
      if (!shipMatchesFilters(s)) return false;
      return true;
    });
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return ships.value;
  }
});

/** ¿La nave tiene, en cualquier categoría, un componente que cumpla TODOS los filtros activos a la vez? */
function shipMatchesFilters(ship) {
  try {
    if (sizeFilter.value === null && gradeFilter.value === null && classFilter.value === null) {
      return true; // sin filtros activos, no descarta nada
    }
    return categories.some((category) =>
      getCellItems(ship, category).some((item) => itemMatchesFilters(item))
    );
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return false;
  }
}

function itemMatchesFilters(item) {
  if (sizeFilter.value !== null && item.size !== sizeFilter.value) return false;
  if (gradeFilter.value !== null && item.gradeLabel !== gradeFilter.value) return false;
  if (classFilter.value !== null && item.class !== classFilter.value) return false;
  return true;
}

/** Nombre/fabricante de la nave, o Size/Grade/Class de cualquiera de sus componentes equipados. */
function shipMatchesTerm(ship, term) {
  try {
    if (ship.name?.toLowerCase().includes(term)) return true;
    if (ship.manufacturer?.name?.toLowerCase().includes(term)) return true;
    return categories.some((category) =>
      getCellItems(ship, category).some((item) => itemMatchesTerm(item, term))
    );
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return false;
  }
}

function itemMatchesTerm(item, term) {
  if (item.name && item.name.toLowerCase().includes(term)) return true;
  if (item.size !== null && item.size !== undefined && String(item.size).toLowerCase().includes(term)) {
    return true;
  }
  if (item.gradeLabel && item.gradeLabel.toLowerCase().includes(term)) return true;
  if (item.class && String(item.class).toLowerCase().includes(term)) return true;
  return false;
}

/** Agrupa items repetidos (mismo componente en varios hardpoints) sumando 'count'. */
function aggregate(items, keyFn, mapFn) {
  try {
    const map = new Map();
    for (const it of items) {
      const key = keyFn(it);
      if (!map.has(key)) {
        map.set(key, { ...mapFn(it), count: 0 });
      }
      map.get(key).count += 1;
    }
    return Array.from(map.values());
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return [];
  }
}

/** Power Plant / Shields / Quantum Drive / Radar / Coolers → desde ship.ports, por port.type. */
function portsFor(ship, portType) {
  try {
    const items = (ship?.ports || []).filter((p) => p.type === portType && p.equipped_item);
    return aggregate(
      items,
      (p) => p.equipped_item.uuid || p.equipped_item.name,
      (p) => {
        const it = p.equipped_item;
        return {
          name: it.name,
          size: it.size ?? null,
          gradeLabel: gradeLabel(it.grade),
          sizeGradeLine: buildSizeGradeLine(it),
          class: lookupCachedComponent(it)?.class ?? null,
          uuid: it.uuid,
          class_name: it.class_name || null,
          link: it.link || null,
        };
      }
    );
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return [];
  }
}

/**
 * Weapons → las armas REALES de la nave, desde ship.weaponry.fixed_weapons.weapons
 * (nombre + dps/alpha por arma), enriquecidas con size / grade / class / link
 * desde el cache de vehicle-weapons. Si la nave no trae fixed_weapons (ej. solo
 * torretas), cae a los hardpoints de ship.components, como antes.
 */
function weaponsFor(ship) {
  try {
    const fixed = ship?.weaponry?.fixed_weapons?.weapons || [];
    if (!fixed.length) return weaponMountsFor(ship);

    return aggregate(
      fixed,
      (w) => w.name,
      (w) => {
        const full = lookupWeapon(w.name, w.alpha);
        const info = { size: full?.size ?? null, grade: full?.grade ?? null };
        return {
          name: w.name,
          size: info.size,
          gradeLabel: gradeLabel(info.grade),
          sizeGradeLine: buildSizeGradeLine(info),
          statsLine: weaponStatsLine(w),
          class: full?.class ?? null,
          uuid: full?.uuid ?? null,
          class_name: full?.class_name ?? null,
          link: full?.link ?? null,
        };
      }
    );
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return [];
  }
}

/** Fallback: hardpoints de armas desde ship.components (type 'weapons'). Sin link por ítem. */
function weaponMountsFor(ship) {
  try {
    const items = (ship?.components || []).filter((c) => c.type === 'weapons');
    return items.map((c) => {
      // components[].size viene como string ("4"); el filtro de Size compara contra números.
      const size = c.size === '' || c.size == null || Number.isNaN(Number(c.size)) ? null : Number(c.size);
      return {
        name: c.name,
        size,
        gradeLabel: gradeLabel(c.grade),
        sizeGradeLine: buildSizeGradeLine(c),
        class: lookupCachedComponent(c)?.class ?? null,
        class_name: c.class_name || null,
        count: c.mounts || 1,
        link: null,
      };
    });
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return [];
  }
}

/** Despacha a portsFor/weaponsFor según category.source — usado desde el template. */
function getCellItems(ship, category) {
  try {
    if (category.source === 'port') {
      return portsFor(ship, category.key);
    }
    return weaponsFor(ship);
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return [];
  }
}

// ── Drawer de detalle de componente ─────────────────────────────────────
const detailDrawerVisible = ref(false);
const activeDetail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
const detailCache = new Map(); // uuid -> item detail, en memoria, dura la sesión de la vista

async function showItemDetail(item) {
  try {
    if (!item) return;

    // Si el componente está en el cache de Shield/Cooler/PowerPlant/QuantumDrive,
    // ya tenemos el recurso completo (mismo shape que /items/{uuid}) — sin red,
    // sin loading.
    const cached = lookupCachedComponent(item);
    if (!cached && !item.link) return; // ej. weapons sin link y sin match en el cache

    // Abrir el drawer recién ahora que sabemos que hay algo para mostrar
    // (antes del await, si hace falta red, para ver el estado de carga).
    detailDrawerVisible.value = true;
    detailError.value = '';

    if (cached) {
      activeDetail.value = cached;
      detailLoading.value = false;
      if (item.uuid) detailCache.set(item.uuid, cached);
      return;
    }

    if (item.uuid && detailCache.has(item.uuid)) {
      activeDetail.value = detailCache.get(item.uuid);
      detailLoading.value = false;
      return;
    }

    activeDetail.value = null;
    detailLoading.value = true;

    const json = await fetchJson(item.link, 20000);
    const data = json?.data || null;

    if (item.uuid) detailCache.set(item.uuid, data);
    activeDetail.value = data;
  } catch (e) {
    console.error('Unexpected Error: ', e);
    detailError.value = 'Could not load component details.';
  } finally {
    detailLoading.value = false;
  }
}

// Civilian / Military / Industrial / Competition / Stealth — para colorear el Tag.
function classSeverity(itemClass) {
  try {
    switch ((itemClass || '').toLowerCase()) {
      case 'military':
        return 'danger';
      case 'civilian':
        return 'success';
      case 'industrial':
        return 'warn';
      case 'competition':
        return 'info';
      case 'stealth':
        return 'contrast';
      default:
        return 'secondary';
    }
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return 'secondary';
  }
}

function minBuyPrice(detail) {
  try {
    const prices = detail?.uex_prices?.purchase || [];
    const values = prices
      .map((p) => p.price_buy)
      .filter((v) => typeof v === 'number' && v > 0);
    if (!values.length) return null;
    return Math.min(...values);
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return null;
  }
}

// Todas las imágenes disponibles del componente (antes solo se mostraba la primera).
const detailImages = computed(() => {
  try {
    const imgs = activeDetail.value?.images || [];
    return imgs.map((img) => img.thumbnail_url || img.source_url).filter(Boolean);
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return [];
  }
});

// Top 5 terminales más baratas donde comprar el componente.
const detailPurchaseLocations = computed(() => {
  try {
    const prices = activeDetail.value?.uex_prices?.purchase || [];
    return prices
      .filter((p) => typeof p.price_buy === 'number' && p.price_buy > 0)
      .map((p) => ({
        terminal: p.terminal?.name || p.terminal_name || 'Unknown terminal',
        price: p.price_buy,
      }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 5);
  } catch (e) {
    console.error('Unexpected Error: ', e);
    return [];
  }
});

onMounted(() => {
  try {
    fetchComponentCache();
    fetchWeaponCache();
    fetchCatalog();
  } catch (e) {
    console.error('Unexpected Error: ', e);
  }
});
</script>

<style scoped>
.ship-components-container {
  padding: 1.5rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0;
}

.page-title i {
  color: var(--p-primary-color);
}

.page-subtitle {
  color: var(--p-text-muted-color);
  margin: 0.35rem 0 0 0;
  font-size: 0.9rem;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--p-red-400, #f87171);
  background: var(--p-red-50, rgba(248, 113, 113, 0.08));
  color: var(--p-red-600, #dc2626);
  border-radius: 8px;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.error-banner i {
  font-size: 1.1rem;
}

.error-banner span {
  flex: 1;
}

.catalog-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem 0;
  color: var(--p-text-muted-color);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.search-wrapper {
  flex: 1;
  min-width: 240px;
}

.search-input {
  width: 100%;
}

.result-count {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-wrapper {
  min-width: 140px;
}

.filter-select {
  width: 100%;
}

.comp-cell-class {
  font-style: italic;
}

/* ── Tabla ───────────────────────────────────────────── */
.ship-table {
  flex: 1;
  min-height: 0;
}

.ship-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.ship-cell-image {
  width: 44px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.ship-cell-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--p-content-hover-background);
  color: var(--p-text-muted-color);
  font-size: 1rem;
}

.ship-cell-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ship-cell-name {
  font-weight: 600;
  color: var(--p-text-color);
  white-space: nowrap;
}

.ship-cell-manufacturer {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.comp-entry {
  margin-bottom: 0.5rem;
}

.comp-entry:last-child {
  margin-bottom: 0;
}

.comp-cell-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.comp-cell-name-row {
  display: flex;
  align-items: baseline;
}

.comp-cell-name {
  font-weight: 600;
  color: var(--p-text-color);
  font-size: 0.85rem;
  white-space: nowrap;
}

.comp-name-link {
  cursor: pointer;
  text-decoration: none;
  color: var(--p-primary-color);
}

.comp-name-link:hover {
  text-decoration: underline;
}

.comp-cell-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.comp-cell-meta {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.comp-none {
  color: var(--p-text-muted-color);
  opacity: 0.6;
}

.columns-wrapper {
  min-width: 180px;
}

.extra-value {
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

/* ── Panel de detalle (Drawer) ──────────────────────── */
.item-detail-drawer {
  width: 380px !important;
  max-width: 90vw;
}

.detail-drawer-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.detail-loading,
.detail-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 0.5rem;
  color: var(--p-text-muted-color);
}

.detail-error {
  color: var(--p-red-600, #dc2626);
}

.detail-gallery {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  margin-bottom: 0.75rem;
}

.detail-image {
  width: 100%;
  min-width: 200px;
  height: 140px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.detail-gallery .detail-image {
  width: 200px;
}

.detail-gallery:has(.detail-image:only-child) .detail-image {
  width: 100%;
  min-width: 0;
}

.detail-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.1rem;
}

.detail-name {
  margin: 0;
  font-size: 1.1rem;
  color: var(--p-text-color);
}

.detail-manufacturer {
  margin: 0 0 0.75rem 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.detail-specs {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem 0;
  font-size: 0.85rem;
  color: var(--p-text-color);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.detail-specs strong {
  color: var(--p-text-muted-color);
  font-weight: 500;
  margin-right: 0.3rem;
}

.detail-section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0 0 0.4rem 0;
}

.detail-price-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  margin-bottom: 1rem;
}

.detail-price-table th {
  text-align: left;
  color: var(--p-text-muted-color);
  font-weight: 500;
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.detail-price-table td {
  padding: 0.3rem 0.4rem;
  color: var(--p-text-color);
  border-bottom: 1px solid var(--p-content-border-color);
}

.detail-subports {
  list-style: disc;
  padding-left: 1.1rem;
  margin: 0 0 1rem 0;
  font-size: 0.8rem;
  color: var(--p-text-color);
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.detail-desc {
  font-size: 0.85rem;
  color: var(--p-text-color);
  line-height: 1.5;
  margin: 0;
}

.item-detail-drawer {
  width: 450px !important;
}

.detail-tags-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin: 0.75rem 0;
}

.detail-section-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-primary-color, #3b82f6);
}

.detail-subsection-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0.75rem 0 0.4rem 0;
  color: var(--p-text-muted-color, #94a3b8);
}

.resistance-section {
  margin-top: 0.5rem;
}

.res-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.res-item {
  background: var(--p-content-background, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.08));
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.res-label {
  font-size: 0.8rem;
  color: var(--p-text-muted-color, #94a3b8);
}

.res-value {
  font-size: 0.85rem;
  font-weight: 600;
}

.detail-actions {
  margin-top: 1rem;
}

.w-full {
  width: 100%;
}
</style>