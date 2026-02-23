<!-- src/renderer/components/Alert.vue -->
<template>
  <div :class="['alert-container', positionClass]">
    <TransitionGroup name="alert">
      <div 
        v-for="item in notifications" 
        :key="item._t"
        class="alert-toast"
      >
        <div class="alert-accent-bar"></div>
        <div class="alert-content">
          <i :class="item.icon || 'pi pi-bell'" class="alert-icon"></i>
          <div class="alert-text">
            <span class="alert-title">{{ item.summary }}</span>
            <p class="alert-message">{{ item.detail }}</p>
          </div>
          <button class="alert-close" @click="removeNotification(item)">
            <i class="pi pi-times"></i>
          </button>
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

const positionClass = computed(() => {
  return `alert-${props.position}`;
});

const removeNotification = (item) => {
  const index = notifications.value.findIndex(n => n._t === item._t);
  if (index > -1) {
    notifications.value.splice(index, 1);
  }
};

watch(
  () => toastBus.data,
  (value) => {
    if (!value) return;
    
    if (value.clear) {
      notifications.value = [];
    } else if (value.severity === 'custom-orange') {
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
.alert-container {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

/* Posiciones Top */
.alert-top-right {
  top: 70px;
  right: 20px;
}

.alert-top-left {
  top: 70px;
  left: 20px;
}

.alert-top-center {
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
}

/* Posiciones Bottom */
.alert-bottom-right {
  bottom: 20px;
  right: 20px;
}

.alert-bottom-left {
  bottom: 20px;
  left: 20px;
}

.alert-bottom-center {
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
}

.alert-toast {
  display: flex;
  background-color: #ff8c00;
  border-radius: 6px;
  overflow: hidden;
  min-width: 350px;
  max-width: 450px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}

.alert-accent-bar {
  width: 6px;
  background-color: #14be05; /* Azul oscuro que contrasta bien */
  flex-shrink: 0;
}

.alert-content {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  gap: 12px;
  flex: 1;
  color: white;
}

.alert-icon {
  font-size: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.alert-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.alert-title {
  font-weight: 600;
  font-size: 16px;
  line-height: 1.3;
}

.alert-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  opacity: 0.95;
}

.alert-close {
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.alert-close:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.alert-close i {
  font-size: 18px;
}

/* Animaciones */
.alert-enter-active,
.alert-leave-active {
  transition: all 0.3s ease;
}

.alert-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.alert-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>