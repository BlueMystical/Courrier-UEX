<!-- src/renderer/views/Settings.vue -->
<template>
  <div class="settings-shell">

    <!-- Header fijo -->
    <div class="settings-header">
      <div class="settings-header-left">
        <span class="settings-header-tag">// SYS_CONFIG</span>
        <h1 class="settings-title">Settings</h1>
      </div>
    </div>

    <!-- Tabs ocupa el resto y scrollea internamente -->
    <Tabs value="general" class="settings-tabview">
      <TabList>
        <Tab value="general"><i class="pi pi-cog"></i> General</Tab>
        <Tab value="theme"><i class="pi pi-palette"></i> Theme</Tab>
        <Tab value="graphics"><i class="pi pi-desktop"></i> Graphics</Tab>
      </TabList>

      <TabPanels class="settings-tabpanels">

        <!-- ── Tab: General ─────────────────────────────── -->
        <TabPanel value="general">
          <div class="tab-scroll">

            <!-- System Tray -->
            <section class="sci-section">
              <div class="sci-section-header">
                <span class="sci-section-num">01</span>
                <span class="sci-section-title">SYSTEM TRAY</span>
              </div>
              <div class="sci-section-body">
                <div class="sci-row">
                  <div class="sci-row-info">
                    <i class="pi pi-window-minimize sci-row-icon"></i>
                    <div>
                      <div class="sci-row-label">Minimize to tray on close</div>
                      <div class="sci-row-desc">Instead of closing, the app hides to the system tray</div>
                    </div>
                  </div>
                  <ToggleSwitch v-model="minimizeToTray" @change="updateTraySettings" />
                </div>
                <div class="sci-row">
                  <div class="sci-row-info">
                    <i class="pi pi-eye-slash sci-row-icon"></i>
                    <div>
                      <div class="sci-row-label">Start minimized in tray</div>
                      <div class="sci-row-desc">Launch the app hidden instead of showing the window</div>
                    </div>
                  </div>
                  <ToggleSwitch v-model="startMinimized" @change="updateTraySettings" />
                </div>
              </div>
            </section>

            <!-- Shortcuts -->
            <section class="sci-section">
              <div class="sci-section-header">
                <span class="sci-section-num">02</span>
                <span class="sci-section-title">GLOBAL KEYBOARD SHORTCUTS</span>
                <span class="sci-section-hint">Click a field and press a key combination</span>
              </div>
              <div class="sci-section-body">
                <div v-for="shortcut in shortcutsList" :key="shortcut.key" class="shortcut-row">
                  <div class="shortcut-row-info">
                    <i :class="[shortcut.icon, 'shortcut-icon']"></i>
                    <div>
                      <div class="shortcut-label">{{ shortcut.label }}</div>
                      <div class="shortcut-route">{{ shortcut.route }}</div>
                    </div>
                  </div>
                  <div class="shortcut-capture"
                    :class="{ 'is-recording': recordingKey === shortcut.key, 'is-conflict': conflicts[shortcut.key] }"
                    @click="startRecording(shortcut.key)" @keydown.prevent="onKeyDown($event, shortcut.key)"
                    tabindex="0">
                    <span class="recording-dot" v-if="recordingKey === shortcut.key"></span>
                    <kbd>{{ editedShortcuts[shortcut.key] || '—' }}</kbd>
                    <Button icon="pi pi-times" text rounded size="small" severity="secondary"
                      @click.stop="clearShortcut(shortcut.key)" v-tooltip.top="'Remove'" />
                  </div>
                  <small class="conflict-msg" v-if="conflicts[shortcut.key]">⚠ Conflict</small>
                </div>

                <div class="shortcut-actions">
                  <Button label="Restore Default Shortcuts" icon="pi pi-refresh" severity="secondary" outlined
                    size="small" @click="resetShortcuts" />
                  <Button label="Save Shortcuts" icon="pi pi-check" severity="success" size="small"
                    :disabled="!shortcutsChanged || Object.values(conflicts).some(Boolean)" @click="saveShortcuts" />
                </div>
              </div>
            </section>

          </div>
        </TabPanel>

        <!-- ── Tab: Theme ────────────────────────────────── -->
        <TabPanel value="theme">
          <div class="tab-scroll">

            <!-- Color Mode -->
            <section class="sci-section">
              <div class="sci-section-header">
                <span class="sci-section-num">01</span>
                <span class="sci-section-title">COLOR MODE</span>
              </div>
              <div class="sci-section-body">
                <div class="sci-row">
                  <div class="sci-row-info">
                    <i class="pi pi-moon sci-row-icon"></i>
                    <div class="sci-row-label">Dark mode</div>
                  </div>
                  <ToggleSwitch v-model="isDarkMode" @change="updateColorMode" />
                </div>
              </div>
            </section>

            <!-- Primary Color -->
            <section class="sci-section">
              <div class="sci-section-header">
                <span class="sci-section-num">02</span>
                <span class="sci-section-title">PRIMARY COLOR</span>
              </div>
              <div class="sci-section-body">
                <div class="color-swatches">
                  <div v-for="color in primaryColors" :key="color.value" class="swatch"
                    :class="{ 'swatch--active': selectedColor === color.value }" :title="color.name"
                    @click="selectColor(color.value)">
                    <div class="swatch-dot" :style="{ backgroundColor: color.hex }">
                      <i v-if="selectedColor === color.value" class="pi pi-check"></i>
                    </div>
                    <span class="swatch-name">{{ color.name }}</span>
                  </div>
                  <!-- Custom -->
                  <div class="swatch" :class="{ 'swatch--active': selectedColor === 'custom' }" title="Custom"
                    @click="openColorPicker">
                    <div class="swatch-dot swatch-dot--custom" :style="{ backgroundColor: customColorHex }">
                      <i v-if="selectedColor === 'custom'" class="pi pi-check"></i>
                      <i v-else class="pi pi-palette"></i>
                    </div>
                    <span class="swatch-name">Custom</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Visual Style — compacto -->
            <section class="sci-section">
              <div class="sci-section-header">
                <span class="sci-section-num">03</span>
                <span class="sci-section-title">VISUAL STYLE</span>
              </div>
              <div class="sci-section-body">
                <div class="preset-list">
                  <div v-for="preset in themePresets" :key="preset.value" class="preset-row"
                    :class="{ 'preset-row--active': selectedPreset === preset.value }"
                    @click="selectPreset(preset.value)">
                    <div class="preset-row-left">
                      <RadioButton :value="preset.value" v-model="selectedPreset" :inputId="preset.value"
                        name="theme-preset" />
                      <i :class="[preset.icon, 'preset-icon']"></i>
                      <div>
                        <div class="preset-name">{{ preset.name }}</div>
                        <div class="preset-desc">{{ preset.description }}</div>
                      </div>
                    </div>
                    <div class="preset-palette">
                      <span v-for="(c, i) in preset.colors" :key="i" class="preset-color-dot"
                        :style="{ backgroundColor: c }"></span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div class="reload-bar" v-if="hasThemeChanges">
              <i class="pi pi-exclamation-triangle"></i>
              <span>Theme changes require restarting the app</span>
              <Button label="Reload now" icon="pi pi-refresh" severity="warning" size="small" outlined
                @click="reloadApp" />
            </div>

          </div>
        </TabPanel>

        <!-- ── Tab: Graphics ─────────────────────────────── -->
        <TabPanel value="graphics">
          <div class="tab-scroll">

            <section class="sci-section">
              <div class="sci-section-header">
                <span class="sci-section-num">01</span>
                <span class="sci-section-title">RENDERING ENGINE</span>
                <span class="sci-section-hint">Graphics engine used by Electron to render the UI</span>
              </div>
              <div class="sci-section-body">
                <div v-for="opt in rendererOptions" :key="opt.value" class="sci-row sci-row--clickable"
                  @click="updateGraphicsSetting('renderer', opt.value)">
                  <div class="sci-row-info">
                    <RadioButton v-model="graphicsSettings.renderer" :value="opt.value" :inputId="opt.value"
                      name="renderer" @change="updateGraphicsSetting('renderer', opt.value)" />
                    <div>
                      <div class="sci-row-label">{{ opt.label }}</div>
                      <div class="sci-row-desc">{{ opt.desc }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="sci-section">
              <div class="sci-section-header">
                <span class="sci-section-num">02</span>
                <span class="sci-section-title">HARDWARE ACCELERATION</span>
              </div>
              <div class="sci-section-body">
                <div class="sci-row">
                  <div class="sci-row-info">
                    <i class="pi pi-bolt sci-row-icon"></i>
                    <div>
                      <div class="sci-row-label">GPU Acceleration</div>
                      <div class="sci-row-desc">Use the GPU to improve graphics performance</div>
                    </div>
                  </div>
                  <ToggleSwitch v-model="graphicsSettings.gpuAcceleration"
                    @change="updateGraphicsSetting('gpuAcceleration', graphicsSettings.gpuAcceleration)" />
                </div>
              </div>
            </section>

            <div class="reload-bar" v-if="hasGraphicsChanges">
              <i class="pi pi-exclamation-triangle"></i>
              <span>Graphics changes require restarting the app</span>
              <Button label="Reload now" icon="pi pi-refresh" severity="warning" size="small" outlined
                @click="reloadApp" />
            </div>

          </div>
        </TabPanel>

      </TabPanels>
    </Tabs>

    <!-- Dialog color picker -->
    <Dialog v-model:visible="showColorPicker" modal header="Custom Color" :style="{ width: '360px' }">
      <div class="color-picker-content">
        <ColorPicker v-model="customColorHex" inline @update:modelValue="onCustomColorChange" />
        <div class="color-preview-bar" :style="{ backgroundColor: customColorHex }">
          <span>{{ customColorHex }}</span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showColorPicker = false" />
        <Button label="Apply" @click="applyCustomColor" />
      </template>
    </Dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import RadioButton from 'primevue/radiobutton';
import ToggleSwitch from 'primevue/toggleswitch';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import ColorPicker from 'primevue/colorpicker';
import Tooltip from 'primevue/tooltip';
import { useNotify } from '@/components/Notificaciones/Notify';
import { shortcutsConfig, defaultShortcuts } from '../../shared/shortcutsConfig'

const vTooltip = Tooltip;
const notify = useNotify();

// --- THEME ---
const isDarkMode = ref(false);
const selectedPreset = ref('aura');
const initialPreset = ref('aura');
const selectedColor = ref('emerald');
const initialColor = ref('emerald');
const customColorHex = ref('#10b981');
const showColorPicker = ref(false);
const hasThemeChanges = ref(false);

// --- GRAPHICS ---
const graphicsSettings = ref({ renderer: 'opengl', gpuAcceleration: true });
const initialGraphicsSettings = ref({ renderer: 'opengl', gpuAcceleration: true });
const hasGraphicsChanges = ref(false);

// --- SYSTEM TRAY ---
const minimizeToTray = ref(false);
const startMinimized = ref(false);

const primaryColors = [
  { name: 'Emerald', value: 'emerald', hex: '#10b981' },
  { name: 'Blue', value: 'blue', hex: '#3b82f6' },
  { name: 'Indigo', value: 'indigo', hex: '#6366f1' },
  { name: 'Purple', value: 'purple', hex: '#a855f7' },
  { name: 'Pink', value: 'pink', hex: '#ec4899' },
  { name: 'Red', value: 'red', hex: '#ef4444' },
  { name: 'Orange', value: 'orange', hex: '#f97316' },
  { name: 'Amber', value: 'amber', hex: '#f59e0b' },
  { name: 'Lime', value: 'lime', hex: '#84cc16' },
  { name: 'Green', value: 'green', hex: '#22c55e' },
  { name: 'Cyan', value: 'cyan', hex: '#06b6d4' },
  { name: 'Sky', value: 'sky', hex: '#0ea5e9' }
];

const themePresets = [
  { name: 'Aura', value: 'aura', description: 'Modern and clean, contemporary design', icon: 'pi pi-sparkles', colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'] },
  { name: 'Material', value: 'material', description: 'Google Material Design, familiar and functional', icon: 'pi pi-android', colors: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'] },
  { name: 'Lara', value: 'lara', description: 'Elegant and professional, ideal for business', icon: 'pi pi-briefcase', colors: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'] },
  { name: 'Nora', value: 'nora', description: 'Alternative modern design with unique style', icon: 'pi pi-palette', colors: ['#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'] }
];

const rendererOptions = [
  { value: 'opengl', label: 'OpenGL', desc: 'Maximum compatibility (recommended)' },
  { value: 'vulkan', label: 'Vulkan', desc: 'High performance (experimental)' },
  { value: 'angle', label: 'ANGLE', desc: 'For systems with problematic drivers' },
];

// --- SHORTCUTS ---
const shortcutsList = shortcutsConfig;
const editedShortcuts = ref({ ...defaultShortcuts });
const savedShortcuts = ref({ ...defaultShortcuts });
const recordingKey = ref(null);
const conflicts = ref({});

const shortcutsChanged = computed(() =>
  JSON.stringify(editedShortcuts.value) !== JSON.stringify(savedShortcuts.value)
);

onMounted(async () => {
  const colorMode = await window.api.Settings.get('settings/theme/color');
  isDarkMode.value = colorMode === 'dark';
  applyDarkClass(colorMode);

  const preset = await window.api.Settings.get('settings/theme/preset');
  selectedPreset.value = preset || 'aura';
  initialPreset.value = preset || 'aura';

  const primaryColor = await window.api.Settings.get('settings/theme/primaryColor');
  selectedColor.value = primaryColor || 'emerald';
  initialColor.value = primaryColor || 'emerald';

  const customColor = await window.api.Settings.get('settings/theme/customColor');
  if (customColor) customColorHex.value = customColor;

  const renderer = await window.api.Settings.get('settings/graphics/renderer');
  const gpuAccel = await window.api.Settings.get('settings/graphics/gpuAcceleration');
  graphicsSettings.value.renderer = renderer || 'opengl';
  graphicsSettings.value.gpuAcceleration = gpuAccel !== undefined ? gpuAccel : true;
  initialGraphicsSettings.value = { ...graphicsSettings.value };

  const loadedShortcuts = await window.api.Shortcuts.get();
  if (loadedShortcuts) {
    editedShortcuts.value = { ...defaultShortcuts, ...loadedShortcuts };
    savedShortcuts.value = { ...editedShortcuts.value };
  }

  minimizeToTray.value = (await window.api.Settings.get('settings/tray/minimizeToTray')) ?? false;
  startMinimized.value = (await window.api.Settings.get('settings/tray/startMinimized')) ?? false;
});

// --- SHORTCUT FUNCTIONS ---
function startRecording(key) { recordingKey.value = key; }

function onKeyDown(event, key) {
  if (recordingKey.value !== key) return;
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  const mainKey = event.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(mainKey)) return;
  parts.push(mainKey.length === 1 ? mainKey.toUpperCase() : mainKey);
  editedShortcuts.value[key] = parts.join('+');
  recordingKey.value = null;
  checkConflicts();
}

function clearShortcut(key) {
  editedShortcuts.value[key] = '';
  recordingKey.value = null;
  checkConflicts();
}

function checkConflicts() {
  const seen = {}, result = {};
  Object.entries(editedShortcuts.value).forEach(([key, val]) => {
    if (!val) return;
    if (seen[val]) { result[key] = true; result[seen[val]] = true; }
    else { seen[val] = key; result[key] = false; }
  });
  conflicts.value = result;
}

async function saveShortcuts() {
  const plain = JSON.parse(JSON.stringify(editedShortcuts.value));
  await window.api.Shortcuts.update(plain);
  savedShortcuts.value = { ...editedShortcuts.value };
  notify.success('Shortcuts saved');
}

function resetShortcuts() {
  editedShortcuts.value = { ...defaultShortcuts };
  checkConflicts();
}

// --- TRAY ---
async function updateTraySettings() {
  await window.api.Settings.set('settings/tray/minimizeToTray', minimizeToTray.value);
  await window.api.Settings.set('settings/tray/startMinimized', startMinimized.value);
}

// --- THEME ---
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

function openColorPicker() { showColorPicker.value = true; }

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
    selectedColor.value !== initialColor.value;
}

function updateGraphicsSetting(key, value) {
  window.api.Settings.set(`settings/graphics/${key}`, value);
  hasGraphicsChanges.value =
    graphicsSettings.value.renderer !== initialGraphicsSettings.value.renderer ||
    graphicsSettings.value.gpuAcceleration !== initialGraphicsSettings.value.gpuAcceleration;
}

function applyDarkClass(mode) {
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('app-dark');
  else root.classList.remove('app-dark');
}

function reloadApp() { window.location.reload(); }
</script>

<style scoped>
/* ── Shell: ocupa toda la altura disponible ─────────── */
.settings-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  /* resta el menubar */
  overflow: hidden;
  padding: 0;
  background-image:
    repeating-linear-gradient(0deg,
      rgba(80, 50, 0, 0.03) 0px, rgba(80, 50, 0, 0.03) 1px,
      transparent 1px, transparent 4px),
    repeating-linear-gradient(90deg,
      rgba(0, 40, 100, 0.012) 0px, rgba(0, 40, 100, 0.012) 1px,
      transparent 1px, transparent 80px);
  background-size: 100% 4px, 80px 100%;
}

:global(.app-dark) .settings-shell {
  background-image:
    repeating-linear-gradient(0deg,
      rgba(255, 200, 80, 0.05) 0px, rgba(255, 200, 80, 0.05) 1px,
      transparent 1px, transparent 4px),
    repeating-linear-gradient(90deg,
      rgba(100, 180, 255, 0.02) 0px, rgba(100, 180, 255, 0.02) 1px,
      transparent 1px, transparent 80px);
}

/* ── Header fijo ────────────────────────────────────── */
.settings-header {
  flex-shrink: 0;
  padding: 1.25rem 2rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  display: flex;
  align-items: flex-end;
  gap: 1rem;
}

.settings-header-tag {
  font-family: monospace;
  font-size: 0.65rem;
  letter-spacing: 0.18em;
  color: var(--p-primary-color);
  opacity: 0.7;
  display: block;
  margin-bottom: 0.25rem;
}

.settings-title {
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

/* ── TabView ocupa el resto, scrollea internamente ──── */
.settings-tabview {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* El panel del tab tiene scroll */
:deep(.settings-tabview .p-tabs-panels) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

:deep(.settings-tabpanels) {
  flex: 1;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
}

:deep(.settings-tabpanels .p-tabpanel) {
  height: 100%;
  overflow: hidden;
}

:deep(.settings-tabview .p-tablist) {
  padding: 0 2rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

:deep(.settings-tabview .p-tab) {
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.04em;
}

/* Área con scroll real */
.tab-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 1.5rem 2rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tab-scroll::-webkit-scrollbar {
  width: 4px;
}

.tab-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.tab-scroll::-webkit-scrollbar-thumb {
  background: var(--p-content-border-color);
  border-radius: 2px;
}

/* ── Sci-Fi sections ────────────────────────────────── */
.sci-section {
  border: 1px solid var(--p-content-border-color);
  border-left: 3px solid var(--p-primary-color);
  background: var(--p-content-background);
}

.sci-section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: color-mix(in srgb, var(--p-primary-color) 4%, transparent);
}

.sci-section-num {
  font-family: monospace;
  font-size: 0.6rem;
  color: var(--p-primary-color);
  letter-spacing: 0.15em;
  opacity: 0.7;
}

.sci-section-title {
  font-family: monospace;
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  color: var(--p-text-color);
  font-weight: 600;
}

.sci-section-hint {
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
  margin-left: auto;
}

.sci-section-body {
  padding: 0.25rem 0;
}

/* ── Rows ───────────────────────────────────────────── */
.sci-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 1rem;
  gap: 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--p-content-border-color) 50%, transparent);
  transition: background 0.15s;
}

.sci-row:last-child {
  border-bottom: none;
}

.sci-row--clickable {
  cursor: pointer;
}

.sci-row--clickable:hover {
  background: var(--p-content-hover-background);
}

.sci-row-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.sci-row-icon {
  color: var(--p-primary-color);
  font-size: 1rem;
  width: 18px;
  flex-shrink: 0;
}

.sci-row-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.sci-row-desc {
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
  margin-top: 1px;
}

/* ── Shortcuts ──────────────────────────────────────── */
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--p-content-border-color) 50%, transparent);
  flex-wrap: wrap;
}

.shortcut-row:last-of-type {
  border-bottom: none;
}

.shortcut-row-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
  min-width: 160px;
}

.shortcut-icon {
  color: var(--p-primary-color);
  font-size: 0.9rem;
  width: 16px;
  flex-shrink: 0;
}

.shortcut-label {
  font-size: 0.85rem;
  font-weight: 500;
}

.shortcut-route {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  font-family: monospace;
}

.shortcut-capture {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  cursor: pointer;
  min-width: 140px;
  transition: border-color 0.15s, background 0.15s;
  outline: none;
}

.shortcut-capture:hover,
.shortcut-capture:focus {
  border-color: var(--p-primary-color);
}

.shortcut-capture.is-recording {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
  animation: pulse-border 1s infinite;
}

.shortcut-capture.is-conflict {
  border-color: var(--p-red-500, #ef4444);
}

.recording-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--p-primary-color);
  flex-shrink: 0;
  animation: blink 0.8s infinite;
}

kbd {
  font-family: monospace;
  font-size: 0.82rem;
  flex: 1;
  color: var(--p-text-color);
}

.conflict-msg {
  color: var(--p-red-500, #ef4444);
  font-size: 0.75rem;
  width: 100%;
  padding-left: 0.5rem;
}

.shortcut-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--p-content-border-color);
}

/* ── Color swatches ─────────────────────────────────── */
.color-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}

.swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: border-color 0.15s, background 0.15s;
}

.swatch:hover {
  background: var(--p-content-hover-background);
}

.swatch--active {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 6%, transparent);
}

.swatch-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
  transition: transform 0.15s;
}

.swatch--active .swatch-dot {
  transform: scale(1.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.swatch-dot i {
  color: white;
  font-size: 0.7rem;
}

.swatch-dot--custom {
  background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red) !important;
}

.swatch-name {
  font-size: 0.6rem;
  color: var(--p-text-muted-color);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

/* ── Preset list (compacto) ─────────────────────────── */
.preset-list {
  display: flex;
  flex-direction: column;
}

.preset-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--p-content-border-color) 50%, transparent);
  cursor: pointer;
  transition: background 0.15s;
  gap: 1rem;
}

.preset-row:last-child {
  border-bottom: none;
}

.preset-row:hover {
  background: var(--p-content-hover-background);
}

.preset-row--active {
  background: color-mix(in srgb, var(--p-primary-color) 6%, transparent);
}

.preset-row-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.preset-icon {
  color: var(--p-primary-color);
  font-size: 1rem;
  width: 18px;
}

.preset-name {
  font-size: 0.875rem;
  font-weight: 500;
}

.preset-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.preset-palette {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.preset-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: block;
}

/* ── Reload bar ─────────────────────────────────────── */
.reload-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
  background: color-mix(in srgb, #f59e0b 6%, transparent);
  border-left: 3px solid #f59e0b;
  font-size: 0.85rem;
  color: var(--p-text-color);
}

.reload-bar i {
  color: #f59e0b;
  flex-shrink: 0;
}

.reload-bar span {
  flex: 1;
}

/* ── Color picker dialog ────────────────────────────── */
.color-picker-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0;
}

.color-preview-bar {
  height: 48px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--p-content-border-color);
}

.color-preview-bar span {
  color: white;
  font-family: monospace;
  font-weight: 600;
  font-size: 1rem;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

/* ── Animaciones ────────────────────────────────────── */
@keyframes pulse-border {

  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--p-primary-color) 30%, transparent);
  }

  50% {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-primary-color) 30%, transparent);
  }
}

@keyframes blink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>