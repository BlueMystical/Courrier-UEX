<!-- src/renderer/components/ProgressNotifications.vue -->
<template>
  <Toast position="top-center" group="progress" @close="onClose">
    <template #container="{ message, closeCallback }">
      <div class="progress-toast-content">
        <div class="progress-toast-header">
          <i :class="getIcon(message)" class="progress-toast-icon"></i>
          <div class="progress-toast-text">
            <span class="progress-toast-title">{{ message.summary }}</span>
            <p class="progress-toast-message">{{ message.detail }}</p>
          </div>
          <button 
            v-if="message.data?.status === 'completed' || message.data?.status === 'error'"
            class="progress-toast-close" 
            @click="closeCallback"
          >
            <i class="pi pi-times"></i>
          </button>
        </div>
        
        <!-- Barra de progreso -->
        <div v-if="message.data?.status === 'active'" class="progress-toast-bar-container">
          <ProgressBar 
            :value="message.data?.progress || 0" 
            :show-value="false"
            :style="{ height: '6px' }"
          />
          <span class="progress-toast-percentage">{{ Math.round(message.data?.progress || 0) }}%</span>
        </div>
      </div>
    </template>
  </Toast>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import Toast from 'primevue/toast';
import ProgressBar from 'primevue/progressbar';
import { progressNotificationsBus } from './Notify';

const toast = useToast();
const activeToasts = ref(new Map());

const getIcon = (message) => {
  const status = message.data?.status;
  if (status === 'completed') return 'pi pi-check-circle';
  if (status === 'error') return 'pi pi-times-circle';
  return 'pi pi-spin pi-spinner';
};

const onClose = (message) => {
  if (message.data?.id) {
    activeToasts.value.delete(message.data.id);
  }
};

// Escuchar cambios en el bus reactivo
watch(
  () => progressNotificationsBus.data.value,
  (value) => {
    if (!value) return;
    
    if (value.action === 'create') {
      const toastData = {
        severity: 'info',
        summary: value.payload.title,
        detail: value.payload.message,
        group: 'progress',
        life: 0, // No auto-hide
        data: {
          id: value.payload.id,
          status: 'active',
          progress: value.payload.progress || 0
        }
      };
      
      toast.add(toastData);
      activeToasts.value.set(value.payload.id, toastData);
      
    } else if (value.action === 'update') {
      const existing = activeToasts.value.get(value.id);
      if (existing) {
        // Actualizar datos
        existing.data.progress = value.progress;
        if (value.message) {
          existing.detail = value.message;
        }
        
        // Remover y re-agregar para forzar actualización
        toast.removeGroup('progress');
        toast.add({ ...existing });
      }
      
    } else if (value.action === 'complete') {
      const existing = activeToasts.value.get(value.id);
      if (existing) {
        existing.data.status = 'completed';
        existing.data.progress = 100;
        existing.detail = value.message;
        existing.life = 3000; // Auto-hide después de 3 segundos
        
        toast.removeGroup('progress');
        toast.add({ ...existing });
        
        setTimeout(() => {
          activeToasts.value.delete(value.id);
        }, 3100);
      }
      
    } else if (value.action === 'error') {
      const existing = activeToasts.value.get(value.id);
      if (existing) {
        existing.data.status = 'error';
        existing.detail = value.message;
        existing.life = 5000; // Mostrar errores por más tiempo
        
        toast.removeGroup('progress');
        toast.add({ ...existing });
        
        setTimeout(() => {
          activeToasts.value.delete(value.id);
        }, 5100);
      }
    }
  }
);
</script>

<style scoped>
.progress-toast-content {
  display: flex;
  flex-direction: column;
  padding: 16px;
  min-width: 450px;
  gap: 12px;
}

.progress-toast-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.progress-toast-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.progress-toast-icon.pi-spinner {
  color: var(--p-primary-color);
}

.progress-toast-icon.pi-check-circle {
  color: var(--p-green-500);
}

.progress-toast-icon.pi-times-circle {
  color: var(--p-red-500);
}

.progress-toast-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-toast-title {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.3;
  color: var(--p-text-color);
}

.progress-toast-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--p-text-muted-color);
}

.progress-toast-close {
  background: transparent;
  border: none;
  color: var(--p-text-muted-color);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--p-content-border-radius);
  transition: all 0.2s;
  flex-shrink: 0;
}

.progress-toast-close:hover {
  background-color: var(--p-highlight-background);
  color: var(--p-text-color);
}

.progress-toast-close i {
  font-size: 14px;
}

.progress-toast-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-toast-bar-container :deep(.p-progressbar) {
  flex: 1;
}

.progress-toast-percentage {
  font-size: 12px;
  font-weight: 600;
  color: var(--p-text-color);
  min-width: 38px;
  text-align: right;
  flex-shrink: 0;
}
</style>