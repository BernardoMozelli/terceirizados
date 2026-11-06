document.addEventListener("DOMContentLoaded", function () {
  // ====== 1. Autenticação ======
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");
  if (!token) {
    window.location.href = "index.html";
    return;
  }

  // ====== 2. Variáveis de Estado ======
  let listaEmpresas = [];
  let currentPage = 1;
  const itemsPerPage = 15;
  let todosFuncionarios = []; // Armazena TODOS os funcionários do utilizador
  let statusCheckboxCache = {}; // Cache para preservar estado dos checkboxes ao navegar entre páginas

  // ==========================================
  // HELPER INTELIGENTE PARA FOTOS
  // ==========================================
  function getUrlFoto(caminhoFoto) {
    if (!caminhoFoto || caminhoFoto === "null") return "";
    if (caminhoFoto.startsWith("data:image")) return caminhoFoto;
    if (caminhoFoto.startsWith("http")) return caminhoFoto;

    let base = "";

    if (typeof API_BASE_URL !== "undefined") {
      base = API_BASE_URL;
    } else if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.origin.includes("5500") ||
      window.location.origin.includes("3000") ||
      window.location.origin === "file://"
    ) {
      // Ambiente de Desenvolvimento Local
      base = "http://127.0.0.1:5000";
    } else {
      // Ambiente de Produção
      // Captura automaticamente o protocolo + domínio do servidor (ex: https://portal.santaluzia.mg.gov.br)
      base = window.location.origin;
    }

    // CORREÇÃO: Força a rota /static/uploads/ ao invés da rota de API quebrada
    let caminho = caminhoFoto.startsWith("/")
      ? caminhoFoto.substring(1)
      : caminhoFoto;
    if (!caminho.startsWith("static/uploads/")) {
      caminho = "static/uploads/" + caminho;
    }

    return `${base}/${caminho}`.replace(/([^:]\/)\/+/g, "$1");
  }

  // ====== 3. Funções de Comunicação com a API ======

  /* // BLOCO DESATIVADO EM 23/03/2026 
        // Motivo: A gestão de status agora é individual via Super Modal.
        async function carregarUltimoSalvamento() {
            try {
                const res = await fetch("/api/usuarios/me/last-status-save", {
                    headers: {
                        Authorization: "Bearer " + token
                    },
                });
                const lastSaveInfo = document.getElementById("lastSaveInfo");
                if (!lastSaveInfo) return;

                if (res.ok) {
                    const data = await res.json();
                    lastSaveInfo.innerHTML = "";

                    if (data.last_save_date) {
                        const diasDesde = data.dias_desde_confirmacao;
                        const diasAlerta = data.dias_alerta;
                        const diasRestantes = diasAlerta - diasDesde;

                        let alertClass = "alert-success",
                            iconClass = "fa-check-circle";
                        let msg = `Status em dia. Último: <strong>${data.last_save_date}</strong>.`;

                        if (diasDesde >= diasAlerta) {
                            alertClass = "alert-danger";
                            iconClass = "fa-exclamation-triangle";
                            msg = `<strong>ATENÇÃO:</strong> Prazo expirou há ${-diasRestantes} dia(s). Salve agora!`;
                        } else if (diasDesde >= diasAlerta * 0.75) {
                            alertClass = "alert-warning";
                            iconClass = "fa-exclamation-circle";
                            msg = `<strong>ALERTA:</strong> Faltam ${diasRestantes} dia(s) para expirar.`;
                        }

                        lastSaveInfo.className = `alert ${alertClass} d-flex align-items-center p-2 mb-0 mt-2`;
                        lastSaveInfo.innerHTML = `<i class="fas ${iconClass} me-2"></i><div style="font-size: 0.9rem;">${msg}</div>`;
                    } else {
                        lastSaveInfo.className =
                            "alert alert-info d-flex align-items-center p-2 mb-0 mt-2";
                        lastSaveInfo.innerHTML = `<i class="fas fa-info-circle me-2"></i><div style="font-size: 0.9rem;">Nenhum status salvo ainda.</div>`;
                    }
                }
            } catch (error) {
                console.error("Erro ao carregar data:", error);
            }
        }
        */

  async function carregarFuncionarios(filtro_geral = "", page = 1) {
    let url = `/api/funcionarios?page=${page}&per_page=${itemsPerPage}`;
    if (filtro_geral)
      url += `&filtro_geral=${encodeURIComponent(filtro_geral)}`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: "Bearer " + token,
        },
      });
      if (res.status === 401) {
        localStorage.removeItem("access_token");
        window.location.href = "index.html";
        return;
      }
      if (!res.ok) throw new Error("Falha ao carregar funcionários.");

      const data = await res.json();
      window._funcTotalItems = data.total_items || data.total || 0;
      renderizarTabela(data);
      renderPagination(data.total_pages || 1);
    } catch (error) {
      console.error(error);
      if (typeof Swal !== "undefined")
        Swal.fire(
          "Erro",
          "Não foi possível carregar os funcionários.",
          "error",
        );
    }
  }

  // Função para carregar TODOS os funcionários (sem paginação) para o Salvar Status
  async function carregarTodosFuncionarios(filtro_geral = "") {
    let url = `/api/funcionarios?per_page=9999`; // Carrega todos de uma vez
    if (filtro_geral)
      url += `&filtro_geral=${encodeURIComponent(filtro_geral)}`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: "Bearer " + token,
        },
      });
      if (!res.ok) throw new Error("Falha ao carregar todos os funcionários.");

      const data = await res.json();
      todosFuncionarios = data.funcionarios || data;
      return todosFuncionarios;
    } catch (error) {
      console.error("Erro ao carregar todos os funcionários:", error);
      return [];
    }
  }

  async function carregarEGuardarEmpresas() {
    if (listaEmpresas.length > 0) return;
    try {
      const res = await fetch("/api/empresas?per_page=9999", {
        headers: {
          Authorization: "Bearer " + token,
        },
      });
      if (res.ok) listaEmpresas = (await res.json()).empresas;
    } catch (error) {
      console.error("Erro ao buscar empresas:", error);
    }
  }

  window.carregarSecretariasParaTransferencia = async function () {
    try {
      const res = await fetch("/api/secretarias", {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("access_token"),
        },
      });

      if (res.ok) {
        const secretarias = await res.json();
        const select = document.getElementById("selectSecretariaDestino");
        if (!select) return;

        select.innerHTML =
          '<option value="">Selecione a secretaria...</option>';

        // LÓGICA MESTRA: Esconder a secretaria onde o funcionário JÁ ESTÁ
        // Pegamos o ID da secretaria que está escrito no Super Modal agora
        const idParaEsconder = window.funcionarioAtualSecretariaId
          ? String(window.funcionarioAtualSecretariaId)
          : "";

        secretarias.forEach((s) => {
          if (String(s.id) !== idParaEsconder) {
            select.appendChild(new Option(s.nome, s.id));
          }
        });
      }
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
    }
  };

  async function carregarSecretariasParaForm() {
    console.log("Iniciando carregamento de secretarias...");
    try {
      if (!window.userInfo) {
        console.log("UserInfo ausente, buscando...");
        const resUser = await fetch("/api/usuarios/me", {
          headers: {
            Authorization: "Bearer " + token,
          },
        });
        if (resUser.ok) window.userInfo = await resUser.json();
      }

      const perfil = (window.userInfo?.perfil || "").toLowerCase();
      console.log("Perfil detectado:", perfil);

      const res = await fetch("/api/secretarias", {
        headers: {
          Authorization: "Bearer " + token,
        },
      });
      if (!res.ok) throw new Error("Erro na API de secretarias");

      const secretarias = await res.json();
      console.log("Secretarias recebidas:", secretarias.length);

      const selectSec =
        document.getElementById("selectSecretaria") ||
        document.querySelector('[name="secretaria_id"]');

      if (!selectSec) {
        console.error(
          "ERRO: Elemento 'selectSecretaria' não encontrado no HTML!",
        );
        return;
      }

      selectSec.innerHTML =
        '<option value="">Selecione a secretaria...</option>';
      secretarias.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.nome;
        selectSec.appendChild(opt);
      });

      if (perfil === "admin") {
        console.log("Liberando campo para admin.");
        selectSec.disabled = false;
        selectSec.readOnly = false;
      } else {
        console.log("Travando campo para usuário comum.");
        selectSec.value = window.userInfo?.secretaria_id || "";
        selectSec.disabled = true;
      }
    } catch (error) {
      console.error("Falha fatal no carregamento:", error);
    }
  }

  async function carregarEmpresasParaForm() {
    try {
      const res = await fetch("/api/empresas?per_page=9999", {
        headers: {
          Authorization: "Bearer " + token,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const selectEmp = document.getElementById("selectEmpresa");
        if (!selectEmp) return;

        selectEmp.innerHTML = '<option value="">Selecione a empresa</option>';
        data.empresas.forEach((e) => {
          selectEmp.appendChild(new Option(e.nome, e.id));
        });
      }
    } catch (error) {
      console.error("Erro ao carregar empresas form:", error);
    }
  }

  async function salvarEdicaoInline(tr) {
    const btn = tr.querySelector(".btn-save-inline");
    if (!btn) return;
    const idFuncionario = btn.dataset.id;
    const dadosAtualizados = {};

    tr.querySelectorAll(".editable").forEach((col) => {
      const field = col.dataset.field;
      dadosAtualizados[field] =
        field === "empresa_id"
          ? col.querySelector("select").value
          : col.textContent.trim();
    });

    try {
      const res = await fetch(`/api/funcionarios/${idFuncionario}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(dadosAtualizados),
      });
      if (res.ok) {
        if (typeof Swal !== "undefined")
          Swal.fire(
            "Sucesso!",
            "Funcionário atualizado com sucesso!",
            "success",
          );
        const newEmpresaId = dadosAtualizados.empresa_id;
        if (newEmpresaId) {
          const empresaCell = tr.querySelector('[data-field="empresa_id"]');
          const empSelecionada = listaEmpresas.find(
            (e) => String(e.id) === String(newEmpresaId),
          );
          empresaCell.textContent = empSelecionada
            ? empSelecionada.nome
            : "N/A";
          empresaCell.dataset.currentId = newEmpresaId;
        }
        desativarEdicao(tr);
      } else {
        const erro = await res.json();
        throw new Error(erro.erro || "Erro desconhecido");
      }
    } catch (error) {
      if (typeof Swal !== "undefined")
        Swal.fire("Erro", error.message, "error");
    }
  }

  async function efetuarSalvamentoStatus(updates) {
    if (!updates || updates.length === 0) return;
    try {
      const res = await fetch("/api/confirmacoes_status/confirmar_status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof Swal !== "undefined") {
          const temErroAD = data.ad_errors && data.ad_errors.length > 0;
          let titulo = temErroAD ? "Guardado com Avisos" : "Sucesso!";
          let icone = temErroAD ? "warning" : "success";
          let textoHtml = data.mensagem || "Status guardado com sucesso!";

          if (temErroAD) {
            textoHtml +=
              '<br><br><div style="text-align: left; background: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; font-size: 0.9em; border: 1px solid #ffeeba;">';
            textoHtml += "<strong>Avisos do Active Directory:</strong><br>";
            textoHtml += data.ad_errors.join("<br><br>");
            textoHtml += "</div>";
          }
          Swal.fire({
            title: titulo,
            html: textoHtml,
            icon: icone,
            confirmButtonColor: "#198754",
          });
        }
        const searchInput = document.getElementById("searchInput");
        carregarFuncionarios(
          searchInput ? searchInput.value.trim() : "",
          currentPage,
        );
      } else {
        const erro = await res.json();
        throw new Error(
          erro.erro || erro.mensagem || "Erro ao guardar o status",
        );
      }
    } catch (error) {
      if (typeof Swal !== "undefined")
        Swal.fire("Erro", error.message, "error");
    }
  }

  // ==========================================
  // FORMATADOR DE CPF (APENAS EXIBIÇÃO)
  // ==========================================
  function formatarCPF(cpf) {
    if (!cpf) return "";

    cpf = String(cpf).replace(/\D/g, ""); // remove tudo que não for número

    if (cpf.length !== 11) return cpf; // evita erro se vier inválido

    return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }

  // ====== 4. Funções de Renderização ======

  function renderizarTabela(data) {
    const tabela = document.getElementById("funcionariosTable");
    const tbody = tabela.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const funcionarios = data.funcionarios || data;
    currentPage = data.current_page || 1;

    // 1. Identifica se estamos no modo Desligados (todos ou a maioria tem status 0)
    const isModoDesligados =
      funcionarios.length > 0 &&
      funcionarios.every((f) => String(f.status_contratual) === "0");

    if (isModoDesligados) {
      tabela.classList.add("modo-desligados");
    } else {
      tabela.classList.remove("modo-desligados");
    }

    funcionarios.forEach((f) => {
      const tr = document.createElement("tr");

      // 2. Lógica da última célula (Check para Ativos, Botão para Desligados)
      let conteudoAcao = "";

      if (isModoDesligados) {
        // Botão Reativar (Sempre visível no modo desligados)
        conteudoAcao = `<button class="btn btn-sm btn-success" onclick="reativarFuncionario(${f.id})">
                                    <i class="fas fa-undo"></i> Reativar
                                </button>`;
      } else {
        // Checkbox (Forçado como MARCADO se o status for 1 ou "1")
        // Ignoramos o cache aqui para garantir que ativos apareçam marcados
        const statusAtivo = String(f.status_contratual) === "1";
        conteudoAcao = `<input type="checkbox" class="form-check-input status-check" 
                                    data-id="${f.id}" 
                                    ${statusAtivo ? "checked" : ""} 
                                    style="width: 20px; height: 20px;">`;
      }

      tr.innerHTML = `
                <td class="text-nowrap">
                    <button class="btn btn-sm btn-primary" title="Abrir Central" onclick="abrirSuperModal(${f.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
                <td>${f.matricula}</td>
                <td>${f.nome}</td>
                <td>${f.cargo}</td>
                <td>${formatarCPF(f.cpf)}</td>
                <td>${f.empresa_nome || ""}</td>
                <td>${f.secretaria_nome || ""}</td>
                <td>${f.setor || ""}</td>
                <td class="text-center last-col-content col-status-acao">${conteudoAcao}</td>
            `;
      tbody.appendChild(tr);
    });

    if (window.controlarVisibilidadeElementos)
      window.controlarVisibilidadeElementos();
  }

  function renderPagination(totalPages) {
    const paginationContainer = document.getElementById("paginationContainer");
    if (!paginationContainer) return;
    paginationContainer.innerHTML = "";

    // Atualiza o contador de registros
    const tableInfo = document.getElementById("tableInfo");
    if (tableInfo) {
      const total = window._funcTotalItems || 0;
      if (total > 0) {
        const startRecord = (currentPage - 1) * itemsPerPage + 1;
        const endRecord = Math.min(currentPage * itemsPerPage, total);
        tableInfo.textContent = `Exibindo ${startRecord}–${endRecord} de ${total} registros  |  Página ${currentPage} de ${totalPages}`;
      } else {
        tableInfo.textContent = "";
      }
    }

    if (totalPages <= 1) return;

    let html = '<ul class="pagination mb-0 shadow-sm flex-wrap justify-content-center">';
    html += `<li class="page-item ${currentPage <= 1 ? "disabled" : ""}"><a class="page-link" href="#" data-page="${currentPage - 1}">Anterior</a></li>`;

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
      html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
      if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `<li class="page-item ${i === currentPage ? "active" : ""}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
      html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
    }

    html += `<li class="page-item ${currentPage >= totalPages ? "disabled" : ""}"><a class="page-link" href="#" data-page="${currentPage + 1}">Próximo</a></li></ul>`;
    paginationContainer.innerHTML = html;

    // Delegação de eventos de paginação (usando data-page para compatibilidade com super-modal)
    paginationContainer.querySelectorAll("a.page-link[data-page]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const page = parseInt(link.getAttribute("data-page"));
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
          const searchInput = document.getElementById("searchInput");
          carregarFuncionarios(searchInput ? searchInput.value.trim() : "", page);
        }
      });
    });
  }

  async function ativarEdicao(tr) {
    await carregarEGuardarEmpresas();
    tr.querySelectorAll(".editable").forEach((col) => {
      col.dataset.originalValue = col.innerHTML;
      const field = col.dataset.field;
      col.classList.add("table-warning");

      if (field === "empresa_id") {
        const currentId = col.dataset.currentId;
        col.innerHTML = "";
        const select = document.createElement("select");
        select.className = "form-select form-select-sm w-auto";
        select.add(new Option("Selecione...", ""));
        listaEmpresas.forEach((emp) => {
          const option = new Option(emp.nome, emp.id);
          if (String(emp.id) === String(currentId)) option.selected = true;
          select.add(option);
        });
        col.appendChild(select);
      } else {
        col.contentEditable = "true";
      }
    });
    const btn = tr.querySelector(".btnEditarInline");
    const id = btn ? btn.dataset.id : "";
    const actionsCell = tr.querySelector("td:nth-child(2)");
    if (actionsCell) {
      actionsCell.innerHTML = `
                    <button class="btn btn-sm btn-link btn-save-inline p-1" data-id="${id}" title="Salvar"><i class="fas fa-save text-success"></i></button>
                    <button class="btn btn-sm btn-link btn-cancel-inline p-1" data-id="${id}" title="Cancelar"><i class="fas fa-times text-danger"></i></button>`;
    }
  }

  function desativarEdicao(tr) {
    tr.querySelectorAll(".editable").forEach((col) => {
      col.contentEditable = "false";
      col.classList.remove("table-warning");
      if (col.dataset.originalValue) delete col.dataset.originalValue;
    });
    const btn = tr.querySelector("button");
    const id = btn ? btn.dataset.id : "";
    const nomeCell = tr.querySelector('[data-field="nome"]');
    const nome = nomeCell ? nomeCell.textContent : "";
    const actionsCell = tr.querySelector("td:nth-child(2)");
    if (actionsCell) {
      actionsCell.innerHTML = `
                    <button class="btn btn-sm btn-link btnEditarInline p-1" data-id="${id}" title="Editar" data-permission="editar_funcionario"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-sm btn-link btn-transfer p-1" data-id="${id}" data-nome="${nome}" title="Transferir" data-permission="transferir_funcionario"><i class="fas fa-exchange-alt"></i></button>`;
    }
  }

  // ====== 5. Delegação de Eventos ======

  document.addEventListener("change", (event) => {
    if (event.target && event.target.classList.contains("status-check")) {
      const funcionarioId = Number(event.target.dataset.id);
      statusCheckboxCache[funcionarioId] = event.target.checked;
    }
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const tr = button.closest("tr");

    if (button.classList.contains("btnEditarInline")) {
      if (tr) await ativarEdicao(tr);
    } else if (button.classList.contains("btn-save-inline")) {
      if (tr) await salvarEdicaoInline(tr);
    } else if (button.classList.contains("btn-cancel-inline")) {
      if (tr) {
        tr.querySelectorAll(".editable").forEach((col) => {
          if (col.dataset.originalValue !== undefined)
            col.innerHTML = col.dataset.originalValue;
        });
        desativarEdicao(tr);
      }
    } else if (button.classList.contains("btn-transfer")) {
      document.getElementById("transferFuncionarioId").value =
        button.dataset.id;
      document.getElementById("transferFuncionarioName").textContent =
        button.dataset.nome;
      bootstrap.Modal.getOrCreateInstance(
        document.getElementById("modalTransferirFuncionario"),
      ).show();
    } else if (button.classList.contains("btn-alterar-foto")) {
      abrirModalEditarFoto(button.dataset.id, null);
    }
  });

  // ====== 6. Busca e Filtros ======

  const searchBtn = document.getElementById("searchBtn");
  const searchInput = document.getElementById("searchInput");
  const clearSearchLink = document.getElementById("clearSearchLink");

  if (searchBtn)
    searchBtn.addEventListener("click", () =>
      carregarFuncionarios(searchInput?.value.trim(), 1),
    );
  if (searchInput)
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") searchBtn?.click();
    });
  if (clearSearchLink) {
    clearSearchLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (searchInput) searchInput.value = "";
      carregarFuncionarios();
    });
  }

  const masterCheck = document.getElementById("masterStatusCheck");
  if (masterCheck) {
    masterCheck.addEventListener("change", async (e) => {
      document.querySelectorAll(".status-check").forEach((cb) => {
        cb.checked = e.target.checked;
        const funcionarioId = Number(cb.dataset.id);
        statusCheckboxCache[funcionarioId] = e.target.checked;
      });

      const searchInput = document.getElementById("searchInput");
      const filtroAtual = searchInput ? searchInput.value.trim() : "";
      const todosFuncs = await carregarTodosFuncionarios(filtroAtual);

      todosFuncs.forEach((f) => {
        statusCheckboxCache[f.id] = e.target.checked;
      });
    });
  }

  // ====== 7. Modais ======

  const modalCriarEl = document.getElementById("modalCriarFuncionario");
  if (modalCriarEl) {
    modalCriarEl.addEventListener("show.bs.modal", async (event) => {
      const secIdInput = document.getElementById("secretariaIdInput");
      if (secIdInput) secIdInput.value = window.userInfo?.secretaria_id || "";
      await carregarEmpresasParaForm();
      await carregarSecretariasParaForm();
      const formModal = document.getElementById("createFuncionarioFormModal");
      const triggerBtn = event.relatedTarget;
      if (
        formModal &&
        (!triggerBtn || !triggerBtn.classList.contains("btnEditarInline"))
      ) {
        formModal.reset();
        formModal.removeAttribute("data-edit-id");
      }
    });
  }

  const formCriar = document.getElementById("createFuncionarioFormModal");
  if (formCriar) {
    formCriar.addEventListener("submit", async (e) => {
      e.preventDefault();
      const selectSec = document.getElementById("selectSecretaria");
      const wasDisabled = selectSec ? selectSec.disabled : false;
      if (selectSec && wasDisabled) selectSec.disabled = false;
      const formData = new FormData(formCriar);
      if (selectSec && wasDisabled) selectSec.disabled = true;
      const idEdicao = formCriar.getAttribute("data-edit-id");
      const url = idEdicao
        ? `/api/funcionarios/${idEdicao}`
        : "/api/funcionarios";
      const method = idEdicao ? "PUT" : "POST";

      const perfil = (window.userInfo?.perfil || "").toLowerCase();
      if (perfil !== "admin") {
        formData.delete("secretaria_id");
      }

      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: "Bearer " + token,
          },
          body: formData,
        });
        if (res.ok) {
          if (typeof Swal !== "undefined")
            Swal.fire("Sucesso!", "Operação realizada!", "success");
          bootstrap.Modal.getOrCreateInstance(modalCriarEl).hide();
          carregarFuncionarios();
        } else throw new Error("Falha na operação");
      } catch (error) {
        if (typeof Swal !== "undefined")
          Swal.fire("Erro", error.message, "error");
      }
    });
  }

  const modalTransferirEl = document.getElementById(
    "modalTransferirFuncionario",
  );
  if (modalTransferirEl) {
    modalTransferirEl.addEventListener("show.bs.modal", () => {
      const form = document.getElementById("transferFuncionarioForm");
      if (form) form.reset();
      carregarSecretariasParaTransferencia();
    });
  }

  const formTransfer = document.getElementById("transferFuncionarioForm");
  if (formTransfer) {
    formTransfer.addEventListener("submit", async (e) => {
      e.preventDefault();

      const funcionarioId = document.getElementById(
        "transferFuncionarioId",
      ).value;
      const payload = {
        funcionario_id: funcionarioId,
        secretaria_destino_id: document.getElementById(
          "selectSecretariaDestino",
        ).value,
        justificativa: document.getElementById("transferJustificativa").value,
      };

      try {
        const res = await fetch("/api/transferencias", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          // 1. Alerta de Sucesso
          if (typeof Swal !== "undefined") {
            Swal.fire(
              "Sucesso!",
              "Transferência solicitada com sucesso!",
              "success",
            );
          }

          // 2. Fecha o modal de transferência (o pequeno)
          const modalTransferirEl = document.getElementById(
            "modalTransferirFuncionario",
          );
          const modalInst = bootstrap.Modal.getInstance(modalTransferirEl);
          if (modalInst) modalInst.hide();

          // 3. LIMPEZA DE BACKDROP (Evita o travamento do Super Modal)
          setTimeout(() => {
            // Remove qualquer fundo escuro que tenha ficado "preso"
            document
              .querySelectorAll(".modal-backdrop")
              .forEach((el) => el.remove());

            // Garante que o corpo da página permita interação novamente
            document.body.classList.remove("modal-open");
            document.body.style.paddingRight = "";

            // 4. ATUALIZAÇÃO EM TEMPO REAL
            // Recarrega o Super Modal para mostrar a nova secretaria/status
            if (typeof abrirSuperModal === "function") {
              abrirSuperModal(funcionarioId);
            }

            // Atualiza a tabela principal ao fundo
            carregarFuncionarios("", currentPage);
          }, 400); // Pequeno delay para a animação do Bootstrap terminar
        } else {
          const errorData = await res.json();
          throw new Error(errorData.erro || "Falha na transferência");
        }
      } catch (error) {
        if (typeof Swal !== "undefined")
          Swal.fire("Erro", error.message, "error");
      }
    });
  }

  // ====== 8. Salvar Status ======

  const salvarStatusBtn = document.getElementById("salvarStatusBtn");
  const confirmarDesligBtn = document.getElementById(
    "confirmarDesligamentoBtn",
  );
  const modalDesligEl = document.getElementById("modalConfirmarDesligamento");

  if (salvarStatusBtn) {
    salvarStatusBtn.addEventListener("click", async () => {
      const searchInput = document.getElementById("searchInput");
      const filtroAtual = searchInput ? searchInput.value.trim() : "";

      const funcionarios = await carregarTodosFuncionarios(filtroAtual);

      if (!funcionarios || funcionarios.length === 0) {
        if (typeof Swal !== "undefined")
          Swal.fire("Aviso", "Não há funcionários para salvar.", "warning");
        return;
      }

      const updates = [];
      const desativados = [];

      funcionarios.forEach((f) => {
        let novoStatus;
        if (f.id in statusCheckboxCache) {
          novoStatus = statusCheckboxCache[f.id] ? "1" : "0";
        } else {
          novoStatus = f.status_contratual == 1 ? "1" : "0";
        }

        updates.push({
          funcionario_id: Number(f.id),
          status_confirmado: novoStatus,
        });

        if (f.status_contratual == 1 && novoStatus === "0") {
          desativados.push({
            nome: f.nome,
            matricula: f.matricula,
          });
        }
      });

      if (desativados.length > 0 && modalDesligEl && confirmarDesligBtn) {
        const listaEl = document.getElementById(
          "listaFuncionariosDesligamento",
        );
        if (listaEl) {
          listaEl.innerHTML = desativados
            .map(
              (f) =>
                `<div>- <strong>${f.nome}</strong> (Matrícula: ${f.matricula})</div>`,
            )
            .join("");
        }
        confirmarDesligBtn.dataset.updates = JSON.stringify(updates);
        bootstrap.Modal.getOrCreateInstance(modalDesligEl).show();
      } else {
        if (typeof Swal !== "undefined") {
          const result = await Swal.fire({
            title: "Confirmar Alterações?",
            html: `Deseja salvar o status de <strong>${updates.length}</strong> funcionário(s)?<br><small>Esta ação registrará a data/hora para todos.</small>`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#198754",
            confirmButtonText: "Sim, salvar",
            cancelButtonText: "Cancelar",
          });
          if (result.isConfirmed) efetuarSalvamentoStatus(updates);
        } else {
          if (confirm("Deseja salvar o status?"))
            efetuarSalvamentoStatus(updates);
        }
      }
    });
  }

  if (confirmarDesligBtn) {
    confirmarDesligBtn.addEventListener("click", async () => {
      const updates = JSON.parse(confirmarDesligBtn.dataset.updates || "[]");
      await efetuarSalvamentoStatus(updates);
      if (modalDesligEl)
        bootstrap.Modal.getOrCreateInstance(modalDesligEl).hide();
    });
  }

  // ====== 9. Lógica de Upload e Visualização de Fotos ======

  if (!document.getElementById("modalEditarFotoFuncionario")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
            <div class="modal fade" id="modalEditarFotoFuncionario" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                <form id="formEditarFotoFuncionario">
                    <div class="modal-header">
                    <h5 class="modal-title">Inserir/Editar Foto</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                    <div id="fotoAtualPreview" class="mb-3 text-center"></div>
                    <label class="form-label">Selecione a imagem:</label>
                    <input type="file" name="foto" id="inputFotoFuncionario" class="form-control" accept="image/*" required />
                    <input type="hidden" name="funcionario_id" id="inputFuncionarioIdFoto" />
                    </div>
                    <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Salvar Foto</button>
                    </div>
                </form>
                </div>
            </div>
            </div>`,
    );
  }

  window.abrirModalFoto = function (id, url) {
    const imgVis = document.getElementById("imgVisualizarFoto");
    const urlSegura = getUrlFoto(url);
    if (imgVis) imgVis.src = urlSegura;
    const btn = document.getElementById("btnAlterarFotoModalVisualizar");
    if (btn) {
      btn.dataset.id = id;
      btn.dataset.url = urlSegura;
    }
    bootstrap.Modal.getOrCreateInstance(
      document.getElementById("modalVisualizarFoto"),
    ).show();
  };

  window.abrirModalEditarFoto = function (id, url) {
    const idInput = document.getElementById("inputFuncionarioIdFoto");
    const preview = document.getElementById("fotoAtualPreview");
    const fileInput = document.getElementById("inputFotoFuncionario");

    if (idInput) idInput.value = id;

    if (preview) {
      const urlSegura = getUrlFoto(url);
      preview.innerHTML =
        urlSegura && urlSegura !== "null"
          ? `<img src="${urlSegura}" class="img-fluid rounded" style="max-height: 200px;">`
          : '<p class="text-center text-muted">Nenhuma foto.</p>';
    }

    if (fileInput) fileInput.value = "";
    bootstrap.Modal.getOrCreateInstance(
      document.getElementById("modalEditarFotoFuncionario"),
    ).show();
  };

  document.body.addEventListener("change", function (e) {
    if (e.target && e.target.id === "inputFotoFuncionario") {
      const preview = document.getElementById("fotoAtualPreview");
      if (e.target.files && e.target.files[0] && preview) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          preview.innerHTML = `<img src="${ev.target.result}" class="img-fluid rounded" style="max-height: 200px; border: 3px solid #198754;">`;
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    }
  });

  document.body.addEventListener("submit", async function (e) {
    if (e.target && e.target.id === "formEditarFotoFuncionario") {
      e.preventDefault();
      const formData = new FormData(e.target);
      const idInput = document.getElementById("inputFuncionarioIdFoto");
      const funcId = idInput ? idInput.value : "";

      try {
        const res = await fetch(`/api/funcionarios/${funcId}`, {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + token,
          },
          body: formData,
        });

        if (res.ok) {
          if (typeof Swal !== "undefined")
            Swal.fire("Sucesso!", "Foto atualizada com sucesso!", "success");
          bootstrap.Modal.getOrCreateInstance(
            document.getElementById("modalEditarFotoFuncionario"),
          ).hide();
          carregarFuncionarios();
        } else {
          const erro = await res.json();
          throw new Error(erro.erro || "Falha ao gravar foto.");
        }
      } catch (error) {
        if (typeof Swal !== "undefined")
          Swal.fire("Erro", error.message, "error");
      }
    }
  });

  document.body.addEventListener("click", (e) => {
    if (e.target && e.target.id === "btnAlterarFotoModalVisualizar") {
      bootstrap.Modal.getInstance(
        document.getElementById("modalVisualizarFoto"),
      )?.hide();
      abrirModalEditarFoto(e.target.dataset.id, e.target.dataset.url);
    }
  });

  // ====== 10. Inicialização da Página ======
  carregarFuncionarios();
});

// ====== 11. Função de Relatório de Funcionários Ativos ======
window.baixarRelatorioExcelAtivos = async function () {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  if (!token) {
    Swal.fire(
      "Erro",
      "Token não encontrado. Por favor, faça login novamente.",
      "error",
    );
    return;
  }
  const btn = document.querySelector(
    'button[onclick="baixarRelatorioExcelAtivos()"]',
  );
  const params = new URLSearchParams({
    empresa_id: document.getElementById("rel_empresa_id").value,
    secretaria_id: document.getElementById("rel_secretaria_id").value,
  });

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    const res = await fetch(`/api/funcionarios/exportar-ativos?${params}`, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    if (!res.ok) throw new Error("Erro ao gerar ficheiro");

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_funcionarios_ativos_${new Date().toLocaleDateString().replace(/\//g, "-")}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    Swal.fire({
      icon: "success",
      title: "Relatório gerado com sucesso.",
      timer: 1500,
      showConfirmButton: false,
    });
  } catch (e) {
    Swal.fire("Erro", "Erro ao gerar o relatório.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
};

document.addEventListener("DOMContentLoaded", function () {
  const selectEmpresa = document.getElementById("rel_empresa_id");
  const selectSecretaria = document.getElementById("rel_secretaria_id");

  if (selectEmpresa || selectSecretaria) {
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    const headers = {
      Authorization: "Bearer " + token,
    };

    if (selectEmpresa) {
      fetch("/api/empresas", {
        headers,
      })
        .then((res) => res.json())
        .then((data) => {
          const listaEmpresas = Array.isArray(data)
            ? data
            : data.empresas || data.data || [];
          selectEmpresa.innerHTML =
            '<option value="todos">Todas as Empresas</option>';
          listaEmpresas.forEach((emp) => {
            const nomeStr =
              emp.nome || emp.razao_social || emp.nome_fantasia || "Sem Nome";
            selectEmpresa.add(new Option(nomeStr, emp.id));
          });
        })
        .catch((error) => console.error("Erro ao carregar empresas:", error));
    }

    if (selectSecretaria) {
      fetch("/api/secretarias", {
        headers,
      })
        .then((res) => res.json())
        .then((data) => {
          const listaSecretarias = Array.isArray(data)
            ? data
            : data.secretarias || data.data || [];
          selectSecretaria.innerHTML =
            '<option value="todos">Todas as Secretarias</option>';
          listaSecretarias.forEach((sec) => {
            selectSecretaria.add(new Option(sec.nome, sec.id));
          });
          // Aplica restrição de secretaria para perfil ativador após popular o select
          aplicarRestricaoSecretariaAtivos(selectSecretaria, token);
        })
        .catch((error) =>
          console.error("Erro ao carregar secretarias:", error),
        );
    }
  }
});

// ====== RESTRIÇÃO DE SECRETARIA PARA PERFIL ATIVADOR (Funcionários Ativos) ======
function aplicarRestricaoSecretariaAtivos(selectSecretaria, token) {
  fetch("/api/usuarios/me", {
    headers: { Authorization: "Bearer " + token },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((user) => {
      if (!user) return;
      if (user.perfil !== "admin" && user.perfil !== "aprovador") {
        // Garante que a opção da secretaria do usuário existe
        let optionExiste = false;
        for (let opt of selectSecretaria.options) {
          if (String(opt.value) === String(user.secretaria_id)) {
            optionExiste = true;
            break;
          }
        }
        if (!optionExiste && user.secretaria_id && user.secretaria_nome) {
          selectSecretaria.add(
            new Option(user.secretaria_nome, user.secretaria_id),
          );
        }
        selectSecretaria.value = user.secretaria_id;
        selectSecretaria.disabled = true;
        selectSecretaria.style.opacity = "0.7";
        selectSecretaria.style.cursor = "not-allowed";
      }
    })
    .catch((err) =>
      console.warn(
        "Erro ao verificar perfil para restrição de secretaria:",
        err,
      ),
    );
}
