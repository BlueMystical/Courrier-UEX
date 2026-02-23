// src/renderer/helpers/network.js
import { useNotify } from '@/components/Notificaciones/Notify';

const { warn, success } = useNotify();

export function initNetworkMonitor() {
    // Escuchar cuando se pierde la conexión
    window.addEventListener('offline', () => {
        warn(
            'Se ha perdido la conexión a internet. Algunas funciones pueden no estar disponibles.',
            'Sin Conexión',
            0 //<- La hacemos Sticky para que el usuario sea consciente
        );
    });

    // Escuchar cuando regresa la conexión
    window.addEventListener('online', () => {
        success(
            'La conexión se ha restablecido correctamente.',
            'Conexión Recuperada'
        );
    });

    console.log('📡 Monitor de red iniciado');
}