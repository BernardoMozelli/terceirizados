/**
 * pmsl-terceiros: token-manager.js
 * Gerenciamento automático de renovação de token JWT
 * 
 * Funcionalidades:
 * - Renovação automática de token em background
 * - Detecção de atividade do usuário
 * - Interceptação de requisições para renovação preventiva
 * - Tratamento elegante de expiração com mensagem ao usuário
 */

class TokenManager {
    constructor(options = {}) {
        // Configurações
        this.tokenRefreshInterval = options.tokenRefreshInterval || 5 * 60 * 1000; // 5 minutos
        this.inactivityTimeout = options.inactivityTimeout || 30 * 60 * 1000; // 30 minutos
        this.refreshThreshold = options.refreshThreshold || 2 * 60 * 1000; // Renovar 2 min antes de expirar
        this.apiBaseUrl = options.apiBaseUrl || '/api';
        this.expirationMessageDuration = options.expirationMessageDuration || 5000; // 5 segundos
        
        // Estado
        this.isRefreshing = false;
        this.refreshPromise = null;
        this.lastActivityTime = Date.now();
        this.refreshIntervalId = null;
        this.inactivityTimeoutId = null;
        this.tokenExpirationTime = null;
        this.isShowingExpirationMessage = false;
        
        // Fila de requisições pendentes enquanto token está sendo renovado
        this.pendingRequests = [];
        
        // Inicializar
        this.init();
    }

    /**
     * Inicializar o gerenciador de token
     */
    init() {
        console.log("[TokenManager] Inicializando gerenciador de token");
        
        // Detectar atividade do usuário
        this.setupActivityDetection();
        
        // Iniciar ciclo de renovação automática
        this.startAutoRefresh();
        
        // Interceptar requisições fetch
        this.interceptFetch();
        
        // Configurar listener para quando a página fica visível novamente
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log("[TokenManager] Página voltou a ser visível, renovando token");
                this.refreshToken();
            }
        });
    }

    /**
     * Detectar atividade do usuário (cliques, movimentos do mouse, digitação)
     */
    setupActivityDetection() {
        const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
        
        events.forEach(event => {
            document.addEventListener(event, () => {
                this.lastActivityTime = Date.now();
                this.resetInactivityTimeout();
            }, { passive: true });
        });
    }

    /**
     * Resetar timeout de inatividade
     */
    resetInactivityTimeout() {
        if (this.inactivityTimeoutId) {
            clearTimeout(this.inactivityTimeoutId);
        }
        
        this.inactivityTimeoutId = setTimeout(() => {
            console.log("[TokenManager] Usuário inativo por muito tempo");
            this.logout("Sua sessão expirou por inatividade");
        }, this.inactivityTimeout);
    }

    /**
     * Iniciar ciclo automático de renovação de token
     */
    startAutoRefresh() {
        // Renovar imediatamente ao iniciar
        this.refreshToken();
        
        // Depois renovar periodicamente
        this.refreshIntervalId = setInterval(() => {
            if (this.isUserActive()) {
                console.log("[TokenManager] Renovando token automaticamente");
                this.refreshToken();
            }
        }, this.tokenRefreshInterval);
    }

    /**
     * Verificar se o usuário está ativo
     */
    isUserActive() {
        const timeSinceLastActivity = Date.now() - this.lastActivityTime;
        return timeSinceLastActivity < this.inactivityTimeout;
    }

    /**
     * Renovar token JWT
     */
    async refreshToken() {
        // Se já está renovando, retornar a promise existente
        if (this.isRefreshing) {
            return this.refreshPromise;
        }

        this.isRefreshing = true;
        const token = this.getToken();

        if (!token) {
            this.logout("Token não encontrado");
            return null;
        }

        this.refreshPromise = (async () => {
            try {
                const response = await fetch(`${this.apiBaseUrl}/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    this.setToken(data.access_token);
                    this.updateTokenExpiration();
                    console.log("[TokenManager] Token renovado com sucesso");
                    
                    // Processar requisições pendentes
                    this.processPendingRequests();
                    
                    return data.access_token;
                } else if (response.status === 401 || response.status === 403) {
                    console.warn("[TokenManager] Token inválido ou expirado");
                    this.logout("Sua sessão expirou. Por favor, faça login novamente");
                    return null;
                } else {
                    throw new Error(`Erro ao renovar token: ${response.status}`);
                }
            } catch (error) {
                console.error("[TokenManager] Erro ao renovar token:", error);
                this.logout("Erro ao renovar sessão. Por favor, faça login novamente");
                return null;
            } finally {
                this.isRefreshing = false;
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    /**
     * Atualizar tempo de expiração do token
     */
    updateTokenExpiration() {
        const token = this.getToken();
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                this.tokenExpirationTime = payload.exp * 1000; // Converter para ms
                
                // Se token vai expirar em menos de 2 minutos, renovar agora
                const timeUntilExpiry = this.tokenExpirationTime - Date.now();
                if (timeUntilExpiry < this.refreshThreshold) {
                    console.log("[TokenManager] Token vai expirar em breve, renovando agora");
                    this.refreshToken();
                }
            } catch (error) {
                console.error("[TokenManager] Erro ao decodificar token:", error);
            }
        }
    }

    /**
     * Interceptar requisições fetch para renovar token se necessário
     */
    interceptFetch() {
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            // Se token está sendo renovado, aguardar
            if (this.isRefreshing) {
                console.log("[TokenManager] Requisição aguardando renovação de token");
                this.pendingRequests.push(args);
                await this.refreshPromise;
            }

            // Atualizar token no header se for requisição para API
            const [resource, config] = args;
            if (typeof resource === 'string' && resource.includes('/api/')) {
                if (!config) args[1] = {};
                if (!args[1].headers) args[1].headers = {};
                
                const token = this.getToken();
                if (token && !args[1].headers['Authorization']) {
                    args[1].headers['Authorization'] = `Bearer ${token}`;
                }
            }

            // Fazer requisição original
            let response = await originalFetch.apply(window, args);

            // Se receber 401 ou 403, tentar renovar token
            if ((response.status === 401 || response.status === 403) && !this.isRefreshing) {
                console.log("[TokenManager] Recebido 401/403, tentando renovar token");
                const newToken = await this.refreshToken();
                
                if (newToken) {
                    // Repetir requisição com novo token
                    if (args[1]) {
                        args[1].headers['Authorization'] = `Bearer ${newToken}`;
                    }
                    response = await originalFetch.apply(window, args);
                } else {
                    // Token não pôde ser renovado, fazer logout
                    this.logout("Sua sessão expirou");
                }
            }

            return response;
        };
    }

    /**
     * Processar requisições que estavam aguardando renovação de token
     */
    processPendingRequests() {
        while (this.pendingRequests.length > 0) {
            const args = this.pendingRequests.shift();
            // Requisições pendentes serão processadas automaticamente pelo fetch interceptado
        }
    }

    /**
     * Obter token do storage
     */
    getToken() {
        return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    }

    /**
     * Salvar token no storage
     */
    setToken(token) {
        try {
            localStorage.setItem('access_token', token);
        } catch (e) {
            sessionStorage.setItem('access_token', token);
        }
    }

    /**
     * Exibir mensagem de expiração de sessão
     */
    showExpirationMessage(message = "Sua sessão expirou. Por favor, faça login novamente") {
        if (this.isShowingExpirationMessage) {
            return; // Evitar múltiplas mensagens
        }

        this.isShowingExpirationMessage = true;
        console.log("[TokenManager] Exibindo mensagem de expiração");

        // Usar SweetAlert2 se disponível, caso contrário usar alert padrão
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'Sessão Expirada',
                text: message,
                confirmButtonText: 'OK',
                confirmButtonColor: '#0066cc',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: (modal) => {
                    // Auto-fechar após X segundos
                    setTimeout(() => {
                        if (Swal.isVisible()) {
                            Swal.close();
                            this.redirectToLogin();
                        }
                    }, this.expirationMessageDuration);
                },
                willClose: () => {
                    this.redirectToLogin();
                }
            });
        } else if (typeof window.AppAlert !== 'undefined' && window.AppAlert.error) {
            // Usar AppAlert se disponível
            window.AppAlert.error(message);
            setTimeout(() => {
                this.redirectToLogin();
            }, this.expirationMessageDuration);
        } else {
            // Fallback para alert padrão
            alert(message);
            this.redirectToLogin();
        }
    }

    /**
     * Redirecionar para página de login
     */
    redirectToLogin() {
        console.log("[TokenManager] Redirecionando para login");
        
        // Limpar storage
        localStorage.removeItem('access_token');
        sessionStorage.removeItem('access_token');
        localStorage.removeItem('theme');
        sessionStorage.removeItem('theme');
        
        // Redirecionar
        window.location.href = 'index.html';
    }

    /**
     * Fazer logout
     */
    logout(message = null) {
        console.log("[TokenManager] Fazendo logout");
        
        // Limpar timers
        if (this.refreshIntervalId) clearInterval(this.refreshIntervalId);
        if (this.inactivityTimeoutId) clearTimeout(this.inactivityTimeoutId);
        
        // Exibir mensagem de expiração se fornecida
        if (message) {
            this.showExpirationMessage(message);
        } else {
            // Fazer logout silencioso
            this.redirectToLogin();
        }
    }

    /**
     * Destruir gerenciador (limpar recursos)
     */
    destroy() {
        if (this.refreshIntervalId) clearInterval(this.refreshIntervalId);
        if (this.inactivityTimeoutId) clearTimeout(this.inactivityTimeoutId);
    }
}

// Inicializar globalmente quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.tokenManager = new TokenManager({
            tokenRefreshInterval: 5 * 60 * 1000,      // Renovar a cada 5 minutos
            inactivityTimeout: 30 * 60 * 1000,        // Logout após 30 minutos de inatividade
            refreshThreshold: 2 * 60 * 1000,          // Renovar 2 minutos antes de expirar
            expirationMessageDuration: 5000            // Mensagem desaparece após 5 segundos
        });
    });
} else {
    window.tokenManager = new TokenManager({
        tokenRefreshInterval: 5 * 60 * 1000,
        inactivityTimeout: 30 * 60 * 1000,
        refreshThreshold: 2 * 60 * 1000,
        expirationMessageDuration: 5000
    });
}
