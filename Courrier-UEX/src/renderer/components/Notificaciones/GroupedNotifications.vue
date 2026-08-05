<!-- src/renderer/components/GroupedNotifications.vue -->
<template>
  <div class="grouped-notifications-container">
    <TransitionGroup name="grouped">
      <div 
        v-for="notification in notifications" 
        :key="notification.id"
        :class="['grouped-notification', `severity-${notification.severity}`]"
      >
        <div class="notification-accent-bar"></div>
        <div class="notification-content">
          <div class="notification-header">
            <i :class="notification.icon" class="notification-icon"></i>
            <div class="notification-text">
              <span class="notification-title">{{ notification.title }}</span>
              <p class="notification-message">{{ notification.message }}</p>
            </div>
            <button class="notification-close" @click="removeNotification(notification.id)">
              <i class="pi pi-times"></i>
            </button>
          </div>
          
          <!-- Acciones personalizadas -->
          <div v-if="notification.actions && notification.actions.length" class="notification-actions">
            <button 
              v-for="(action, index) in notification.actions"
              :key="index"
              class="action-btn"
              @click="handleAction(action, notification.id)"
            >
              <i v-if="action.icon" :class="action.icon"></i>
              <span>{{ action.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { groupedNotificationsBus } from './Notify';

const props = defineProps({
  position: {
    type: String,
    default: 'bottom-right'
  }
});

const notifications = ref([]);

const handleAction = (action, notificationId) => {
  if (action.onClick) {
    action.onClick();
  }
  // Cerrar la notificación después de ejecutar la acción
  if (action.closeOnClick !== false) {
    removeNotification(notificationId);
  }
};

const removeNotification = (id) => {
  const index = notifications.value.findIndex(n => n.id === id);
  if (index > -1) {
    notifications.value.splice(index, 1);
  }
};

watch(
  () => groupedNotificationsBus.data,
  (value) => {
    if (!value) return;
    
    if (value.action === 'add') {
      notifications.value.push(value.payload);
    } else if (value.action === 'remove') {
      removeNotification(value.id);
    } else if (value.action === 'clear') {
      notifications.value = [];
    }
  }
);
</script>

<style scoped>
.grouped-notifications-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
  max-width: 400px;
}

.grouped-notification {
  display: flex;
  background-color: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
}

.notification-accent-bar {
  width: 4px;
  flex-shrink: 0;
}

.severity-info .notification-accent-bar {
  background-color: #3b82f6;
}

.severity-success .notification-accent-bar {
  background-color: #10b981;
}

.severity-warn .notification-accent-bar {
  background-color: #f59e0b;
}

.severity-danger .notification-accent-bar {
  background-color: #ef4444;
}

.notification-content {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.notification-header {
  display: flex;
  align-items: flex-start;
  padding: 14px;
  gap: 10px;
}

.notification-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--p-primary-color);
}

.notification-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.notification-title {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.3;
  color: var(--p-text-color);
}

.notification-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--p-text-muted-color);
}

.notification-close {
  background: transparent;
  border: none;
  color: var(--p-text-muted-color);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.notification-close:hover {
  background-color: var(--p-surface-100);
  color: var(--p-text-color);
}

.notification-close i {
  font-size: 14px;
}

/* Acciones */
.notification-actions {
  display: flex;
  gap: 8px;
  padding: 0 14px 14px 14px;
  border-top: 1px solid var(--p-surface-200);
  padding-top: 10px;
  margin-top: 4px;
}

.action-btn {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  border: none;
  padding: 8px 14px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  font-family: 'Segoe UI', sans-serif;
}

.action-btn:hover {
  background: var(--p-primary-600);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.action-btn i {
  font-size: 13px;
}

/* Animaciones */
.grouped-enter-active,
.grouped-leave-active {
  transition: all 0.3s ease;
}

.grouped-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.grouped-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>