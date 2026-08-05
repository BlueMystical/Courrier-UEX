<template>
  <div class="planner-root">
    <div class="ambient-glow"></div>

    <!-- HEADER -->
    <header class="hud-header">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1>CARGO MISSION PLANNER</h1>
          <span class="subtitle">UEX CORP ROUTE OPTIMIZER // v2.0</span>
        </div>
      </div>

      <div class="hud-stats">
        <div class="stat-pill">
          <span class="stat-label">PAYOUT</span>
          <span class="stat-value text-gold">aUEC {{ (totalPayout || 0).toLocaleString() }}</span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">PEAK SCU</span>
          <span class="stat-value" :class="routeResult.maxSCU > currentShipCapacity ? 'text-danger' : 'text-cyan'">
            {{ routeResult.maxSCU }}
          </span>
        </div>
        <div class="stat-pill timer-pill" :class="{ active: timerRunning }">
          <span class="stat-label">SESSION</span>
          <span class="stat-value font-mono">{{ formattedTime }}</span>
          <div class="timer-controls">
            <button @click="toggleTimer" class="btn-icon"><i :class="timerRunning ? 'pi pi-pause' : 'pi pi-play'"></i></button>
            <button @click="resetTimer" class="btn-icon"><i class="pi pi-refresh"></i></button>
          </div>
        </div>
      </div>
    </header>

    <!-- CAPACITY ALERT -->
    <Transition name="slide-down">
      <div v-if="routeResult.maxSCU > currentShipCapacity" class="alert-banner">
        <i class="pi pi-exclamation-triangle"></i>
        <span><strong>CAPACITY EXCEEDED</strong> — Route peaks at {{ routeResult.maxSCU }} SCU (Ship limit: {{ currentShipCapacity }} SCU)</span>
      </div>
    </Transition>

    <!-- MAIN LAYOUT -->
    <main class="main-layout">

      <!-- FLIGHT CONFIG -->
      <section class="panel panel-config">
        <div class="panel-header">
          <i class="pi pi-sliders-h"></i>
          <h2>FLIGHT CONFIG</h2>
        </div>
        <div class="panel-body config-body">
          <div class="config-grid">
            <div class="field-group">
              <label>STAR SYSTEM</label>
              <Select v-model="selectedStarSystem" :options="starSystems" optionLabel="name" optionValue="id" placeholder="Select system..." class="w-full dark-select" @change="onStarSystemChange" @show="focusSearchInput" />
            </div>
            <div class="field-group">
              <label>ORIGIN POINT</label>
              <Select v-model="startingLocationId" :options="locations" optionLabel="displayName" optionValue="uniqueId" placeholder="Current location..." class="w-full dark-select" filter @show="focusSearchInput" />
            </div>
            <div class="field-group">
              <label>SHIP MANIFEST</label>
              <Select v-model="selectedShip" :options="ships" optionLabel="name" placeholder="Select vessel..." class="w-full dark-select" @change="onShipChange" filter @show="focusSearchInput" />
            </div>
            <div class="field-group">
              <label>CARGO OVERRIDE</label>
              <div class="scu-input-wrapper">
                <InputNumber v-model="customCapacity" placeholder="Auto" :min="0" class="w-full dark-input scu-input" />
              </div>
              <div v-if="selectedShip" class="capacity-hint">{{ selectedShip.name }}: {{ selectedShip.capacity }} SCU</div>
            </div>
          </div>
          <div class="ship-gauge">
            <div class="gauge-label">
              <span>CARGO LOAD PROJECTION</span>
              <span class="font-mono">{{ totalMissionSCU }} / {{ currentShipCapacity }} SCU</span>
            </div>
            <div class="gauge-track">
              <div class="gauge-fill" :style="{ width: Math.min((totalMissionSCU / currentShipCapacity) * 100, 100) + '%' }" :class="{ danger: totalMissionSCU > currentShipCapacity }"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- MISSION MANIFEST (Full Width) -->
      <section class="panel panel-missions">
        <div class="panel-header">
          <div class="header-left">
            <i class="pi pi-list-check"></i>
            <h2>MISSION MANIFEST</h2>
            <span class="mission-count">{{ missions.length }} / 10</span>
          </div>
          <button class="btn-flight-plan" @click="drawerVisible = true" :disabled="routeResult.steps.length === 0">
            <i class="pi pi-map"></i>
            <span>FLIGHT PLAN</span>
            <span v-if="routeResult.steps.length > 0" class="fp-badge">{{ routeResult.steps.length }}</span>
          </button>
        </div>

        <div class="panel-body">
          <!-- Route Summary + Add Button -->
          <div class="route-summary-bar">
            <div class="summary-pill">
              <span class="summary-label">TOTAL STOPS</span>
              <span class="summary-value">{{ routeResult.steps.length }}</span>
            </div>
            <div class="summary-pill">
              <span class="summary-label">EST. PAYOUT</span>
              <span class="summary-value text-gold">aUEC {{ totalPayout.toLocaleString() }}</span>
            </div>
            <div class="summary-pill">
              <span class="summary-label">PEAK LOAD</span>
              <span class="summary-value" :class="routeResult.maxSCU > currentShipCapacity ? 'text-danger' : 'text-cyan'">{{ routeResult.maxSCU }} SCU</span>
            </div>
            <div class="summary-pill">
              <span class="summary-label">CONTRACTS</span>
              <span class="summary-value">{{ missions.length }}</span>
            </div>
            <button class="btn-primary btn-add-inline" @click="openAddMissionDialog" :disabled="missions.length >= 10">
              <i class="pi pi-plus"></i> ADD CONTRACT
            </button>
          </div>

          <!-- Empty State -->
          <div v-if="missions.length === 0" class="empty-state compact">
            <div class="empty-icon"><i class="pi pi-inbox"></i></div>
            <h3>NO ACTIVE CONTRACTS</h3>
            <p>Add cargo missions to begin route optimization.</p>
          </div>

          <!-- Mission Grid -->
          <div v-else class="mission-grid">
            <div 
              v-for="(mission, index) in missions" 
              :key="mission.id" 
              class="mission-card-compact"
              :class="{ complete: getMissionProgress(mission).complete, 'in-progress': getMissionProgress(mission).started && !getMissionProgress(mission).complete }"
              @click="openEditMissionDialog(index)"
              title="Click to edit"
            >
              <div class="mc-main">
                <div class="mc-icon" :class="mission.type">
                  <i :class="{
                    'pi pi-tag': mission.type === 'simple',
                    'pi pi-code-branch': mission.type === 'multidrop',
                    'pi pi-sitemap': mission.type === 'multipickup'
                  }"></i>
                </div>
                <div class="mc-info">
                  <div class="mc-title-row">
                    <h4>{{ mission.name }}</h4>
                    <span class="mc-scu">{{ mission.cargoItems.reduce((acc, i) => acc + i.scu, 0) }} SCU</span>
                  </div>
                  <div class="mc-meta">
                    <span>{{ getMissionTypeLabel(mission.type) }}</span>
                    <span class="dot">•</span>
                    <span>{{ mission.cargoItems.length }} Segment{{ mission.cargoItems.length !== 1 ? 's' : '' }}</span>
                    <span class="dot">•</span>
                    <span class="mc-payout">aUEC {{ mission.payout.toLocaleString() }}</span>
                  </div>
                </div>
              </div>

              <div class="mc-actions">
                <span
                  class="mc-progress"
                  :class="{ complete: getMissionProgress(mission).complete, started: getMissionProgress(mission).started }"
                  title="Tareas completadas (recogida + entrega por segmento)"
                >
                  <i class="pi" :class="getMissionProgress(mission).complete ? 'pi-check-circle' : 'pi-circle-fill'"></i>
                  {{ getMissionProgress(mission).done }}/{{ getMissionProgress(mission).total }}
                </span>
                <button class="btn-delete-compact" @click.stop="removeMission(index)" title="Remove">
                  <i class="pi pi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- FLIGHT PLAN DRAWER -->
    <Drawer 
      v-model:visible="drawerVisible" 
      position="right" 
      :style="{ width: '520px' }"
      class="flight-plan-drawer"
    >
      <template #header>
        <div class="drawer-header">
          <i class="pi pi-map"></i>
          <div>
            <h3>FLIGHT PLAN</h3>
            <span class="drawer-sub">{{ routeResult.steps.length }} stops • {{ routeResult.totalDistance.toLocaleString() }} Gm total</span>
          </div>
        </div>
      </template>

      <div class="drawer-body">
        <div v-if="routeResult.steps.length === 0" class="empty-state">
          <div class="empty-icon large">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
            </svg>
          </div>
          <h3>AWAITING NAV DATA</h3>
          <p>Add missions and set origin to calculate route.</p>
        </div>

        <div v-else class="drawer-timeline">
          <div v-for="(step, index) in routeResult.steps" :key="index" class="dt-item" :class="{ 'dt-done': isStepDone(step) }">
            <div v-if="index > 0" class="dt-distance">
              <i class="pi pi-upload"></i>
              <span>{{ step.distance.toLocaleString() }} Gm</span>
            </div>

            <div class="dt-node" :class="[step.type, { done: isStepDone(step) }]">
              <i :class="isStepDone(step) ? 'pi pi-check' : (step.type === 'pickup' ? 'pi pi-upload' : 'pi pi-download')"></i>
            </div>
            <div
              class="dt-card"
              :class="[step.type, {
                done: isStepDone(step),
                locked: step.type === 'delivery' && !isPickupDoneForStep(step) && !isStepDone(step),
                active: !isStepDone(step) && !(step.type === 'delivery' && !isPickupDoneForStep(step))
              }]"
              :title="step.type === 'delivery' && !isPickupDoneForStep(step) && !isStepDone(step) ? 'Marca primero la recogida de este cargamento' : (isStepDone(step) ? 'Marcar como pendiente' : 'Marcar como completado')"
              @click="toggleStepDone(step)"
            >
              <div class="dt-top">
                <div class="dt-top-info">
                  <span class="dt-step" :class="step.type">STEP {{ index + 1 }}</span>
                  <h4>{{ step.locationName }}</h4>
                </div>
                <Tag v-if="isStepDone(step)" value="✓ DONE" severity="success" class="dt-tag dt-tag-done" />
                <Tag v-else-if="step.type === 'delivery' && !isPickupDoneForStep(step) && !isStepDone(step)" value="🔒 LOCKED" severity="danger" class="dt-tag" />
                <Tag v-else :value="step.scuChange" :severity="step.type === 'pickup' ? 'success' : 'info'" class="dt-tag" />
              </div>
              <p class="dt-action" :class="{ 'dt-strike': isStepDone(step) }">{{ step.actionDescription }}</p>
              <div class="dt-capacity">
                <span class="dt-capacity-label">LOAD AFTER STEP</span>
                <div class="dt-capacity-row">
                  <div class="dt-bar-bg">
                    <div class="dt-bar-fill" :style="{ width: Math.min((step.currentVolume / currentShipCapacity) * 100, 100) + '%' }" :class="{ danger: step.currentVolume > currentShipCapacity }"></div>
                  </div>
                  <span class="dt-cap-text">{{ step.currentVolume }} / {{ currentShipCapacity }} SCU</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>

    <!-- ADD / EDIT MISSION MODAL -->
    <Dialog 
      v-model:visible="missionDialogVisible" 
      modal 
      :header="editingIndex !== null ? 'EDIT CONTRACT' : 'NEW CONTRACT'" 
      :style="{ width: '80vw', maxWidth: '1100px' }"
      :dismissableMask="true"
      class="mission-modal"
    >
      <div class="modal-body">
        <div class="modal-row cols-3">
          <div class="field-group">
            <label>CONTRACT NAME</label>
            <InputText v-model="currentMission.name" placeholder="E.g. Hauling Tier 2 - Hurston" class="w-full dark-input" />
          </div>
          <div class="field-group">
            <label>CONTRACT TYPE</label>
            <Select v-model="currentMission.type" :options="missionTypes" optionLabel="label" optionValue="value" class="w-full dark-select" />
          </div>
          <div class="field-group">
            <label>PAYOUT (aUEC)</label>
            <InputNumber v-model="currentMission.payout" :min="0" class="w-full dark-input" />
          </div>
        </div>

        <template v-if="currentMission.type === 'simple'">
          <div class="modal-section boxed">
            <h5><i class="pi pi-tag"></i> ROUTE</h5>
            <div class="modal-row cols-2">
              <div class="field-group"><label>PICKUP (A)</label><Select v-model="currentMission.pickupLocationId" :options="locations" optionLabel="displayName" optionValue="uniqueId" placeholder="Origin" class="w-full dark-select" filter @show="focusSearchInput" /></div>
              <div class="field-group"><label>DELIVERY (B)</label><Select v-model="currentMission.deliveryLocationId" :options="locations" optionLabel="displayName" optionValue="uniqueId" placeholder="Destination" class="w-full dark-select" filter @show="focusSearchInput" /></div>
            </div>
            <div class="modal-row cols-2">
              <div class="field-group"><label>COMMODITY</label><Select v-model="currentMission.commodityId" :options="commodities" optionLabel="name" optionValue="id" placeholder="Select..." class="w-full dark-select" filter @show="focusSearchInput" /></div>
              <div class="field-group"><label>QUANTITY (SCU)</label>
                <div class="scu-input-wrapper"><InputNumber v-model="currentMission.scu" :min="1" class="w-full dark-input scu-input" /></div>
              </div>
            </div>
          </div>
        </template>

        <template v-if="currentMission.type === 'multidrop'">
          <div class="modal-row"><div class="field-group"><label>MASTER PICKUP</label><Select v-model="currentMission.masterPickupLocationId" :options="locations" optionLabel="displayName" optionValue="uniqueId" placeholder="Shared origin" class="w-full dark-select" filter @show="focusSearchInput" /></div></div>
          <div class="modal-section boxed">
            <div class="section-header"><h5><i class="pi pi-code-branch"></i> DROPS</h5><button class="btn-text" @click="addDropLeg"><i class="pi pi-plus"></i> ADD</button></div>
            <div v-for="(leg, idx) in currentMission.dropLegs" :key="idx" class="leg-row">
              <div class="leg-field"><label>Point</label><Select v-model="leg.deliveryLocationId" :options="locations" optionLabel="displayName" optionValue="uniqueId" placeholder="Drop" class="w-full dark-select" filter @show="focusSearchInput" /></div>
              <div class="leg-field"><label>Cargo</label><Select v-model="leg.commodityId" :options="commodities" optionLabel="name" optionValue="id" placeholder="Type" class="w-full dark-select" filter @show="focusSearchInput" /></div>
              <div class="leg-field scu-field"><label>SCU</label><div class="scu-input-wrapper"><InputNumber v-model="leg.scu" :min="1" placeholder="Qty" class="w-full dark-input scu-input" /></div></div>
              <button class="btn-icon-danger leg-delete" @click="removeDropLeg(idx)" :disabled="currentMission.dropLegs.length === 1"><i class="pi pi-trash"></i></button>
            </div>
          </div>
        </template>

        <template v-if="currentMission.type === 'multipickup'">
          <div class="modal-row"><div class="field-group"><label>MASTER DELIVERY</label><Select v-model="currentMission.masterDeliveryLocationId" :options="locations" optionLabel="displayName" optionValue="uniqueId" placeholder="Shared destination" class="w-full dark-select" filter @show="focusSearchInput" /></div></div>
          <div class="modal-section boxed">
            <div class="section-header"><h5><i class="pi pi-sitemap"></i> PICKUPS</h5><button class="btn-text" @click="addPickupLeg"><i class="pi pi-plus"></i> ADD</button></div>
            <div v-for="(leg, idx) in currentMission.pickupLegs" :key="idx" class="leg-row">
              <div class="leg-field"><label>Point</label><Select v-model="leg.pickupLocationId" :options="locations" optionLabel="displayName" optionValue="uniqueId" placeholder="Pickup" class="w-full dark-select" filter @show="focusSearchInput" /></div>
              <div class="leg-field"><label>Cargo</label><Select v-model="leg.commodityId" :options="commodities" optionLabel="name" optionValue="id" placeholder="Type" class="w-full dark-select" filter @show="focusSearchInput" /></div>
              <div class="leg-field scu-field"><label>SCU</label><div class="scu-input-wrapper"><InputNumber v-model="leg.scu" :min="1" placeholder="Qty" class="w-full dark-input scu-input" /></div></div>
              <button class="btn-icon-danger leg-delete" @click="removePickupLeg(idx)" :disabled="currentMission.pickupLegs.length === 1"><i class="pi pi-trash"></i></button>
            </div>
          </div>
        </template>
      </div>

      <template #footer>
        <div class="modal-footer">
          <button class="btn-secondary" @click="missionDialogVisible = false">CANCEL</button>
          <button class="btn-primary" @click="saveMission" :disabled="!isMissionValid"><i class="pi pi-check"></i> {{ editingIndex !== null ? 'UPDATE' : 'SAVE' }}</button>
        </div>
      </template>
    </Dialog>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import Tag from 'primevue/tag'

const starSystems = ref([])
const selectedStarSystem = ref(68)
const locations = ref([]) 
const startingLocationId = ref(null)
const distanceMatrix = ref({}) 
const commodities = ref([])
const ships = ref([])
const selectedShip = ref(null)
const customCapacity = ref(null)
const missions = ref([])
const missionDialogVisible = ref(false)
const drawerVisible = ref(false)
const editingIndex = ref(null)

const STORAGE_KEY = 'cargo-planner-flight-config'
const API_BASE = 'https://api.uexcorp.uk/2.0';

const saveFlightConfig = () => {
  const config = {
    starSystem: selectedStarSystem.value,
    originId: startingLocationId.value,
    shipName: selectedShip.value?.name || null,
    customCapacity: customCapacity.value
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

const loadFlightConfig = async () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const config = JSON.parse(raw)
    if (config.starSystem && starSystems.value.find(s => s.id === config.starSystem)) {
      selectedStarSystem.value = config.starSystem
      await loadSystemData(config.starSystem)
    }
    if (config.originId && locations.value.find(l => l.uniqueId === config.originId)) {
      startingLocationId.value = config.originId
    }
    if (config.shipName) {
      const ship = ships.value.find(s => s.name === config.shipName)
      if (ship) {
        selectedShip.value = ship
        if (config.customCapacity !== null && config.customCapacity > 0) {
          customCapacity.value = config.customCapacity
        } else {
          customCapacity.value = ship.capacity
        }
      }
    } else if (config.customCapacity !== null && config.customCapacity > 0) {
      customCapacity.value = config.customCapacity
    }
  } catch (e) {
    console.error('Error loading flight config', e)
  }
}

watch(selectedStarSystem, saveFlightConfig)
watch(startingLocationId, saveFlightConfig)
watch(selectedShip, saveFlightConfig)
watch(customCapacity, saveFlightConfig)

let legIdCounter = 0
function newLegId() {
  return `leg-${Date.now()}-${legIdCounter++}`
}

function getEmptyMission() {
  return {
    name: `Contract #${missions.value.length + 1}`,
    type: 'simple',
    payout: 50000,
    pickupLocationId: null,
    deliveryLocationId: null,
    commodityId: null,
    scu: 10,
    masterPickupLocationId: null,
    dropLegs: [{ deliveryLocationId: null, commodityId: null, scu: 10, legId: newLegId() }],
    masterDeliveryLocationId: null,
    pickupLegs: [{ pickupLocationId: null, commodityId: null, scu: 10, legId: newLegId() }]
  }
}

const currentMission = ref(getEmptyMission())

const missionTypes = [
  { label: 'A → B (Simple)', value: 'simple' },
  { label: 'A → Multiple (Multi-drop)', value: 'multidrop' },
  { label: 'Multiple → B (Multi-pickup)', value: 'multipickup' }
]

const timerRunning = ref(false)
const secondsElapsed = ref(0)
let timerInterval = null

const formattedTime = computed(() => {
  const mins = Math.floor(secondsElapsed.value / 60)
  const secs = secondsElapsed.value % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

const toggleTimer = () => {
  if (timerRunning.value) clearInterval(timerInterval)
  else timerInterval = setInterval(() => { secondsElapsed.value++ }, 1000)
  timerRunning.value = !timerRunning.value
}

const resetTimer = () => {
  clearInterval(timerInterval)
  timerRunning.value = false
  secondsElapsed.value = 0
}

const currentShipCapacity = computed(() => {
  if (customCapacity.value !== null && customCapacity.value > 0) return customCapacity.value
  return selectedShip.value ? selectedShip.value.capacity : 99999
})

const totalPayout = computed(() => missions.value.reduce((acc, m) => acc + (m.payout || 0), 0))

const totalMissionSCU = computed(() => {
  return missions.value.reduce((total, mission) => {
    return total + mission.cargoItems.reduce((sum, item) => sum + (item.scu || 0), 0)
  }, 0)
})

const isMissionValid = computed(() => {
  if (!currentMission.value.name) return false
  if (currentMission.value.type === 'simple') {
    return currentMission.value.pickupLocationId && currentMission.value.deliveryLocationId && currentMission.value.commodityId && currentMission.value.scu > 0
  }
  if (currentMission.value.type === 'multidrop') {
    if (!currentMission.value.masterPickupLocationId) return false
    return currentMission.value.dropLegs.length > 0 && currentMission.value.dropLegs.every(leg => leg.deliveryLocationId && leg.commodityId && leg.scu > 0)
  }
  if (currentMission.value.type === 'multipickup') {
    if (!currentMission.value.masterDeliveryLocationId) return false
    return currentMission.value.pickupLegs.length > 0 && currentMission.value.pickupLegs.every(leg => leg.pickupLocationId && leg.commodityId && leg.scu > 0)
  }
  return false
})

const getMissionProgress = (mission) => {
  const total = mission.cargoItems.length * 2
  const done = mission.cargoItems.reduce(
    (acc, item) => acc + (item.pickedUp ? 1 : 0) + (item.delivered ? 1 : 0),
    0
  )
  return { done, total, complete: total > 0 && done === total, started: done > 0 }
}

const toggleTaskPickup = (missionIndex, itemIndex) => {
  const item = missions.value[missionIndex]?.cargoItems[itemIndex]
  if (!item) return
  item.pickedUp = !item.pickedUp
  if (!item.pickedUp) item.delivered = false
}

const toggleTaskDelivery = (missionIndex, itemIndex) => {
  const item = missions.value[missionIndex]?.cargoItems[itemIndex]
  if (!item || !item.pickedUp) return
  item.delivered = !item.delivered
}

const openAddMissionDialog = () => {
  editingIndex.value = null
  currentMission.value = getEmptyMission()
  missionDialogVisible.value = true
}

const openEditMissionDialog = (index) => {
  editingIndex.value = index
  const m = missions.value[index]
  const editData = {
    name: m.name,
    type: m.type,
    payout: m.payout,
    pickupLocationId: null,
    deliveryLocationId: null,
    commodityId: null,
    scu: 10,
    masterPickupLocationId: null,
    dropLegs: [{ deliveryLocationId: null, commodityId: null, scu: 10, legId: newLegId() }],
    masterDeliveryLocationId: null,
    pickupLegs: [{ pickupLocationId: null, commodityId: null, scu: 10, legId: newLegId() }]
  }
  if (m.type === 'simple' && m.cargoItems[0]) {
    editData.pickupLocationId = m.cargoItems[0].pickupLocationId
    editData.deliveryLocationId = m.cargoItems[0].deliveryLocationId
    editData.commodityId = m.cargoItems[0].commodityId
    editData.scu = m.cargoItems[0].scu
  } else if (m.type === 'multidrop' && m.cargoItems.length > 0) {
    editData.masterPickupLocationId = m.cargoItems[0].pickupLocationId
    editData.dropLegs = m.cargoItems.map(item => ({
      deliveryLocationId:   item.deliveryLocationId,
      commodityId:          item.commodityId,
      scu:                  item.scu,
      legId: item.legId || newLegId()
    }))
  } else if (m.type === 'multipickup' && m.cargoItems.length > 0) {
    editData.masterDeliveryLocationId = m.cargoItems[0].deliveryLocationId
    editData.pickupLegs = m.cargoItems.map(item => ({
      pickupLocationId:   item.pickupLocationId,
      commodityId:        item.commodityId,
      scu:                item.scu,
      legId:              item.legId || newLegId()
    }))
  }
  currentMission.value = editData
  missionDialogVisible.value = true
}

const addDropLeg = () => currentMission.value.dropLegs.push({ deliveryLocationId: null, commodityId: null, scu: 10, legId: newLegId() })
const removeDropLeg = (idx) => currentMission.value.dropLegs.splice(idx, 1)
const addPickupLeg = () => currentMission.value.pickupLegs.push({ pickupLocationId: null, commodityId: null, scu: 10, legId: newLegId() })
const removePickupLeg = (idx) => currentMission.value.pickupLegs.splice(idx, 1)

const saveMission = () => {
  let cargoItems = []
  if (currentMission.value.type === 'simple') {
    cargoItems.push({
      pickupLocationId:   currentMission.value.pickupLocationId,
      deliveryLocationId: currentMission.value.deliveryLocationId,
      commodityId:        currentMission.value.commodityId,
      scu:                currentMission.value.scu,
      legId:              'simple-0'
    })
  } else if (currentMission.value.type === 'multidrop') {
    cargoItems = currentMission.value.dropLegs.map(leg => ({
      pickupLocationId:   currentMission.value.masterPickupLocationId,
      deliveryLocationId: leg.deliveryLocationId,
      commodityId:        leg.commodityId,
      scu:                leg.scu,
      legId:              leg.legId || newLegId()
    }))
  } else if (currentMission.value.type === 'multipickup') {
    cargoItems = currentMission.value.pickupLegs.map(leg => ({
      pickupLocationId:   leg.pickupLocationId,
      deliveryLocationId: currentMission.value.masterDeliveryLocationId,
      commodityId:        leg.commodityId,
      scu:                leg.scu,
      legId:              leg.legId || newLegId()
    }))
  }
  const oldCargoItems = editingIndex.value !== null ? missions.value[editingIndex.value].cargoItems : null
  const oldByLegId = new Map((oldCargoItems || []).map(item => [item.legId, item]))
  cargoItems = cargoItems.map(item => {
    const old = oldByLegId.get(item.legId)
    return {
      ...item,
      pickedUp: old?.pickedUp || false,
      delivered: old?.delivered || false
    }
  })
  const missionData = {
    id: editingIndex.value !== null ? missions.value[editingIndex.value].id : Date.now(),
    name: currentMission.value.name,
    type: currentMission.value.type,
    payout: currentMission.value.payout,
    cargoItems: cargoItems
  }
  if (editingIndex.value !== null) {
    missions.value.splice(editingIndex.value, 1, missionData)
  } else {
    missions.value.push(missionData)
  }
  missionDialogVisible.value = false
  editingIndex.value = null
}



const fetchStarSystems = async () => {
  try {
    const res = await fetch(`${API_BASE}/star_systems`)
    const json = await res.json()
    if (json.status === 'ok') starSystems.value = json.data.filter(s => s.is_available_live === 1)
  } catch (e) { console.error('Error fetching star systems', e) }
}

const fetchCommodities = async () => {
  try {
    const res = await fetch(`${API_BASE}/commodities`)
    const json = await res.json()
    if (json.status === 'ok') commodities.value = json.data.filter(c => c.is_available_live === 1)
  } catch (e) { console.error('Error fetching commodities', e) }
}

const fetchShips = async () => {
  const fallbackShips = [
    { name: 'C2 Hercules', capacity: 696 }, { name: 'Constellation Taurus', capacity: 174 },
    { name: 'Cutter', capacity: 2 }, { name: 'Freelancer MAX', capacity: 120 },
    { name: 'Hull A', capacity: 64 }, { name: 'Railen', capacity: 320 }
  ]
  try {
    const res = await fetch(`${API_BASE}/vehicles`)
    const json = await res.json()
    if (json.status === 'ok') {
      ships.value = json.data.map(v => ({ name: v.name, capacity: v.scu || 0 })).sort((a, b) => a.name.localeCompare(b.name))
    } else {
      ships.value = fallbackShips.sort((a, b) => a.name.localeCompare(b.name))
    }
  } catch (e) { 
    ships.value = fallbackShips.sort((a, b) => a.name.localeCompare(b.name))
  }
}

const loadSystemData = async (systemId) => {
  try {
    const [planetsRes, moonsRes, stationsRes, citiesRes, distancesRes] = await Promise.all([
      fetch(`${API_BASE}/planets?id_star_system=${systemId}`).then(r => r.json()),
      fetch(`${API_BASE}/moons?id_star_system=${systemId}`).then(r => r.json()),
      fetch(`${API_BASE}/space_stations?id_star_system=${systemId}`).then(r => r.json()),
      fetch(`${API_BASE}/cities?id_star_system=${systemId}`).then(r => r.json()),
      fetch(`${API_BASE}/orbits_distances?id_star_system=${systemId}`).then(r => r.json())
    ]);
    let combinedLocations = []
    if (planetsRes.status === 'ok')   combinedLocations.push(...planetsRes.data.map(p => ({ ...p, uniqueId: `planet_${p.id}`, type: 'Planet', routeId: p.id_orbit || p.id })))
    if (moonsRes.status === 'ok')     combinedLocations.push(...moonsRes.data.map(m => ({ ...m, uniqueId: `moon_${m.id}`, type: 'Moon', routeId: m.id_orbit || m.id })))
    if (stationsRes.status === 'ok')  combinedLocations.push(...stationsRes.data.map(s => ({ ...s, uniqueId: `station_${s.id}`, type: 'Station', routeId: s.id_orbit || s.id })))
    if (citiesRes.status === 'ok')    combinedLocations.push(...citiesRes.data.map(c => ({ ...c, uniqueId: `city_${c.id}`, type: 'City', routeId: c.id_orbit || c.id })))
    locations.value = combinedLocations
      .filter(l => l.is_available_live === 1)
      .map(l => ({ 
        ...l, 
        displayName: l.type === 'City' && l.planet_name 
          ? `${l.name} (City • ${l.planet_name})` 
          : `${l.name} (${l.type})` 
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (distancesRes.status === 'ok') {
      const matrix = {}
      distancesRes.data.forEach(item => {
        if (!matrix[item.id_orbit_origin]) matrix[item.id_orbit_origin] = {}
        matrix[item.id_orbit_origin][item.id_orbit_destination] = item.distance
      })
      distanceMatrix.value = matrix
    }
  } catch (e) { console.error('Error loading system data', e) }
}

const onStarSystemChange = async () => {
  startingLocationId.value = null
  missions.value = []
  await loadSystemData(selectedStarSystem.value)
}

const onShipChange = () => {
  if (selectedShip.value) customCapacity.value = selectedShip.value.capacity
}

const getLocation = (uniqueId) => locations.value.find(l => l.uniqueId === uniqueId)
const getCommodityName = (id) => commodities.value.find(c => c.id === id)?.name || 'Cargo'
const getMissionTypeLabel = (type) => missionTypes.find(t => t.value === type)?.label || type

const focusSearchInput = () => {
  setTimeout(() => {
    const searchInput = document.querySelector('.p-select-filter') || document.querySelector('.p-dropdown-filter')
    if (searchInput) searchInput.focus()
  }, 50)
}

const removeMission = (index) => missions.value.splice(index, 1)

const routeResult = computed(() => {
  if (!startingLocationId.value || missions.value.length === 0) return { steps: [], maxSCU: 0, totalDistance: 0 }
  const steps = []
  let currentLocationObj = getLocation(startingLocationId.value)
  let currentRouteId = currentLocationObj ? currentLocationObj.routeId : null
  let previousRouteId = currentRouteId
  let totalDistance = 0
  
  let pendingPickups = []
  missions.value.forEach((m, mIdx) => {
    m.cargoItems.forEach((item, iIdx) => {
      pendingPickups.push({
        missionIndex:       mIdx,
        itemIndex:          iIdx,
        locationId:         item.pickupLocationId,
        deliveryLocationId: item.deliveryLocationId,
        scu:                item.scu,
        commodity:          getCommodityName(item.commodityId)
      })
    })
  })
  
  let pendingDeliveries = []
  let currentSCU = 0
  let maxSCU = 0
  
  const getDistance = (fromRouteId, toRouteId) => {
    if (!fromRouteId || !toRouteId || fromRouteId === toRouteId) return 0
    return distanceMatrix.value[fromRouteId]?.[toRouteId] ?? distanceMatrix.value[toRouteId]?.[fromRouteId] ?? 0
  }
  
  let safetyIterations = 0
  
  while ((pendingPickups.length > 0 || pendingDeliveries.length > 0) && safetyIterations < 150) {
    safetyIterations++
    const validOptions = []
    
    // Restricción dura de capacidad
    pendingPickups.forEach(p => {
      if (p.locationId) {
        if (currentSCU + p.scu <= currentShipCapacity.value) {
          validOptions.push({ type: 'pickup', locId: p.locationId, item: p })
        }
      }
    })
    
    pendingDeliveries.forEach(d => {
      if (d.locationId) validOptions.push({ type: 'delivery', locId: d.locationId, item: d })
    })
    
    if (validOptions.length === 0) break
    
    let bestOption = null
    let minCost = Infinity

for (const opt of validOptions) {
      const targetLoc = getLocation(opt.locId)
      if (!targetLoc) continue
      
      let cost = getDistance(currentRouteId, targetLoc.routeId)
      
      // --- 1. PENALIZACIÓN ATMOSFÉRICA ---
      if (targetLoc.type === 'City' || targetLoc.type === 'Planet') {
        cost += 100000; // Penalización alta para obligar a consolidar viajes a la superficie
      } else if (targetLoc.type === 'Outpost') {
        cost += 30000; // Penalización menor
      }
      
      // --- LÓGICA DE EFICIENCIA OPERATIVA ---
      if (cost === 0) {
        // PRIORIDAD ABSOLUTA
        cost -= 999999999 
      } else {
        // Aplicamos la heurística normal SOLO si implica viajar a otro sitio
        if (opt.type === 'delivery') {
          const pendingPickupsForThisDest = pendingPickups.filter(
            p => p.deliveryLocationId === opt.item.locationId && (currentSCU + p.scu <= currentShipCapacity.value)
          )
          if (pendingPickupsForThisDest.length > 0) {
            cost += 99999999 
          }
        }

        if (opt.type === 'pickup') {
           const isDestAlreadyInHold = pendingDeliveries.some(
             d => d.locationId === opt.item.deliveryLocationId
           )
           if (isDestAlreadyInHold) {
             cost -= 50000 
           }
        }
      }
      // --- FIN LÓGICA DE EFICIENCIA ---

      if (cost < minCost || (cost === minCost && opt.type === 'delivery' && bestOption?.type === 'pickup')) {
        minCost = cost
        bestOption = opt
      }
    }
    
    if (!bestOption) break
    
    const bestLoc = getLocation(bestOption.locId)
    previousRouteId = currentRouteId
    currentRouteId = bestLoc.routeId
    
    // Sumamos la distancia real, no los números artificiales de la heurística
    const legDistance = getDistance(previousRouteId, currentRouteId)
    totalDistance += legDistance
    
    if (bestOption.type === 'pickup') {
      currentSCU += bestOption.item.scu
      if (currentSCU > maxSCU) maxSCU = currentSCU
      
      steps.push({
        locationName:     bestLoc.name,
        actionDescription: `Pick up ${bestOption.item.scu} SCU of ${bestOption.item.commodity}`,
        type:             'pickup',
        scuChange:        `+${bestOption.item.scu}`,
        currentVolume:    currentSCU,
        distance:         legDistance,
        missionIndex:     bestOption.item.missionIndex,
        itemIndex:        bestOption.item.itemIndex
      })
      
      pendingDeliveries.push({
        locationId:   bestOption.item.deliveryLocationId,
        scu:          bestOption.item.scu,
        commodity:    bestOption.item.commodity,
        missionIndex: bestOption.item.missionIndex,
        itemIndex:    bestOption.item.itemIndex
      })
      
      pendingPickups = pendingPickups.filter(p => p !== bestOption.item)
      
    } else {
      currentSCU -= bestOption.item.scu
      
      steps.push({
        locationName:       bestLoc.name,
        actionDescription:  `Deliver ${bestOption.item.scu} SCU of ${bestOption.item.commodity}`,
        type:               'delivery',
        scuChange:          `-${bestOption.item.scu}`,
        currentVolume:      currentSCU,
        distance:           legDistance,
        missionIndex:       bestOption.item.missionIndex,
        itemIndex:          bestOption.item.itemIndex
      })
      
      pendingDeliveries = pendingDeliveries.filter(d => d !== bestOption.item)
    }
  }
  
  return { steps, maxSCU, totalDistance }
})

const isStepDone = (step) => {
  const item = missions.value[step.missionIndex]?.cargoItems?.[step.itemIndex]
  if (!item) return false
  return step.type === 'pickup' ? !!item.pickedUp : !!item.delivered
}

const isPickupDoneForStep = (step) => {
  const item = missions.value[step.missionIndex]?.cargoItems?.[step.itemIndex]
  return !!item?.pickedUp
}

const toggleStepDone = (step) => {
  if (step.type === 'pickup') {
    toggleTaskPickup(step.missionIndex, step.itemIndex)
  } else {
    toggleTaskDelivery(step.missionIndex, step.itemIndex)
  }
}

onMounted(async () => {
  await Promise.all([
    fetchStarSystems(),
    fetchCommodities(),
    fetchShips()
  ])
  await loadSystemData(selectedStarSystem.value)
  await loadFlightConfig()
})
</script>
<style scoped>
/* ─── ESTRATEGIA DE COLOR ─── */
/* Usamos color-mix con text-color + content-background para crear elevación
   consistente en ambos modos. En claro: negro sobre blanco = gris claro.
   En oscuro: blanco sobre negro = gris oscuro. Nunca gris sucio. */

/* ─── ROOT ─── */
.planner-root {
  min-height: 100vh;
  background: var(--p-content-background);
  background-image: 
    radial-gradient(ellipse at 20% 0%, color-mix(in srgb, var(--p-primary-color) 6%, transparent) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, color-mix(in srgb, var(--p-amber-500) 3%, transparent) 0%, transparent 50%);
  color: var(--p-text-color);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  position: relative;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.ambient-glow {
  position: fixed;
  top: -50%;
  left: -20%;
  width: 800px;
  height: 800px;
  background: radial-gradient(circle, color-mix(in srgb, var(--p-primary-color) 4%, transparent) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* ─── HEADER ─── */
.hud-header {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 2rem;
  background: color-mix(in srgb, var(--p-text-color) 4%, var(--p-content-background) 96%);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.brand { display: flex; align-items: center; gap: 0.875rem; }
.brand-icon {
  width: 38px; height: 38px;
  background: linear-gradient(135deg, var(--p-primary-color) 0%, color-mix(in srgb, var(--p-primary-color) 80%, black) 100%);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: white;
  box-shadow: 0 0 16px color-mix(in srgb, var(--p-primary-color) 25%, transparent);
}
.brand-icon svg { width: 20px; height: 20px; }
.brand h1 { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.04em; color: var(--p-text-color); margin: 0; line-height: 1; }
.subtitle { font-size: 0.6rem; color: var(--p-text-muted-color); letter-spacing: 0.12em; font-weight: 600; }

.hud-stats { display: flex; gap: 0.625rem; align-items: center; }
.stat-pill {
  background: color-mix(in srgb, var(--p-text-color) 3%, var(--p-content-background) 97%);
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  padding: 0.4rem 0.875rem;
  display: flex; flex-direction: column;
  min-width: 90px;
}
.stat-label { font-size: 0.55rem; color: var(--p-text-muted-color); letter-spacing: 0.1em; font-weight: 700; }
.stat-value { font-size: 0.85rem; font-weight: 700; color: var(--p-text-color); }
.timer-pill { flex-direction: row; align-items: center; gap: 0.625rem; min-width: auto; }
.timer-pill.active { border-color: color-mix(in srgb, var(--p-primary-color) 40%, transparent); box-shadow: 0 0 12px color-mix(in srgb, var(--p-primary-color) 8%, transparent); }
.timer-controls { display: flex; gap: 0.2rem; }
.btn-icon {
  width: 26px; height: 26px; border-radius: 5px; border: none;
  background: color-mix(in srgb, var(--p-text-color) 6%, var(--p-content-background) 94%); color: var(--p-text-muted-color);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; font-size: 0.7rem;
}
.btn-icon:hover { background: color-mix(in srgb, var(--p-text-color) 10%, var(--p-content-background) 90%); color: var(--p-text-color); }

/* ─── ALERT ─── */
.alert-banner {
  position: relative; z-index: 10;
  background: linear-gradient(90deg, color-mix(in srgb, var(--p-red-500) 12%, transparent) 0%, color-mix(in srgb, var(--p-red-500) 4%, transparent) 100%);
  border-left: 3px solid var(--p-red-500);
  border-bottom: 1px solid color-mix(in srgb, var(--p-red-500) 20%, transparent);
  padding: 0.625rem 2rem;
  display: flex; align-items: center; gap: 0.625rem;
  color: var(--p-red-500); font-size: 0.8rem; flex-shrink: 0;
}
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-10px); }

/* ─── MAIN LAYOUT ─── */
.main-layout {
  position: relative; z-index: 5;
  flex: 1;
  display: flex; flex-direction: column;
  padding: 1rem 2rem; gap: 1rem;
  max-width: 1400px; margin: 0 auto; width: 100%;
  min-height: 0;
}

/* ─── PANELS ─── */
.panel {
  background: color-mix(in srgb, var(--p-text-color) 3%, var(--p-content-background) 97%);
  backdrop-filter: blur(16px);
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.panel-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: color-mix(in srgb, var(--p-text-color) 2%, var(--p-content-background) 98%);
  border-bottom: 1px solid var(--p-content-border-color);
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; color: var(--p-text-muted-color);
  flex-shrink: 0;
}
.panel-header i { color: var(--p-primary-color); font-size: 0.85rem; }
.panel-header h2 { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; margin: 0; color: var(--p-text-muted-color); }

.header-left { display: flex; align-items: center; gap: 0.5rem; flex: 1; }
.mission-count {
  background: color-mix(in srgb, var(--p-text-color) 5%, var(--p-content-background) 95%);
  padding: 0.1rem 0.4rem; border-radius: 4px;
  font-size: 0.6rem; color: var(--p-text-secondary-color);
}

.btn-flight-plan {
  display: inline-flex; align-items: center; gap: 0.4rem;
  background: linear-gradient(135deg, var(--p-green-500) 0%, color-mix(in srgb, var(--p-green-500) 80%, black) 100%);
  color: white; border: none;
  padding: 0.4rem 0.875rem; border-radius: 6px;
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--p-green-500) 20%, transparent);
}
.btn-flight-plan:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px color-mix(in srgb, var(--p-green-500) 30%, transparent); }
.btn-flight-plan:disabled { opacity: 0.3; cursor: not-allowed; }
.fp-badge {
  background: rgba(255,255,255,0.2);
  padding: 0.05rem 0.35rem; border-radius: 4px;
  font-size: 0.65rem; font-weight: 800;
}

.panel-body { padding: 1rem 1.25rem; }

/* ─── CONFIG ─── */
.config-body { padding: 1rem 1.25rem; }
.config-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.field-group { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
.field-group label { font-size: 0.55rem; font-weight: 700; letter-spacing: 0.12em; color: var(--p-text-muted-color); }

.dark-select, .dark-input {
  background: color-mix(in srgb, var(--p-text-color) 5%, var(--p-content-background) 95%) !important;
  border: 1px solid var(--p-content-border-color) !important;
  border-radius: 8px !important; color: var(--p-text-color) !important; width: 100%;
}
.dark-select :deep(.p-select-label),
.dark-input :deep(.p-inputnumber-input) { color: var(--p-text-color) !important; font-size: 0.8rem; }
.dark-select :deep(.p-select-dropdown-icon) { color: var(--p-text-muted-color); }

.scu-input-wrapper { width: 100%; min-width: 0; }
.scu-input { width: 100% !important; }
.scu-input :deep(.p-inputnumber-input) { width: 100% !important; }

.capacity-hint { font-size: 0.65rem; color: var(--p-text-secondary-color); font-style: italic; margin-top: 0.15rem; }

.ship-gauge { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--p-content-border-color); }
.gauge-label { display: flex; justify-content: space-between; font-size: 0.6rem; color: var(--p-text-muted-color); margin-bottom: 0.4rem; font-weight: 600; letter-spacing: 0.05em; }
.gauge-track { height: 5px; background: color-mix(in srgb, var(--p-text-color) 8%, var(--p-content-background) 92%); border-radius: 3px; overflow: hidden; }
.gauge-fill { height: 100%; background: linear-gradient(90deg, var(--p-primary-color), color-mix(in srgb, var(--p-primary-color) 70%, white)); border-radius: 3px; transition: width 0.5s ease; box-shadow: 0 0 8px color-mix(in srgb, var(--p-primary-color) 25%, transparent); }
.gauge-fill.danger { background: linear-gradient(90deg, var(--p-red-500), color-mix(in srgb, var(--p-red-500) 70%, white)); box-shadow: 0 0 8px color-mix(in srgb, var(--p-red-500) 25%, transparent); }

/* ─── ROUTE SUMMARY BAR ─── */
.route-summary-bar {
  display: flex; gap: 0.625rem; margin-bottom: 0.875rem;
  align-items: center; flex-wrap: wrap;
}
.summary-pill {
  background: color-mix(in srgb, var(--p-text-color) 3%, var(--p-content-background) 97%);
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  display: flex; flex-direction: column; gap: 0.05rem;
}
.summary-label { font-size: 0.5rem; color: var(--p-text-secondary-color); letter-spacing: 0.1em; font-weight: 700; }
.summary-value { font-size: 0.85rem; font-weight: 800; color: var(--p-text-color); }

.btn-add-inline {
  margin-left: auto;
  padding: 0.4rem 0.875rem;
  font-size: 0.7rem;
}

/* ─── MISSION GRID ─── */
.empty-state.compact { padding: 2rem 1rem; }
.empty-icon {
  width: 48px; height: 48px;
  background: color-mix(in srgb, var(--p-text-color) 6%, var(--p-content-background) 94%); border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 0.875rem; font-size: 1.25rem; color: var(--p-text-muted-color);
}
.empty-icon.large { width: 64px; height: 64px; font-size: 1.75rem; }
.empty-state h3 { font-size: 0.8rem; font-weight: 700; color: var(--p-text-muted-color); margin: 0 0 0.35rem; letter-spacing: 0.05em; }
.empty-state p { font-size: 0.75rem; color: var(--p-text-secondary-color); margin: 0 0 1.25rem; line-height: 1.5; }

.btn-primary {
  display: inline-flex; align-items: center; gap: 0.4rem;
  background: linear-gradient(135deg, var(--p-primary-color) 0%, color-mix(in srgb, var(--p-primary-color) 80%, black) 100%);
  color: white; border: none;
  padding: 0.5rem 1rem; border-radius: 6px;
  font-size: 0.75rem; font-weight: 700;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--p-primary-color) 20%, transparent);
}
.btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 10px color-mix(in srgb, var(--p-primary-color) 30%, transparent); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.mission-grid { display: flex; flex-direction: column; gap: 0.5rem; }

.mission-card-compact {
  display: flex; align-items: center; gap: 0.625rem;
  background: color-mix(in srgb, var(--p-text-color) 2%, var(--p-content-background) 98%);
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  transition: all 0.15s;
  cursor: pointer;
}
.mission-card-compact:hover {
  background: color-mix(in srgb, var(--p-text-color) 5%, var(--p-content-background) 95%);
  border-color: color-mix(in srgb, var(--p-primary-color) 25%, transparent);
  transform: translateX(2px);
}
.mission-card-compact.in-progress {
  border-left: 3px solid var(--p-amber-500);
}
.mission-card-compact.complete {
  border-left: 3px solid var(--p-green-500);
  opacity: 0.65;
}

.mc-main { display: flex; align-items: center; gap: 0.625rem; flex: 1; min-width: 0; }
.mc-icon {
  width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; flex-shrink: 0;
}
.mc-icon.simple { background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); color: var(--p-primary-color); }
.mc-icon.multidrop { background: color-mix(in srgb, var(--p-amber-500) 12%, transparent); color: var(--p-amber-500); }
.mc-icon.multipickup { background: color-mix(in srgb, var(--p-green-500) 12%, transparent); color: var(--p-green-500); }

.mc-info { flex: 1; min-width: 0; }
.mc-title-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.1rem; }
.mc-title-row h4 { font-size: 0.8rem; font-weight: 700; color: var(--p-text-color); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-scu { font-size: 0.85rem; font-weight: 800; color: var(--p-primary-color); white-space: nowrap; }

.mc-meta { display: flex; align-items: center; gap: 0.35rem; font-size: 0.65rem; color: var(--p-text-secondary-color); }
.mc-meta .dot { color: var(--p-text-muted-color); }
.mc-payout { color: var(--p-text-muted-color); }

.mc-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

.mc-progress {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.65rem; font-weight: 700; font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: var(--p-text-muted-color); background: color-mix(in srgb, var(--p-text-color) 5%, var(--p-content-background) 95%);
  padding: 0.2rem 0.5rem; border-radius: 5px; white-space: nowrap;
}
.mc-progress i { font-size: 0.5rem; }
.mc-progress.started { color: var(--p-amber-500); background: color-mix(in srgb, var(--p-amber-500) 12%, transparent); }
.mc-progress.complete { color: var(--p-green-500); background: color-mix(in srgb, var(--p-green-500) 12%, transparent); }

.btn-delete-compact {
  width: 26px; height: 26px; border-radius: 5px; border: none;
  background: transparent; color: var(--p-text-muted-color);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; font-size: 0.75rem;
}
.btn-delete-compact:hover { background: color-mix(in srgb, var(--p-red-500) 12%, transparent); color: var(--p-red-400); }

/* ─── DRAWER ─── */
.flight-plan-drawer :deep(.p-drawer-header) {
  background: color-mix(in srgb, var(--p-text-color) 4%, var(--p-content-background) 96%) !important;
  border-bottom: 1px solid var(--p-content-border-color) !important;
  padding: 1rem 1.25rem !important;
}
.flight-plan-drawer :deep(.p-drawer-content) {
  background: var(--p-content-background) !important;
  padding: 0 !important;
}
.flight-plan-drawer :deep(.p-drawer-mask) {
  background: rgba(0, 0, 0, 0.6) !important;
  backdrop-filter: blur(4px);
}

.drawer-header { display: flex; align-items: center; gap: 0.75rem; color: var(--p-text-color); }
.drawer-header i { color: var(--p-primary-color); font-size: 1.1rem; }
.drawer-header h3 { font-size: 0.9rem; font-weight: 800; margin: 0; letter-spacing: 0.05em; }
.drawer-sub { font-size: 0.65rem; color: var(--p-text-muted-color); letter-spacing: 0.05em; }

.drawer-body { padding: 1.25rem; overflow-y: auto; height: 100%; }

.drawer-timeline { display: flex; flex-direction: column; gap: 0; position: relative; }
/* Línea vertical e indentado eliminados */

.dt-item { display: flex; align-items: flex-start; gap: 0.75rem; position: relative; padding-bottom: 1.25rem; }
.dt-node {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  position: relative; z-index: 2; flex-shrink: 0;
  font-size: 0.75rem;
}
.dt-node.pickup { background: linear-gradient(135deg, var(--p-green-600), var(--p-green-500)); color: white; box-shadow: 0 0 12px color-mix(in srgb, var(--p-green-500) 25%, transparent); }
.dt-node.done { background: linear-gradient(135deg, var(--p-surface-400), var(--p-surface-300)); box-shadow: none; }
.dt-node.delivery { background: linear-gradient(135deg, color-mix(in srgb, var(--p-primary-color) 80%, black), var(--p-primary-color)); color: white; box-shadow: 0 0 12px color-mix(in srgb, var(--p-primary-color) 25%, transparent); }

.dt-card {
  flex: 1;
  background: color-mix(in srgb, var(--p-text-color) 2%, var(--p-content-background) 98%);
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px; padding: 1rem 1.125rem;
  position: relative; overflow: hidden;
  cursor: pointer; transition: all 0.15s;
}
.dt-card:hover:not(.locked) { background: color-mix(in srgb, var(--p-text-color) 5%, var(--p-content-background) 95%); border-color: color-mix(in srgb, var(--p-primary-color) 25%, transparent); }
.dt-card.pickup { border-left: 2px solid var(--p-green-500); }
.dt-card.done { 
  opacity: 0.9; 
  border-left-color: var(--p-green-500) !important; 
  border: 1px solid var(--p-green-500);
  background: color-mix(in srgb, var(--p-green-500) 10%, var(--p-content-background) 90%) !important;
  cursor: pointer; 
}
.dt-card.done .dt-action { text-decoration: line-through; color: var(--p-green-600); }
.dt-card.done .dt-step { background: color-mix(in srgb, var(--p-green-500) 20%, transparent) !important; color: var(--p-green-700) !important; }
.dt-card.locked { 
  cursor: not-allowed; 
  opacity: 0.4; 
  border-left-color: var(--p-red-400) !important;
  border: 1px dashed var(--p-red-400);
  background: color-mix(in srgb, var(--p-red-500) 6%, var(--p-content-background) 94%) !important;
  filter: grayscale(0.4);
}
.dt-card.delivery { border-left: 2px solid var(--p-primary-color); }

/* ─── ACRÍLICO PARA ITEMS ACTIVOS ─── */
.dt-card.active {
  background: color-mix(in srgb, var(--p-primary-color) 8%, var(--p-content-background) 92%);
  border-color: color-mix(in srgb, var(--p-primary-color) 50%, transparent);
  border-left-width: 3px;
  box-shadow: 0 0 16px color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}
.dt-card.active:hover {
  background: color-mix(in srgb, var(--p-primary-color) 14%, var(--p-content-background) 86%);
  border-color: color-mix(in srgb, var(--p-primary-color) 70%, transparent);
  box-shadow: 0 0 24px color-mix(in srgb, var(--p-primary-color) 20%, transparent);
}

.dt-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.5rem; }
.dt-top-info { min-width: 0; }
.dt-step {
  display: inline-block; font-size: 0.55rem; letter-spacing: 0.1em; font-weight: 800;
  padding: 0.1rem 0.4rem; border-radius: 4px; margin-bottom: 0.35rem;
  color: var(--p-text-secondary-color);
  background: color-mix(in srgb, var(--p-text-color) 6%, var(--p-content-background) 94%);
}
.dt-step.pickup { color: var(--p-green-600); background: color-mix(in srgb, var(--p-green-500) 15%, transparent); }
.dt-step.delivery { color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 15%, transparent); }
.dt-top h4 { font-size: 0.95rem; font-weight: 700; color: var(--p-text-color); margin: 0; line-height: 1.3; }
.dt-tag { font-size: 0.7rem !important; font-weight: 700 !important; margin-top: 0.1rem; flex-shrink: 0; }
.dt-tag-done { 
  background: var(--p-green-500) !important; 
  color: white !important; 
  font-size: 0.65rem !important;
  padding: 0.15rem 0.5rem !important;
  border-radius: 4px !important;
}

.dt-action { font-size: 0.75rem; color: var(--p-text-muted-color); margin: 0 0 0.75rem; line-height: 1.5; }
.dt-action.dt-strike { text-decoration: line-through; color: var(--p-text-secondary-color); }

.dt-capacity {
  padding-top: 0.625rem;
  border-top: 1px solid var(--p-content-border-color);
}
.dt-capacity-label { display: block; font-size: 0.55rem; font-weight: 700; letter-spacing: 0.08em; color: var(--p-text-secondary-color); margin-bottom: 0.35rem; }
.dt-capacity-row { display: flex; align-items: center; gap: 0.625rem; }
.dt-bar-bg { flex: 1; height: 3px; background: color-mix(in srgb, var(--p-text-color) 8%, var(--p-content-background) 92%); border-radius: 2px; overflow: hidden; }
.dt-bar-fill { height: 100%; background: linear-gradient(90deg, var(--p-primary-color), color-mix(in srgb, var(--p-primary-color) 70%, white)); border-radius: 2px; transition: width 0.5s ease; }
.dt-bar-fill.danger { background: linear-gradient(90deg, var(--p-red-500), color-mix(in srgb, var(--p-red-500) 70%, white)); }
.dt-cap-text { font-size: 0.65rem; color: var(--p-text-muted-color); font-family: 'JetBrains Mono', 'Fira Code', monospace; white-space: nowrap; }

/* ─── MODAL ─── */
.mission-modal :deep(.p-dialog-header) {
  background: color-mix(in srgb, var(--p-text-color) 4%, var(--p-content-background) 96%) !important;
  border-bottom: 1px solid var(--p-content-border-color) !important;
  color: var(--p-text-color) !important; padding: 1rem 1.5rem !important;
}
.mission-modal :deep(.p-dialog-content) { background: var(--p-content-background) !important; padding: 0 !important; }
.mission-modal :deep(.p-dialog-footer) {
  background: color-mix(in srgb, var(--p-text-color) 4%, var(--p-content-background) 96%) !important;
  border-top: 1px solid var(--p-content-border-color) !important;
  padding: 0.875rem 1.5rem !important;
}

.modal-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.modal-row { display: flex; flex-direction: column; gap: 0.875rem; }
.modal-row.cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.modal-row.cols-3 { display: grid; grid-template-columns: 2fr 1.5fr 1fr; gap: 1rem; }

.modal-section { display: flex; flex-direction: column; gap: 0.875rem; }
.modal-section.boxed {
  background: color-mix(in srgb, var(--p-text-color) 3%, var(--p-content-background) 97%);
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px; padding: 1rem;
}
.modal-section h5 { font-size: 0.65rem; color: var(--p-text-muted-color); letter-spacing: 0.1em; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 0.4rem; }
.modal-section h5 i { color: var(--p-primary-color); }

.section-header { display: flex; justify-content: space-between; align-items: center; }
.btn-text {
  background: none; border: none; color: var(--p-primary-color);
  font-size: 0.7rem; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; gap: 0.3rem;
  padding: 0.2rem 0.4rem; border-radius: 4px; transition: all 0.2s;
}
.btn-text:hover { background: color-mix(in srgb, var(--p-primary-color) 10%, transparent); }

.leg-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 90px 32px;
  gap: 0.625rem;
  align-items: end;
  background: color-mix(in srgb, var(--p-text-color) 2%, var(--p-content-background) 98%);
  padding: 0.5rem 0.625rem;
  border-radius: 8px;
  border: 1px solid var(--p-content-border-color);
}
.leg-field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.leg-field label { font-size: 0.55rem; font-weight: 700; letter-spacing: 0.08em; color: var(--p-text-secondary-color); }
.scu-field { min-width: 70px; }

.btn-icon-danger {
  width: 28px; height: 28px; border-radius: 5px; border: none;
  background: transparent; color: var(--p-text-muted-color);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; font-size: 0.75rem;
}
.btn-icon-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--p-red-500) 12%, transparent); color: var(--p-red-400); }
.btn-icon-danger:disabled { opacity: 0.3; cursor: not-allowed; }

.btn-secondary {
  display: inline-flex; align-items: center; gap: 0.4rem;
  background: color-mix(in srgb, var(--p-text-color) 5%, var(--p-content-background) 95%); color: var(--p-text-muted-color);
  border: 1px solid var(--p-content-border-color);
  padding: 0.5rem 1rem; border-radius: 6px;
  font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-secondary:hover { background: color-mix(in srgb, var(--p-text-color) 8%, var(--p-content-background) 92%); color: var(--p-text-color); }

.modal-footer { display: flex; justify-content: flex-end; gap: 0.625rem; }

/* Distance between steps */
.dt-distance {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
  font-size: 0.65rem;
  color: var(--p-text-muted-color);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  width: 32px;
  justify-content: center;
}
.dt-distance i {
  font-size: 0.55rem;
  color: var(--p-text-secondary-color);
}

/* Text helpers */
.text-gold { color: var(--p-amber-500); }
.text-cyan { color: var(--p-primary-color); }
.text-danger { color: var(--p-red-500); }

/* Responsive */
@media (max-width: 1024px) {
  .modal-row.cols-3 { grid-template-columns: 1fr 1fr; }
  .modal-row.cols-3 > :nth-child(3) { grid-column: 1 / -1; }
}
@media (max-width: 768px) {
  .hud-header { flex-direction: column; gap: 0.875rem; align-items: flex-start; padding: 0.75rem 1rem; }
  .hud-stats { width: 100%; justify-content: space-between; flex-wrap: wrap; }
  .main-layout { padding: 0.75rem 1rem; }
  .modal-row.cols-2, .modal-row.cols-3 { grid-template-columns: 1fr; }
  .modal-row.cols-3 > :nth-child(3) { grid-column: auto; }
  .leg-row { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .scu-field { grid-column: 1; }
  .leg-delete { grid-column: 2; justify-self: end; }
  .route-summary-bar { gap: 0.5rem; }
  .btn-add-inline { margin-left: 0; width: 100%; margin-top: 0.25rem; }
}
</style>