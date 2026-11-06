/**
 * funcionarios_inativos.js
 */

document.addEventListener("DOMContentLoaded", function () {
    const tableBody = document.querySelector("#funcionariosTable tbody");
    const token = localStorage.getItem("access_token");

    const searchInput = document.getElementById("searchInput");
    const btnBuscar = document.getElementById("btnBuscar");
    const paginationContainer = document.getElementById("paginationContainer");
    const tableInfo = document.getElementById("tableInfo");
    const selectEmpresa = document.getElementById("rel_empresa_id");
    const selectSecretaria = document.getElementById("rel_secretaria_id");

    // VARIÁVEIS GLOBAIS DE CONTROLE DE PÁGINA
    let currentPage = 1;
    let currentSearch = "";
    
    // VARIÁVEIS PARA NAVEGAÇÃO DO MODAL (CROSS-PAGE)
    let funcionariosAtuais = []; 
    let indiceAtualModal = 0;
    let totalPagesGlobal = 1;
    let totalItemsGlobal = 0;
    const perPage = 15; // Deve coincidir com o limite da API

    if (!token) { window.location.href = "index.html"; return; }

    // --- 1. FILTROS ---
    async function carregarFiltrosRelatorio() {
        const headers = { Authorization: "Bearer " + token };
        try {
            const [resEmp, resSec] = await Promise.all([
                fetch('/api/empresas', { headers }),
                fetch('/api/secretarias', { headers })
            ]);
            if (resEmp.ok) {
                const dataEmp = await resEmp.json();
                const lista = Array.isArray(dataEmp) ? dataEmp : (dataEmp.empresas || dataEmp.data || []);
                selectEmpresa.innerHTML = '<option value="todos">Todas as Empresas</option>';
                lista.forEach(emp => selectEmpresa.add(new Option(emp.nome || emp.razao_social || "Sem Nome", emp.id)));
            }
            if (resSec.ok) {
                const dataSec = await resSec.json();
                const lista = Array.isArray(dataSec) ? dataSec : (dataSec.secretarias || dataSec.data || []);
                selectSecretaria.innerHTML = '<option value="todos">Todas as Secretarias</option>';
                lista.forEach(sec => selectSecretaria.add(new Option(sec.nome || "Sem Nome", sec.id)));
                await aplicarRestricaoSecretariaInativos(selectSecretaria, token);
            }
        } catch (error) { console.error("Erro ao carregar filtros:", error); }
    }

    // --- 2. TABELA ---
    // --- 2. TABELA ---
    async function carregarFuncionariosInativos(searchQuery = "", page = 1) {
        try {
            if (!window.userInfo) {
                const resUser = await fetch('/api/usuarios/me', { headers: { Authorization: "Bearer " + token } });
                if (resUser.ok) {
                    window.userInfo = await resUser.json();
                }
            }

            const url = `/api/funcionarios/inativos?page=${page}&per_page=${perPage}&search=${encodeURIComponent(searchQuery)}`;
            const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
            if (res.status === 401) { window.location.href = "index.html"; return; }

            const data = await res.json();
            tableBody.innerHTML = "";
            
            // Salva dados globais para a navegação do modal inter-páginas
            funcionariosAtuais = data.funcionarios || [];
            totalPagesGlobal = data.total_pages || 1;
            totalItemsGlobal = data.total_items || 0;

            if (funcionariosAtuais.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-4">Nenhum registro encontrado.</td></tr>`;
                renderizarPaginacao(0, 1, 0);
                return;
            }

            funcionariosAtuais.forEach((f) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><small class="fw-bold">${f.matricula || ""}</small></td>
                    <td>${f.nome || ""}</td>
                    <td><small>${f.cargo || ""}</small></td>
                    <td><span class="badge bg-secondary opacity-75">${f.empresa_nome || ""}</span></td>
                    <td><small>${f.data_desligamento || ""}</small></td>
                    <td><small>${f.usuario_desligamento_nome || ""}</small></td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-primary btn-ver-detalhe px-3 shadow-sm" data-id="${f.id}" title="Ver Ficha">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            renderizarPaginacao(totalPagesGlobal, data.current_page, totalItemsGlobal);
        } catch (error) {
            console.error("Erro ao carregar tabela:", error);
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger p-4">Erro ao ligar ao servidor.</td></tr>`;
        }
    }

    // --- 3. MODAL DE DETALHE E NAVEGAÇÃO ---
    
    // Injeta dados no modal baseado na posição (index) e gerencia os bloqueios dos botões
    function preencherModalPeloIndice(index) {
        if (index < 0 || index >= funcionariosAtuais.length) return;
        
        const f = funcionariosAtuais[index];
        const perms = window.userInfo?.permissoes || {};
        
        const btnPrev = document.getElementById("btnPrevDesligado");
        const btnNext = document.getElementById("btnNextDesligado");
        const contador = document.getElementById("contadorNavegacaoModal");
        
        // Calcula a posição global (ex: Página 2, primeiro item (0) = item global 16)
        const globalIndex = ((currentPage - 1) * perPage) + index + 1;
        
        if (btnPrev) btnPrev.disabled = (currentPage === 1 && index === 0);
        if (btnNext) btnNext.disabled = (currentPage === totalPagesGlobal && index === funcionariosAtuais.length - 1);
        if (contador) contador.textContent = `${globalIndex} de ${totalItemsGlobal}`;

        // Preenche Cabeçalho Lateral
        document.getElementById("detalheNomeSuperior").textContent = f.nome || "—";
        document.getElementById("detalheCargoSuperior").textContent = f.cargo || "—";
        
        const imgPerfil = document.getElementById("detalheFotoImg");
        if (imgPerfil) {
            const avatarPadrao = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23e0e0e0'/%3E%3Ccircle cx='50' cy='38' r='18' fill='%23bdbdbd'/%3E%3Cellipse cx='50' cy='85' rx='28' ry='20' fill='%23bdbdbd'/%3E%3C/svg%3E";
            const fotoUrl = f.foto_url || f.foto;
            imgPerfil.src = (fotoUrl && fotoUrl !== "null") ? fotoUrl : avatarPadrao;
            imgPerfil.onerror = function() { this.src = avatarPadrao; };
        }

        // Preenche Inputs
        document.getElementById("detalheNome").value       = f.nome       || "";
        document.getElementById("detalheMatricula").value  = f.matricula  || "";
        document.getElementById("detalheCpf").value        = f.cpf        || "";
        document.getElementById("detalheEmpresa").value    = f.empresa_nome || f.empresa || "";
        document.getElementById("detalheSecretaria").value = f.secretaria_nome || f.secretaria || "";
        document.getElementById("detalheSetor").value      = f.setor      || "";
        document.getElementById("detalheData").value       = f.data_desligamento || "";
        document.getElementById("detalheUsuario").value    = f.usuario_desligamento_nome || "";
        
        let motivoTratado = f.motivo_desligamento || "Não Informado";
        if (motivoTratado) motivoTratado = motivoTratado.replace(/"/g, '');
        document.getElementById("detalheMotivo").value = motivoTratado;

        // Botão Reativar
        const btnReativarModal = document.getElementById("btnReativarModal");
        if (btnReativarModal) {
            btnReativarModal.dataset.id = f.id;
            btnReativarModal.dataset.nome = f.nome;

            if (perms.reativar_funcionario === false) {
                btnReativarModal.style.setProperty("display", "none", "important");
            } else {
                btnReativarModal.style.setProperty("display", "inline-block", "important");
            }
        }
    }

    // Abertura inicial do modal
    function abrirModalDetalhe(idClicado) {
        indiceAtualModal = funcionariosAtuais.findIndex(f => String(f.id) === String(idClicado));
        if (indiceAtualModal !== -1) {
            preencherModalPeloIndice(indiceAtualModal);
            bootstrap.Modal.getOrCreateInstance(document.getElementById("modalDetalheDesligado")).show();
        }
    }

    // =========================================================
    // NAVEGAÇÃO ENTRE PÁGINAS PELO MODAL
    // =========================================================
    const btnPrevModal = document.getElementById("btnPrevDesligado");
    const btnNextModal = document.getElementById("btnNextDesligado");

    btnPrevModal?.addEventListener("click", async () => {
        if (indiceAtualModal > 0) {
            // Continua na mesma página
            indiceAtualModal--;
            preencherModalPeloIndice(indiceAtualModal);
        } else if (currentPage > 1) {
            // Volta para a página anterior via API
            btnPrevModal.disabled = true;
            btnPrevModal.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
            
            currentPage--;
            await carregarFuncionariosInativos(currentSearch, currentPage);
            indiceAtualModal = funcionariosAtuais.length - 1; // Pega o último da página nova
            preencherModalPeloIndice(indiceAtualModal);
            
            btnPrevModal.innerHTML = '<i class="fas fa-chevron-left me-1"></i> Anterior';
            btnPrevModal.disabled = false;
        }
    });

    btnNextModal?.addEventListener("click", async () => {
        if (indiceAtualModal < funcionariosAtuais.length - 1) {
            // Continua na mesma página
            indiceAtualModal++;
            preencherModalPeloIndice(indiceAtualModal);
        } else if (currentPage < totalPagesGlobal) {
            // Avança para a próxima página via API
            btnNextModal.disabled = true;
            btnNextModal.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
            
            currentPage++;
            await carregarFuncionariosInativos(currentSearch, currentPage);
            indiceAtualModal = 0; // Pega o primeiro da página nova
            preencherModalPeloIndice(indiceAtualModal);
            
            btnNextModal.innerHTML = 'Próximo <i class="fas fa-chevron-right ms-1"></i>';
            btnNextModal.disabled = false;
        }
    });

    // --- 4. PAGINAÇÃO ---
    function renderizarPaginacao(totalPages, currentPageParam, totalItems) {
        if (!paginationContainer) return;
        paginationContainer.innerHTML = "";

        if (tableInfo) {
            if (totalItems > 0) {
                const startRecord = (currentPageParam - 1) * perPage + 1;
                const endRecord = Math.min(currentPageParam * perPage, totalItems);
                tableInfo.textContent = `Exibindo ${startRecord}–${endRecord} de ${totalItems} registros  |  Página ${currentPageParam} de ${totalPages}`;
            } else {
                tableInfo.textContent = `Nenhum registro encontrado`;
            }
        }

        if (totalPages <= 1) return;

        let html = '<ul class="pagination mb-0 shadow-sm flex-wrap justify-content-center">';
        html += `<li class="page-item ${currentPageParam <= 1 ? "disabled" : ""}"><a class="page-link" href="#" data-page="${currentPageParam - 1}">Anterior</a></li>`;

        let startPage = Math.max(1, currentPageParam - 2);
        let endPage = Math.min(totalPages, currentPageParam + 2);

        if (startPage > 1) {
            html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
            if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<li class="page-item ${i === currentPageParam ? "active" : ""}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
        }

        html += `<li class="page-item ${currentPageParam >= totalPages ? "disabled" : ""}"><a class="page-link" href="#" data-page="${currentPageParam + 1}">Próximo</a></li></ul>`;
        paginationContainer.innerHTML = html;
    }

    // --- 5. EXPORTAÇÃO EXCEL ---
    window.baixarRelatorioExcel = async function () {
        const btn = document.querySelector('button[onclick="baixarRelatorioExcel()"]');
        const params = new URLSearchParams({
            data_inicio: document.getElementById('rel_data_inicio').value,
            data_fim: document.getElementById('rel_data_fim').value,
            empresa_id: selectEmpresa.value,
            secretaria_id: selectSecretaria.value
        });
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        try {
            const res = await fetch(`/api/funcionarios/exportar-desligados?${params}`, {
                headers: { Authorization: "Bearer " + token }
            });
            if (!res.ok) throw new Error("Erro ao gerar ficheiro");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `relatorio_desligados_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
            Swal.fire({ icon: 'success', title: 'Relatório gerado com sucesso.', timer: 1500, showConfirmButton: false });
        } catch (e) {
            Swal.fire('Erro', 'Erro ao gerar o relatório.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    };

    // --- 6. EVENTOS GERAIS DA PÁGINA ---
    btnBuscar.addEventListener("click", () => {
        currentSearch = searchInput.value.trim(); currentPage = 1;
        carregarFuncionariosInativos(currentSearch, currentPage);
    });

    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            currentSearch = searchInput.value.trim(); currentPage = 1;
            carregarFuncionariosInativos(currentSearch, currentPage);
        }
    });

    paginationContainer.addEventListener("click", (e) => {
        e.preventDefault();
        const link = e.target.closest("a");
        if (link) {
            const page = parseInt(link.getAttribute("data-page"));
            if (page > 0) { currentPage = page; carregarFuncionariosInativos(currentSearch, currentPage); }
        }
    });

    // Abertura do modal via clique na tabela
    tableBody.addEventListener("click", async (e) => {
        const btnVer = e.target.closest(".btn-ver-detalhe");
        if (btnVer) { 
            abrirModalDetalhe(btnVer.dataset.id); 
        }
    });

    // Evento de Reativar via Modal
    document.getElementById("btnReativarModal")?.addEventListener("click", function() {
        processarReativacao(this.dataset.id, this.dataset.nome);
    });

    // Lógica de reativação
    async function processarReativacao(id, nome) {
        const { isConfirmed } = await Swal.fire({
            title: 'Reativar Funcionário?',
            text: `Deseja reativar ${nome}? Ele voltará para a lista de ativos.`,
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#198754', cancelButtonColor: '#d33',
            confirmButtonText: 'Sim, Reativar', cancelButtonText: 'Cancelar'
        });

        if (isConfirmed) {
            try {
                const res = await fetch(`/api/funcionarios/${id}/reativar`, {
                    method: "POST", headers: { Authorization: "Bearer " + token }
                });
                if (res.ok) {
                    const modalEl = document.getElementById("modalDetalheDesligado");
                    const modalInst = bootstrap.Modal.getInstance(modalEl);
                    if(modalInst) modalInst.hide();
                    
                    Swal.fire('Sucesso!', 'Funcionário reativado com sucesso.', 'success');
                    carregarFuncionariosInativos(currentSearch, currentPage);
                } else {
                    const err = await res.json();
                    Swal.fire('Erro', err.erro || 'Falha ao reativar.', 'error');
                }
            } catch (err) { Swal.fire('Erro', 'Erro de ligação ao servidor.', 'error'); }
        }
    }

    carregarFuncionariosInativos();
    carregarFiltrosRelatorio();
});

// --- FUNÇÃO AUXILIAR PARA O FILTRO ---
async function aplicarRestricaoSecretariaInativos(selectSecretaria, token) {
    try {
        let user = window.userInfo;
        if (!user) {
            const res = await fetch('/api/usuarios/me', { headers: { Authorization: "Bearer " + token } });
            if (!res.ok) return;
            user = await res.json();
        }
        
        if (user.perfil !== "admin" && user.perfil !== "aprovador") {
            let existe = false;
            for (let opt of selectSecretaria.options) {
                if (String(opt.value) === String(user.secretaria_id)) { existe = true; break; }
            }
            if (!existe && user.secretaria_id && user.secretaria_nome)
                selectSecretaria.add(new Option(user.secretaria_nome, user.secretaria_id));
            selectSecretaria.value = user.secretaria_id;
            selectSecretaria.disabled = true;
            selectSecretaria.style.opacity = '0.7';
            selectSecretaria.style.cursor = 'not-allowed';
        }
    } catch (err) { console.warn("Erro ao verificar perfil:", err); }
}