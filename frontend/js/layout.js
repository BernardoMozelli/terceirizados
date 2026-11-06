/**
 * pmsl-terceiros: layout.js
 * Motor central corrigido: Injeção de Modal e Troca de Senha com "olho".
 */

if (typeof window.AppAlert === 'undefined') {
    window.AppAlert = {
        success: (message) => Swal.fire({ icon: 'success', title: 'Sucesso!', text: message, confirmButtonColor: '#193C8E' }),
        error: (message) => Swal.fire({ icon: 'error', title: 'Erro!', text: message, confirmButtonColor: '#d33' }),
        confirm: (title, text, confirmCallback) => {
            Swal.fire({ title: title, text: text, icon: 'warning', showCancelButton: true, confirmButtonColor: '#193C8E', cancelButtonColor: '#64748B', confirmButtonText: 'Sim, confirmar!', cancelButtonText: 'Cancelar' })
            .then((result) => { if (result.isConfirmed) confirmCallback(); });
        },
        toast: (message, icon = 'success') => {
            const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
            return Toast.fire({ icon: icon, title: message });
        }
    };
}

if (typeof window._redirecting === 'undefined') {
    window._redirecting = false;
}

document.addEventListener("DOMContentLoaded", function () {
    injetarModalSenha();

    console.log("[Layout] A carregar Navbar...");
    fetch('navbar.html')
        .then(response => {
            if (!response.ok) throw new Error("Erro ao carregar navbar");
            return response.text();
        })
        .then(data => {
            const placeholder = document.getElementById('navbar-placeholder');
            if (placeholder) {
                placeholder.innerHTML = data;
                console.log("[Layout] Navbar inserida no ecrã.");
                marcarMenuAtivo();
                injetarRodape();
                initializeSharedComponents();
            }
        })
        .catch(error => console.error('[Layout] Falha ao carregar a navbar:', error));
});

function injetarModalSenha() {
    if (document.getElementById('modalAlterarMinhaSenha')) return;

    const modalHTML = `
    <div class="modal fade" id="modalAlterarMinhaSenha" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <form id="formAlterarMinhaSenha">
            <div class="modal-header">
              <h5 class="modal-title"><i class="fas fa-key me-2 icon-blue text-primary"></i>Alterar Minha Senha</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Senha Atual</label>
                <div class="input-group">
                    <input type="password" name="senha_atual" class="form-control" required>
                    <button class="btn btn-outline-secondary toggle-password" type="button" tabindex="-1" title="Mostrar/Ocultar Senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
              </div>
              <hr>
              <div class="mb-3">
                <label class="form-label">Nova Senha</label>
                <div class="input-group">
                    <input type="password" name="nova_senha" id="inputNovaSenha" class="form-control" required>
                    <button class="btn btn-outline-secondary toggle-password" type="button" tabindex="-1" title="Mostrar/Ocultar Senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Confirmar Nova Senha</label>
                <div class="input-group">
                    <input type="password" id="inputConfirmarNovaSenha" class="form-control" required>
                    <button class="btn btn-outline-secondary toggle-password" type="button" tabindex="-1" title="Mostrar/Ocultar Senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar Nova Senha</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    configurarLogicaSenha();
}

function configurarLogicaSenha() {
    const form = document.getElementById("formAlterarMinhaSenha");
    if (!form) return;

    // Configurar a lógica do olho (mostrar/ocultar)
    const toggleButtons = form.querySelectorAll('.toggle-password');
    toggleButtons.forEach(button => {
        button.addEventListener('click', function() {
            // O input é o elemento imediatamente anterior ao botão no HTML
            const input = this.previousElementSibling;
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });

    // Lógica de submissão
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
        
        const nova = document.getElementById("inputNovaSenha").value;
        const confirma = document.getElementById("inputConfirmarNovaSenha").value;

        if (nova !== confirma) {
            window.AppAlert.error("As novas senhas não coincidem!");
            return;
        }

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
            const res = await fetch('/api/usuarios/trocar-senha', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token 
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                window.AppAlert.success("Senha alterada com sucesso!");
                const modalEl = document.getElementById('modalAlterarMinhaSenha');
                const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
                modalInstance.hide();
                form.reset();
                
                // Restaura o tipo password se algum olho ficou aberto
                form.querySelectorAll('input').forEach(input => input.type = 'password');
                form.querySelectorAll('.toggle-password i').forEach(icon => {
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                });
            } else {
                const err = await res.json();
                window.AppAlert.error(err.erro || "Senha atual incorreta.");
            }
        } catch (error) {
            window.AppAlert.error("Erro de conexão com o servidor.");
        }
    });
}

// Helper seguro para interpretar permissões do backend em qualquer formato (Array ou Objeto)
function _temPermissao(permissoes, recurso) {
    if (!permissoes) return false;
    
    // Se for um array de strings ['acessar_empresas']
    if (Array.isArray(permissoes) && typeof permissoes[0] === 'string') {
        return permissoes.includes(recurso);
    }
    // Se for um array de objetos [{recurso: 'acessar_empresas', permitido: true}]
    if (Array.isArray(permissoes) && typeof permissoes[0] === 'object') {
        const p = permissoes.find(x => x.recurso === recurso);
        return p ? (p.permitido === true) : false;
    }
    // Se for um objeto direto {'acessar_empresas': true}
    return permissoes[recurso] === true;
}

// Campo "Indicação": só admin, Prefeito e Vice-Prefeito (regra vem do backend em /api/usuarios/me)
window.podeVerIndicacao = function () {
    return !!(window.userInfo && window.userInfo.pode_ver_indicacao);
};

function aplicarVisibilidadeIndicacao(userInfo) {
    const pode = !!(userInfo && userInfo.pode_ver_indicacao);
    document.body.classList.toggle('pode-ver-indicacao', pode);
    if (!pode) {
        // Campos ocultos não podem ficar "required", senão o navegador trava o envio do formulário
        document.querySelectorAll('[data-indicacao] [required]').forEach(el => el.removeAttribute('required'));
    }
}

function controlarVisibilidadeElementos() {
    if (!window.userInfo || !window.userInfo.permissoes) {
        console.warn("[Layout] userInfo ou permissões não disponíveis ainda.");
        return;
    }
    
    const { permissoes, perfil } = window.userInfo;

    const BLOQUEADAS_ADMIN = ['aprovar_candidato', 'recusar_candidato'];
    
    const PERMISSOES_APROVADOR = [
        'acessar_aprovacoes', 'acessar_contratacoes', 'acessar_logs_atividades', 
        'candidatos', 'criar_candidato', 'editar_candidato', 'excluir_candidato', 
        'aprovar_candidato', 'recusar_candidato', 'acessar_transferencias',
        'acessar_empresas', 'criar_empresa', 'editar_empresa', 'excluir_empresa'
    ];

    const PERMISSOES_ATIVADOR = [
        'acessar_funcionarios', 'acessar_contratacoes', 
        'candidatos', 'criar_candidato', 'editar_candidato', 'excluir_candidato',
        'acessar_empresas', 'criar_empresa', 'editar_empresa', 'acessar_transferencias'
    ];

    const calcular = (requiredPermission) => {
        const dbHasPermission = _temPermissao(permissoes, requiredPermission);
        if (perfil === 'admin') return !BLOQUEADAS_ADMIN.includes(requiredPermission);
        if (perfil === 'aprovador') return PERMISSOES_APROVADOR.includes(requiredPermission) || dbHasPermission;
        if (perfil === 'ativador') return PERMISSOES_ATIVADOR.includes(requiredPermission) || dbHasPermission;
        // Perfil padrão e outros leem diretamente a permissão dinâmica validada
        return dbHasPermission;
    };
    // Disponível para outras telas (ex.: cards do Início)
    window.pmslTemPermissao = (perm) => !perm || calcular(perm);

    document.querySelectorAll('[data-permission]').forEach(el => {
        el.classList.toggle('d-none', !calcular(el.dataset.permission));
    });

    // Ocultar botão "Nova Solicitação de Contratação" para perfil padrão
    const btnNovaContratacao = document.getElementById('btnNovaContratacao');
    if (btnNovaContratacao) {
        if (perfil === 'padrao') {
            btnNovaContratacao.classList.add('d-none');
        } else {
            btnNovaContratacao.classList.remove('d-none');
        }
    }

    ajustarGruposMenu();
    _controlarAcessoPagina(perfil, permissoes);
    PmslFavoritos.iniciar();
    document.dispatchEvent(new CustomEvent('pmsl-usuario-pronto', { detail: window.userInfo }));
}

// ---------------------------------------------------------------------------
// Visual novo (padrão SIAG): menu ativo, grupos vazios e rodapé
// ---------------------------------------------------------------------------
function marcarMenuAtivo() {
    const atual = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.pmsl-nav a[href]').forEach(a => {
        const alvo = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
        if (!alvo || alvo === '#' || alvo !== atual) return;
        if (a.classList.contains('dropdown-item')) {
            a.classList.add('active');
            const grupo = a.closest('.pmsl-grupo');
            if (grupo) grupo.querySelector('.pmsl-btn').classList.add('cur');
        } else if (a.classList.contains('pmsl-btn')) {
            a.classList.add('cur');
        }
    });
}

// Esconde o grupo do menu quando o usuário não tem permissão para nenhuma tela dele
function ajustarGruposMenu() {
    document.querySelectorAll('.pmsl-grupo').forEach(grupo => {
        const itens = grupo.querySelectorAll('.dropdown-item');
        const algumVisivel = Array.from(itens).some(i => !i.classList.contains('d-none'));
        grupo.classList.toggle('d-none', !algumVisivel);
    });
}

function injetarRodape() {
    if (document.querySelector('.pmsl-rodape')) return;
    document.body.classList.add('pmsl-moderno');
    document.body.insertAdjacentHTML('beforeend', `
    <footer class="pmsl-rodape">
        <img src="assets/logo-prefeitura-emb.png" alt="" />
        <span>Prefeitura Municipal de Santa Luzia</span>
        <span class="pmsl-rodape-sep">•</span>
        <span>Secretaria de Planejamento, Ciência, Tecnologia e Inovação</span>
    </footer>`);
}

// ---------------------------------------------------------------------------
// Módulos do sistema (cards do Início, alfinetes do menu e "Fixar no Início")
// ---------------------------------------------------------------------------
window.PMSL_MODULOS = [
    { pagina: 'funcionarios.html', titulo: 'Funcionários ativos', curto: 'Funcionários', grupo: 'Funcionários', icone: 'fa-users', permissao: 'acessar_funcionarios', texto: 'Consulte, edite e gerencie os terceirizados em atividade.' },
    { pagina: 'funcionarios_inativos.html', titulo: 'Desligados', grupo: 'Funcionários', icone: 'fa-user-slash', permissao: 'acessar_desligados', texto: 'Histórico de quem já foi desligado e reativações.' },
    { pagina: 'transferencias.html', titulo: 'Transferências', grupo: 'Funcionários', icone: 'fa-exchange-alt', permissao: 'acessar_transferencias', texto: 'Movimentação de funcionários entre secretarias.' },
    { pagina: 'contratacoes.html', titulo: 'Nova solicitação', grupo: 'Contratações', icone: 'fa-briefcase', permissao: 'acessar_contratacoes', texto: 'Abra um pedido de contratação de terceirizado.' },
    { pagina: 'aprovacoes.html', titulo: 'Aprovações', grupo: 'Contratações', icone: 'fa-check-circle', permissao: 'acessar_aprovacoes', texto: 'Analise e aprove os candidatos pendentes.' },
    { pagina: 'secretarias.html', titulo: 'Secretarias', grupo: 'Cadastros', icone: 'fa-sitemap', permissao: 'acessar_secretarias', texto: 'Secretarias e setores da Prefeitura.' },
    { pagina: 'empresas.html', titulo: 'Empresas', grupo: 'Cadastros', icone: 'fa-building', permissao: 'acessar_empresas', texto: 'Empresas prestadoras de serviço contratadas.' },
    { pagina: 'dashboard.html', titulo: 'Dashboard', grupo: 'Gestão', icone: 'fa-chart-line', permissao: 'acessar_dashboard', texto: 'Indicadores de ocupação e distribuição dos terceirizados.' },
    { pagina: 'relatorios.html', titulo: 'Relatórios', grupo: 'Gestão', icone: 'fa-chart-bar', permissao: 'acessar_relatorios', texto: 'Relatórios gerenciais e exportações.' },
    { pagina: 'usuarios.html', titulo: 'Usuários', grupo: 'Administração', icone: 'fa-user-tie', permissao: 'acessar_usuarios', texto: 'Contas de acesso, perfis, permissões e logs.' },
    { pagina: 'importar_funcionarios.html', titulo: 'Importação', grupo: 'Administração', icone: 'fa-file-import', permissao: 'acessar_importacao', texto: 'Importe funcionários em lote por planilha.' },
];

// Favoritos: cópia local para abrir já personalizado + gravação no servidor (vale em qualquer computador)
window.PmslFavoritos = (function () {
    let estado = { favoritos: [], ordem: [] };
    const token = () => localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const chave = () => 'pmsl_menu_' + ((window.userInfo && window.userInfo.id) || '');
    const avisar = () => document.dispatchEvent(new CustomEvent('pmsl-favoritos', { detail: estado }));

    function lerLocal() {
        try { const p = JSON.parse(localStorage.getItem(chave())); if (p) estado = { favoritos: p.favoritos || [], ordem: p.ordem || [] }; } catch (e) {}
    }
    function gravarLocal() { try { localStorage.setItem(chave(), JSON.stringify(estado)); } catch (e) {} }

    async function salvar(novo) {
        estado = { favoritos: novo.favoritos || [], ordem: novo.ordem || [] };
        gravarLocal(); avisar(); atualizarAlfinetes();
        try {
            const r = await fetch('/api/usuarios/menu-pessoal', {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify(estado)
            });
            if (r.ok) { const d = await r.json(); estado = { favoritos: d.favoritos || [], ordem: d.ordem || [] }; gravarLocal(); avisar(); atualizarAlfinetes(); }
        } catch (e) { console.warn('[Favoritos] Não foi possível salvar no servidor', e); }
    }

    const ehFavorito = (pagina) => estado.favoritos.includes(pagina);

    function alternar(pagina) {
        const mod = PMSL_MODULOS.find(m => m.pagina === pagina);
        const fixar = !ehFavorito(pagina);
        const favoritos = fixar ? [...estado.favoritos, pagina] : estado.favoritos.filter(p => p !== pagina);
        salvar({ ...estado, favoritos });
        if (window.AppAlert && mod) window.AppAlert.toast(fixar ? `"${mod.curto || mod.titulo}" fixado no Início` : `"${mod.curto || mod.titulo}" removido do Início`, fixar ? 'success' : 'info');
    }

    // Alfinete ao lado de cada tela nos submenus
    function colocarAlfinetes() {
        document.querySelectorAll('.pmsl-grupo .dropdown-item').forEach(a => {
            const pagina = (a.getAttribute('href') || '').split('/').pop();
            if (!PMSL_MODULOS.some(m => m.pagina === pagina) || a.parentElement.querySelector('.pmsl-pin')) return;
            a.parentElement.classList.add('pmsl-lin');
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'pmsl-pin'; b.dataset.pagina = pagina;
            b.innerHTML = '<i class="fas fa-thumbtack"></i>';
            b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); alternar(pagina); });
            a.parentElement.appendChild(b);
        });
    }

    // Botão "Fixar no Início" no topo de cada tela do catálogo
    function colocarBotaoFixar() {
        const atual = (window.location.pathname.split('/').pop() || '').toLowerCase();
        if (!PMSL_MODULOS.some(m => m.pagina === atual) || document.querySelector('.pmsl-fixar')) return;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pmsl-fixar'; b.dataset.pagina = atual;
        b.addEventListener('click', () => alternar(atual));
        // Fica ao lado do título da tela (não disputa espaço com os botões de ação da página)
        const titulo = document.querySelector('.page-header h1, .page-header h2, body > .container h1:not(.card-title):not(.modal-title), body > .container h2:not(.card-title):not(.modal-title)');
        if (titulo) titulo.appendChild(b);
    }

    function atualizarAlfinetes() {
        document.querySelectorAll('.pmsl-pin').forEach(b => {
            const on = ehFavorito(b.dataset.pagina);
            b.classList.toggle('on', on);
            b.title = on ? 'Desafixar do Início' : 'Fixar no Início';
            b.setAttribute('aria-label', b.title);
        });
        document.querySelectorAll('.pmsl-fixar').forEach(b => {
            const on = ehFavorito(b.dataset.pagina);
            b.classList.toggle('on', on);
            b.innerHTML = `<i class="fas fa-thumbtack"></i>${on ? 'Fixada no Início' : 'Fixar no Início'}`;
            b.title = on ? 'Esta tela aparece entre os favoritos do Início. Clique para desafixar.' : 'Mostrar esta tela entre os favoritos do Início';
        });
    }

    let iniciado = false;
    async function iniciar() {
        if (iniciado) return; iniciado = true;
        lerLocal(); colocarAlfinetes(); colocarBotaoFixar(); atualizarAlfinetes(); avisar();
        try {
            const r = await fetch('/api/usuarios/menu-pessoal', { headers: { Authorization: 'Bearer ' + token() } });
            if (r.ok) { const d = await r.json(); estado = { favoritos: d.favoritos || [], ordem: d.ordem || [] }; gravarLocal(); atualizarAlfinetes(); avisar(); }
        } catch (e) { console.warn('[Favoritos] Usando cópia local', e); }
    }

    return { iniciar, alternar, salvar, ehFavorito, estado: () => estado };
})();

function _controlarAcessoPagina(perfil, permissoes) {
    if (window._redirecting) return;

    const paginaAtualUrl = window.location.pathname.split('/').pop() || 'index.html';

    const MAPA_PAGINAS = {
        'dashboard.html': 'acessar_dashboard',
        'funcionarios.html': 'acessar_funcionarios',
        'funcionarios_inativos.html': 'acessar_desligados',
        'empresas.html': 'acessar_empresas',
        'transferencias.html': 'acessar_transferencias',
        'contratacoes.html': 'acessar_contratacoes',
        'aprovacoes.html': 'acessar_aprovacoes',
        'usuarios.html': 'acessar_usuarios',
        'secretarias.html': 'acessar_secretarias',
        'importar_funcionarios.html': 'acessar_importacao',
        'logs_atividades.html': 'acessar_logs_atividades',
        'relatorios.html': 'acessar_relatorios',
    };

    const permissaoNecessaria = MAPA_PAGINAS[paginaAtualUrl];
    if (!permissaoNecessaria) return; 

    const PERMISSOES_PAGINAS_APROVADOR = ['acessar_aprovacoes', 'acessar_contratacoes', 'acessar_logs_atividades', 'acessar_transferencias', 'acessar_empresas'];
    const PERMISSOES_PAGINAS_ATIVADOR = ['acessar_funcionarios', 'acessar_contratacoes', 'acessar_empresas', 'acessar_transferencias'];

    let temAcesso = false;
    const dbHasPermission = _temPermissao(permissoes, permissaoNecessaria);
    
    if (perfil === 'admin') {
        temAcesso = true;
    } else if (perfil === 'aprovador') {
        temAcesso = PERMISSOES_PAGINAS_APROVADOR.includes(permissaoNecessaria) || dbHasPermission;
    } else if (perfil === 'ativador') {
        temAcesso = PERMISSOES_PAGINAS_ATIVADOR.includes(permissaoNecessaria) || dbHasPermission;
    } else {
        // Perfil padrão confere as páginas liberadas
        temAcesso = dbHasPermission;
    }

    if (!temAcesso) {
        window._redirecting = true;
        window.AppAlert.error('Você não tem permissão para acessar esta página.');
        const paginaInicial = _getPaginaInicial(perfil);
        
        setTimeout(() => { 
            window.location.href = paginaInicial;
        }, 1500);
    }
}

function _getPaginaInicial(perfil) {
    switch (perfil) {
        case 'padrao':
        case 'ativador':
        case 'admin':
        case 'aprovador': return 'inicio.html';
        default:          return 'index.html';
    }
}

function initializeSharedComponents() {
    let token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    const temaSelect = document.getElementById('temaSelect');
    
    function aplicarTema(tema) {
        document.body.classList.toggle('dark-theme', tema === 'escuro');
        localStorage.setItem('theme', tema);
    }

    async function carregarUserInfo() {
        const nomeEl = document.getElementById('userInfoNome');
        const secEl = document.getElementById('userInfoSecretaria');
        const photoEl = document.getElementById('userPhoto');

        try {
            const res = await fetch('/api/usuarios/me', { headers: { Authorization: 'Bearer ' + token } });
            if (res.ok) {
                const data = await res.json();
                window.userInfo = data;
                aplicarVisibilidadeIndicacao(data);
                
                if (nomeEl) nomeEl.innerText = data.nome || 'Sem Nome';
                if (secEl) secEl.innerText = data.secretaria_nome || data.secretaria || 'Geral';
                if (photoEl && data.foto) {
                    photoEl.innerHTML = `<img src="${data.foto}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                } else if (photoEl && data.nome) {
                    // Sem foto: mostra a inicial do nome, como no SIAG
                    photoEl.textContent = data.nome.trim().charAt(0).toUpperCase();
                }
                
                controlarVisibilidadeElementos();
            } else if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('access_token');
                sessionStorage.removeItem('access_token');
                window.location.href = 'index.html';
            }
        } catch (error) { 
            localStorage.removeItem('access_token');
            sessionStorage.removeItem('access_token');
            window.location.href = 'index.html';
        }
    }

    async function carregarNotificacoes() {
        try {
            const badge = document.getElementById('notification-badge');
            const res = await fetch('/api/transferencias/notificacoes', { headers: { Authorization: 'Bearer ' + token } });
            if (res.ok) {
                const data = await res.json();
                if (badge && data.count > 0) {
                    badge.innerText = data.count;
                    badge.classList.add('show');
                    badge.classList.remove('d-none');
                }
            }
        } catch (error) { console.error(error); }
    }

    document.addEventListener('click', (e) => {
      if (e.target.closest('#logoutBtn')) {
        e.preventDefault();
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'index.html';
      }
    });

    let temaSalvo = localStorage.getItem('theme') || 'claro';
    aplicarTema(temaSalvo);
    if (temaSelect) {
        temaSelect.value = temaSalvo;
        temaSelect.addEventListener('change', e => aplicarTema(e.target.value));
    }

    carregarUserInfo();
    carregarNotificacoes();
}