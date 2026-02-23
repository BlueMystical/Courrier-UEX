// src/renderer/components/Notify.js
import { reactive } from 'vue';

export const toastBus = reactive({
    data: null,
    send(payload) {
        this.data = payload ? { ...payload, _t: Date.now() } : { clear: true, _t: Date.now() };
    }
});

// Bus para notificaciones agrupadas
export const groupedNotificationsBus = reactive({
    data: null,
    add(payload) {
        this.data = { action: 'add', payload, _t: Date.now() };
    },
    remove(id) {
        this.data = { action: 'remove', id, _t: Date.now() };
    },
    clear() {
        this.data = { action: 'clear', _t: Date.now() };
    }
});

// Bus para notificaciones de progreso
class ProgressNotificationsBus {
  constructor() {
    this.listeners = [];
    this.data = reactive({ value: null });
  }

  on(callback) {
    this.listeners.push(callback);
    // Retornar función para remover el listener
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  emit(value) {
    this.data.value = value;
    this.listeners.forEach(callback => callback(value));
  }

  create(payload) {
    this.emit({
      action: 'create',
      payload
    });
  }

  update(id, progress, message) {
    this.emit({
      action: 'update',
      id,
      progress,
      message
    });
  }

  complete(id, message) {
    this.emit({
      action: 'complete',
      id,
      message
    });
  }

  error(id, message) {
    this.emit({
      action: 'error',
      id,
      message
    });
  }
}

export const progressNotificationsBus = new ProgressNotificationsBus();

// API pública para crear notificaciones de progreso
export const createProgressNotification = (title, message, progress = 0) => {
  const id = `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  progressNotificationsBus.create({
    id,
    title,
    message,
    progress
  });
  
  return {
    id,
    update: (progress, message) => {
      progressNotificationsBus.update(id, progress, message);
    },
    complete: (message) => {
      progressNotificationsBus.complete(id, message);
    },
    error: (message) => {
      progressNotificationsBus.error(id, message);
    }
  };
};

export function useNotify() {
    const notify = (severity, summary, detail, life = 3000) => {
        toastBus.send({ severity, summary, detail, life });
    };

    return {
        success:    (msg, title = 'Éxito', time) =>       notify('success', title, msg, time),
        error:      (msg, title = 'Error', time) =>       notify('error', title, msg, time),
        warn:       (msg, title = 'Advertencia', time) => notify('warn', title, msg, time),
        info:       (msg, title = 'Información', time) => notify('info', title, msg, time),
        secondary:  (msg, title = 'Notificación', time) => notify('secondary', title, msg, time),
        contrast:   (msg, title = 'Aviso', time) =>       notify('contrast', title, msg, time),
        sticky:     (msg, title = 'Atención', severity = 'info') => notify(severity, title, msg, 0),
        custom:     (options) => toastBus.send(options),
        alert:      (msg, title = 'Atención', icon = 'pi pi-exclamation-triangle') => {
            toastBus.send({
                severity: 'custom-orange',
                summary: title,
                detail: msg,
                life: 0,
                icon: icon
            });
        },
        errorNotification: (errorName, errorMessage, stacktrace = null) => {
            toastBus.send({
                severity: 'error-notification',
                summary: errorName,
                detail: errorMessage,
                stacktrace: stacktrace,
                life: 0
            });
        },
        
        // Notificación con acciones personalizadas
        actionable: (msg, title, options = {}) => {
            const id = Date.now();
            groupedNotificationsBus.add({
                id,
                type: 'actionable',
                title,
                message: msg,
                icon: options.icon || 'pi pi-bell',
                severity: options.severity || 'info',
                actions: options.actions || [],
                timestamp: new Date()
            });
            return id;
        },

        // Notificación de progreso
        progress: (msg, initialProgress = 0, title = 'Procesando...') => {
            const id = 'progress_' + Date.now();
            progressNotificationsBus.create({
                id,
                title,
                message: msg,
                progress: initialProgress
            });
            return id;
        },
        
        // Actualizar progreso
        updateProgress: (id, progress, message = null) => {
            progressNotificationsBus.update(id, progress, message);
        },

        // Completar progreso
        completeProgress: (id, message = 'Completado') => {
            progressNotificationsBus.complete(id, message);
        },
        
        // Error en progreso
        errorProgress: (id, message = 'Error') => {
            progressNotificationsBus.error(id, message);
        },
        
        clearAll: () => toastBus.send({ clear: true })
    };
}