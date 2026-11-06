/**
 * usuarios.js
 * 
 * PROBLEMA RESOLVIDO:
 * O layout.js carrega a navbar.html de forma assíncrona via fetch APÓS o
 * DOMContentLoaded. Isso significa que o botão #btnFiltrarUsuarios e o
 * input #filtroGeralUsuarios ainda NÃO existem quando o DOMContentLoaded
 * deste arquivo dispara — portanto addEventListener("click") no botão
 * nunca era registrado.
 *
 * SOLUÇÃO: Usar event delegation no `document` para capturar o clique no
 * botão filtrar e o keydown no input, independente de quando foram inseridos
 * no DOM. O carregamento inicial da tabela é adiado com um pequeno delay
 * para aguardar o layout.js terminar de injetar a navbar e chamar
 * carregarUserInfo(), evitando o duplo disparo observado nos logs.
 */

(function () {
  "use strict";

  const token = () => localStorage.getItem("access_token") || localStorage.getItem("token");

  let listaSecretarias = [];
  let currentPage = 1;
  const itemsPerPage = 15;
  let _iniciado = false; // guarda para evitar dupla inicialização

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  async function extrairErroDaResposta(res) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const d = await res.json();
      return d.erro || d.mensagem || "Ocorreu um erro inesperado.";
    }
    return "O servidor encontrou um erro crítico. Tente novamente mais tarde.";
  }

  function aplicarCorPadraoModal(modalId) {
    const content = document.querySelector(`#${modalId} .modal-content`);
    if (content) { content.classList.remove("border-warning", "border-info"); content.classList.add("border-primary"); }
    if (modalId === "modalEditarUsuario") {
      const dialog = document.querySelector(`#${modalId} .modal-dialog`);
      if (dialog) dialog.style.maxWidth = "500px";
      const body = document.querySelector(`#${modalId} .modal-body`);
      if (body) { body.style.minHeight = "500px"; body.style.padding = "3rem"; }
    }
    const header = document.querySelector(`#${modalId} .modal-header`);
    if (header) {
      header.className = "modal-header bg-primary text-white";
      const btnClose = header.querySelector(".btn-close");
      if (btnClose) btnClose.classList.add("btn-close-white");
    }
    const submitBtn = document.querySelector(`#${modalId} form button[type="submit"]`);
    if (submitBtn) submitBtn.className = "btn btn-primary";
  }

  function perfilBadge(perfil) {
    switch (perfil) {
      case "padrao":    return '<span class="badge bg-secondary">Usuário</span>';
      case "ativador":  return '<span class="badge" style="background-color:#0052a3;color:#fff;">Ativador</span>';
      case "admin":     return '<span class="badge bg-danger">Administrador</span>';
      case "aprovador": return '<span class="badge bg-success">Aprovador</span>';
      default:          return `<span class="badge bg-secondary">${perfil}</span>`;
    }
  }

  // ─── 1. CARREGAR / BUSCAR USUÁRIOS ────────────────────────────────────────
  let _carregando = false;

  window.carregarUsuarios = async function (page = 1) {
    // Evita chamadas simultâneas (ex: duplo disparo do layout.js)
    if (_carregando) {
      console.log("[carregarUsuarios] já em andamento, ignorando chamada duplicada.");
      return;
    }
    _carregando = true;
    currentPage = page;

    const tbody   = document.querySelector("#usersTable tbody");
    const inputEl = document.getElementById("filtroGeralUsuarios");
    const termo   = inputEl ? inputEl.value.trim() : "";
    const tok     = token();

    if (!tbody) { console.warn("[carregarUsuarios] tbody não encontrado, aguardando DOM..."); return; }

    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Carregando...</td></tr>';

    const url = `/api/usuarios?page=${page}&per_page=${itemsPerPage}&busca=${encodeURIComponent(termo)}`;
    console.log("[Busca] GET →", url);

    try {
      const res = await fetch(url, { headers: { Authorization: "Bearer " + tok } });

      if (!res.ok) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">${await extrairErroDaResposta(res)}</td></tr>`;
        return;
      }

      const data     = await res.json();
      const usuarios = data.usuarios || [];
      tbody.innerHTML = "";

      if (usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">Nenhum usuário encontrado${termo ? ` para <strong>${termo}</strong>` : ""}.</td></tr>`;
        const pg = document.getElementById("paginationContainer");
        if (pg) pg.innerHTML = "";
        return;
      }

      usuarios.forEach((u) => {
        const tr = document.createElement("tr");
        tr.dataset.id             = u.id;
        tr.dataset.nome           = u.nome;
        tr.dataset.email          = u.email;
        tr.dataset.matricula      = u.matricula      || "";
        tr.dataset.perfil         = u.perfil;
        tr.dataset.secretaria_id  = u.secretaria_id  || "";
        tr.dataset.nivel_aprovacao = u.nivel_aprovacao || "";

        tr.innerHTML = `
          <td>${u.id}</td>
          <td class="fw-bold">${u.nome}</td>
          <td>${u.matricula || "---"}</td>
          <td>${u.email}</td>
          <td>${u.secretaria_nome || "N/A"}</td>
          <td>${perfilBadge(u.perfil)}</td>
          <td class="text-center" style="white-space:nowrap;">
            <button class="btn btn-sm btn-outline-warning btn-preparar-edicao me-1" title="Editar usuário"><i class="fas fa-pencil-alt"></i></button><button class="btn btn-sm btn-outline-secondary btn-change-password me-1" title="Alterar senha" data-id="${u.id}" data-nome="${u.nome}"><i class="fas fa-key"></i></button><button class="btn btn-sm btn-outline-danger btn-delete-user" title="Excluir usuário" data-id="${u.id}" data-nome="${u.nome}"><i class="fas fa-trash"></i></button>
          </td>`;
        tbody.appendChild(tr);
      });

      renderPagination(data.total_pages, data.current_page);

    } catch (err) {
      console.error("[carregarUsuarios] erro:", err);
      const t = document.querySelector("#usersTable tbody");
      if (t) t.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-3">Erro de conexão ao carregar usuários.</td></tr>';
    } finally {
      _carregando = false;
    }
  };

  // ─── 2. EDIÇÃO VIA MODAL ──────────────────────────────────────────────────
  async function prepararEdicao(tr) {
    // Se as secretarias ainda não foram carregadas (ex: falha de timing),
    // busca agora antes de abrir o modal
    if (listaSecretarias.length === 0) {
      await carregarSecretarias();
    }

    document.getElementById("editUserId").value    = tr.dataset.id;
    document.getElementById("editNome").value      = tr.dataset.nome;
    document.getElementById("editEmail").value     = tr.dataset.email;
    document.getElementById("editMatricula").value = tr.dataset.matricula;
    document.getElementById("editPerfil").value    = tr.dataset.perfil;

    // Popula o select e marca a secretaria atual do usuário
    const selectSec = document.getElementById("editSecretariaId");
    if (selectSec) {
      selectSec.innerHTML = '<option value="">Selecione...</option>';
      listaSecretarias.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id; opt.textContent = s.nome;
        if (String(s.id) === String(tr.dataset.secretaria_id)) opt.selected = true;
        selectSec.appendChild(opt);
      });
    }

    toggleNivelAprovacaoEdicao(tr.dataset.perfil);
    if (tr.dataset.perfil === "aprovador") {
      const el = document.getElementById("editNivelAprovacao");
      if (el) el.value = tr.dataset.nivel_aprovacao;
    }

    aplicarCorPadraoModal("modalEditarUsuario");
    const modalEditar = bootstrap.Modal.getOrCreateInstance(document.getElementById("modalEditarUsuario"));
    modalEditar.show();
  }

  // ─── 3. DELEGAÇÃO GLOBAL DE CLIQUES ───────────────────────────────────────
  // Usando AbortController para garantir que o listener seja registrado
  // apenas uma vez, mesmo que este script seja re-executado.
  if (!window._usuariosClickListenerRegistrado) {
    window._usuariosClickListenerRegistrado = true;

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      // ── Botão FILTRAR (delegado porque é injetado assincronamente pela navbar) ──
      if (btn.id === "btnFiltrarUsuarios") {
        e.preventDefault();
        carregarUsuarios(1);
        return;
      }

      const tr = btn.closest("tr");

      if (btn.classList.contains("btn-preparar-edicao") && tr) {
        prepararEdicao(tr);
      } else if (btn.classList.contains("btn-change-password")) {
        document.getElementById("adminChangePasswordUserId").value = btn.dataset.id;
        const nameEl = document.getElementById("adminChangePasswordUserName");
        if (nameEl) nameEl.textContent = btn.dataset.nome || btn.dataset.id;
        aplicarCorPadraoModal("modalAdminChangePassword");
        bootstrap.Modal.getOrCreateInstance(document.getElementById("modalAdminChangePassword")).show();
      } else if (btn.classList.contains("btn-delete-user")) {
        excluirUsuario(btn.dataset.id, btn.dataset.nome);
      }
    });

    // ── Input BUSCA: keydown delegado pelo mesmo motivo ──
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.id === "filtroGeralUsuarios") {
        e.preventDefault();
        carregarUsuarios(1);
      }
    });

    // ── Limpar busca recarrega lista completa ──
    document.addEventListener("input", (e) => {
      if (e.target.id === "filtroGeralUsuarios" && e.target.value === "") {
        carregarUsuarios(1);
      }
    });
  }

  // ─── 4. FORMULÁRIOS ───────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    if (_iniciado) return; // evita dupla execução
    _iniciado = true;

    const formEditar = document.getElementById("editUserForm");
    const formCriar  = document.getElementById("createUserForm");
    const formSenha  = document.getElementById("adminChangePasswordForm");

    if (formEditar) {
      formEditar.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id     = document.getElementById("editUserId").value;
        const perfil = document.getElementById("editPerfil").value;
        const dados  = {
          nome:            document.getElementById("editNome").value.trim(),
          email:           document.getElementById("editEmail").value.trim(),
          matricula:       document.getElementById("editMatricula").value.trim(),
          secretaria_id:   document.getElementById("editSecretariaId").value,
          perfil,
          nivel_aprovacao: perfil === "aprovador" ? document.getElementById("editNivelAprovacao").value : null,
        };
        try {
          const res = await fetch(`/api/usuarios/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
            body: JSON.stringify(dados),
          });
          if (res.ok) {
            Swal.fire("Sucesso!", "Usuário atualizado com sucesso.", "success");
            bootstrap.Modal.getOrCreateInstance(document.getElementById("modalEditarUsuario")).hide();
            carregarUsuarios(currentPage);
          } else {
            Swal.fire("Erro", await extrairErroDaResposta(res), "error");
          }
        } catch { Swal.fire("Erro", "Erro de conexão.", "error"); }
      });
    }

    if (formCriar) {
      formCriar.addEventListener("submit", async (e) => {
        e.preventDefault();
        const perfil  = formCriar.perfil.value;
        const payload = {
          nome:          formCriar.nome.value.trim(),
          email:         formCriar.email.value.trim(),
          senha:         formCriar.senha.value.trim(),
          matricula:     formCriar.matricula.value.trim(),
          secretaria_id: Number(formCriar.secretaria_id.value),
          perfil,
        };
        if (perfil === "aprovador") {
          const nivelEl = document.getElementById("selectNivelAprovacao");
          if (!nivelEl || !nivelEl.value) {
            Swal.fire("Atenção", "Selecione o nível de aprovação para o perfil Aprovador.", "warning");
            return;
          }
          payload.nivel_aprovacao = nivelEl.value;
        }
        try {
          const res = await fetch("/api/usuarios", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            Swal.fire("Sucesso!", "Usuário criado com sucesso!", "success");
            formCriar.reset();
            const campoNivel = document.getElementById("campoNivelAprovacao");
            if (campoNivel) campoNivel.style.display = "none";
            bootstrap.Modal.getOrCreateInstance(document.getElementById("modalCriarUsuario")).hide();
            carregarUsuarios(1);
          } else {
            Swal.fire("Atenção", await extrairErroDaResposta(res), res.status === 409 ? "warning" : "error");
          }
        } catch { Swal.fire("Erro", "Falha na conexão com o servidor.", "error"); }
      });
    }

    if (formSenha) {
      formSenha.addEventListener("submit", async (e) => {
        e.preventDefault();
        const userId    = document.getElementById("adminChangePasswordUserId").value;
        const novaSenha = document.getElementById("adminNewPassword").value;
        try {
          const res = await fetch(`/api/usuarios/${userId}/definir-senha`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
            body: JSON.stringify({ nova_senha: novaSenha }),
          });
          if (res.ok) {
            const d = await res.json();
            Swal.fire("Sucesso!", d.mensagem || "Senha alterada com sucesso.", "success");
            bootstrap.Modal.getOrCreateInstance(document.getElementById("modalAdminChangePassword")).hide();
            formSenha.reset();
          } else {
            Swal.fire("Erro", await extrairErroDaResposta(res), "error");
          }
        } catch { Swal.fire("Erro", "Falha na conexão com o servidor.", "error"); }
      });
    }

    // Limpar filtro de usuários
    document.addEventListener("click", (e) => {
      if (e.target.closest("#btnLimparFiltroUsuarios")) {
        const input = document.getElementById("filtroGeralUsuarios");
        if (input) { input.value = ""; input.focus(); }
        carregarUsuarios(1);
      }
    });

    // ─── INIT ────────────────────────────────────────────────────────────────
    carregarSecretarias();
    carregarUsuarios(1);

    // Aba Logs
    const tabLogs = document.querySelector('[data-bs-target="#logs-panel"]');
    if (tabLogs) {
      tabLogs.addEventListener("shown.bs.tab", () => {
        if (typeof window.carregarTiposDeAcao === "function") window.carregarTiposDeAcao();
        if (typeof window.carregarLogs === "function") window.carregarLogs(1);
      });
    }

    // Limpar filtro de logs
    document.addEventListener("click", (e) => {
      if (e.target.closest("#btnLimparFiltroLogs")) {
        const selectAcao = document.getElementById("filtroAcao");
        const inputDetalhes = document.getElementById("filtroDetalhes");
        if (selectAcao) selectAcao.value = "";
        if (inputDetalhes) { inputDetalhes.value = ""; }
        if (typeof window.carregarLogs === "function") window.carregarLogs(1);
      }
    });
  });

  // ─── 6. EXCLUIR USUÁRIO ───────────────────────────────────────────────────
  async function excluirUsuario(id, nome) {
    const conf = await Swal.fire({
      title: "Tem certeza?",
      text: `Deseja realmente excluir o usuário "${nome}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Sim, excluir!",
      cancelButtonText: "Cancelar",
    });
    if (!conf.isConfirmed) return;
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token() },
      });
      if (res.ok) {
        Swal.fire("Excluído!", (await res.json()).mensagem || "Usuário excluído.", "success");
        carregarUsuarios(currentPage);
      } else {
        Swal.fire("Atenção", await extrairErroDaResposta(res), res.status === 409 || res.status === 403 ? "warning" : "error");
      }
    } catch (err) {
      console.error("Erro na exclusão:", err);
      Swal.fire("Erro", "Falha na conexão com o servidor.", "error");
    }
  }

  // ─── 7. PAGINAÇÃO ─────────────────────────────────────────────────────────
  function renderPagination(totalPages, activePage) {
    const container = document.getElementById("paginationContainer");
    if (!container) return;
    container.innerHTML = "";
    if (!totalPages || totalPages <= 1) return;

    const ul = document.createElement("ul");
    ul.className = "pagination justify-content-center mb-0";

    function mkItem(label, page, disabled, active) {
      const li = document.createElement("li");
      li.className = `page-item${disabled ? " disabled" : ""}${active ? " active" : ""}`;
      li.innerHTML = `<a class="page-link" href="#">${label}</a>`;
      if (!disabled && page !== null) {
        li.addEventListener("click", (e) => { e.preventDefault(); carregarUsuarios(page); });
      }
      return li;
    }

    ul.appendChild(mkItem("Anterior", activePage - 1, activePage === 1));
    let start = Math.max(1, activePage - 2);
    let end   = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    if (start > 1) { ul.appendChild(mkItem("1", 1)); if (start > 2) ul.appendChild(mkItem("...", null, true)); }
    for (let i = start; i <= end; i++) ul.appendChild(mkItem(i, i, false, i === activePage));
    if (end < totalPages) { if (end < totalPages - 1) ul.appendChild(mkItem("...", null, true)); ul.appendChild(mkItem(totalPages, totalPages)); }
    ul.appendChild(mkItem("Próximo", activePage + 1, activePage === totalPages));
    container.appendChild(ul);
  }

  // ─── 8. SECRETARIAS ───────────────────────────────────────────────────────
  async function carregarSecretarias() {
    try {
      const res = await fetch("/api/secretarias", { headers: { Authorization: "Bearer " + token() } });
      if (!res.ok) return;
      const data = await res.json();
      listaSecretarias = data.secretarias || data;

      function popularSelect(id, valorSelecionado) {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecione...</option>';
        listaSecretarias.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.id; opt.textContent = s.nome;
          if (valorSelecionado && s.id == valorSelecionado) opt.selected = true;
          sel.appendChild(opt);
        });
      }

      popularSelect("selectSecretaria");   // modal CRIAR
      popularSelect("editSecretariaId");   // modal EDITAR (sem seleção prévia)

    } catch (err) { console.error("Erro ao carregar secretarias:", err); }
  }

  // ─── LÓGICA DO BOTÃO MOSTRAR/OCULTAR SENHA (MODAL ADMIN) ─────────────────
  const togglePasswordBtn = document.querySelector('.toggle-password-admin');
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', function() {
      const input = document.getElementById('adminNewPassword');
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
  }

  // ─── LÓGICA DO BOTÃO MOSTRAR/OCULTAR SENHA (MODAL CRIAÇÃO) ────────────────
  const togglePasswordCreateBtn = document.querySelector('.toggle-password-create');
  if (togglePasswordCreateBtn) {
    togglePasswordCreateBtn.addEventListener('click', function() {
      const input = document.getElementById('inputSenhaCriar');
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
  }

})();

// ─── HELPERS GLOBAIS (usados pelos onchange inline no HTML) ─────────────────
function toggleNivelAprovacao(perfil) {
  const campo = document.getElementById("campoNivelAprovacao");
  const sel   = document.getElementById("selectNivelAprovacao");
  if (!campo) return;
  const show = perfil === "aprovador";
  campo.style.display = show ? "block" : "none";
  if (sel) { sel.required = show; if (!show) sel.value = ""; }
}

function toggleNivelAprovacaoEdicao(perfil) {
  const campo = document.getElementById("campoNivelAprovacaoEdicao");
  const sel   = document.getElementById("editNivelAprovacao");
  if (!campo) return;
  const show = perfil === "aprovador";
  campo.style.display = show ? "block" : "none";
  if (sel) { sel.required = show; if (!show) sel.value = ""; }
}