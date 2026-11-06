/**
 * LOGS_ATIVIDADE.JS
 * Gerenciamento da interface de Logs de Auditoria
 */

// Tornamos as funções globais para que possam ser chamadas pelo usuarios.js ou layout.js
window.carregarLogs = null;
window.carregarTiposDeAcao = null;

document.addEventListener("DOMContentLoaded", function () {
  const token = localStorage.getItem('access_token') || localStorage.getItem('token');
  
  const logsTableBody = document.querySelector('#logsTable tbody');
  const filtroAcao = document.getElementById('filtroAcao');
  const filtroDetalhes = document.getElementById('filtroDetalhes');
  const btnAplicarFiltro = document.getElementById('btnAplicarFiltro');
  const paginationNav = document.getElementById('pagination-nav');

  let currentPage = 1;

  // 1. DEFINIÇÃO DA FUNÇÃO DE CARGA
  window.carregarLogs = async function(page = 1) {
    if (!logsTableBody) return; // Evita erro se não estiver na tela de logs

    currentPage = page;
    const acao = filtroAcao ? filtroAcao.value : '';
    const detalhes = filtroDetalhes ? filtroDetalhes.value.trim() : '';

    // Mostra um indicador de carregamento simples
    logsTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando logs...</td></tr>';

    let url = `/api/logs_atividades?page=${page}&per_page=15`;
    if (acao) url += `&acao=${encodeURIComponent(acao)}`;
    if (detalhes) url += `&detalhes=${encodeURIComponent(detalhes)}`;

    try {
      const res = await fetch(url, {
        headers: { 
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error('Erro ao carregar logs.');

      const data = await res.json();
      
      // Limpa a tabela
      logsTableBody.innerHTML = '';

      // O backend agora envia { logs: [...] }
      const listaLogs = data.logs || [];

      if (listaLogs.length === 0) {
        logsTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum log encontrado.</td></tr>';
        if (paginationNav) paginationNav.innerHTML = '';
        return;
      }

      listaLogs.forEach(log => {
        // --- CORREÇÃO DE FUSO HORÁRIO PARA OS LOGS ---
        let dataHoraFormatada = log.data_hora || '-';
        if (log.data_hora) {
            try {
                // Força o padrão UTC (Z) se a data vier no formato padrão do banco YYYY-MM-DD HH:MM:SS
                let dataUtcStr = log.data_hora;
                if (dataUtcStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
                    dataUtcStr = dataUtcStr.replace(' ', 'T') + 'Z';
                } else if (dataUtcStr.match(/^\d{4}-\d{2}-\d{2}T/)) {
                    if (!dataUtcStr.endsWith('Z')) dataUtcStr += 'Z';
                }
                
                const d = new Date(dataUtcStr);
                if (!isNaN(d)) {
                    dataHoraFormatada = d.toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric', 
                        hour: '2-digit', minute: '2-digit'
                    }).replace(',', ' às');
                }
            } catch (e) {
                console.error("Erro ao formatar data do log:", e);
            }
        }
        // ---------------------------------------------

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><i class="fas fa-user-circle me-1"></i> ${log.usuario_nome || 'Sistema'}</td>
          <td><span class="badge bg-warning text-dark">${log.acao}</span></td>
          <td><div class="text-wrap" style="max-width: 400px;"><small>${log.detalhes || ''}</small></div></td>
          <td><i class="far fa-clock me-1"></i> ${dataHoraFormatada}</td>
          <td><code class="small">${log.ip_origem || '---'}</code></td>
        `;
        logsTableBody.appendChild(tr);
      });

      renderizarPaginacao(data.total_pages, data.current_page);

    } catch (error) {
      console.error("Erro ao carregar logs:", error);
      logsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Falha ao carregar dados.</td></tr>';
    }
  };

  // 2. CARREGAR OPÇÕES DO SELECT DE FILTRO
  window.carregarTiposDeAcao = async function() {
    if (!filtroAcao) return;

    try {
      const res = await fetch('/api/logs_atividades/acoes', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar tipos de ação.');
      
      const acoes = await res.json();
      
      // Mantém apenas a primeira opção (Todos) e adiciona as novas
      filtroAcao.innerHTML = '<option value="">Todas as Ações</option>';
      
      acoes.forEach(acao => {
        // Se a ação for "Reativação" (em qualquer formato), ignora e pula para a próxima
        if (acao.toUpperCase() === 'REATIVAÇÃO' || acao.toUpperCase() === 'REATIVACAO') {
          return;
        }

        const option = document.createElement('option');
        option.value = acao;
        option.textContent = acao;
        filtroAcao.appendChild(option);
      });
    } catch (error) {
      console.error("Erro ao carregar tipos de ação:", error);
    }
  };

  // 3. FUNÇÃO DE RENDERIZAÇÃO DA PAGINAÇÃO
  function renderizarPaginacao(totalPages, currentPage) {
    if (!paginationNav) return;
    paginationNav.innerHTML = "";

    if (!totalPages || totalPages <= 1) return;

    const nav = document.createElement("ul");
    nav.className = "pagination justify-content-center mb-0";

    // Botão Anterior
    const prevItem = document.createElement("li");
    prevItem.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
    prevItem.innerHTML = `<a class="page-link" href="#">Anterior</a>`;
    prevItem.onclick = (e) => {
      e.preventDefault();
      if (currentPage > 1) window.carregarLogs(currentPage - 1);
    };
    nav.appendChild(prevItem);

    // Lógica de redução de páginas visíveis (1, 2, 3...)
    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, startPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      const pageItem = document.createElement("li");
      pageItem.className = `page-item ${i === currentPage ? "active" : ""}`;
      pageItem.innerHTML = `<a class="page-link" href="#">${i}</a>`;
      pageItem.onclick = (e) => {
        e.preventDefault();
        window.carregarLogs(i);
      };
      nav.appendChild(pageItem);
    }

    // Botão Próximo
    const nextItem = document.createElement("li");
    nextItem.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
    nextItem.innerHTML = `<a class="page-link" href="#">Próximo</a>`;
    nextItem.onclick = (e) => {
      e.preventDefault();
      if (currentPage < totalPages) window.carregarLogs(currentPage + 1);
    };
    nav.appendChild(nextItem);

    paginationNav.appendChild(nav);
  }

  // 4. LISTENERS DE EVENTOS
  if (btnAplicarFiltro) {
    btnAplicarFiltro.addEventListener('click', () => window.carregarLogs(1));
  }
  
  if (filtroDetalhes) {
    filtroDetalhes.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') window.carregarLogs(1);
    });
  }

  // Execução inicial apenas se estivermos na página de logs
  if (logsTableBody) {
    window.carregarTiposDeAcao();
    window.carregarLogs();
  }
});