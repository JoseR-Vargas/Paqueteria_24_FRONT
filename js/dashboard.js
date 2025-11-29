// ===================================
// DASHBOARD - Paquetería24
// Principios: DRY, SOLID, YAGNI
// ===================================

// Servicio de autenticación (reutilizable - DRY)
class AuthService {
    constructor() {
        this.SESSION_KEY = 'paqueteria24_session';
    }

    isSessionValid() {
        const session = this.getSession();
        if (!session) return false;
        
        const now = Date.now();
        return session.authenticated && now < session.expiresAt;
    }

    getSession() {
        const data = localStorage.getItem(this.SESSION_KEY);
        return data ? JSON.parse(data) : null;
    }

    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        window.location.href = 'login.html';
    }
}

// Clase principal del Dashboard (Single Responsibility)
class Dashboard {
    constructor() {
        this.authService = new AuthService();
        this.contacts = [];
        this.filteredContacts = [];
        this.lastCheckedContacts = [];
        this.notificationCheckInterval = null;
        this.socket = null;
        this.init();
    }

    // Inicialización
    async init() {
        // Verificar autenticación primero
        if (!this.authService.isSessionValid()) {
            window.location.href = 'login.html';
            return;
        }

        this.contacts = await this.loadContacts();
        this.lastCheckedContacts = [...this.contacts];
        this.filteredContacts = [...this.contacts];
        
        // Al cargar inicialmente, marcar todas las consultas existentes como leídas
        const allIds = new Set(this.contacts.map(c => c._id || c.id));
        this.saveReadNotificationIds(allIds);
        
        this.renderContacts();
        this.updateNotificationBadge();
        this.attachEventListeners();
        this.connectWebSocket();
        // Mantener polling como backup por si falla WebSocket
        // this.startNotificationPolling();
    }

    // Cargar contactos desde backend
    async loadContacts() {
        try {
            // Intentar cargar desde backend
            const backendData = await this.loadFromBackend();
            console.log('✅ Datos cargados desde backend:', backendData);
            return backendData || [];
        } catch (error) {
            console.error('❌ Error al cargar desde backend:', error);
            this.showNotification('❌ Error al conectar con el servidor', 'error');
            return [];
        }
    }

    // Cargar datos desde backend
    async loadFromBackend() {
        // Usar configuración centralizada del archivo config.js
        const backendUrl = window.PAQUETERIA24_CONFIG 
            ? window.PAQUETERIA24_CONFIG.backendUrl 
            : 'http://localhost:3000'; // Fallback por defecto
        
        if (!window.PAQUETERIA24_CONFIG) {
            console.warn('⚠️ Dashboard: PAQUETERIA24_CONFIG no encontrado, usando fallback');
        }
        
        console.log('🎯 Dashboard - Conectando a:', backendUrl);
        
        const response = await fetch(`${backendUrl}/form`);
        
        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
        }
        
        const result = await response.json();
        
        // El backend ahora retorna { success: true, data: [...] }
        if (result.success && result.data) {
            return result.data;
        } else {
            throw new Error('Formato de respuesta inválido del backend');
        }
    }

    // Renderizar contactos en la tabla
    renderContacts() {
        const tbody = document.getElementById('contacts-tbody');
        const noDataMessage = document.getElementById('no-data-message');
        
        // Actualizar contadores
        this.updateCounters();
        
        if (this.filteredContacts.length === 0) {
            tbody.innerHTML = '';
            noDataMessage.classList.add('show');
            return;
        }

        noDataMessage.classList.remove('show');
        tbody.innerHTML = this.filteredContacts.map(contact => this.createTableRow(contact)).join('');
    }

    // Actualizar contadores de estadísticas
    updateCounters() {
        const totalCount = document.getElementById('total-count');
        const filteredCount = document.getElementById('filtered-count');
        
        if (totalCount) {
            totalCount.textContent = this.contacts.length;
        }
        
        if (filteredCount) {
            filteredCount.textContent = this.filteredContacts.length;
        }
    }

    // Crear fila de tabla (DRY)
    createTableRow(contact) {
        const contactId = contact._id || contact.id;
        return `
            <tr>
                <td>${this.escapeHtml(contact.nombre)}</td>
                <td>${this.escapeHtml(contact.cedula)}</td>
                <td>${this.escapeHtml(contact.telefono)}</td>
                <td>${this.escapeHtml(contact.email)}</td>
                <td>${this.renderBadges(contact.paqueteria)}</td>
                <td>${this.escapeHtml(contact.comentario)}</td>
                <td>${this.formatDate(contact.fecha)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-delete" onclick="dashboard.deleteContact('${contactId}')">🗑️ Eliminar</button>
                    </div>
                </td>
            </tr>
        `;
    }

    // Renderizar badges de tipos de paquetería (DRY)
    renderBadges(paqueteria) {
        if (!paqueteria || paqueteria.length === 0) {
            return '<span class="badge badge-privado">Ninguno</span>';
        }
        
        return paqueteria.map(tipo => {
            const badgeClass = `badge badge-${tipo}`;
            const label = this.formatBadgeLabel(tipo);
            return `<span class="${badgeClass}">${label}</span>`;
        }).join('');
    }

    // Formatear etiqueta de badge
    formatBadgeLabel(tipo) {
        const labels = {
            'mercado-libre': 'Mercado Libre',
            'ecommerce': 'E-commerce',
            'privado': 'Privado'
        };
        return labels[tipo] || tipo;
    }

    // Formatear fecha
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-UY', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Escapar HTML para prevenir XSS (Security)
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Filtrar contactos por búsqueda y tipo
    filterContacts() {
        const searchInput = document.getElementById('search-input');
        const filterTypeEl = document.getElementById('filter-type');
        
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const filterType = filterTypeEl ? filterTypeEl.value : 'all';

        this.filteredContacts = this.contacts.filter(contact => {
            const matchesSearch = this.matchesSearchTerm(contact, searchTerm);
            const matchesType = this.matchesType(contact, filterType);
            return matchesSearch && matchesType;
        });

        this.renderContacts();
    }

    // Verificar si coincide con término de búsqueda (DRY)
    matchesSearchTerm(contact, term) {
        if (!term) return true;
        
        const searchableFields = [
            contact.nombre,
            contact.cedula,
            contact.email,
            contact.telefono
        ];
        
        return searchableFields.some(field => 
            field.toLowerCase().includes(term)
        );
    }

    // Verificar si coincide con el tipo de paquetería
    matchesType(contact, type) {
        if (type === 'all') return true;
        if (type === 'none') return !contact.paqueteria || contact.paqueteria.length === 0;
        return contact.paqueteria && contact.paqueteria.includes(type);
    }

    // Adjuntar event listeners
    attachEventListeners() {
        // Elementos opcionales
        const searchInput = document.getElementById('search-input');
        const filterType = document.getElementById('filter-type');
        const btnLogout = document.getElementById('btn-logout');
        const btnClearData = document.getElementById('btn-clear-data');
        const syncBtn = document.getElementById('btn-sync-backend');
        const btnNotifications = document.getElementById('btn-notifications');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterContacts());
        }
        
        if (filterType) {
            filterType.addEventListener('change', () => this.filterContacts());
        }
        
        if (btnLogout) {
            btnLogout.addEventListener('click', () => this.logout());
        }
        
        if (btnClearData) {
            btnClearData.addEventListener('click', () => this.clearData());
        }
        
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.syncWithBackend());
        }
        
        if (btnNotifications) {
            btnNotifications.addEventListener('click', () => this.handleNotificationClick());
        }
    }

    // Sincronizar con backend
    async syncWithBackend() {
        try {
            console.log('🔄 Sincronizando con backend...');
            const data = await this.loadFromBackend();
            this.contacts = data;
            this.filteredContacts = [...this.contacts];
            this.renderContacts();
            this.updateNotificationBadge();
            
            // Guardar en localStorage como backup
            localStorage.setItem('paqueteria24_contacts', JSON.stringify(this.contacts));
            
            this.showNotification('✅ Sincronización exitosa con el backend', 'success');
        } catch (error) {
            console.error('❌ Error al sincronizar:', error);
            this.showNotification('❌ Error al sincronizar con el backend. Verifica la conexión.', 'error');
        }
    }

    // Función para mostrar notificaciones en el dashboard
    showNotification(message, type = 'info') {
        // Remover notificación anterior si existe
        const existingNotification = document.querySelector('.dashboard-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = `dashboard-notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;

        // Agregar animación CSS
        if (!document.querySelector('#dashboard-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'dashboard-notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        // Remover después de 4 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 4000);
    }

    // Logout
    logout() {
        this.authService.logout();
    }

    // Limpiar todos los datos
    clearData() {
        if (confirm('¿Estás seguro de limpiar todos los datos? Esto recargará las consultas desde el servidor.')) {
            // Resetear filtros
            const searchInput = document.getElementById('search-input');
            const filterType = document.getElementById('filter-type');
            
            if (searchInput) searchInput.value = '';
            if (filterType) filterType.value = 'all';
            
            this.init(); // Reinicializar completamente
            this.showNotification('✅ Datos recargados desde el servidor.', 'success');
        }
    }

    // Detectar nuevas consultas
    detectNewContacts(currentContacts) {
        if (this.lastCheckedContacts.length === 0) {
            // Primera carga, no hay notificaciones
            return [];
        }

        const currentIds = new Set(currentContacts.map(c => c._id || c.id));
        const lastIds = new Set(this.lastCheckedContacts.map(c => c._id || c.id));
        
        // Encontrar contactos nuevos
        const newContacts = currentContacts.filter(c => {
            const id = c._id || c.id;
            return !lastIds.has(id);
        });

        return newContacts;
    }

    // Actualizar badge de notificaciones
    updateNotificationBadge() {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        const newContacts = this.detectNewContacts(this.contacts);
        const unreadCount = this.getUnreadNotificationsCount();

        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
            badge.classList.remove('hidden');
            
            // Agregar animación si hay nuevas notificaciones
            if (newContacts.length > 0) {
                badge.classList.add('animate');
                setTimeout(() => badge.classList.remove('animate'), 500);
            }
        } else {
            badge.classList.add('hidden');
        }
    }

    // Obtener contador de notificaciones no leídas
    getUnreadNotificationsCount() {
        const readIds = this.getReadNotificationIds();
        const currentIds = new Set(this.contacts.map(c => c._id || c.id));
        
        // Contar contactos que no han sido marcados como leídos
        return Array.from(currentIds).filter(id => !readIds.has(id)).length;
    }

    // Obtener IDs de notificaciones leídas
    getReadNotificationIds() {
        const stored = localStorage.getItem('paqueteria24_read_notifications');
        return stored ? new Set(JSON.parse(stored)) : new Set();
    }

    // Guardar IDs de notificaciones leídas
    saveReadNotificationIds(ids) {
        localStorage.setItem('paqueteria24_read_notifications', JSON.stringify(Array.from(ids)));
    }

    // Manejar clic en notificaciones
    handleNotificationClick() {
        // Marcar todas las notificaciones como leídas
        const allIds = new Set(this.contacts.map(c => c._id || c.id));
        this.saveReadNotificationIds(allIds);
        this.updateNotificationBadge();
        
        // Scroll a la tabla
        const table = document.getElementById('contacts-table');
        if (table) {
            table.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Mostrar mensaje
        this.showNotification('✅ Todas las notificaciones marcadas como leídas', 'success');
    }

    // Iniciar polling de notificaciones
    startNotificationPolling() {
        // Verificar cada 30 segundos si hay nuevas consultas
        this.notificationCheckInterval = setInterval(async () => {
            try {
                const newContacts = await this.loadContacts();
                const newOnes = this.detectNewContacts(newContacts);
                
                if (newOnes.length > 0) {
                    this.contacts = newContacts;
                    this.filteredContacts = [...this.contacts];
                    this.renderContacts();
                    this.updateNotificationBadge();
                    
                    // Mostrar notificación de nuevas consultas
                    const message = newOnes.length === 1 
                        ? `🔔 Nueva consulta recibida: ${newOnes[0].nombre}`
                        : `🔔 ${newOnes.length} nuevas consultas recibidas`;
                    this.showNotification(message, 'info');
                }
                
                // Actualizar última verificación
                this.lastCheckedContacts = [...newContacts];
            } catch (error) {
                console.error('❌ Error al verificar nuevas consultas:', error);
            }
        }, 30000); // 30 segundos
    }

    // Conectar a WebSocket para notificaciones en tiempo real
    connectWebSocket() {
        if (!window.PAQUETERIA24_CONFIG) {
            console.warn('⚠️ PAQUETERIA24_CONFIG no disponible');
            this.startNotificationPolling();
            return;
        }

        if (!window.io) {
            console.warn('⚠️ Socket.io no disponible, usando polling como fallback');
            this.startNotificationPolling();
            return;
        }

        // Obtener URL base del backend
        const backendUrl = window.PAQUETERIA24_CONFIG.backendUrl || 'http://localhost:3000';
        
        console.log('🔌 Conectando a WebSocket...', backendUrl);
        console.log('🔌 Namespace: /notifications');

        try {
            // Conectar directamente al namespace /notifications
            // Socket.io maneja automáticamente ws/wss según el protocolo
            this.socket = window.io(`${backendUrl}/notifications`, {
                path: '/socket.io',
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: Infinity,
                withCredentials: true,
                autoConnect: true,
            });

            // Eventos de conexión
            this.socket.on('connect', () => {
                console.log('✅ Conectado al servidor WebSocket:', this.socket.id);
                console.log('✅ Namespace:', this.socket.nsp.name);
            });

            this.socket.on('disconnect', (reason) => {
                console.warn('⚠️ Desconectado del servidor WebSocket:', reason);
                if (reason === 'io server disconnect') {
                    // El servidor desconectó, reconectar manualmente
                    this.socket.connect();
                }
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ Error al conectar WebSocket:', error);
                console.error('❌ Detalles del error:', error.message);
                // Usar polling como fallback si WebSocket falla
                if (!this.notificationCheckInterval) {
                    console.log('🔄 Cambiando a polling como fallback...');
                    this.startNotificationPolling();
                }
            });

            // Escuchar evento de nueva consulta
            this.socket.on('new_form', (data) => {
                console.log('🔔 Nueva consulta recibida vía WebSocket:', data);
                this.handleNewFormNotification(data);
            });

            // Escuchar evento de eliminación de consulta
            this.socket.on('form_deleted', (data) => {
                console.log('🗑️ Consulta eliminada vía WebSocket:', data);
                this.handleDeletedFormNotification(data.formId);
            });

            // Confirmación de conexión
            this.socket.on('connected', (data) => {
                console.log('📡 Servidor WebSocket confirmó conexión:', data);
            });

            // Escuchar todos los eventos para debugging (si está disponible)
            if (this.socket.onAny) {
                this.socket.onAny((event, ...args) => {
                    console.log('📨 Evento WebSocket recibido:', event, args);
                });
            }

        } catch (error) {
            console.error('❌ Error al inicializar WebSocket:', error);
            this.startNotificationPolling();
        }
    }

    // Manejar notificación de nuevo formulario
    async handleNewFormNotification(data) {
        try {
            console.log('📥 Procesando nueva consulta:', data);
            
            const newForm = data.data || data;
            
            if (!newForm) {
                console.error('❌ Datos de formulario inválidos:', data);
                return;
            }
            
            // Verificar si la consulta ya existe (evitar duplicados)
            const formId = newForm._id || newForm.id;
            const exists = this.contacts.some(c => (c._id || c.id) === formId);
            
            if (exists) {
                console.log('⚠️ Consulta ya existe, omitiendo:', formId);
                return;
            }
            
            console.log('✅ Agregando nueva consulta:', newForm.nombre);
            
            // Agregar nueva consulta a la lista (al principio)
            this.contacts.unshift(newForm);
            this.filteredContacts = [...this.contacts];
            
            // Actualizar UI
            this.renderContacts();
            
            // Actualizar contador total
            this.updateCounters();
            
            // Actualizar badge de notificaciones
            // La nueva consulta no está marcada como leída, así que se contará
            this.updateNotificationBadge();
            
            // Mostrar notificación
            const message = `🔔 Nueva consulta recibida: ${newForm.nombre || 'Sin nombre'}`;
            this.showNotification(message, 'info');
            
            // Actualizar última verificación
            this.lastCheckedContacts = [...this.contacts];
            
            // Agregar animación al badge
            const badge = document.getElementById('notification-badge');
            if (badge) {
                badge.classList.add('animate');
                setTimeout(() => badge.classList.remove('animate'), 500);
            }
            
            console.log('✅ Consulta agregada exitosamente. Total:', this.contacts.length);
        } catch (error) {
            console.error('❌ Error al procesar nueva consulta:', error);
            this.showNotification('❌ Error al procesar nueva consulta', 'error');
        }
    }

    // Manejar notificación de eliminación de formulario
    async handleDeletedFormNotification(formId) {
        // Remover consulta de la lista
        this.contacts = this.contacts.filter(c => (c._id || c.id) !== formId);
        this.filteredContacts = [...this.contacts];
        
        // Actualizar UI
        this.renderContacts();
        this.updateNotificationBadge();
        
        // Actualizar última verificación
        this.lastCheckedContacts = [...this.contacts];
    }

    // Limpiar polling y WebSocket cuando se cierra la página
    cleanup() {
        if (this.notificationCheckInterval) {
            clearInterval(this.notificationCheckInterval);
        }
        
        if (this.socket) {
            console.log('🔌 Desconectando WebSocket...');
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // Eliminar un contacto específico
    async deleteContact(contactId) {
        try {
            // Usar configuración centralizada del archivo config.js
            const backendUrl = window.PAQUETERIA24_CONFIG 
                ? window.PAQUETERIA24_CONFIG.backendUrl 
                : 'http://localhost:3000'; // Fallback por defecto
            
            console.log('🗑️ Eliminando contacto:', contactId, 'desde:', backendUrl);

            const response = await fetch(`${backendUrl}/form/${contactId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                this.showNotification('✅ Consulta eliminada exitosamente', 'success');
                
                // Recargar los contactos
                this.contacts = await this.loadContacts();
                this.filteredContacts = [...this.contacts];
                this.renderContacts();
                this.updateNotificationBadge();
            } else {
                throw new Error('Error al eliminar el contacto');
            }
        } catch (error) {
            console.error('❌ Error al eliminar contacto:', error);
            this.showNotification('❌ Error al eliminar la consulta. Intenta nuevamente.', 'error');
        }
    }
}

// Variable global para acceder al dashboard desde onclick
let dashboard;

// Inicializar Dashboard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new Dashboard();
    
    // Configurar menú móvil hamburger
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });
        
        // Cerrar menú al hacer click en cerrar sesión
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        }
    }
});

// Limpiar intervalos cuando se cierra la página
window.addEventListener('beforeunload', () => {
    if (dashboard) {
        dashboard.cleanup();
    }
});
