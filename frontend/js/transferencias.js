document.addEventListener("DOMContentLoaded", function () {
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    const tabelaAprovacaoBody = document.querySelector('#tabelaAprovacao tbody');
    const tabelaSolicitadasBody = document.querySelector('#tabelaSolicitadas tbody');
    const msgSemAprovacao = document.getElementById('msgSemAprovacao');
    const msgSemSolicitacao = document.getElementById('msgSemSolicitacao');
    
    // Elementos do Histórico
    const tabelaHistoricoBody = document.querySelector('#tabelaHistorico tbody');
    const msgSemHistorico = document.getElementById('msgSemHistorico');

    // Modal de Rejeição
    const rejeitarModalEl = document.getElementById('rejeitarModal');
    const rejeitarModal = new bootstrap.Modal(rejeitarModalEl);
    const confirmarRejeicaoBtn = document.getElementById('confirmarRejeicaoBtn');
    
    let currentPage = 1;
    const itemsPerPage = 15;

    /**
     * Carrega as transferências pendentes (Aprovação e Solicitadas)
     */
    async function carregarTransferencias() {
        try {
            const res = await fetch('/api/transferencias/pendentes', {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (!res.ok) throw new Error('Erro ao carregar transferências.');
            const data = await res.json();

            // 1. Tabela de Aprovação (Quem quer vir para minha secretaria)
            renderizarLinhas(tabelaAprovacaoBody, data.aguardando_aprovacao, msgSemAprovacao, true);

            // 2. Tabela de Solicitações (Quem eu pedi para vir)
            renderizarLinhas(tabelaSolicitadasBody, data.solicitadas_por_mim, msgSemSolicitacao, false);

        } catch (error) {
            console.error("Erro:", error);
        }
    }

    /**
     * Função auxiliar para renderizar as linhas das tabelas de pendentes
     */
    function renderizarLinhas(tbody, lista, msgElement, ehAprovacao) {
        tbody.innerHTML = '';
        const temDados = lista && lista.length > 0;
        if (msgElement) msgElement.classList.toggle('d-none', temDados);

        if (!temDados) return;

        lista.forEach(t => {
            const temJustificativa = t.justificativa && t.justificativa.trim() !== "";
            
            // --- LINHA PRINCIPAL DO FUNCIONÁRIO ---
            const trPrincipal = document.createElement('tr');
            if (!temJustificativa) trPrincipal.style.borderBottom = "3px solid var(--color-primary)";

            trPrincipal.innerHTML = `
                <td><strong>${t.funcionario_nome}</strong></td>
                <td>${t.funcionario_matricula}</td>
                <td>${ehAprovacao ? t.secretaria_origem_nome : t.secretaria_destino_nome}</td>
                ${ehAprovacao ? `<td>${t.secretaria_destino_nome}</td>` : ''}
                ${ehAprovacao ? `<td>${t.solicitante_nome}</td>` : ''}
                <td>${t.data_solicitacao}</td>
                <td class="text-nowrap">
                    ${ehAprovacao ? `
                        <button class="btn btn-sm btn-success btn-aprovar" data-id="${t.id}" title="Aprovar"><i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-danger btn-rejeitar" data-id="${t.id}" data-bs-toggle="modal" data-bs-target="#rejeitarModal" title="Rejeitar"><i class="fas fa-times"></i></button>
                    ` : `
                        <button class="btn btn-sm btn-warning btn-cancelar" data-id="${t.id}"><i class="fas fa-ban me-1"></i>Cancelar</button>
                    `}
                </td>
            `;
            tbody.appendChild(trPrincipal);

            // --- LINHA DA JUSTIFICATIVA (SE EXISTIR) ---
            if (temJustificativa) {
                const trJust = document.createElement('tr');
                trJust.style.borderBottom = "3px solid var(--color-primary)";
                trJust.innerHTML = `
                    <td colspan="${ehAprovacao ? 7 : 5}" class="p-0">
                        <div style="background-color: var(--bg-tertiary); color: var(--text-primary); margin: 5px 10px 15px 10px; padding: 12px; border-left: 5px solid var(--color-warning); border-radius: 4px; font-style: italic;">
                            <strong><i class="fas fa-comment-dots me-2 text-warning"></i>Justificativa:</strong> ${t.justificativa}
                        </div>
                    </td>
                `;
                tbody.appendChild(trJust);
            }
        });
    }

    /**
     * Carrega o histórico de transferências (Aprovadas, Rejeitadas e Canceladas)
     */
    window.carregarHistorico = async function(page = 1) {
        try {
            const res = await fetch(`/api/transferencias/historico?page=${page}&per_page=${itemsPerPage}`, {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (!res.ok) throw new Error('Erro ao carregar histórico.');
            const data = await res.json();

            if (tabelaHistoricoBody) tabelaHistoricoBody.innerHTML = '';
            
            if (!data.historico || data.historico.length === 0) {
                if(msgSemHistorico) msgSemHistorico.classList.remove('d-none');
                document.getElementById('paginationContainer').innerHTML = '';
                return;
            }

            if(msgSemHistorico) msgSemHistorico.classList.add('d-none');
            currentPage = data.current_page || page;

            data.historico.forEach(t => {
                const tr = document.createElement('tr');
                
                // Formatação visual dos status
                let statusBadge = '';
                if (t.status.toLowerCase() === 'aprovada') statusBadge = '<span class="badge bg-success">Aprovada</span>';
                else if (t.status.toLowerCase() === 'rejeitada') statusBadge = '<span class="badge bg-danger">Rejeitada</span>';
                else if (t.status.toLowerCase() === 'cancelada') statusBadge = '<span class="badge bg-secondary">Cancelada</span>';
                else statusBadge = `<span class="badge bg-info">${t.status}</span>`;

                // Agrupa a justificativa e o motivo da rejeição em uma célula
                let detalhes = t.justificativa ? `<div class="mb-1"><strong>Justificativa:</strong> ${t.justificativa}</div>` : '';
                if (t.motivo_rejeicao) detalhes += `<div><strong class="text-danger">Motivo Rejeição:</strong> ${t.motivo_rejeicao}</div>`;

                tr.innerHTML = `
                    <td><strong>${t.funcionario_nome}</strong></td>
                    <td>${t.funcionario_matricula}</td>
                    <td>${t.secretaria_origem_nome}</td>
                    <td>${t.secretaria_destino_nome}</td>
                    <td>${statusBadge}</td>
                    <td>${t.data_acao}</td>
                    <td>${detalhes || '<span class="text-muted">-</span>'}</td>
                `;
                tabelaHistoricoBody.appendChild(tr);
            });

            renderPagination(data.total_pages || 1, currentPage);

        } catch (error) {
            console.error("Erro ao carregar histórico:", error);
        }
    };

    /**
     * Renderiza a paginação inteligente do histórico
     */
    function renderPagination(totalPages, currentPage) {
        const paginationContainer = document.getElementById("paginationContainer");
        if (!paginationContainer) return;
        paginationContainer.innerHTML = "";
        if (totalPages <= 1) return;

        const createPageItem = (text, page, isDisabled = false, isActive = false) => {
            const li = document.createElement("li");
            li.className = `page-item ${isDisabled ? "disabled" : ""} ${isActive ? "active" : ""}`;
            const a = document.createElement("a");
            a.className = "page-link";
            a.href = "#";
            a.textContent = text;
            if (!isDisabled) {
                a.addEventListener("click", (e) => {
                    e.preventDefault();
                    window.carregarHistorico(page);
                });
            }
            li.appendChild(a);
            return li;
        };

        const nav = document.createElement("ul");
        nav.className = "pagination justify-content-center";
        nav.appendChild(createPageItem("Anterior", currentPage - 1, currentPage === 1));

        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);

        if (startPage > 1) nav.appendChild(createPageItem("1", 1));
        if (startPage > 2) nav.appendChild(createPageItem("...", 0, true));

        for (let i = startPage; i <= endPage; i++) {
            nav.appendChild(createPageItem(i, i, false, i === currentPage));
        }

        if (endPage < totalPages - 1) nav.appendChild(createPageItem("...", 0, true));
        if (endPage < totalPages) nav.appendChild(createPageItem(totalPages, totalPages));

        nav.appendChild(createPageItem("Próximo", currentPage + 1, currentPage === totalPages));
        paginationContainer.appendChild(nav);
    }

    /**
     * Executa ações (Aprovar/Cancelar) usando SweetAlert2
     */
    async function executarAcao(url, titulo, texto) {
        const result = await Swal.fire({
            title: titulo,
            text: texto,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#198754',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Sim, confirmar',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token }
                });
                const data = await res.json();
                
                if (res.ok) {
                    Swal.fire('Sucesso!', data.mensagem || 'Ação realizada com sucesso.', 'success');
                    carregarTransferencias();
                    window.carregarHistorico(1); // Atualiza o histórico
                } else {
                    Swal.fire('Erro', data.erro || 'Não foi possível completar a ação.', 'error');
                }
            } catch (error) {
                Swal.fire('Erro', 'Falha na comunicação com o servidor.', 'error');
            }
        }
    }

    // Gerenciador de cliques para botões na tabela
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const id = btn.dataset.id;
        if (btn.classList.contains('btn-aprovar')) {
            executarAcao(`/api/transferencias/${id}/aprovar`, 'Aprovar Transferência', `Deseja realmente aceitar este funcionário na sua secretaria?`);
        } else if (btn.classList.contains('btn-cancelar')) {
            executarAcao(`/api/transferencias/${id}/cancelar`, 'Cancelar Solicitação', `Deseja remover este pedido de transferência?`);
        }
    });

    // Lógica do Modal de Rejeição
    if (confirmarRejeicaoBtn) {
        confirmarRejeicaoBtn.addEventListener('click', async () => {
            const id = document.getElementById('rejeitarTransferenciaId').value;
            const motivo = document.getElementById('motivoRejeicao').value;
            
            if (!motivo.trim()) {
                // Alerta com 'target' para aparecer na frente do modal
                Swal.fire({
                    title: 'Aviso',
                    text: 'Por favor, informe o motivo da rejeição.',
                    icon: 'warning',
                    target: document.getElementById('rejeitarModal')
                });
                return;
            }

            try {
                const res = await fetch(`/api/transferencias/${id}/rejeitar`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token 
                    },
                    body: JSON.stringify({ motivo })
                });

                if (res.ok) {
                    rejeitarModal.hide(); // Fecha o modal primeiro
                    // Como o modal já está a ser fechado, não precisamos de target no sucesso
                    Swal.fire('Sucesso', 'A transferência foi rejeitada.', 'success');
                    carregarTransferencias();
                    window.carregarHistorico(1); // Atualiza o histórico
                } else {
                    const data = await res.json();
                    // Erro vindo do backend (Modal continua aberto, precisa de target)
                    Swal.fire({
                        title: 'Erro',
                        text: data.erro || 'Falha ao rejeitar.',
                        icon: 'error',
                        target: document.getElementById('rejeitarModal')
                    });
                }
            } catch (e) {
                // Erro de comunicação (Modal continua aberto, precisa de target)
                Swal.fire({
                    title: 'Erro',
                    text: 'Falha na comunicação com o servidor.',
                    icon: 'error',
                    target: document.getElementById('rejeitarModal')
                });
            }
        });
    }

    // Captura o ID da transferência ao abrir o modal de rejeição
    if (rejeitarModalEl) {
        rejeitarModalEl.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;
            document.getElementById('rejeitarTransferenciaId').value = button.getAttribute('data-id');
            document.getElementById('motivoRejeicao').value = ''; // Limpa o campo
        });
    }

    // Inicialização da Tela
    carregarTransferencias();
    window.carregarHistorico(); // Chama o histórico imediatamente ao entrar na página
});