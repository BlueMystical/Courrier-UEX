<!-- src/renderer/views/Home.vue -->
<template>
  <div class="home-container">
    <!-- Logo circular central -->
    <div class="logo-section">
      <div class="logo-wrapper">
        <img src="@/assets/SC-Courrier-UEX_Logo_01.png" alt="Logo" class="logo-image" />
      </div>
    </div>

    <!-- Información del usuario -->
    <div class="user-info-section">
      <template v-if="store.currentUser">
        <h2 class="user-name">{{ store.currentUser.fullName || store.currentUser.username }}</h2>
        <p class="user-role"><i class="pi pi-shield"></i>{{ store.currentUser.role || 'Usuario' }}</p>

        <div class="user-details" v-if="store.currentUser">

          <a href="https://uexcorp.space/data/home/type/commodity/?only_my_reports=1" target="_blank" class="detail-item link-item">
            <i class="pi pi-external-link"></i>
            UEX Corp Terminal
          </a>
          
          <span class="detail-item">
            <i class="pi pi-check-circle"></i>
            Online
          </span>
        </div>

        <Button label="Logout" icon="pi pi-sign-out" outlined size="small" @click="handleLogout" class="logout-btn" />
      </template>

      <template v-else>
        <h2 class="welcome-title">Welcome</h2>
        <p class="welcome-subtitle">Please Login to continue</p>

        <Button label="Login" icon="pi pi-user" @click="showLoginDialog = true" class="login-btn" />
      </template>
    </div>

    <LoginDialog v-model:visible="showLoginDialog" @login="handleLogin" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAppStore } from '@/AppStore';
import Button from 'primevue/button';
import LoginDialog from '@/components/Login/LoginDialog.vue';
import { useNotify } from '@/components/Notificaciones/Notify';

const store = useAppStore();
const notify = useNotify();
const showLoginDialog = ref(false);

onMounted(async () => {
  // Si no hay usuario en el store, pero el diálogo no está abierto,
  // podríamos verificar si hay datos para invitar al usuario a loguearse.
  // Pero lo más limpio es dejar que el usuario decida.
});

/**
 * Manejamos el objeto completo (userData)
 * enviado por el LoginDialog  */
function handleLogin(userData) {
  // El store ya hace el login, pero podemos asegurar la persistencia aquí también
  // si no se hizo en el Dialog (aunque lo ideal es que el Dialog gestione el disco).
  showLoginDialog.value = false;
  
  const displayName = userData.fullName || userData.username;
  notify.success(`Welcome back, ${displayName}`, 'Access Granted');
}

function handleLogout() {
  const displayName = store.currentUser?.fullName || store.currentUser?.username;
  store.logout();

  notify.info(
    `¡Goodbye ${displayName || ''}!`,
    'Session closed'
  );
}
</script>



<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
}

/* Logo circular central */
.logo-section {
  margin-bottom: 3rem;
}

.logo-wrapper {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2); /* Fondo un poco más oscuro para que el logo resalte */
  
  /* Borde más definido con el color primario */
  border: 2px solid var(--p-primary-color); 
  
  /* Resplandor (Glow) usando el color primario directamente */
  box-shadow: 0 0 20px -5px var(--p-primary-color); 

  overflow: hidden;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-wrapper:hover {
  transform: scale(1.05);
  /* Aumentamos el resplandor al pasar el ratón */
  box-shadow: 0 0 30px -2px var(--p-primary-color);
  border-color: var(--p-primary-400);
}

.logo-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Sección de información del usuario */
.user-info-section {
  text-align: center;
  max-width: 400px;
}

.user-name {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0 0 0.5rem 0;
}


.user-role {
    display: flex;         /* Para alinear icono y texto perfectamente */
    align-items: center;
    justify-content: center;
    gap: 0.5rem;          /* Este es el "aire" o espacio que buscabas */
    
    font-size: 0.95rem;
    color: var(--p-text-muted-color);
    margin: 0 0 1.5rem 0;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.user-role i {
    color: var(--p-primary-color); /* Para que el escudo brille como el resto */
    font-size: 0.9rem;
}

.user-details {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  margin-bottom: 2rem;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.detail-item i {
  color: var(--p-primary-color);
  font-size: 0.875rem;
}

/* Botones */
.logout-btn,
.login-btn {
  min-width: 160px;
}

/* Estado sin usuario */
.welcome-title {
  font-size: 2rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0 0 0.5rem 0;
}

.welcome-subtitle {
  font-size: 1rem;
  color: var(--p-text-muted-color);
  margin: 0 0 2rem 0;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  text-decoration: none; /* Quita el subrayado por defecto */
  transition: color 0.2s ease;
}

.link-item {
  cursor: pointer;
}

.link-item:hover {
  color: var(--p-primary-color); /* Brilla con el color del tema al pasar el mouse */
  text-decoration: underline;
}

.detail-item i {
  color: var(--p-primary-color);
  font-size: 0.875rem;
}

/* Responsive */
@media (max-width: 768px) {
  .logo-wrapper {
    width: 160px;
    height: 160px;
  }

  .user-name,
  .welcome-title {
    font-size: 1.5rem;
  }

  .user-details {
    flex-direction: column;
    gap: 0.75rem;
  }
}

@media (max-width: 480px) {
  .logo-wrapper {
    width: 140px;
    height: 140px;
  }

  .home-container {
    padding: 1.5rem;
  }
}
</style>