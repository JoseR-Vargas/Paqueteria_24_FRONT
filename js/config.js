// ===================================
// CONFIGURACIÓN DEL BACKEND
// Cambia esta URL cuando tengas tu backend desplegado
// ===================================

const BACKEND_CONFIG = {
    // DESARROLLO: Backend local
    development: 'http://localhost:3000',
    
    // PRODUCCIÓN: Backend en Render
    production: 'https://paqueteria24-backend.onrender.com',
};

// Auto-detectar entorno
const isLocalDev = 
    window.location.hostname === 'localhost' 
    || window.location.hostname === '127.0.0.1'
    || window.location.protocol === 'file:'
    || window.location.hostname === '';

const BACKEND_URL = isLocalDev 
    ? BACKEND_CONFIG.development 
    : BACKEND_CONFIG.production;

// Log para debugging
console.log('🔧 Config - Entorno:', isLocalDev ? 'DESARROLLO' : 'PRODUCCIÓN');
console.log('🔧 Config - Backend URL:', BACKEND_URL);
console.log('🔧 Config - Hostname:', window.location.hostname);

// Exportar para uso en otros archivos
window.PAQUETERIA24_CONFIG = {
    backendUrl: BACKEND_URL,
    isDevelopment: isLocalDev
};
