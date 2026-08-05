<!-- src/renderer/components/Login/UserMenu.vue -->
 <template>
    <div class="user-menu-wrapper">
        <Avatar 
            v-if="store.currentUser?.photo"
            :image="store.currentUser.photo"
            shape="circle" 
            class="custom-avatar"
            @click="toggleMenu"
        />
        
        <Avatar 
            v-else
            :icon="!store.currentUser ? 'pi pi-user' : ''" 
            :label="avatarLabel"
            shape="circle" 
            class="custom-avatar"
            @click="toggleMenu"
            aria-haspopup="true"
            aria-controls="overlay_menu"
        />
        <Menu ref="menu" id="overlay_menu" :model="menuItems" :popup="true" />

        <LoginDialog 
            v-model:visible="showLoginDialog" 
            @login="handleLogin" 
        />
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import Avatar from 'primevue/avatar';
import Menu from 'primevue/menu';
import LoginDialog from '@/components/Login/LoginDialog.vue'; 
import { useNotify } from '@/components/Notificaciones/Notify';
import { useAppStore } from '@/AppStore'; 

const store = useAppStore(); 
const notify = useNotify();
const menu = ref(null);
const showLoginDialog = ref(false);

/**
 * 1. Calculamos la inicial de forma segura.
 * Blindamos la función contra cualquier tipo de dato (null, undefined, objetos).
 */
const avatarLabel = computed(() => {
    // Verificamos que exista el usuario Y que el username sea un string
    const user = store.currentUser;
    if (user && typeof user.username === 'string' && user.username.length > 0) {
        return user.username.charAt(0).toUpperCase();
    }
    // Si algo falla, devolvemos vacío para que no rompa el renderizado
    return '';
});

// Vinculamos los items del menú
const menuItems = computed(() => [
    {
        label: store.currentUser ? `Usuario: ${store.currentUser.fullName || store.currentUser.username}` : 'Invitado',
        items: [
            {
                label: store.currentUser ? 'Cerrar Sesión' : 'Iniciar Sesión',
                icon: store.currentUser ? 'pi pi-sign-out' : 'pi pi-sign-in',
                command: () => {
                    if (store.currentUser) handleLogout();
                    else showLoginDialog.value = true;
                }
            }
        ]
    }
]);

const toggleMenu = (event) => menu.value.toggle(event);


function handleLogin(userData) {
    if (userData) {
        // Pasamos el objeto COMPLETO al store
        store.login(userData);
        showLoginDialog.value = false;
        
        const name = userData.fullName || userData.username;
        notify.success(`¡Bienvenido ${name}!`, 'Sesión iniciada');
    }
}

function handleLogout() {
    const prevUser = store.currentUser?.username;
    store.logout();
    notify.info(`Hasta pronto ${prevUser || ''}`, 'Sesión cerrada');
}
</script>

<style scoped>
/* (Tus estilos se mantienen iguales) */
.user-menu-wrapper {
    display: flex;
    align-items: center;
    margin-left: 12px;
    padding-left: 12px;
    border-left: 1px solid var(--p-content-border-color);
    height: 100%;
}

.custom-avatar {
    width: 26px !important;
    height: 26px !important;
    background: var(--p-primary-color);
    color: var(--p-primary-contrast-color);
    cursor: pointer;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: hidden;
}

:deep(.p-avatar-icon) {
    font-size: 0.9rem !important;
}

:deep(.p-avatar-label) {
    font-size: 0.75rem;
    font-weight: 600;
}

.custom-avatar:hover {
    filter: brightness(1.1);
}
</style>