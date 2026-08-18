// src/renderer/helpers/menuConfig.js
//
// Estructura única de las "Features" de la app, compartida entre el Menubar
// (App.vue) y el panel de navegación del Home (Home.vue).
//
// La mayoría de las funciones NO requieren cuenta UEX ni login, así que viven
// siempre en el menú. Solo lo que realmente depende de la cuenta (por ahora,
// UEX Notifications) se gatea: si hay sesión navega normal, si no, ejecuta
// `onRequireLogin` (cada vista decide cómo abrir su LoginDialog).
//
// IMPORTANTE: si agregás una ruta nueva en router.js que deba aparecer en el
// menú, agregala ACÁ, no por separado en App.vue o Home.vue.

/**
 * @param {Object} opts
 * @param {boolean} opts.isLoggedIn
 * @param {Function} opts.onRequireLogin - se ejecuta si se clickea un item que requiere cuenta sin estar logueado
 * @param {Object} [opts.shortcuts] - mapa opcional de atajos de teclado (settings/shortcuts),
 *                                    p.ej. { commodities: 'Ctrl+1', items: 'Ctrl+2', ... }
 */
export function getFeatureMenu({ isLoggedIn, onRequireLogin, shortcuts = {} } = {}) {
    return [
        {
            label: 'Buy or Sell',       icon: 'pi pi-caret-right',
            items: [
                { label: 'Commodities', icon: 'pi pi-angle-right', route: '/buysell/comodities', shortcut: shortcuts.commodities },
                { label: 'Items',       icon: 'pi pi-angle-right', route: '/buysell/items', shortcut: shortcuts.items },
                { label: 'Vehicles',    icon: 'pi pi-angle-right', route: '/buysell/vehicles', shortcut: shortcuts.vehicles },
                { label: 'Marketplace', icon: 'pi pi-angle-right', route: '/buysell/marketplace', shortcut: shortcuts.marketplace }
            ]
        },
        {
            label: 'Utilities',         icon: 'pi pi-caret-right',
            items: [
                { label: 'Trade Routes',            icon: 'pi pi-angle-right', route: '/buysell/routes' },
                { label: 'Cargo Mission Planner',   icon: 'pi pi-angle-right', route: '/utilities/hauling' }
            ]
        },
        {
            label: 'Data Courrier',             icon: 'pi pi-caret-right',
            items: [
                { label: 'Datarunner Captures', icon: 'pi pi-camera',       route: '/datarunner-capture', shortcut: shortcuts.datarunnerCapture },
                { label: 'Where to go?',        icon: 'pi pi-map-marker',   route: '/datarunner/heatmap' },
                isLoggedIn
                    ? { label: 'UEX Notifications', icon: 'pi pi-bell',     route: '/uex-notifications' }
                    : { label: 'UEX Notifications', icon: 'pi pi-lock', command: () => onRequireLogin?.() }
            ]
        },
    ];
}