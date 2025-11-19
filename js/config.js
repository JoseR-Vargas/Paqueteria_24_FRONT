// ===================================
// CONFIGURACIÓN DEL BACKEND
// Auto-detecta el entorno y usa la URL correcta
// ===================================

const BACKEND_CONFIG = {
    // DESARROLLO: Backend local
    development: 'http://localhost:3000',
    
    // PRODUCCIÓN: Backend en Render
    production: 'https://paqueteria24-back.onrender.com',
};

// URLs para WebSocket (convertir http/https a ws/wss)
function getWebSocketUrl(baseUrl) {
    if (baseUrl.startsWith('http://')) {
        return baseUrl.replace('http://', 'ws://') + '/notifications';
    } else if (baseUrl.startsWith('https://')) {
        return baseUrl.replace('https://', 'wss://') + '/notifications';
    }
    return baseUrl + '/notifications';
}

/**
 * Detectar si estamos en desarrollo local
 * Considera desarrollo si:
 * - hostname es localhost o 127.0.0.1
 * - protocolo es file:// (archivo local)
 * - hostname está vacío
 * - URL contiene 'localhost' o '127.0.0.1'
 */
function detectEnvironment() {
    const hostname = window.location.hostname.toLowerCase();
    const protocol = window.location.protocol;
    const href = window.location.href.toLowerCase();
    
    // Verificar si hay un parámetro forzado en la URL (útil para testing)
    const urlParams = new URLSearchParams(window.location.search);
    const forceEnv = urlParams.get('env'); // ?env=dev o ?env=prod
    
    if (forceEnv === 'dev' || forceEnv === 'development') {
        return { isDev: true, reason: 'forced_dev' };
    }
    if (forceEnv === 'prod' || forceEnv === 'production') {
        return { isDev: false, reason: 'forced_prod' };
    }
    
    // Detección automática
    const isLocalDev = 
        hostname === 'localhost' 
        || hostname === '127.0.0.1'
        || protocol === 'file:'
        || hostname === ''
        || href.includes('localhost')
        || href.includes('127.0.0.1');
    
    return { 
        isDev: isLocalDev, 
        reason: isLocalDev ? 'auto_detected_local' : 'auto_detected_production' 
    };
}

// Detectar entorno
const env = detectEnvironment();
const isLocalDev = env.isDev;
const BACKEND_URL = isLocalDev 
    ? BACKEND_CONFIG.development 
    : BACKEND_CONFIG.production;

// Logs detallados para debugging
console.group('🔧 Configuración del Backend');
console.log('📍 Entorno:', isLocalDev ? '🛠️ DESARROLLO' : '🚀 PRODUCCIÓN');
console.log('🔍 Razón:', env.reason);
console.log('🌐 Hostname:', window.location.hostname);
console.log('🔗 Protocolo:', window.location.protocol);
console.log('📡 Backend URL:', BACKEND_URL);
console.log('⚙️ URLs configuradas:', BACKEND_CONFIG);
console.groupEnd();

// Calcular URL de WebSocket
const WEBSOCKET_URL = getWebSocketUrl(BACKEND_URL);

// Exportar configuración global para uso en otros archivos
window.PAQUETERIA24_CONFIG = {
    backendUrl: BACKEND_URL,
    websocketUrl: WEBSOCKET_URL,
    isDevelopment: isLocalDev,
    environment: isLocalDev ? 'development' : 'production',
    config: BACKEND_CONFIG,
    // Función útil para cambiar el entorno en tiempo de ejecución (debugging)
    switchEnvironment: function(forceDev) {
        const newUrl = forceDev ? BACKEND_CONFIG.development : BACKEND_CONFIG.production;
        this.backendUrl = newUrl;
        this.websocketUrl = getWebSocketUrl(newUrl);
        this.isDevelopment = forceDev;
        this.environment = forceDev ? 'development' : 'production';
        console.log('🔄 Entorno cambiado a:', this.environment);
        console.log('📡 Nueva URL:', this.backendUrl);
        console.log('🔌 Nueva WebSocket URL:', this.websocketUrl);
        return this;
    }
};

// Agregar WebSocket URL a los logs
console.log('🔌 WebSocket URL:', WEBSOCKET_URL);

// Exportar también como módulo si se usa ES6 modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.PAQUETERIA24_CONFIG;
}
