<!-- src/renderer/views/Settings.vue -->
<template>
  <div class="settings-container">
    <h1>Settings</h1>

    <TabView>
      <!-- Tab: General -->
      <TabPanel>
        <template #header>
          <i class="pi pi-cog mr-2"></i>
          <span>&nbsp;General</span>
        </template>
        <div class="tab-content">

          <!-- System Tray -->
          <Panel header="System Tray" class="settings-panel">
            <p class="panel-description">
              Control how the application behaves when minimized or closed.
            </p>
            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-label">
                  <i class="pi pi-window-minimize"></i>
                  <span>Minimize to tray on close</span>
                </div>
                <p class="setting-description">Instead of closing, the app will hide to the system tray</p>
              </div>
              <ToggleSwitch v-model="minimizeToTray" @change="updateTraySettings" />
            </div>
            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-label">
                  <i class="pi pi-eye-slash"></i>
                  <span>Start minimized in tray</span>
                </div>
                <p class="setting-description">Launch the app hidden in the system tray instead of showing the window</p>
              </div>
              <ToggleSwitch v-model="startMinimized" @change="updateTraySettings" />
            </div>
          </Panel>

          <!-- Global Keyboard Shortcuts -->
          <Panel header="Global Keyboard Shortcuts" class="settings-panel">
            <p class="panel-description">
              These shortcuts work even when the app is minimized or hidden in the system tray.
              Click a field and press the desired key combination.
            </p>

            <div class="shortcuts-grid">
              <div v-for="shortcut in shortcutsList" :key="shortcut.key" class="shortcut-item">
                <div class="shortcut-info">
                  <i :class="shortcut.icon"></i>
                  <div>
                    <span class="shortcut-label">{{ shortcut.label }}</span>
                    <span class="shortcut-route">{{ shortcut.route }}</span>
                  </div>
                </div>
                <div class="shortcut-input-wrapper"
                  :class="{ 'recording': recordingKey === shortcut.key, 'conflict': conflicts[shortcut.key] }"
                  @click="startRecording(shortcut.key)"
                  @keydown.prevent="onKeyDown($event, shortcut.key)"
                  tabindex="0">
                  <i class="pi pi-circle-fill recording-dot" v-if="recordingKey === shortcut.key"></i>
                  <kbd>{{ editedShortcuts[shortcut.key] || 'Not assigned' }}</kbd>
                  <Button icon="pi pi-times" text rounded size="small" severity="secondary"
                    @click.stop="clearShortcut(shortcut.key)" v-tooltip.top="'Remove shortcut'" />
                </div>
                <small class="conflict-msg" v-if="conflicts[shortcut.key]">
                  ⚠️ Conflict with another shortcut
                </small>
              </div>
            </div>

            <div class="shortcuts-actions">
              <Button label="Restore Defaults" icon="pi pi-refresh" severity="secondary" outlined
                @click="resetShortcuts" />
              <Button label="Save Shortcuts" icon="pi pi-check" severity="success"
                :disabled="!shortcutsChanged || Object.values(conflicts).some(Boolean)"
                @click="saveShortcuts" />
            </div>
          </Panel>

        </div>
      </TabPanel>

      <!-- Tab: Theme -->
      <TabPanel>
        <template #header>
          <i class="pi pi-palette mr-2"></i>
          <span>&nbsp;Theme</span>
        </template>
        <div class="tab-content">

          <Panel header="Color Mode" class="settings-panel">
            <div class="setting-item">
              <div class="setting-label">
                <i class="pi pi-moon"></i>
                <span>Dark mode</span>
              </div>
              <ToggleSwitch v-model="isDarkMode" @change="updateColorMode" />
            </div>
          </Panel>

          <Panel header="Primary Color" class="settings-panel">
            <p class="panel-description">Select the main interface color</p>
            <div class="color-selector-grid">
              <div v-for="color in primaryColors" :key="color.value"
                :class="['color-selector-item', { 'selected': selectedColor === color.value }]"
                @click="selectColor(color.value)" :title="color.name">
                <div class="color-preview" :style="{ backgroundColor: color.hex }">
                  <i v-if="selectedColor === color.value" class="pi pi-check"></i>
                </div>
              </div>
              <div :class="['color-selector-item', { 'selected': selectedColor === 'custom' }]"
                @click="openColorPicker" title="Custom">
                <div class="color-preview color-preview-custom" :style="{ backgroundColor: customColorHex }">
                  <i v-if="selectedColor === 'custom'" class="pi pi-check"></i>
                  <i v-else class="pi pi-palette custom-icon"></i>
                </div>
              </div>
            </div>
          </Panel>

          <Dialog v-model:visible="showColorPicker" modal header="Select custom color" :style="{ width: '400px' }">
            <div class="color-picker-content">
              <ColorPicker v-model="customColorHex" inline @update:modelValue="onCustomColorChange" />
              <div class="color-preview-large" :style="{ backgroundColor: customColorHex }">
                <span class="color-hex">{{ customColorHex }}</span>
              </div>
            </div>
            <template #footer>
              <Button label="Cancel" text @click="showColorPicker = false" />
              <Button label="Apply" @click="applyCustomColor" />
            </template>
          </Dialog>

          <Panel header="Visual Style" class="settings-panel">
            <p class="panel-description">Select the interface design preset</p>
            <div class="theme-grid">
              <Card v-for="preset in themePresets" :key="preset.value"
                :class="['theme-card', { 'selected': selectedPreset === preset.value }]"
                @click="selectPreset(preset.value)">
                <template #header>
                  <div class="card-header-content">
                    <div class="icon-radio-group">
                      <i :class="preset.icon"></i>
                      <RadioButton :value="preset.value" v-model="selectedPreset" :inputId="preset.value"
                        name="theme-preset" />
                    </div>
                    <Badge v-if="selectedPreset === preset.value" value="Active" severity="success" />
                  </div>
                </template>
                <template #title>{{ preset.name }}</template>
                <template #content>
                  <p class="theme-description">{{ preset.description }}</p>
                  <div class="color-palette">
                    <Tag v-for="(color, idx) in preset.colors" :key="idx"
                      :style="{ backgroundColor: color, border: 'none' }" class="color-tag"></Tag>
                  </div>
                </template>
              </Card>
            </div>
          </Panel>

          <Message v-if="hasThemeChanges" severity="warn" class="reload-message">
            <div class="message-content">
              <span>Theme changes require restarting the application</span>
              <Button label="Reload now" icon="pi pi-refresh" severity="warning" size="small" @click="reloadApp" />
            </div>
          </Message>
        </div>
      </TabPanel>

      <!-- Tab: Graphics -->
      <TabPanel>
        <template #header>
          <i class="pi pi-desktop mr-2"></i>
          <span>&nbsp;Graphics</span>
        </template>
        <div class="tab-content">

          <Panel header="Rendering Engine" class="settings-panel">
            <div class="setting-group">
              <label class="setting-label-main">Chromium Renderer</label>
              <p class="setting-help">Select the graphics engine Electron will use to render the interface</p>
              <div class="radio-group">
                <div class="radio-item">
                  <RadioButton v-model="graphicsSettings.renderer" inputId="opengl" value="opengl"
                    @change="updateGraphicsSetting('renderer', 'opengl')" />
                  <label for="opengl" class="radio-label">
                    <span class="radio-title">OpenGL</span>
                    <span class="radio-description">Maximum compatibility (recommended)</span>
                  </label>
                </div>
                <div class="radio-item">
                  <RadioButton v-model="graphicsSettings.renderer" inputId="vulkan" value="vulkan"
                    @change="updateGraphicsSetting('renderer', 'vulkan')" />
                  <label for="vulkan" class="radio-label">
                    <span class="radio-title">Vulkan</span>
                    <span class="radio-description">High performance (experimental)</span>
                  </label>
                </div>
                <div class="radio-item">
                  <RadioButton v-model="graphicsSettings.renderer" inputId="angle" value="angle"
                    @change="updateGraphicsSetting('renderer', 'angle')" />
                  <label for="angle" class="radio-label">
                    <span class="radio-title">ANGLE</span>
                    <span class="radio-description">For systems with problematic drivers</span>
                  </label>
                </div>
              </div>
            </div>
          </Panel>

          <Panel header="Hardware Acceleration" class="settings-panel">
            <div class="setting-item">
              <div class="setting-info">
                <div class="setting-label">
                  <i class="pi pi-bolt"></i>
                  <span>GPU Acceleration</span>
                </div>
                <p class="setting-description">Use the GPU to improve graphics performance</p>
              </div>
              <ToggleSwitch v-model="graphicsSettings.gpuAcceleration"
                @change="updateGraphicsSetting('gpuAcceleration', graphicsSettings.gpuAcceleration)" />
            </div>
          </Panel>

          <Message v-if="hasGraphicsChanges" severity="warn" class="reload-message">
            <div class="message-content">
              <span>Graphics changes require restarting the application</span>
              <Button label="Reload now" icon="pi pi-refresh" severity="warning" size="small" @click="reloadApp" />
            </div>
          </Message>
        </div>
      </TabPanel>

    </TabView>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import Panel from 'primevue/panel';
import Card from 'primevue/card';
import RadioButton from 'primevue/radiobutton';
import ToggleSwitch from 'primevue/toggleswitch';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import Badge from 'primevue/badge';
import Dialog from 'primevue/dialog';
import ColorPicker from 'primevue/colorpicker';
import Tooltip from 'primevue/tooltip';
import { useNotify } from '@/components/Notificaciones/Notify';
import { shortcutsConfig, defaultShortcuts } from '../../shared/shortcutsConfig'

const vTooltip = Tooltip;
const notify = useNotify();

// --- THEME ---
const isDarkMode       = ref(false);
const selectedPreset   = ref('aura');
const initialPreset    = ref('aura');
const selectedColor    = ref('emerald');
const initialColor     = ref('emerald');
const customColorHex   = ref('#10b981');
const showColorPicker  = ref(false);
const hasThemeChanges  = ref(false);

// --- GRAPHICS ---
const graphicsSettings        = ref({ renderer: 'opengl', gpuAcceleration: true });
const initialGraphicsSettings = ref({ renderer: 'opengl', gpuAcceleration: true });
const hasGraphicsChanges      = ref(false);

// --- SYSTEM TRAY ---
const minimizeToTray = ref(false);
const startMinimized = ref(false);

const primaryColors = [
  { name: 'Emerald', value: 'emerald', hex: '#10b981' },
  { name: 'Blue',    value: 'blue',    hex: '#3b82f6' },
  { name: 'Indigo',  value: 'indigo',  hex: '#6366f1' },
  { name: 'Purple',  value: 'purple',  hex: '#a855f7' },
  { name: 'Pink',    value: 'pink',    hex: '#ec4899' },
  { name: 'Red',     value: 'red',     hex: '#ef4444' },
  { name: 'Orange',  value: 'orange',  hex: '#f97316' },
  { name: 'Amber',   value: 'amber',   hex: '#f59e0b' },
  { name: 'Lime',    value: 'lime',    hex: '#84cc16' },
  { name: 'Green',   value: 'green',   hex: '#22c55e' },
  { name: 'Cyan',    value: 'cyan',    hex: '#06b6d4' },
  { name: 'Sky',     value: 'sky',     hex: '#0ea5e9' }
];

const themePresets = [
  { name: 'Aura',     value: 'aura',     description: 'Modern and clean, contemporary design',           icon: 'pi pi-sparkles', colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'] },
  { name: 'Material', value: 'material', description: 'Google Material Design, familiar and functional', icon: 'pi pi-android',  colors: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'] },
  { name: 'Lara',     value: 'lara',     description: 'Elegant and professional, ideal for business',    icon: 'pi pi-briefcase',colors: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'] },
  { name: 'Nora',     value: 'nora',     description: 'Alternative modern design with unique style',     icon: 'pi pi-palette',  colors: ['#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'] }
];

// --- SHORTCUTS ---
const shortcutsList   = shortcutsConfig
const editedShortcuts = ref({ ...defaultShortcuts })
const savedShortcuts  = ref({ ...defaultShortcuts })
const recordingKey    = ref(null)
const conflicts       = ref({})

const shortcutsChanged = computed(() =>
  JSON.stringify(editedShortcuts.value) !== JSON.stringify(savedShortcuts.value)
)

onMounted(async () => {
  // Theme
  const colorMode = await window.api.Settings.get('settings/theme/color');
  isDarkMode.value = colorMode === 'dark';
  applyDarkClass(colorMode);

  const preset = await window.api.Settings.get('settings/theme/preset');
  selectedPreset.value = preset || 'aura';
  initialPreset.value  = preset || 'aura';

  const primaryColor = await window.api.Settings.get('settings/theme/primaryColor');
  selectedColor.value = primaryColor || 'emerald';
  initialColor.value  = primaryColor || 'emerald';

  const customColor = await window.api.Settings.get('settings/theme/customColor');
  if (customColor) customColorHex.value = customColor;

  // Graphics
  const renderer = await window.api.Settings.get('settings/graphics/renderer');
  const gpuAccel  = await window.api.Settings.get('settings/graphics/gpuAcceleration');
  graphicsSettings.value.renderer        = renderer || 'opengl';
  graphicsSettings.value.gpuAcceleration = gpuAccel !== undefined ? gpuAccel : true;
  initialGraphicsSettings.value = { ...graphicsSettings.value };

  // Shortcuts
  const loadedShortcuts = await window.api.Shortcuts.get()
  if (loadedShortcuts) {
    editedShortcuts.value = { ...defaultShortcuts, ...loadedShortcuts }
    savedShortcuts.value  = { ...editedShortcuts.value }
  }

  // System Tray
  minimizeToTray.value = (await window.api.Settings.get('settings/tray/minimizeToTray')) ?? false;
  startMinimized.value  = (await window.api.Settings.get('settings/tray/startMinimized'))  ?? false;
});

// --- SHORTCUT FUNCTIONS ---
function startRecording(key) { recordingKey.value = key }

function onKeyDown(event, key) {
  if (recordingKey.value !== key) return
  const parts = []
  if (event.ctrlKey)  parts.push('Ctrl')
  if (event.altKey)   parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey)  parts.push('Meta')
  const mainKey = event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(mainKey)) return
  parts.push(mainKey.length === 1 ? mainKey.toUpperCase() : mainKey)
  editedShortcuts.value[key] = parts.join('+')
  recordingKey.value = null
  checkConflicts()
}

function clearShortcut(key) {
  editedShortcuts.value[key] = ''
  recordingKey.value = null
  checkConflicts()
}

function checkConflicts() {
  const seen = {}
  const result = {}
  Object.entries(editedShortcuts.value).forEach(([key, val]) => {
    if (!val) return
    if (seen[val]) { result[key] = true; result[seen[val]] = true }
    else           { seen[val] = key;    result[key] = false }
  })
  conflicts.value = result
}

async function saveShortcuts() {
  // FIX: Vue reactive proxies can't cross IPC — serialize to plain object first
  const plainShortcuts = JSON.parse(JSON.stringify(editedShortcuts.value))
  await window.api.Shortcuts.update(plainShortcuts)
  savedShortcuts.value = { ...editedShortcuts.value }
  notify.success('Shortcuts saved and updated')
}

function resetShortcuts() {
  editedShortcuts.value = { ...defaultShortcuts }
  checkConflicts()
}

// --- TRAY FUNCTIONS ---
async function updateTraySettings() {
  await window.api.Settings.set('settings/tray/minimizeToTray', minimizeToTray.value)
  await window.api.Settings.set('settings/tray/startMinimized',  startMinimized.value)
}

// --- THEME FUNCTIONS ---
function updateColorMode() {
  const mode = isDarkMode.value ? 'dark' : 'light';
  window.api.Settings.set('settings/theme/color', mode);
  applyDarkClass(mode);
}

function selectPreset(preset) {
  selectedPreset.value = preset;
  window.api.Settings.set('settings/theme/preset', preset);
  checkThemeChanges();
}

function selectColor(color) {
  selectedColor.value = color;
  window.api.Settings.set('settings/theme/primaryColor', color);
  checkThemeChanges();
}

function openColorPicker() { showColorPicker.value = true }

function onCustomColorChange(value) {
  if (!value.startsWith('#')) customColorHex.value = '#' + value;
}

function applyCustomColor() {
  window.api.Settings.set('settings/theme/customColor', customColorHex.value);
  selectColor('custom');
  showColorPicker.value = false;
}

function checkThemeChanges() {
  hasThemeChanges.value =
    selectedPreset.value !== initialPreset.value ||
    selectedColor.value  !== initialColor.value;
}

function updateGraphicsSetting(key, value) {
  window.api.Settings.set(`settings/graphics/${key}`, value);
  hasGraphicsChanges.value =
    graphicsSettings.value.renderer        !== initialGraphicsSettings.value.renderer ||
    graphicsSettings.value.gpuAcceleration !== initialGraphicsSettings.value.gpuAcceleration;
}

function applyDarkClass(mode) {
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('app-dark');
  else root.classList.remove('app-dark');
}

function reloadApp() { window.location.reload() }
</script>

<style scoped>
.settings-container { max-width: 1000px; margin: 0 auto; padding: 2rem; }

h1 { font-size: 2rem; font-weight: 700; margin-bottom: 2rem; }

.tab-content { padding-top: 1rem; }
.settings-panel { margin-bottom: 1.5rem; }

.panel-description { margin: -0.5rem 0 1.5rem 0; color: var(--p-text-muted-color); font-size: 0.9rem; }

.setting-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; gap: 1rem; border-bottom: 1px solid var(--p-content-border-color); }
.setting-item:last-child { border-bottom: none; }

.setting-info { flex: 1; }

.setting-label { display: flex; align-items: center; gap: 0.75rem; font-weight: 500; margin-bottom: 0.25rem; }
.setting-label i { font-size: 1.25rem; color: var(--p-primary-color); }

.setting-description { font-size: 0.875rem; color: var(--p-text-muted-color); margin: 0; }

.setting-group { padding: 0.5rem 0; }
.setting-label-main { font-weight: 600; font-size: 1rem; display: block; margin-bottom: 0.5rem; }
.setting-help { font-size: 0.875rem; color: var(--p-text-muted-color); margin: 0 0 1rem 0; }

.radio-group { display: flex; flex-direction: column; gap: 1rem; }

.radio-item {
  display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius); cursor: pointer; transition: all 0.2s;
}
.radio-item:hover { background: var(--p-highlight-background); }

.radio-label { flex: 1; cursor: pointer; display: flex; flex-direction: column; gap: 0.25rem; }
.radio-title { font-weight: 500; font-size: 0.95rem; }
.radio-description { font-size: 0.85rem; color: var(--p-text-muted-color); }

.color-selector-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }

.color-selector-item {
  cursor: pointer; padding: 0.25rem; border-radius: 4px; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.color-selector-item:hover { background: var(--p-highlight-background); transform: scale(1.1); }

.color-preview {
  width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; transition: all 0.2s; border: 2px solid transparent; position: relative;
}
.color-selector-item.selected .color-preview {
  border-color: var(--p-content-border-color);
  box-shadow: 0 0 0 2px var(--p-content-background), 0 0 0 4px currentColor;
}
.color-preview i { color: white; font-size: 0.875rem; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }

.color-preview-custom {
  background: linear-gradient(135deg,
    #ff0000 0%, #ff7f00 16.66%, #ffff00 33.33%,
    #00ff00 50%, #0000ff 66.66%, #8b00ff 83.33%, #ff0000 100%) !important;
  position: relative;
}
.color-preview-custom::before { content: ''; position: absolute; inset: 3px; background: var(--p-content-background); border-radius: 50%; }

.custom-icon { position: relative; z-index: 1; color: var(--p-text-color) !important; text-shadow: none !important; font-size: 0.75rem; }

.color-picker-content { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0; }

.color-preview-large {
  width: 100%; height: 80px; border-radius: var(--p-content-border-radius);
  display: flex; align-items: center; justify-content: center; border: 1px solid var(--p-content-border-color);
}
.color-hex { color: white; font-weight: 600; font-size: 1.25rem; text-shadow: 0 1px 3px rgba(0,0,0,0.5); font-family: monospace; }

.theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }

.theme-card { cursor: pointer; transition: all 0.2s; position: relative; }
.theme-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
.theme-card.selected { box-shadow: 0 0 0 2px var(--p-primary-color); transform: translateY(-2px); }

.card-header-content { display: flex; justify-content: space-between; align-items: center; padding: 1rem; }
.icon-radio-group { display: flex; align-items: center; gap: 1rem; }
.icon-radio-group i { font-size: 1.75rem; color: var(--p-text-color); }

.theme-card :deep(.p-card-title) { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; }

.theme-description { font-size: 0.875rem; color: var(--p-text-muted-color); margin-bottom: 1rem; line-height: 1.5; }

.color-palette { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.color-tag { width: 32px; height: 32px; border-radius: 50%; padding: 0; }

.reload-message { margin-top: 2rem; }
.message-content { display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 1rem; }
.message-content span { flex: 1; }

/* SHORTCUTS */
.shortcuts-grid { display: flex; flex-direction: column; gap: 0.75rem; }
.shortcut-item { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.shortcut-info { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 180px; }
.shortcut-info i { font-size: 1.1rem; color: var(--p-primary-color); width: 20px; text-align: center; }
.shortcut-label { display: block; font-weight: 500; font-size: 0.95rem; }
.shortcut-route { display: block; font-size: 0.75rem; color: var(--p-text-muted-color); font-family: monospace; }

.shortcut-input-wrapper {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem;
  border: 2px solid var(--p-content-border-color); border-radius: 8px;
  cursor: pointer; min-width: 160px; transition: all 0.2s; outline: none;
}
.shortcut-input-wrapper:hover,
.shortcut-input-wrapper:focus { border-color: var(--p-primary-color); }
.shortcut-input-wrapper.recording { border-color: var(--p-primary-color); background: var(--p-highlight-background); animation: pulse 1s infinite; }
.shortcut-input-wrapper.conflict { border-color: var(--p-red-500); }

.recording-dot { color: var(--p-primary-color); font-size: 0.5rem; animation: blink 1s infinite; }

kbd { font-family: monospace; font-size: 0.9rem; flex: 1; }

.conflict-msg { color: var(--p-red-500); font-size: 0.8rem; width: 100%; padding-left: 1rem; }

.shortcuts-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--p-primary-color) 30%, transparent); }
  50%       { box-shadow: 0 0 0 4px color-mix(in srgb, var(--p-primary-color) 30%, transparent); }
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
</style>
