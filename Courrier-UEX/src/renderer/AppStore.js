// src/renderer/AppStore.js
import { defineStore } from 'pinia';
import { ref } from 'vue';

/* 
    Store para manejar el estado global de la aplicación
    osea: para guardar datos persistentes y accesibles desde cualquier componente.
*/
export const useAppStore = defineStore('app', () => {
    // Estado
    const currentUser = ref(null);
    const funcionalidades = ref([]);
    const lastActivity = ref(Date.now());
    const sessionExpired = ref(false); // Flag para indicar que la sesión caducó por actualización
    const isSyncing = ref(false); // Flag para indicar que la app está sincronizando datos
    const syncMessage = ref(''); // Mensaje de progreso de sincronización
    const lastSync = ref(null); // Fecha de la última sincronización exitosa
    const colorMode = ref('light'); // 'light' o 'dark'
    
    // Acciones:

    /** Persiste los datos del usuario logeado */
    function login(userData) {
        // Combinamos lo que viene de la API/Mock con datos locales
        currentUser.value = {
            ...userData,
            lastLogin: new Date().toLocaleString()
        };
        // 2. Cargamos las funcionalidades que vienen del login
        if (userData.funcionalidades) {
            funcionalidades.value = userData.funcionalidades;
        }

        sessionExpired.value = false; // Reset al loguear
        updateActivity(); // Inicializamos actividad al loguear
    }

    function logout() {
        currentUser.value = null;
        funcionalidades.value = []; // Limpiamos el menú al salir
    }

    function setSessionExpired(val) {
        sessionExpired.value = val;
    }
    function setFuncionalidades(data) {
        funcionalidades.value = data;
    }

    function setSyncState(syncing, message = '') {
        isSyncing.value = syncing;
        syncMessage.value = message;
        if (!syncing && !message) { // Asumimos que una llamada sin mensaje al finalizar es un éxito
            lastSync.value = Date.now();
        }
    }

    function setColorMode(mode) {
        colorMode.value = mode;
    }

    // Acción para refrescar la marca de tiempo
    function updateActivity() {
        lastActivity.value = Date.now();
    }

    return {
        currentUser,
        funcionalidades,
        lastActivity,
        sessionExpired,
        isSyncing,
        syncMessage,
        lastSync,
        colorMode,
        login,
        logout,
        setSessionExpired,
        setFuncionalidades,
        setSyncState,
        setColorMode,
        updateActivity
    };
}, {
    // CONFIGURACIÓN DE PERSISTENCIA
    persist: {
        storage: sessionStorage, // <--- La sesión muere al cerrar la App
    }
});