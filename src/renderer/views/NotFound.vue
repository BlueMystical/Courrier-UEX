<!-- src/renderer/views/NotFound.vue -->
<template>
    <div class="not-found-container">
        <div class="not-found-content">
            <i class="pi pi-exclamation-triangle not-found-icon"></i>
            <h1 class="not-found-title">404</h1>
            <h2 class="not-found-subtitle">Página No Encontrada</h2>
            <p class="not-found-message">
                La ruta <strong>{{ currentPath }}</strong> no existe.
            </p>
            <Button 
                label="Volver al Inicio" 
                icon="pi pi-home" 
                @click="goHome"
                class="mt-4"
            />
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Button from 'primevue/button';

const router = useRouter();
const route = useRoute();

const currentPath = computed(() => route.path);

const goHome = () => {
    router.push('/');
};
</script>

<style scoped>
.not-found-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    padding: 2rem;
}

.not-found-content {
    text-align: center;
    max-width: 500px;
}

.not-found-icon {
    font-size: 5rem;
    color: var(--p-orange-500);
    margin-bottom: 1rem;
}

.not-found-title {
    font-size: 6rem;
    font-weight: bold;
    color: var(--p-text-color);
    margin: 0;
    line-height: 1;
}

.not-found-subtitle {
    font-size: 1.5rem;
    color: var(--p-text-color);
    margin: 1rem 0;
}

.not-found-message {
    font-size: 1rem;
    color: var(--p-text-muted-color);
    margin: 1rem 0;
}

.not-found-message strong {
    color: var(--p-primary-color);
    font-family: monospace;
}
</style>