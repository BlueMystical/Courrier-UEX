<!-- src/renderer/components/ErrorNotification.vue -->
<template>
  <div :class="['error-notification-container', positionClass]">
    <TransitionGroup name="error-notification">
      <div 
        v-for="item in notifications" 
        :key="item._t"
        class="error-notification-toast"
      >
        <div class="error-accent-bar"></div>
        <div class="error-content">
          <div class="error-header">
            <!-- SVG de bug personalizado -->
            <svg class="error-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>
            </svg>
            <div class="error-text">
              <span class="error-title">{{ item.summary }}</span>
              <p class="error-message">{{ item.detail }}</p>
            </div>
            <div class="error-buttons">
                <button class="error-close" @click="removeNotification(item)">
                <i class="pi pi-times"></i>
              </button>
              <button 
                class="error-copy-btn"
                @click="copyErrorToClipboard(item)"
                :title="copiedId === item._t ? 'Copiado!' : 'Copiar error como JSON'"
              >
                <i :class="copiedId === item._t ? 'pi pi-check' : 'pi pi-copy'"></i>
              </button>
              
            </div>
          </div>
          
          <!-- Stacktrace colapsable -->
          <div v-if="item.stacktrace" class="stacktrace-section">
            <button 
              class="stacktrace-toggle"
              @click="toggleStacktrace(item._t)"
            >
              <i :class="isExpanded(item._t) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"></i>
              <span>{{ isExpanded(item._t) ? 'Ocultar' : 'Ver' }} detalles técnicos</span>
            </button>
            
            <Transition name="stacktrace">
              <div v-if="isExpanded(item._t)" class="stacktrace-content">
                <pre>{{ item.stacktrace }}</pre>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { toastBus } from './Notify';

const props = defineProps({
  position: {
    type: String,
    default: 'top-right',
    validator: (value) => {
      return ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center'].includes(value);
    }
  }
});

const notifications = ref([]);
const expandedStacktraces = ref(new Set());
const copiedId = ref(null);

const positionClass = computed(() => {
  return `error-notification-${props.position}`;
});

const isExpanded = (id) => {
  return expandedStacktraces.value.has(id);
};

const toggleStacktrace = (id) => {
  if (expandedStacktraces.value.has(id)) {
    expandedStacktraces.value.delete(id);
  } else {
    expandedStacktraces.value.add(id);
  }
};

const copyErrorToClipboard = async (item) => {
  const errorData = {
    timestamp: new Date(item._t).toISOString(),
    error: item.summary,
    message: item.detail,
    stacktrace: item.stacktrace || 'No stacktrace available'
  };
  
  try {
    await navigator.clipboard.writeText(JSON.stringify(errorData, null, 2));
    copiedId.value = item._t;
    
    // Reset después de 2 segundos
    setTimeout(() => {
      copiedId.value = null;
    }, 2000);
  } catch (err) {
    console.error('Error al copiar al portapapeles:', err);
  }
};

const removeNotification = (item) => {
  const index = notifications.value.findIndex(n => n._t === item._t);
  if (index > -1) {
    expandedStacktraces.value.delete(item._t);
    notifications.value.splice(index, 1);
  }
};

watch(
  () => toastBus.data,
  (value) => {
    if (!value) return;
    
    if (value.clear) {
      notifications.value = [];
      expandedStacktraces.value.clear();
    } else if (value.severity === 'error-notification') {
      notifications.value.push(value);
      
      if (value.life && value.life > 0) {
        setTimeout(() => {
          removeNotification(value);
        }, value.life);
      }
    }
  }
);
</script>

<style scoped>
.error-notification-container {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

/* Posiciones */
.error-notification-top-right {
  top: 70px;
  right: 20px;
}

.error-notification-top-left {
  top: 70px;
  left: 20px;
}

.error-notification-top-center {
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
}

.error-notification-bottom-right {
  bottom: 20px;
  right: 20px;
}

.error-notification-bottom-left {
  bottom: 20px;
  left: 20px;
}

.error-notification-bottom-center {
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
}

.error-notification-toast {
  display: flex;
  background-color: #dc2626;
  border-radius: 6px;
  overflow: hidden;
  min-width: 400px;
  max-width: 550px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}

.error-accent-bar {
  width: 6px;
  background-color: #7f1d1d;
  flex-shrink: 0;
}

.error-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  color: white;
}

.error-header {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  gap: 12px;
}

.error-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  margin-top: 2px;
}

.error-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.error-title {
  font-weight: 600;
  font-size: 16px;
  line-height: 1.3;
}

.error-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  opacity: 0.95;
}

/* Contenedor de botones en columna */
.error-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.error-copy-btn,
.error-close {
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
  width: 28px;
  height: 28px;
}

.error-copy-btn:hover,
.error-close:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.error-copy-btn i,
.error-close i {
  font-size: 14px;
}

/* Feedback visual cuando se copia */
.error-copy-btn:active {
  background-color: rgba(34, 197, 94, 0.3);
}

/* Sección de stacktrace */
.stacktrace-section {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0;
}

.stacktrace-toggle {
  width: 100%;
  background: rgba(0, 0, 0, 0.2);
  border: none;
  color: white;
  cursor: pointer;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  transition: background-color 0.2s;
}

.stacktrace-toggle:hover {
  background: rgba(0, 0, 0, 0.3);
}

.stacktrace-toggle i {
  font-size: 12px;
}

.stacktrace-content {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px 16px;
  max-height: 300px;
  overflow-y: auto;
}

.stacktrace-content pre {
  margin: 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #fecaca;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* Scrollbar personalizado para el stacktrace */
.stacktrace-content::-webkit-scrollbar {
  width: 8px;
}

.stacktrace-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
}

.stacktrace-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

.stacktrace-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}

/* Animaciones del toast */
.error-notification-enter-active,
.error-notification-leave-active {
  transition: all 0.3s ease;
}

.error-notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.error-notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

/* Animaciones del stacktrace */
.stacktrace-enter-active,
.stacktrace-leave-active {
  transition: all 0.3s ease;
}

.stacktrace-enter-from,
.stacktrace-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.stacktrace-enter-to,
.stacktrace-leave-from {
  max-height: 300px;
  opacity: 1;
}
</style>