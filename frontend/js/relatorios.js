/**
 * relatorios.js
 * Gerenciamento de Relatórios Personalizados
 */

document.addEventListener("DOMContentLoaded", function () {
    console.log("Página de relatórios carregada");
    carregarFiltrosRelatorios();
    inicializarSelectCustomizado();
    aplicarRestricoesDePerfil();
});

// ====== RESTRIÇÕES DE PERFIL ======
function aplicarRestricoesDePerfil() {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    if (!token) return;

    fetch('/api/usuarios/me', {
        headers: { Authorization: "Bearer " + token }
    })
    .then(res => res.ok ? res.json() : null)
    .then(user => {
        if (!user) return;

        // Ocultar cards restritos para perfil ativador
        if (user.perfil === "ativador") {
            document.querySelectorAll('[data-hide-for-ativador]').forEach(card => {
                card.style.display = 'none';
            });
        }

        // Fixar filtro de secretaria nos relatórios de ativos e desligados
        if (user.perfil !== "admin" && user.perfil !== "aprovador") {
            document.querySelectorAll('select[data-secretaria-locked]').forEach(select => {
                // Aguarda o carregamento das opções e então fixa o valor
                const observador = new MutationObserver(() => {
                    fixarSecretaria(select, user.secretaria_id, user.secretaria_nome);
                });
                observador.observe(select, { childList: true });

                // Também aplica imediatamente caso as opções já estejam carregadas
                fixarSecretaria(select, user.secretaria_id, user.secretaria_nome);
            });
        }
    })
    .catch(err => console.warn("Não foi possível carregar perfil do usuário:", err));
}

function fixarSecretaria(select, secretariaId, secretariaNome) {
    if (!secretariaId) return;

    // Garante que a opção correta existe
    let optionExiste = false;
    for (let opt of select.options) {
        if (String(opt.value) === String(secretariaId)) {
            optionExiste = true;
            break;
        }
    }

    if (!optionExiste && secretariaNome) {
        const novaOpcao = new Option(secretariaNome, secretariaId);
        select.add(novaOpcao);
    }

    select.value = secretariaId;
    select.disabled = true;
    select.style.opacity = '0.7';
    select.style.cursor = 'not-allowed';
}

// ====== SELECT CUSTOMIZADO PARA RELATÓRIO DE USUÁRIOS ======
function inicializarSelectCustomizado() {
    const header = document.getElementById('rel_usuarios_perfil_header');
    const list = document.getElementById('rel_usuarios_perfil_list');
    const input = document.getElementById('rel_usuarios_perfil');
    const options = list ? list.querySelectorAll('.custom-select-option') : [];

    if (!header || !list) return;

    // Abrir/fechar lista
    header.addEventListener('click', function () {
        header.classList.toggle('active');
        list.classList.toggle('active');
    });

    // Selecionar opção
    options.forEach(option => {
        option.addEventListener('click', function () {
            const value = this.getAttribute('data-value');
            const text = this.textContent;

            // Atualizar valor do input hidden
            input.value = value;

            // Atualizar texto exibido
            header.querySelector('.selected-text').textContent = text;

            // Atualizar classe selected
            options.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');

            // Fechar lista
            header.classList.remove('active');
            list.classList.remove('active');
        });
    });

    // Marcar opção inicial como selecionada
    const selectedOption = list.querySelector('[data-value="todos"]');
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }

    // Fechar ao clicar fora
    document.addEventListener('click', function (e) {
        if (!header.contains(e.target) && !list.contains(e.target)) {
            header.classList.remove('active');
            list.classList.remove('active');
        }
    });
}

// ====== CARREGAMENTO DE FILTROS (Empresas e Secretarias) ======
async function carregarFiltrosRelatorios() {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    
    if (!token) {
        console.warn("Token não encontrado. Filtros não podem ser carregados.");
        return;
    }
    
    const headers = { Authorization: "Bearer " + token };
    
    try {
        console.log("Iniciando carregamento de filtros...");
        
        // Carregar empresas
        console.log("Buscando empresas em /api/empresas");
        const resEmp = await fetch('/api/empresas', { headers });
        
        if (resEmp.ok) {
            const dataEmp = await resEmp.json();
            console.log("Resposta de empresas:", dataEmp);
            
            const empresas = Array.isArray(dataEmp) ? dataEmp : (dataEmp.data || dataEmp.empresas || []);
            console.log("Empresas processadas:", empresas);
            
            const selectsEmp = ['rel_ativos_empresa_id', 'rel_desligados_empresa_id', 'rel_aprovados_empresa_id'];
            
            selectsEmp.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    console.log(`Preenchendo select ${id} com ${empresas.length} empresas`);
                    el.innerHTML = '<option value="todos">Todas as Empresas</option>';
                    empresas.forEach(e => {
                        const optionText = e.nome_fantasia || e.razao_social || e.nome || 'Sem nome';
                        const optionValue = e.id || e.ID;
                        el.add(new Option(optionText, optionValue));
                    });
                } else {
                    console.warn(`Elemento com ID ${id} não encontrado no DOM`);
                }
            });
        } else {
            console.error(`Erro ao carregar empresas: ${resEmp.status} ${resEmp.statusText}`);
        }
        
        // Carregar secretarias
        console.log("Buscando secretarias em /api/secretarias");
        const resSec = await fetch('/api/secretarias', { headers });
        
        if (resSec.ok) {
            const dataSec = await resSec.json();
            console.log("Resposta de secretarias:", dataSec);
            
            const secretarias = Array.isArray(dataSec) ? dataSec : (dataSec.data || dataSec.secretarias || []);
            console.log("Secretarias processadas:", secretarias);
            
            const selectsSec = ['rel_ativos_secretaria_id', 'rel_desligados_secretaria_id', 'rel_aprovados_secretaria_id', 'rel_usuarios_secretaria_id'];
            
            selectsSec.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    console.log(`Preenchendo select ${id} com ${secretarias.length} secretarias`);
                    el.innerHTML = '<option value="todos">Todas as Secretarias</option>';
                    secretarias.forEach(s => {
                        const optionText = s.nome || 'Sem nome';
                        const optionValue = s.id || s.ID;
                        el.add(new Option(optionText, optionValue));
                    });
                } else {
                    console.warn(`Elemento com ID ${id} não encontrado no DOM`);
                }
            });

            // Re-aplica restrição de secretaria após popular os selects
            aplicarRestricoesDePerfil();
        } else {
            console.error(`Erro ao carregar secretarias: ${resSec.status} ${resSec.statusText}`);
        }
        
    } catch (error) {
        console.error("Erro ao carregar filtros:", error);
    }
}

// ====== FUNÇÃO ÚNICA PARA GERAR RELATÓRIOS ======
window.gerarRelatorio = async function (tipo) {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    const btn = event.currentTarget; // Captura o botão que foi clicado
    
    let url = '';
    let params = new URLSearchParams();
    let nomeArquivo = `relatorio_${tipo}_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;

    // Define URL e Parâmetros baseados no tipo
    switch (tipo) {
        case 'ativos':
            url = '/api/funcionarios/exportar-ativos';
            params.append('empresa_id', document.getElementById('rel_ativos_empresa_id').value);
            params.append('secretaria_id', document.getElementById('rel_ativos_secretaria_id').value);
            break;
        case 'desligados':
            url = '/api/funcionarios/exportar-desligados';
            params.append('data_inicio', document.getElementById('rel_desligados_data_inicio').value);
            params.append('data_fim', document.getElementById('rel_desligados_data_fim').value);
            params.append('empresa_id', document.getElementById('rel_desligados_empresa_id').value);
            params.append('secretaria_id', document.getElementById('rel_desligados_secretaria_id').value);
            break;
        case 'aprovados':
            url = '/api/relatorios/candidatos/exportar-aprovados';
            params.append('empresa_id', document.getElementById('rel_aprovados_empresa_id').value);
            params.append('secretaria_id', document.getElementById('rel_aprovados_secretaria_id').value);
            params.append('status', document.getElementById('rel_aprovados_status').value);
            break;
        case 'empresas':
            url = '/api/relatorios/empresas/exportar';
            // Empresa não tem filtros complexos no momento
            break;
        case 'usuarios':
            url = '/api/relatorios/usuarios/exportar';
            
            // Pega o valor do perfil (que já existe no HTML)
            const campoPerfil = document.getElementById('rel_usuarios_perfil');
            if (campoPerfil) {
                params.append('perfil', campoPerfil.value);
            }

            // Pega o valor da secretaria SOMENTE SE o campo existir no HTML
            const campoSecretaria = document.getElementById('rel_usuarios_secretaria_id');
            if (campoSecretaria) {
                params.append('secretaria_id', campoSecretaria.value);
            }
            break;
    }

    // Interface de carregamento no botão
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Processando...';

    try {
        const res = await fetch(`${url}?${params}`, {
            headers: { Authorization: "Bearer " + token }
        });

        if (!res.ok) throw new Error("Erro na geração");

        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        Swal.fire({ icon: 'success', title: 'Relatório gerado com sucesso!', timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire('Erro', 'Não foi possível gerar este relatório. Verifique se o servidor está ativo.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
};
