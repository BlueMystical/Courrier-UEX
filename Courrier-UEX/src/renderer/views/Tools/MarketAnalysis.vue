<template>
  <div class="market-analysis">
    <div class="toolbar">

      

        <AutoComplete v-model="search" @complete="search" 
          optionLabel="label" showClear placeholder="Buscar commodity o terminal..." 
          inputClass="w-full md:w-56" scrollHeight="14rem" selectOnFocus="true">

        </AutoComplete>

      <!-- NUEVO INPUT: Inversión máxima -->
      <div class="filter-group">
        <label>Inversión máx. (aUEC)</label>
        <InputNumber v-model="maxInvestment" :min="0" placeholder="ej. 50000" />
      </div>

      <!-- NUEVO INPUT: Cantidad a comprar -->
      <div class="filter-group">
        <label>Cantidad a comprar (SCU)</label>
        <InputNumber v-model="buyQuantity" :min="1" placeholder="ej. 100" />
      </div>

      <!-- NUEVO INPUT: Sistema de origen (compra) -->
      <div class="filter-group">
        <label>Sistema (compra)</label>
        <Select
          v-model="buySystemFilter"
          :options="buySystemOptions"
          placeholder="Todos"
          showClear
        />
      </div>

      <Button icon="pi pi-refresh" :loading="loading" label="Actualizar" @click="loadData(true)" />
    </div>

    <div v-if="lastSynced" class="sync-status">
      Última sync: {{ formatDate(lastSynced) }}
      <span v-if="isStale" class="stale-tag">(desactualizado, refrescando...)</span>
    </div>

    <DataTable 
      :value="filteredOpportunities" :loading="loading" 
      paginator :rows="25" :rowsPerPageOptions="[25, 50, 100]" 
      sortField="estTotalProfit" :sortOrder="-1" 
      stripedRows showGridlines
      responsiveLayout="scroll"  scrollable scrollHeight="calc(100vh - 220px)"
      :selection="selectedProduct" selectionMode="single" 
      dataKey="idCommodity"
      class="opportunities-table" 
      @row-click="onRowClick"
      >

      <Column field="commodityName" header="Commodity" sortable>
        <template #body="{ data }">
          <div class="commodity-row">
            <span class="commodity-name" :class="{ 'illegal-text': data.isIllegal }">{{ data.commodityName }}</span>
            <i
              v-if="data.isIllegal"
              class="pi pi-exclamation-triangle illegal-icon"
              title="Commodity ilegal"
            />
          </div>
          <small class="location-text">{{ data.commodityKind }}</small>
        </template>
      </Column>

      <!-- COMPRAR EN -->
      <Column field="buyTerminal" header="Comprar en" sortable>
        <template #body="{ data }">
          <div class="terminal-name">{{ data.buyTerminal }}</div>
          <small class="location-text" v-if="data.buyLocation">{{ data.buyLocation }}</small>
        </template>
      </Column>

      <!-- VALOR UNITARIO COMPRA -->
      <Column field="buyPrice" header="Precio Unit. Compra" sortable>
        <template #body="{ data }">
          <div>{{ formatCredits(data.buyPrice) }}</div>
          <small class="location-text">Box Size: {{ data.buyBoxesSize }}</small>
        </template>
      </Column>

      <!-- TOTAL COMPRA (Multiplicado) -->
      <Column field="totalBuyCost" header="Costo Total Compra" sortable>
        <template #body="{ data }">
          <div :class="{ positive: data.profitUnit > 0 }">
            {{ formatCredits(data.totalBuyCost) }}
          </div>
          <span class="location-text">{{ data.scuUsed }} SCU</span>
        </template>
      </Column>

      <!-- VENDER EN -->
      <Column field="sellTerminal" header="Vender en" sortable>
        <template #body="{ data }">
          <div class="terminal-name">{{ data.sellTerminal }}</div>
          <small class="location-text" v-if="data.sellLocation">{{ data.sellLocation }}</small>
        </template>
      </Column>

      <!-- VALOR UNITARIO VENTA -->
      <Column field="sellPrice" header="Precio Unit. Venta" sortable>
        <template #body="{ data }">
          <div>{{ formatCredits(data.sellPrice) }}</div>
          <small class="location-text">Box Size: {{ data.sellBoxesSize }}</small>
        </template>
      </Column>


      <!-- TOTAL VENTA (Multiplicado) -->
      <Column field="totalSellRevenue" header="Totall Venta" sortable>
        <template #body="{ data }">
          <div>{{ formatCredits(data.totalSellRevenue) }}</div>          
          <span class="location-text">{{ data.scuUsed }} SCU</span>
        </template>
      </Column>

      <Column field="roiPct" header="ROI %" sortable>
        <template #body="{ data }">
          <Tag :severity="roiSeverity(data.roiPct)" :value="data.roiPct.toFixed(1) + '%'" />
        </template>
      </Column>


      <!-- GANANCIA TOTAL EST. -->
      <Column header="Ganancia Total Est." sortable field="estTotalProfit">
        <template #body="{ data }">
          <span class="positive">{{ formatCredits(data.estTotalProfit) }}</span>
        </template>
      </Column>
    </DataTable>

    <div v-if="!loading && filteredOpportunities.length === 0" class="empty-state">
      No hay oportunidades que cumplan los filtros actuales.
    </div>

    <!-- DETALLE DEL COMMODITY -->
    <Drawer
      v-model:visible="drawerVisible"
      position="right"
      :header="drawerCommodity?.name"
      style="width: 52rem; max-width: 100vw"
    >
      <div v-if="detailLoading" class="detail-state">
        <ProgressSpinner style="width: 2.5rem; height: 2.5rem" strokeWidth="4" />
      </div>

      <div v-else-if="detailError" class="detail-state">
        <p>No se pudieron cargar los precios.</p>
        <Button
          label="Reintentar"
          icon="pi pi-refresh"
          size="small"
          @click="loadCommodityDetail(drawerCommodity.id)"
        />
      </div>

      <template v-else>
      <section class="route-summary" aria-live="polite">
        <template v-if="customRoute">
          <div class="route-legs">
            <div class="route-leg">
              <div class="terminal-name">{{ pickedBuy.terminal_name }}</div>
              <small class="location-text">{{ drawerLocation(pickedBuy) }}</small>
              <div>{{ formatCredits(customRoute.buyPrice) }} / scu</div>
            </div>
            <i class="pi pi-arrow-right route-arrow" />
            <div class="route-leg">
              <div class="terminal-name">{{ pickedSell.terminal_name }}</div>
              <small class="location-text">{{ drawerLocation(pickedSell) }}</small>
              <div>{{ formatCredits(customRoute.sellPrice) }} / scu</div>
            </div>
          </div>
          <dl class="route-totals">
            <dt>Buy total</dt>
            <dd>{{ formatCredits(customRoute.totalBuyCost) }}</dd>
            <dt>Sell total</dt>
            <dd>{{ formatCredits(customRoute.totalSellRevenue) }}</dd>
            <dt>Profit</dt>
            <dd class="profit" :class="customRoute.profitUnit > 0 ? 'positive' : 'negative'">
              {{ formatCredits(customRoute.estTotalProfit) }}
              <small class="scu-used">({{ customRoute.scuUsed }} SCU)</small>
            </dd>
            <dt>ROI</dt>
            <dd><Tag :severity="roiSeverity(customRoute.roiPct)" :value="customRoute.roiPct.toFixed(1) + '%'" /></dd>
          </dl>
          <small v-if="buyShortfall !== null" class="route-warning">
            La terminal de compra solo tiene {{ buyShortfall }} SCU disponibles.
          </small>
        </template>
        <p v-else class="route-hint">Elegí una terminal de compra y una de venta para calcular la ruta.</p>
      </section>

      <div class="detail-grid">
        <!-- COLUMNA BUY -->
        <section class="detail-col">
          <h3 class="col-title">Buy <small>({{ buyList.length }})</small></h3>
          <ul class="price-list">
            <li
              v-for="r in buyList" :key="r.id" class="price-item"
              :class="{ picked: pickedBuyId === r.id_terminal }"
              role="button" tabindex="0" :aria-pressed="pickedBuyId === r.id_terminal"
              @click="togglePick('buy', r.id_terminal)"
              @keydown.enter.prevent="togglePick('buy', r.id_terminal)"
              @keydown.space.prevent="togglePick('buy', r.id_terminal)"
            >
              <div class="terminal-name">{{ r.terminal_name }}</div>
              <small class="location-text">{{ drawerLocation(r) }}</small>
              <dl class="price-data">
                <dt>Buy price</dt>
                <dd class="positive">{{ formatCredits(r.price_buy) }}</dd>
                <dt>Stock</dt>
                <dd class="stock-cell">
                  {{ formatStock(r.scu_buy, r.scu_buy_max) }}
                  <Tag v-if="stockTag('buy', r.status_buy)" v-bind="stockTag('buy', r.status_buy)" />
                </dd>
                <dt class="meta">Updated</dt>
                <dd class="meta" :title="formatDateTime(r.date_modified)">{{ timeAgo(r.date_modified) }}</dd>
              </dl>
            </li>
          </ul>
          <p v-if="buyList.length === 0" class="empty-state">Ninguna terminal vende este commodity.</p>
        </section>

        <!-- COLUMNA SELL -->
        <section class="detail-col">
          <h3 class="col-title">Sell <small>({{ sellList.length }})</small></h3>
          <ul class="price-list">
            <li
              v-for="r in sellList" :key="r.id" class="price-item"
              :class="{ picked: pickedSellId === r.id_terminal }"
              role="button" tabindex="0" :aria-pressed="pickedSellId === r.id_terminal"
              @click="togglePick('sell', r.id_terminal)"
              @keydown.enter.prevent="togglePick('sell', r.id_terminal)"
              @keydown.space.prevent="togglePick('sell', r.id_terminal)"
            >
              <div class="terminal-name">{{ r.terminal_name }}</div>
              <small class="location-text">{{ drawerLocation(r) }}</small>
              <dl class="price-data">
                <dt>Sell price</dt>
                <dd class="positive">{{ formatCredits(r.price_sell) }}</dd>
                <dt>Stock</dt>
                <dd class="stock-cell">
                  {{ formatStock(r.scu_sell_stock) }}
                  <Tag v-if="stockTag('sell', r.status_sell)" v-bind="stockTag('sell', r.status_sell)" />
                </dd>
                <dt class="meta">Updated</dt>
                <dd class="meta" :title="formatDateTime(r.date_modified)">{{ timeAgo(r.date_modified) }}</dd>
              </dl>
            </li>
          </ul>
          <p v-if="sellList.length === 0" class="empty-state">Ninguna terminal compra este commodity.</p>
        </section>
      </div>
      </template>
    </Drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import Drawer from 'primevue/drawer'
import ProgressSpinner from 'primevue/progressspinner'
import { useNotify } from '@/components/Notificaciones/Notify'

const notify = useNotify()

// Actualizado al dominio correcto (.space) según el endpoint que pasaste
const API_COMMODITIES_PRICES_ALL = 'https://api.uexcorp.uk/2.0/commodities_prices_all'
const API_COMMODITIES_PRICES = 'https://api.uexcorp.uk/2.0/commodities_prices'
const API_COMMODITIES_STATUS = 'https://api.uexcorp.uk/2.0/commodities_status'

const rawRows = ref([])
const loading = ref(false)
const lastSynced = ref(null)
const isStale = ref(false)

const search = ref('')
const minRoiPct = ref(5)
const minSellStock = ref(1)
const buyQuantity = ref(null)
const maxInvestment = ref(null)
const buySystemFilter = ref(null)
const buySystemOptions = ['Stanton', 'Pyro', 'Nyx']
const selectedProduct = ref();
const terminalsCache = ref(null);
const commodityCache = ref(null);

onMounted(() => loadCacheData()
  .then(() => loadData(false))
  .catch(err => console.error('Error during initial load:', err))
)

async function loadData() {
  loading.value = true
  try {
    rawRows.value = await fetchCommoditiesPricesAll()
    lastSynced.value = Date.now()
    isStale.value = false
    if (rawRows.value.length === 0) notify.warn('No se encontraron precios de commodities')
  } catch (err) {
    notify.error('Error cargando precios de commodities')
    console.error('[MarketAnalysis] error cargando precios:', err)
  } finally {
    loading.value = false
  }
}

// ---------- Drawer de detalle ----------
const drawerVisible = ref(false)
const drawerCommodity = ref(null) // { id, name } - independiente de la selección para que el título no parpadee al cerrar
const detailRows = ref([])
const detailLoading = ref(false)
const detailError = ref(false)

// Niveles de stock de las terminales (código 1-7 -> nombre/color). Casi no cambian,
// así que se piden una sola vez por sesión, la primera vez que se abre el drawer.
const stockStatus = ref({ buy: {}, sell: {} })
let stockStatusPromise = null

function loadStockStatus() {
  if (!stockStatusPromise) {
    stockStatusPromise = (async () => {
      const res = await fetch(API_COMMODITIES_STATUS)
      const json = await res.json()
      if (json.status !== 'ok') {
        throw new Error(`UEX API respondio status=${json.status}`)
      }
      const byCode = (list) => Object.fromEntries(list.map(s => [s.code, s]))
      stockStatus.value = { buy: byCode(json.data.buy), sell: byCode(json.data.sell) }
    })().catch(err => {
      stockStatusPromise = null // permite reintentar la próxima vez que se abra el drawer
      console.error('[MarketAnalysis] error cargando estados de stock:', err)
    })
  }
  return stockStatusPromise
}

// El color de UEX se traduce a la severidad del Tag de PrimeVue
const STATUS_SEVERITY = { red: 'danger', orange: 'warn', blue: 'info', green: 'success' }

// side: 'buy' | 'sell'. En Sell los colores están invertidos (mucho stock = poca demanda = rojo).
function stockTag(side, code) {
  const st = stockStatus.value[side][code]
  if (!st) return null
  return {
    value: st.name_short,
    severity: STATUS_SEVERITY[st.colors] ?? 'secondary',
    title: `${st.name} (${st.percentage})`,
  }
}

// Terminales elegidas en el drawer (por id_terminal) para la ruta alternativa
const pickedBuyId = ref(null)
const pickedSellId = ref(null)

function togglePick(side, idTerminal) {
  const picked = side === 'buy' ? pickedBuyId : pickedSellId
  picked.value = picked.value === idTerminal ? null : idTerminal
}

// Evita que una respuesta lenta pise a una más reciente si se cambia de commodity rápido
let detailRequestId = 0

// La selección se maneja a mano (el DataTable la recibe solo lectura) para que la fila
// quede resaltada al cerrar el drawer y un nuevo click sobre ella lo vuelva a abrir,
// en vez de "des-seleccionarla" como haría el modo single por defecto.
const onRowClick = (event) => {
  selectedProduct.value = event.data
  openDrawer(event.data)
}

function openDrawer(row) {
  drawerCommodity.value = { id: row.idCommodity, name: row.commodityName }
  // Arranca con la ruta óptima de la tabla; el jugador puede cambiar cualquiera de los dos lados
  pickedBuyId.value = row.buyTerminalId
  pickedSellId.value = row.sellTerminalId
  drawerVisible.value = true
  loadStockStatus() // no se espera: los Tag aparecen cuando llega la respuesta
  loadCommodityDetail(row.idCommodity)
}

async function loadCommodityDetail(idCommodity) {
  const requestId = ++detailRequestId
  detailLoading.value = true
  detailError.value = false
  detailRows.value = []
  try {
    const res = await fetch(`${API_COMMODITIES_PRICES}?id_commodity=${idCommodity}`)
    const json = await res.json()
    if (json.status !== 'ok') {
      throw new Error(`UEX API respondio status=${json.status}`)
    }
    if (requestId !== detailRequestId) return
    detailRows.value = json.data
  } catch (err) {
    if (requestId !== detailRequestId) return
    detailError.value = true
    notify.error('Error cargando el detalle del commodity')
    console.error('[MarketAnalysis] error cargando detalle:', err)
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false
  }
}

// Buy: precio ascendente (más barato primero). A igual precio, mayor cantidad disponible primero.
const buyList = computed(() =>
  detailRows.value
    .filter(r => r.price_buy > 0)
    .sort((a, b) => a.price_buy - b.price_buy || b.scu_buy - a.scu_buy)
)

// Sell: precio descendente (mejor pago primero). A igual precio, primero la terminal con
// menor inventario (status_sell más bajo = más demanda).
const sellList = computed(() =>
  detailRows.value
    .filter(r => r.price_sell > 0)
    .sort((a, b) => b.price_sell - a.price_sell || a.status_sell - b.status_sell)
)

const pickedBuy = computed(() => buyList.value.find(r => r.id_terminal === pickedBuyId.value))
const pickedSell = computed(() => sellList.value.find(r => r.id_terminal === pickedSellId.value))

// Ruta con las terminales elegidas, calculada igual que las filas de la tabla
const customRoute = computed(() =>
  pickedBuy.value && pickedSell.value ? buildRoute(pickedBuy.value, pickedSell.value) : null
)

// Avisa si la cantidad pedida no está disponible en la terminal de compra elegida
const buyShortfall = computed(() =>
  buyQuantity.value && pickedBuy.value && buyQuantity.value > pickedBuy.value.scu_buy
    ? pickedBuy.value.scu_buy
    : null
)

// Función para obtener los precios de commodities desde la API
async function fetchCommoditiesPricesAll() {
  const res = await fetch(API_COMMODITIES_PRICES_ALL)
  const json = await res.json()
  if (json.status !== 'ok') {
    throw new Error(`UEX API respondio status=${json.status}`)
  }
  return json.data
}

// Carga de datos en caché de terminales para mostrar ubicaciones
const loadCacheData = async () => {
    try {
        const lcache = await window.api.UEX.getCache();
        if (!lcache || !lcache.terminals || !lcache.terminals.data) {
            throw new Error('No se encontraron datos de terminales en la caché.');
        }
        terminalsCache.value = lcache.terminals.data;
        commodityCache.value = lcache.commodities.data;

        //console.log('Cached Terminals loaded:', terminalsCache.value);
        //console.log('Cached Commodities loaded:', commodityCache.value);
    } catch (e) {
        notify.error('Error loading cached Terminals: ' + e.message);
    }
};

// Mapa id_commodity -> datos de catálogo (para saber si es ilegal, etc.)
// Ajustá "c.id" si en tu API el id_commodity de las filas de precio en
// realidad corresponde a "c.id_item" u otro campo de commodityCache.
const commodityById = computed(() => {
  const map = new Map()
  for (const c of commodityCache.value || []) {
    map.set(c.id, c)
  }
  return map
})

function isIllegalCommodity(idCommodity) {
  return !!commodityById.value.get(idCommodity)?.is_illegal
}

function commodityKind(idCommodity) {
  return commodityById.value.get(idCommodity)?.kind ?? ''
}

// Función para formatear la ubicación de una terminal
const formatLocation = (item, includeTerminalName = false) => {
    const parts = [];
    
    // 1. Sistema Solar
    if (item.star_system_name) {
        parts.push(item.star_system_name);
    }
    
    // 2. Planeta (Evitando duplicados si el sistema se llama igual)
    if (item.planet_name && item.planet_name !== item.star_system_name) {
        parts.push(item.planet_name);
    }
    
    // 3. Luna (Si la terminal está en una luna)
    if (item.moon_name) {
        parts.push(item.moon_name);
    }
    
    // 4. Nombre de la Terminal (Solo si se solicita)
    if (includeTerminalName) {
        if (item.space_station_name) {
            parts.push(item.space_station_name);
        } else if (item.city_name) {
            parts.push(item.city_name);
        } else if (item.outpost_name) {
            parts.push(item.outpost_name);
        } else if (item.name) {
            // Fallback por si es un tipo de terminal distinto
            parts.push(item.name); 
        }
    }
    
    // Cambiado aquí
    return parts.join(' » '); // ' » ' , ' → '
};

// Arma una ruta (compra -> venta) con los mismos cálculos para la tabla y para la
// ruta alternativa que se elige en el drawer.
function buildRoute(bestBuy, bestSell) {
  const profitUnit = bestSell.price_sell - bestBuy.price_buy
  const roiPct = (profitUnit / bestBuy.price_buy) * 100

  const scuAvailable = bestSell.scu_sell_stock || 0

  // Si se ingresó una cantidad a comprar, los precios se multiplican por ese valor.
  // Si está vacío, calculamos el total basándonos en el máximo stock disponible (o 1 si es cero).
  const scuUsed = buyQuantity.value ? buyQuantity.value : (scuAvailable > 0 ? scuAvailable : 1)

  const totalBuyCost = bestBuy.price_buy * scuUsed
  const totalSellRevenue = bestSell.price_sell * scuUsed
  const estTotalProfit = profitUnit * scuUsed

  let buyTerminalLoc = ''
  let sellTerminalLoc = ''
  let startLocation = ''
  let buyBoxesSize = ''
  let sellBoxesSize = ''

  if (terminalsCache.value && terminalsCache.value.length > 0) {
    const buyTerminalCache = terminalsCache.value.find(t => t.id === bestBuy.id_terminal)
    const sellTerminalCache = terminalsCache.value.find(t => t.id === bestSell.id_terminal)
    
    if (buyTerminalCache) {
      buyTerminalLoc = formatLocation(buyTerminalCache);
      startLocation = buyTerminalCache.star_system_name;
      buyBoxesSize = bestBuy.container_sizes;
    }
    if (sellTerminalCache) {
      sellTerminalLoc = formatLocation(sellTerminalCache);
      sellBoxesSize = bestSell.container_sizes;
    }
  }
  //console.log('Best Buy:', bestBuy);
  //console.log('Best Sell:', bestSell);

  return {
    idCommodity:    bestBuy.id_commodity,
    commodityName:  bestBuy.commodity_name,
    isIllegal:      isIllegalCommodity(bestBuy.id_commodity),
    commodityKind:  commodityKind(bestBuy.id_commodity),

    buyTerminalId:  bestBuy.id_terminal,
    buyTerminal:    bestBuy.terminal_name,
    buyLocation:    buyTerminalLoc,
    buySystem:      startLocation,
    scuBuyAvg:      bestBuy.scu_buy_avg,
    buyPrice:       bestBuy.price_buy,
    buyBoxesSize,

    totalBuyCost,
    sellTerminalId: bestSell.id_terminal,
    sellTerminal:   bestSell.terminal_name,
    sellLocation:   sellTerminalLoc,
    sellPrice:      bestSell.price_sell,
    sellBoxesSize,
    totalSellRevenue,

    profitUnit,
    roiPct,
    sellStock:      scuAvailable,
    scuUsed,
    estTotalProfit,
  }
}

const opportunities = computed(() => {
  const byCommodity = new Map()

  for (const row of rawRows.value) {
    if (!byCommodity.has(row.id_commodity)) {
      byCommodity.set(row.id_commodity, [])
    }
    byCommodity.get(row.id_commodity).push(row)
  }

  const results = []

  for (const [, rows] of byCommodity) {
    const buyable = rows.filter(r => r.price_buy > 0)
    const sellable = rows.filter(r => r.price_sell > 0)

    if (buyable.length === 0 || sellable.length === 0) continue

    const bestBuy = buyable.reduce((min, r) => (r.price_buy < min.price_buy ? r : min))

    const sellCandidates = sellable.filter(r => r.id_terminal !== bestBuy.id_terminal)
    if (sellCandidates.length === 0) continue

    const bestSell = sellCandidates.reduce((max, r) => (r.price_sell > max.price_sell ? r : max))

    const route = buildRoute(bestBuy, bestSell)
    if (route.profitUnit <= 0) continue

    results.push(route)
  }

  return results
})

const filteredOpportunities = computed(() => {
  const q = search.value.trim().toLowerCase()

  return opportunities.value.filter(o => {
    // Filtros existentes
    if (o.roiPct < (minRoiPct.value || 0)) return false
    //if (o.sellStock < (minSellStock.value || 0)) return false

    // NUEVO FILTRO: Inversión máxima
    if (maxInvestment.value !== null && maxInvestment.value > 0) {
      if (o.totalBuyCost > maxInvestment.value) return false
    }

    // NUEVO FILTRO: Sistema de origen (compra)
    if (buySystemFilter.value && o.buySystem !== buySystemFilter.value) return false

    // Filtro de búsqueda por texto
    if (q) {
      const haystack = `${o.commodityName} ${o.buyTerminal} ${o.sellTerminal}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
})

function formatCredits(value) {
  return new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 }).format(value) + ' aUEC'
}

// "18 / 75 SCU" si se conoce el máximo; "512 SCU" si no. 0 se muestra como 0 (terminal sin stock).
function formatStock(current, max) {
  const nf = new Intl.NumberFormat('es-UY')
  const cur = current || 0
  return max > 0
    ? `${nf.format(cur)} / ${nf.format(Math.max(max, cur))} SCU`
    : `${nf.format(cur)} SCU`
}

const relativeTime = new Intl.RelativeTimeFormat('es-UY', { numeric: 'auto' })

// date_modified viene en segundos (Unix), no en milisegundos
function timeAgo(unixSeconds) {
  if (!unixSeconds) return '—'
  const diffSec = Math.round(unixSeconds - Date.now() / 1000) // negativo = pasado
  const abs = Math.abs(diffSec)
  if (abs < 3600) return relativeTime.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return relativeTime.format(Math.round(diffSec / 3600), 'hour')
  return relativeTime.format(Math.round(diffSec / 86400), 'day')
}

// Fecha completa, se muestra como tooltip sobre el "hace X"
function formatDateTime(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toLocaleString('es-UY') : ''
}

// Igual que formatLocation, pero agrega la órbita (puntos Lagrange, gateways, Levski...)
// cuando no hay luna y el orbit_name aporta algo distinto al planeta/sistema.
function drawerLocation(row) {
  const base = formatLocation(row)
  const orbit = row.orbit_name
  const aporta = !row.moon_name && orbit && orbit !== row.planet_name && orbit !== row.star_system_name
  return aporta ? `${base} » ${orbit}` : base
}

function formatDate(ts) {
  return new Date(ts).toLocaleTimeString('es-UY')
}

function roiSeverity(roiPct) {
  if (roiPct >= 50) return 'success'
  if (roiPct >= 20) return 'info'
  if (roiPct >= 5) return 'warning'
  return 'danger'
}


</script>

<style scoped>
.market-analysis {
  padding: 1rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
  margin-bottom: 0.75rem;
}

.search-box {
  min-width: 220px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.filter-group label {
  font-size: 0.75rem;
  opacity: 0.75;
}

.terminal-name {
  font-weight: 600;
  font-size: 1.2rem;
  color: var(--yellow-500, #1890e0);
}

.location-text {
  display: block;
  opacity: 0.65;
  font-size: 0.75rem;
  margin-top: 0.15rem;
}

.sync-status {
  font-size: 0.8rem;
  opacity: 0.7;
  margin-bottom: 0.5rem;
}

.stale-tag {
  color: var(--yellow-500, #d97706);
}

.positive {
  color: var(--green-500, #22c55e);
  font-weight: 600;
}

.commodity-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.commodity-name {
  font-weight: 500;
}

.illegal-text {
  color: var(--red-500, #ef4444);
  font-weight: 700;
}

.illegal-icon {
  color: var(--red-500, #ef4444);
  font-size: 0.9rem;
}

.scu-used {
  opacity: 0.6;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  opacity: 0.6;
}

/* ---------- Drawer de detalle ---------- */
.detail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 1rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

.detail-col {
  min-width: 0; /* permite que el texto largo de terminales haga wrap dentro de la columna */
}

.col-title {
  margin: 0 0 0.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border, var(--p-content-border-color, #d4d4d8));
  font-size: 1.1rem;
}

.col-title small {
  font-weight: 400;
  opacity: 0.6;
}

.price-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.price-item {
  padding: 0.6rem 0.5rem;
  border-bottom: 1px solid var(--surface-border, var(--p-content-border-color, #e4e4e7));
  border-left: 3px solid transparent;
  cursor: pointer;
}

.price-item:hover {
  background: var(--p-content-hover-background, rgba(127, 127, 127, 0.08));
}

.price-item:focus-visible {
  outline: 2px solid var(--p-primary-color, var(--primary-color, #6366f1));
  outline-offset: -2px;
}

.price-item.picked {
  background: var(--p-highlight-background, rgba(99, 102, 241, 0.12));
  border-left-color: var(--p-primary-color, var(--primary-color, #6366f1));
}

/* Resumen de la ruta elegida: queda fijo arriba mientras se recorren las listas */
.route-summary {
  position: sticky;
  top: 0;
  z-index: 1;
  margin-bottom: 1rem;
  padding: 0.75rem 0;
  background: var(--p-content-background, var(--surface-card, #fff));
  border-bottom: 1px solid var(--surface-border, var(--p-content-border-color, #d4d4d8));
}

.route-legs {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.route-leg {
  flex: 1;
  min-width: 0;
}

.route-arrow {
  margin-top: 0.3rem;
  opacity: 0.6;
}

.route-totals {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  align-items: baseline;
  margin: 0.6rem 0 0;
  font-size: 0.85rem;
}

/* La ganancia es el dato principal de la ruta: más grande y en negrita */
.route-totals .profit {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.route-totals .profit .scu-used {
  font-size: 0.75rem;
  font-weight: 400;
}

.route-totals dt {
  opacity: 0.65;
}

.route-totals dd {
  margin: 0;
  text-align: right;
}

.route-warning {
  display: block;
  margin-top: 0.4rem;
  color: var(--yellow-500, #d97706);
}

.route-hint {
  margin: 0;
  opacity: 0.65;
  font-size: 0.85rem;
}

.negative {
  color: var(--red-500, #ef4444);
  font-weight: 600;
}

.price-data {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
}

.price-data dt {
  opacity: 0.65;
}

.price-data dd {
  margin: 0;
  text-align: right;
}

/* Dato secundario: pequeño y gris para no competir con precio y stock */
.price-data .meta {
  font-size: 0.7rem;
  opacity: 1;
  color: var(--p-text-muted-color, var(--text-color-secondary, #71717a));
}

.stock-cell {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.15rem 0.4rem;
}

.stock-cell :deep(.p-tag) {
  font-size: 0.7rem;
}

/* En pantallas angostas las columnas se apilan */
@media (max-width: 720px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>