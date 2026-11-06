/**
 * LOGS_ATIVIDADES.JS
 * Gerenciamento da interface de Logs de Auditoria
 * - Modal detalhado para TODOS os tipos de ação
 * - Horário corrigido: string terminada em Z é interpretada como UTC
 *   e convertida para o horário local do navegador (Brasília = UTC-3)
 */

window.carregarLogs = null;
window.carregarTiposDeAcao = null;
window.abrirDetalhesLog = null;

document.addEventListener("DOMContentLoaded", function () {
  const token = localStorage.getItem('access_token') || localStorage.getItem('token');

  const logsTableBody = document.querySelector('#logsTable tbody');
  const filtroAcao = document.getElementById('filtroAcao');
  const filtroDetalhes = document.getElementById('filtroDetalhes');
  const btnAplicarFiltro = document.getElementById('btnAplicarFiltro');
  const paginationNav = document.getElementById('paginationLogsContainer');

  let currentPage = 1;

  // ─────────────────────────────────────────────
  // INJETAR MODAL NO DOM (uma única vez)
  // ─────────────────────────────────────────────
  function injetarModal() {
    if (document.getElementById('modalDetalhesLog')) return;

    const html = `
    <div class="modal fade" id="modalDetalhesLog" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content border-0 shadow-lg" style="border-radius:12px; overflow:hidden;">

          <!-- HEADER -->
          <div class="modal-header text-white border-0 py-3 px-4"
               style="background: linear-gradient(135deg, #0d6efd 0%, #0044bb 100%);">
            <h5 class="modal-title d-flex align-items-center gap-2 fw-bold mb-0" style="font-size:1.1rem;">
              <i class="fas fa-scroll" style="color:#fff"></i>
              <span style="color: #ffffff;">Detalhes do Registro de Auditoria</span>
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>

          <!-- BODY -->
          <div class="modal-body px-4 py-4" id="modalDetalhesLogBody">
            <!-- conteúdo dinâmico injetado por JS -->
          </div>

          <!-- FOOTER -->
          <div class="modal-footer border-top px-4 py-3"
               style="background: var(--bg-tertiary, #f8f9fa);">
            <button type="button" class="btn btn-secondary fw-semibold px-4" data-bs-dismiss="modal">
              <i class="fas fa-times me-2"></i>FECHAR
            </button>
          </div>

        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ─────────────────────────────────────────────
  // CONFIGURAÇÕES DE TIPO DE AÇÃO
  // ─────────────────────────────────────────────
  const TIPO_CONFIG = {
    criacao:    { icon: 'fa-plus-circle',  cor: 'success',   label: 'Criação'    },
    edicao:     { icon: 'fa-pencil-alt',   cor: 'warning',   label: 'Edição'     },
    exclusao:   { icon: 'fa-trash-alt',    cor: 'danger',    label: 'Exclusão'   },
    acesso:     { icon: 'fa-sign-in-alt',  cor: 'info',      label: 'Acesso'     },
    senha:      { icon: 'fa-key',          cor: 'secondary', label: 'Senha'      },
    exportacao: { icon: 'fa-file-export',  cor: 'primary',   label: 'Exportação' },
    aprovacao:  { icon: 'fa-check-circle', cor: 'success',   label: 'Aprovação'  },
    reativacao: { icon: 'fa-undo-alt',     cor: 'info',      label: 'Reativação' },
    foto:       { icon: 'fa-camera',       cor: 'secondary', label: 'Foto'       },
    outro:      { icon: 'fa-info-circle',  cor: 'secondary', label: 'Atividade'  },
  };

  function getTipoConfig(tipo) {
    return TIPO_CONFIG[tipo] || TIPO_CONFIG.outro;
  }

  // ─────────────────────────────────────────────
  // FORMATAR DATA/HORA
  // ─────────────────────────────────────────────
  // O backend envia strings no formato ISO 8601 terminadas em 'Z' (UTC).
  // O construtor Date() do navegador interpreta 'Z' como UTC e converte
  // automaticamente para o fuso local — em Brasília (UTC-3) isso significa
  // subtrair 3 horas. Portanto NÃO adicionamos 'Z' manualmente se a string
  // já tiver indicador de fuso; apenas normalizamos o separador T se necessário.
  function formatarDataHora(dataHoraStr, completo = false) {
    if (!dataHoraStr || dataHoraStr === 'N/A') return '—';
    try {
      let s = dataHoraStr.trim();

      // "2025-01-15 14:30:00" → "2025-01-15T14:30:00Z"  (sem indicador = assume UTC)
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
        s = s.replace(' ', 'T') + 'Z';
      }
      // "2025-01-15T14:30:00" sem fuso → assume UTC
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
        s += 'Z';
      }
      // Caso já termine em Z ou +HH:MM: não alterar

      const d = new Date(s);
      if (isNaN(d.getTime())) return dataHoraStr;

      if (completo) {
        return d.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }).replace(',', ' às');
      }
      return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }).replace(',', ' às');
    } catch (e) {
      return dataHoraStr;
    }
  }

  // ─────────────────────────────────────────────
  // RENDERIZAR CORPO DO MODAL
  // ─────────────────────────────────────────────
  function renderizarModalBody(log) {
    const ds = log.detalhes_estruturados || {};
    const tipo = ds.tipo_acao || 'outro';
    const cfg = getTipoConfig(tipo);
    const dataFormatada = formatarDataHora(log.data_hora, true);

    // ── Seção 1: Cabeçalho ──
    let html = `
      <div class="d-flex align-items-start gap-3 mb-4 p-3 rounded-3"
           style="background:var(--bg-tertiary,#f8f9fa); border-left:4px solid var(--bs-${cfg.cor},#6c757d);">
        <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
             style="width:48px;height:48px;background:rgba(var(--bs-${cfg.cor}-rgb,108,117,125),0.15);">
          <i class="fas ${cfg.icon} text-${cfg.cor}" style="font-size:1.3rem;"></i>
        </div>
        <div class="flex-grow-1 min-w-0">
          <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
            <span class="badge bg-${cfg.cor} text-uppercase fw-bold" style="font-size:.75rem;letter-spacing:.5px;">
              ${_escaparHTML(log.acao || cfg.label)}
            </span>
            <span class="text-muted small"><i class="far fa-clock me-1"></i>${dataFormatada}</span>
          </div>
          <div class="text-muted small">
            <i class="fas fa-hashtag me-1"></i>ID do Registro: <strong class="text-body">#${log.id}</strong>
          </div>
        </div>
      </div>`;

    // ── Seção 2: Responsável ──
    html += `
      <div class="row g-3 mb-4">
        <div class="col-12">
          <h6 class="text-uppercase fw-bold small text-muted mb-3"
              style="letter-spacing:.8px;border-bottom:2px solid var(--bs-primary,#0d6efd);padding-bottom:.4rem;display:inline-block;">
            <i class="fas fa-user-shield me-2 text-primary"></i>Responsável pela Ação
          </h6>
        </div>
        <div class="col-md-6">${_campo('Usuário', log.usuario_nome || 'Sistema', 'fas fa-user')}</div>
        <div class="col-md-6">${_campo('E-mail', log.usuario_email || '—', 'fas fa-envelope')}</div>
        <div class="col-md-6">${_campo('Perfil', _formatarPerfil(log.usuario_perfil), 'fas fa-id-badge')}</div>
        <div class="col-md-6">${_campo('IP de Origem', log.ip_origem || '—', 'fas fa-network-wired')}</div>
      </div>`;

    // ── Seção 3: Detalhes da operação (dinâmico por tipo) ──
    const secaoConteudo = _renderizarSecaoConteudo(ds, log);
    if (secaoConteudo) {
      html += `
        <div class="mb-3">
          <h6 class="text-uppercase fw-bold small text-muted mb-3"
              style="letter-spacing:.8px;border-bottom:2px solid var(--bs-primary,#0d6efd);padding-bottom:.4rem;display:inline-block;">
            <i class="fas fa-file-alt me-2 text-primary"></i>Detalhes da Operação
          </h6>
          ${secaoConteudo}
        </div>`;
    }

    // ── Seção 4: Campos extras não mapeados (JSON livre) ──
    const extras = ds.campos_extras || {};
    const extrasHtml = _renderizarCamposExtras(extras);
    if (extrasHtml) {
      html += `
        <div class="mb-3">
          <h6 class="text-uppercase fw-bold small text-muted mb-3"
              style="letter-spacing:.8px;border-bottom:2px solid var(--color-gray-light,#dee2e6);padding-bottom:.4rem;display:inline-block;">
            <i class="fas fa-list me-2 text-muted"></i>Informações Adicionais
          </h6>
          <div class="row g-2">${extrasHtml}</div>
        </div>`;
    }

    // ── Seção 5: Texto bruto completo ──
    if (log.detalhes) {
      html += `
        <div class="mt-3">
          <h6 class="text-uppercase fw-bold small text-muted mb-2" style="letter-spacing:.8px;">
            <i class="fas fa-align-left me-2 text-muted"></i>Registro
          </h6>
          <div class="p-3 rounded-2 small"
               style="background:var(--bg-primary,#fff);border:1px solid var(--color-gray-light,#dee2e6);word-break:break-word;line-height:1.7;max-height:160px;overflow-y:auto;">
            ${log.detalhes}
          </div>
        </div>`;
    }

    return html;
  }

  // ─────────────────────────────────────────────
  // RENDERIZAR SEÇÃO DE CONTEÚDO POR TIPO
  // ─────────────────────────────────────────────
  function _renderizarSecaoConteudo(ds, log) {
    const tipo = ds.tipo_acao || 'outro';

    // ── EDIÇÃO: exibe campo, valor anterior e novo com destaque visual ──
    if (tipo === 'edicao') {
      const rows = [];

      // Funcionário afetado
      if (ds.funcionario) {
        rows.push(`<div class="col-12">${_campo('Funcionário / Registro Afetado', ds.funcionario, 'fas fa-user-tag')}</div>`);
      }

      // Campo alterado
      if (ds.campo_alterado) {
        rows.push(`<div class="col-12 col-md-4">${_campo('Campo Alterado', ds.campo_alterado, 'fas fa-tag')}</div>`);
      }

      // Valor anterior → novo (destaque vermelho/verde)
      const temValores = ds.valor_anterior !== undefined || ds.valor_novo !== undefined;
      if (temValores) {
        rows.push(`
          <div class="col-12 col-md-4">
            ${_campoDestacado('Valor Anterior', ds.valor_anterior ?? '—', 'danger', 'fas fa-arrow-left')}
          </div>
          <div class="col-12 col-md-4">
            ${_campoDestacado('Novo Valor', ds.valor_novo ?? '—', 'success', 'fas fa-arrow-right')}
          </div>`);
      }

      // Observação/motivo se houver
      if (ds.observacao) {
        rows.push(`<div class="col-12">${_campo('Observação', ds.observacao, 'fas fa-comment-alt')}</div>`);
      }

      return rows.length ? `<div class="row g-3">${rows.join('')}</div>` : '';
    }

    // ── CRIAÇÃO: mostra todos os dados do novo registro ──
    if (tipo === 'criacao') {
      const rows = [];
      const CAMPOS_CRIACAO = [
        ['funcionario',    'Funcionário / Nome',   'fas fa-user'],
        ['matricula',      'Matrícula',             'fas fa-id-card'],
        ['cargo',          'Cargo',                 'fas fa-briefcase'],
        ['departamento',   'Departamento',          'fas fa-sitemap'],
        ['secretaria',     'Secretaria',            'fas fa-building'],
        ['email',          'E-mail',                'fas fa-envelope'],
        ['perfil',         'Perfil de Acesso',      'fas fa-id-badge'],
        ['situacao',       'Situação',              'fas fa-info-circle'],
        ['entidade',       'Entidade',              'fas fa-layer-group'],
        ['entidade_id',    'ID da Entidade',        'fas fa-hashtag'],
        ['observacao',     'Observação',            'fas fa-comment-alt'],
      ];
      CAMPOS_CRIACAO.forEach(([key, label, icon]) => {
        if (ds[key]) rows.push(`<div class="col-12 col-md-6">${_campo(label, ds[key], icon)}</div>`);
      });
      return rows.length ? `<div class="row g-2">${rows.join('')}</div>` : '';
    }

    // ── EXCLUSÃO / INATIVAÇÃO ──
    if (tipo === 'exclusao') {
      const rows = [];
      if (ds.funcionario)  rows.push(`<div class="col-12">${_campoDestacado('Registro Removido / Inativado', ds.funcionario, 'danger', 'fas fa-user-minus')}</div>`);
      if (ds.matricula)    rows.push(`<div class="col-md-6">${_campo('Matrícula', ds.matricula, 'fas fa-id-card')}</div>`);
      if (ds.cargo)        rows.push(`<div class="col-md-6">${_campo('Cargo', ds.cargo, 'fas fa-briefcase')}</div>`);
      if (ds.departamento) rows.push(`<div class="col-md-6">${_campo('Departamento', ds.departamento, 'fas fa-sitemap')}</div>`);
      if (ds.secretaria)   rows.push(`<div class="col-md-6">${_campo('Secretaria', ds.secretaria, 'fas fa-building')}</div>`);
      if (ds.observacao)   rows.push(`<div class="col-12">${_campo('Motivo / Observação', ds.observacao, 'fas fa-comment-alt')}</div>`);
      return rows.length ? `<div class="row g-2">${rows.join('')}</div>` : '';
    }

    // ── ACESSO (LOGIN) ──
    if (tipo === 'acesso') {
      const rows = [];
      if (ds.email)        rows.push(`<div class="col-md-6">${_campo('E-mail / Usuário', ds.email, 'fas fa-envelope')}</div>`);
      if (ds.perfil)       rows.push(`<div class="col-md-6">${_campo('Perfil', _formatarPerfil(ds.perfil), 'fas fa-id-badge')}</div>`);
      if (ds.situacao)     rows.push(`<div class="col-md-6">${_campo('Resultado', ds.situacao, 'fas fa-info-circle')}</div>`);
      if (ds.observacao)   rows.push(`<div class="col-12">${_campo('Observação', ds.observacao, 'fas fa-comment-alt')}</div>`);
      return rows.length ? `<div class="row g-2">${rows.join('')}</div>` : '';
    }

    // ── SENHA ──
    if (tipo === 'senha') {
      const rows = [];
      if (ds.funcionario || ds.email) {
        rows.push(`<div class="col-12">${_campo('Usuário Afetado', ds.funcionario || ds.email, 'fas fa-user')}</div>`);
      }
      if (ds.observacao) rows.push(`<div class="col-12">${_campo('Observação', ds.observacao, 'fas fa-comment-alt')}</div>`);
      return rows.length ? `<div class="row g-2">${rows.join('')}</div>` : '';
    }

    // ── APROVAÇÃO / RECUSA ──
    if (tipo === 'aprovacao') {
      const rows = [];
      if (ds.funcionario)  rows.push(`<div class="col-md-6">${_campo('Solicitante / Funcionário', ds.funcionario, 'fas fa-user')}</div>`);
      if (ds.situacao)     rows.push(`<div class="col-md-6">${_campoDestacado('Resultado', ds.situacao, 'success', 'fas fa-check-circle')}</div>`);
      if (ds.campo_alterado) rows.push(`<div class="col-md-6">${_campo('Campo', ds.campo_alterado, 'fas fa-tag')}</div>`);
      if (ds.valor_anterior !== undefined) rows.push(`<div class="col-md-6">${_campoDestacado('Valor Anterior', ds.valor_anterior ?? '—', 'danger', 'fas fa-arrow-left')}</div>`);
      if (ds.valor_novo !== undefined)     rows.push(`<div class="col-md-6">${_campoDestacado('Novo Valor', ds.valor_novo ?? '—', 'success', 'fas fa-arrow-right')}</div>`);
      if (ds.observacao)   rows.push(`<div class="col-12">${_campo('Observação', ds.observacao, 'fas fa-comment-alt')}</div>`);
      return rows.length ? `<div class="row g-2">${rows.join('')}</div>` : '';
    }

    // ── REATIVAÇÃO ──
    if (tipo === 'reativacao') {
      const rows = [];
      if (ds.funcionario)  rows.push(`<div class="col-12">${_campoDestacado('Registro Reativado', ds.funcionario, 'info', 'fas fa-undo-alt')}</div>`);
      if (ds.matricula)    rows.push(`<div class="col-md-6">${_campo('Matrícula', ds.matricula, 'fas fa-id-card')}</div>`);
      if (ds.cargo)        rows.push(`<div class="col-md-6">${_campo('Cargo', ds.cargo, 'fas fa-briefcase')}</div>`);
      if (ds.observacao)   rows.push(`<div class="col-12">${_campo('Motivo / Observação', ds.observacao, 'fas fa-comment-alt')}</div>`);
      return rows.length ? `<div class="row g-2">${rows.join('')}</div>` : '';
    }

    // ── EXPORTAÇÃO ──
    if (tipo === 'exportacao') {
      const rows = [];
      if (ds.entidade)     rows.push(`<div class="col-md-6">${_campo('Módulo Exportado', ds.entidade, 'fas fa-layer-group')}</div>`);
      if (ds.situacao)     rows.push(`<div class="col-md-6">${_campo('Formato / Status', ds.situacao, 'fas fa-file-alt')}</div>`);
      if (ds.observacao)   rows.push(`<div class="col-12">${_campo('Observação', ds.observacao, 'fas fa-comment-alt')}</div>`);
      return rows.length ? `<div class="row g-2">${rows.join('')}</div>` : '';
    }

    // ── FOTO / IMAGEM ──
    if (tipo === 'foto') {
      const rows = [];
      if (ds.funcionario)  rows.push(`<div class="col-12">${_campo('Funcionário', ds.funcionario, 'fas fa-user')}</div>`);
      if (ds.observacao)   rows.push(`<div class="col-12">${_campo('Observação', ds.observacao, 'fas fa-comment-alt')}</div>`);
      return rows.length ? `<div class="row g-2">${rows.join('')}</div>` : '';
    }

    // ── GENÉRICO: renderiza tudo que tiver valor ──
    const linhas = _renderizarCamposGenericos(ds, ['tipo_acao','resumo','campos','campos_extras']);
    return linhas ? `<div class="row g-2">${linhas}</div>` : '';
  }

  // ─────────────────────────────────────────────
  // RENDERIZAR CAMPOS EXTRAS (JSON livre)
  // ─────────────────────────────────────────────
  function _renderizarCamposExtras(extras) {
    if (!extras || typeof extras !== 'object') return '';
    const rows = [];
    for (const [chave, valor] of Object.entries(extras)) {
      if (valor === null || valor === undefined || valor === '') continue;
      // Formata a chave: underscores → espaços, capitaliza
      const label = chave.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const valorStr = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
      rows.push(`<div class="col-12 col-md-6">${_campo(label, valorStr, 'fas fa-info-circle')}</div>`);
    }
    return rows.join('');
  }

  function _renderizarCamposGenericos(ds, ignorar = []) {
    const LABELS = {
      funcionario:    ['Funcionário',    'fas fa-user'],
      funcionario_id: ['ID Funcionário', 'fas fa-hashtag'],
      campo_alterado: ['Campo',          'fas fa-tag'],
      valor_anterior: ['Valor Anterior', 'fas fa-arrow-left'],
      valor_novo:     ['Novo Valor',     'fas fa-arrow-right'],
      email:          ['E-mail',         'fas fa-envelope'],
      perfil:         ['Perfil',         'fas fa-id-badge'],
      secretaria:     ['Secretaria',     'fas fa-building'],
      matricula:      ['Matrícula',      'fas fa-id-card'],
      departamento:   ['Departamento',   'fas fa-sitemap'],
      cargo:          ['Cargo',          'fas fa-briefcase'],
      situacao:       ['Situação',       'fas fa-info-circle'],
      entidade:       ['Entidade',       'fas fa-layer-group'],
      entidade_id:    ['ID da Entidade', 'fas fa-hashtag'],
      observacao:     ['Observação',     'fas fa-comment-alt'],
    };

    const rows = [];
    for (const [key, valor] of Object.entries(ds)) {
      if (ignorar.includes(key) || valor === null || valor === undefined || valor === '' || valor === 'N/A') continue;
      if (!(key in LABELS)) continue;
      const [label, icon] = LABELS[key];
      rows.push(`<div class="col-md-6">${_campo(label, String(valor), icon)}</div>`);
    }
    return rows.join('');
  }

  // ─────────────────────────────────────────────
  // HELPERS VISUAIS
  // ─────────────────────────────────────────────
  function _campo(label, valor, icon = 'fas fa-info-circle') {
    return `
      <div class="p-2 rounded-2" style="background:var(--bg-primary,#fff);border:1px solid var(--color-gray-light,#dee2e6);">
        <div class="d-flex align-items-center gap-1 mb-1">
          <i class="${icon} text-muted" style="font-size:.7rem;"></i>
          <span class="text-muted" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">${label}</span>
        </div>
        <div class="fw-semibold text-body" style="font-size:.9rem;word-break:break-word;color:#dee2e6">${_escaparHTML(String(valor || '—'))}</div>

      </div>`;
  }

  function _campoDestacado(label, valor, cor, icon) {
    return `
      <div class="p-2 rounded-2 border-start border-${cor} border-3"
           style="background:var(--bg-primary,#fff);border:1px solid var(--color-gray-light,#dee2e6);">
        <div class="d-flex align-items-center gap-1 mb-1">
          <i class="${icon} text-${cor}" style="font-size:.7rem;"></i>
          <span class="text-${cor}" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">${label}</span>
        </div>
        <div class="fw-bold text-${cor}" style="font-size:.95rem;word-break:break-word;">${_escaparHTML(String(valor || '—'))}</div>
      </div>`;
  }

  function _formatarPerfil(perfil) {
    const mapa = {
      admin: 'Administrador', aprovador: 'Aprovador',
      ativador: 'Ativador', padrao: 'Usuário Padrão', padrão: 'Usuário Padrão'
    };
    return mapa[perfil] || perfil || '—';
  }

  function _escaparHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─────────────────────────────────────────────
  // ABRIR MODAL
  // ─────────────────────────────────────────────
  window.abrirDetalhesLog = function (log) {
    injetarModal();

    const bodyEl = document.getElementById('modalDetalhesLogBody');
    if (bodyEl) bodyEl.innerHTML = renderizarModalBody(log);

    const modalEl = document.getElementById('modalDetalhesLog');
    if (modalEl) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  };

  // ─────────────────────────────────────────────
  // CARREGAR LOGS
  // ─────────────────────────────────────────────
  window.carregarLogs = async function (page = 1) {
    if (!logsTableBody) return;

    currentPage = page;
    const acao = filtroAcao ? filtroAcao.value : '';
    const detalhes = filtroDetalhes ? filtroDetalhes.value.trim() : '';

    logsTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted">
      <i class="fas fa-spinner fa-spin me-2"></i>Carregando registros...</td></tr>`;

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
      logsTableBody.innerHTML = '';

      const listaLogs = data.logs || [];
      if (listaLogs.length === 0) {
        logsTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">
          <i class="fas fa-search me-2"></i>Nenhum registro encontrado.</td></tr>`;
        if (paginationNav) paginationNav.innerHTML = '';
        return;
      }

      listaLogs.forEach(log => {
        const ds = log.detalhes_estruturados || {};
        const tipo = ds.tipo_acao || 'outro';
        const cfg = getTipoConfig(tipo);
        const dataFormatada = formatarDataHora(log.data_hora);

        // Resumo para a coluna Detalhes
        let resumoDetalhes = '';
        if (ds.funcionario) {
          resumoDetalhes = `<i class="fas fa-user me-1 text-muted"></i>${_escaparHTML(ds.funcionario)}`;
          if (ds.campo_alterado) resumoDetalhes += ` &middot; <span class="text-muted">${_escaparHTML(ds.campo_alterado)}</span>`;
        } else if (ds.email) {
          resumoDetalhes = `<i class="fas fa-envelope me-1 text-muted"></i>${_escaparHTML(ds.email)}`;
        } else if (log.detalhes) {
          const texto = log.detalhes.length > 80 ? log.detalhes.substring(0, 80) + '…' : log.detalhes;
          resumoDetalhes = `<span class="text-muted">${_escaparHTML(texto)}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="rounded-circle bg-light d-flex align-items-center justify-content-center flex-shrink-0"
                   style="width:32px;height:32px;">
                <i class="fas fa-user-circle text-secondary" style="font-size:.95rem;"></i>
              </div>
              <div>
                <div class="fw-semibold small">${_escaparHTML(log.usuario_nome || 'Sistema')}</div>
                ${log.usuario_email ? `<div class="text-muted" style="font-size:.72rem;">${_escaparHTML(log.usuario_email)}</div>` : ''}
              </div>
            </div>
          </td>
          <td>
            <span class="badge bg-${cfg.cor} d-inline-flex align-items-center gap-1" style="font-size:.75rem;">
              <i class="fas ${cfg.icon}"></i>
              ${_escaparHTML(log.acao)}
            </span>
          </td>
          <td>
            <div class="small">${resumoDetalhes || '<span class="text-muted">—</span>'}</div>
          </td>
          <td>
            <div class="small d-flex align-items-center gap-1 text-muted">
              <i class="far fa-clock" style="font-size:.75rem;"></i>
              ${dataFormatada}
            </div>
          </td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary rounded-circle p-0 btn-ver-detalhes"
                    style="width:32px;height:32px;" title="Ver detalhes completos">
              <i class="fas fa-eye" style="font-size:.85rem;"></i>
            </button>
          </td>`;

        tr.querySelector('.btn-ver-detalhes').addEventListener('click', () => {
          window.abrirDetalhesLog(log);
        });

        logsTableBody.appendChild(tr);
      });

      renderizarPaginacao(data.total_pages, data.current_page);
    } catch (error) {
      console.error("Erro ao carregar logs:", error);
      logsTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">
        <i class="fas fa-exclamation-circle me-2"></i>Falha ao carregar dados.</td></tr>`;
    }
  };

  // ─────────────────────────────────────────────
  // CARREGAR TIPOS DE AÇÃO
  // ─────────────────────────────────────────────
  window.carregarTiposDeAcao = async function () {
    if (!filtroAcao) return;
    try {
      const res = await fetch('/api/logs_atividades/acoes', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) throw new Error();
      const acoes = await res.json();
      filtroAcao.innerHTML = '<option value="">Todas as Ações</option>';
      acoes.forEach(acao => {
        if (!acao) return;
        const a = acao.toUpperCase();
        if (a === 'REATIVAÇÃO' || a === 'REATIVACAO') return;
        const opt = document.createElement('option');
        opt.value = acao;
        opt.textContent = acao;
        filtroAcao.appendChild(opt);
      });
    } catch (e) {
      console.error("Erro ao carregar tipos de ação:", e);
    }
  };

  // ─────────────────────────────────────────────
  // PAGINAÇÃO
  // ─────────────────────────────────────────────
  function renderizarPaginacao(totalPages, currentPage) {
    if (!paginationNav) return;
    paginationNav.innerHTML = '';
    if (!totalPages || totalPages <= 1) return;

    const nav = document.createElement('ul');
    nav.className = 'pagination justify-content-center mb-0';

    // Botão: Primeira Página
    const first = document.createElement('li');
    first.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    first.innerHTML = `<a class="page-link" href="#" title="Primeira página"><i class="fas fa-step-backward"></i></a>`;
    first.onclick = e => { e.preventDefault(); if (currentPage > 1) window.carregarLogs(1); };
    nav.appendChild(first);

    // Botão: Anterior
    const prev = document.createElement('li');
    prev.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prev.innerHTML = `<a class="page-link" href="#"><i class="fas fa-chevron-left"></i> Anterior</a>`;
    prev.onclick = e => { e.preventDefault(); if (currentPage > 1) window.carregarLogs(currentPage - 1); };
    nav.appendChild(prev);

    // Números de página
    const start = Math.max(1, currentPage - 1);
    const end = Math.min(totalPages, start + 2);
    for (let i = start; i <= end; i++) {
      const li = document.createElement('li');
      li.className = `page-item ${i === currentPage ? 'active' : ''}`;
      li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
      li.onclick = e => { e.preventDefault(); window.carregarLogs(i); };
      nav.appendChild(li);
    }

    // Botão: Próximo
    const next = document.createElement('li');
    next.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    next.innerHTML = `<a class="page-link" href="#">Próximo <i class="fas fa-chevron-right"></i></a>`;
    next.onclick = e => { e.preventDefault(); if (currentPage < totalPages) window.carregarLogs(currentPage + 1); };
    nav.appendChild(next);

    // Botão: Última Página
    const last = document.createElement('li');
    last.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    last.innerHTML = `<a class="page-link" href="#" title="Última página"><i class="fas fa-step-forward"></i></a>`;
    last.onclick = e => { e.preventDefault(); if (currentPage < totalPages) window.carregarLogs(totalPages); };
    nav.appendChild(last);

    paginationNav.appendChild(nav);
  }

  // ─────────────────────────────────────────────
  // EVENTOS
  // ─────────────────────────────────────────────
  if (btnAplicarFiltro) {
    btnAplicarFiltro.addEventListener('click', () => window.carregarLogs(1));
  }
  if (filtroDetalhes) {
    filtroDetalhes.addEventListener('keypress', e => {
      if (e.key === 'Enter') window.carregarLogs(1);
    });
  }

  const btnLimparLogs = document.getElementById('btnLimparFiltroLogs');
  if (btnLimparLogs) {
    btnLimparLogs.addEventListener('click', () => {
      if (filtroAcao) filtroAcao.value = '';
      if (filtroDetalhes) filtroDetalhes.value = '';
      window.carregarLogs(1);
    });
  }

  // ─────────────────────────────────────────────
  // INICIALIZAÇÃO
  // ─────────────────────────────────────────────
  if (logsTableBody) {
    injetarModal();
    window.carregarTiposDeAcao();
    window.carregarLogs();
  }
});
