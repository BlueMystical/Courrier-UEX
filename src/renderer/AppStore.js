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
    const lastActivity = ref(Date.now()); // <--- Nuevo: Seguimiento de actividad

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

        updateActivity(); // Inicializamos actividad al loguear
    }

    function logout() {
        currentUser.value = null;
        funcionalidades.value = []; // Limpiamos el menú al salir
    }
    function setFuncionalidades(data) {
        funcionalidades.value = data;
    }

    // Acción para refrescar la marca de tiempo
    function updateActivity() {
        lastActivity.value = Date.now();
    }

    return {
        currentUser,
        funcionalidades,
        lastActivity,
        login,
        logout,
        setFuncionalidades,
        updateActivity
    };
}, {
    // CONFIGURACIÓN DE PERSISTENCIA
    persist: {
        storage: sessionStorage, // <--- La sesión muere al cerrar la App
    }
});