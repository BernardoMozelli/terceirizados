// ==========================================
// VARIÁVEIS GLOBAIS
// ==========================================
if (typeof window.paginaAtual === "undefined") window.paginaAtual = 1;
if (typeof window.porPagina === "undefined") window.porPagina = 15;
if (typeof window.totalCandidatos === "undefined") window.totalCandidatos = 0;
if (typeof window.candidatoSelecionado === "undefined") window.candidatoSelecionado = null;
if (typeof window.empresas === "undefined") window.empresas = [];
if (typeof window.secretarias === "undefined") window.secretarias = [];
if (typeof window.modalVisualizarInstancia === "undefined") window.modalVisualizarInstancia = null;
if (typeof window.modalCriarInstancia === "undefined") window.modalCriarInstancia = null;
if (typeof window.modalEditarInstancia === "undefined") window.modalEditarInstancia = null;
if (typeof window.fotoBase64 === "undefined") window.fotoBase64 = null;
if (typeof window.fotoEdicaoBase64 === "undefined") window.fotoEdicaoBase64 = null;

// Variáveis para navegação no modal
if (typeof window.candidatosAtuais === "undefined") window.candidatosAtuais = [];
if (typeof window.indiceAtualModal === "undefined") window.indiceAtualModal = 0;
if (typeof window.totalPagesGlobal === "undefined") window.totalPagesGlobal = 1;
if (typeof window.currentPage === "undefined") window.currentPage = 1;
if (typeof window.totalItemsGlobal === "undefined") window.totalItemsGlobal = 0;

// Ícone padrão de perfil
const fotoPadrao = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e0e0e0%22/%3E%3Ccircle cx=%2250%22 cy=%2238%22 r=%2218%22 fill=%22%23bdbdbd%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2228%22 ry=%2220%22 fill=%22%23bdbdbd%22/%3E%3C/svg%3E";

function getUrlFoto(caminhoFoto) {
  if (!caminhoFoto || caminhoFoto === "null" || caminhoFoto === "undefined") return "";
  if (caminhoFoto.startsWith("data:image") || caminhoFoto.startsWith("http")) return caminhoFoto;

  let caminho = caminhoFoto.replace(/^\/+/, "");
  return `/api/arquivos/${caminho}`;
}

// ==========================================
// FORMATADOR DE CPF (APENAS EXIBIÇÃO)
// ==========================================
function formatarCPF(cpf) {
  if (!cpf) return "";
  cpf = String(cpf).replace(/\D/g, "");
  if (cpf.length !== 11) return cpf;
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

// ==========================================
// INICIALIZAÇÃO DA PÁGINA
// ==========================================
if (!window.aprovacoesInitialized) {
  window.aprovacoesInitialized = true;

  document.addEventListener("DOMContentLoaded", function () {
    try {
      if (typeof initializeSharedComponents === "function") {
        initializeSharedComponents();
      }
    } catch (error) {
      console.error("Erro ao inicializar componentes partilhados:", error);
    }

    const modalVisEl = document.getElementById("modalVisualizar");
    if (modalVisEl) window.modalVisualizarInstancia = new bootstrap.Modal(modalVisEl);

    const modalCriarEl = document.getElementById("modalCriar");
    if (modalCriarEl) window.modalCriarInstancia = new bootstrap.Modal(modalCriarEl);

    const modalEditarEl = document.getElementById("modalEditar");
    if (modalEditarEl) window.modalEditarInstancia = new bootstrap.Modal(modalEditarEl);

    carregarEmpresas();
    carregarSecretarias();
    buscarCandidatos();

    // Evento de zoom da imagem do modal
    const imgCandidatoModal = document.getElementById("modal-foto");
    if (imgCandidatoModal) {
      imgCandidatoModal.style.cursor = "pointer";
      imgCandidatoModal.title = "Clique para ampliar";
      imgCandidatoModal.addEventListener("click", function () {
        if (this.src.includes("data:image/svg+xml")) return; 
        Swal.fire({
          target: modalVisEl,
          imageUrl: this.src,
          imageAlt: "Foto do Candidato",
          showConfirmButton: false,
          showCloseButton: true,
          width: "600px",
          padding: "1em",
          backdrop: `rgba(0,0,0,0.85)`,
          customClass: { image: "img-fluid rounded shadow" },
        });
      });
    }

    // Botões de Navegação
    const btnPrev = document.getElementById("btnPrevCandidato");
    const btnNext = document.getElementById("btnNextCandidato");
    if (btnPrev) btnPrev.addEventListener("click", () => navegarCandidato("anterior"));
    if (btnNext) btnNext.addEventListener("click", () => navegarCandidato("proximo"));

    // Formatação de CPF e Telefone
    const camposCpf = ["criar-cpf", "editar-cpf"];
    const camposTel = ["criar-telefone", "editar-telefone"];

    camposCpf.forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener("input", function () {
          let v = this.value.replace(/\D/g, "");
          if (v.length <= 11) {
            v = v.replace(/(\d{3})(\d)/, "$1.$2");
            v = v.replace(/(\d{3})(\d)/, "$1.$2");
            v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
            this.value = v;
          }
        });
      }
    });

    camposTel.forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener("input", function () {
          let v = this.value.replace(/\D/g, "");
          if (v.length <= 11) {
            v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
            v = v.replace(/(\d)(\d{4})$/, "$1-$2");
            this.value = v;
          }
        });
      }
    });
  });
}

// ==========================================
// CARREGAMENTO DE DADOS (FILTROS)
// ==========================================
async function carregarEmpresas() {
  try {
    const response = await fetch("/api/empresas", {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
    });
    if (response.ok) {
      const data = await response.json();
      window.empresas = Array.isArray(data) ? data : data.empresas || [];
      const selectFiltro = document.getElementById("filtro-empresa");
      const selectCriar = document.getElementById("criar-empresa");
      
      if (selectFiltro) {
        selectFiltro.innerHTML = '<option value="">Todas</option>';
        window.empresas.forEach(empresa => selectFiltro.innerHTML += `<option value="${empresa.id}">${empresa.nome}</option>`);
      }
      
      if (selectCriar) {
        selectCriar.innerHTML = '<option value="">Selecione a empresa...</option>';
        window.empresas.forEach(empresa => selectCriar.innerHTML += `<option value="${empresa.id}">${empresa.nome}</option>`);
      }
    }
  } catch (error) { console.error(error); }
}

async function carregarSecretarias() {
  try {
    const response = await fetch("/api/secretarias", {
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
    });
    if (response.ok) {
      const data = await response.json();
      window.secretarias = Array.isArray(data) ? data : data.secretarias || [];
      const selectFiltro = document.getElementById("filtro-secretaria");
      if (selectFiltro) {
        selectFiltro.innerHTML = '<option value="">Todas</option>';
        window.secretarias.forEach(secretaria => selectFiltro.innerHTML += `<option value="${secretaria.id}">${secretaria.nome}</option>`);
      }

      const selectCriar = document.getElementById("criar-secretaria");
      if (selectCriar) {
        const perfilAtual = window.userInfo ? window.userInfo.perfil : "";
        const ehAtivador = perfilAtual === "ativador";

        selectCriar.innerHTML = '<option value="">Selecione a secretaria...</option>';
        if (ehAtivador) {
          const secAtivador = window.userInfo?.secretaria_id;
          const secNomeAtivador = window.userInfo?.secretaria_nome;
          if (secAtivador) {
            selectCriar.innerHTML += `<option value="${secAtivador}" selected>${secNomeAtivador}</option>`;
            selectCriar.disabled = true;
          }
        } else {
          window.secretarias.forEach(secretaria => selectCriar.innerHTML += `<option value="${secretaria.id}">${secretaria.nome}</option>`);
        }
      }
    }
  } catch (error) { console.error(error); }
}

// ==========================================
// GESTÃO DE CANDIDATOS (BUSCAR E RENDERIZAR)
// ==========================================
async function buscarCandidatos(pagina = 1) {
  try {
    window.paginaAtual = pagina;
    window.currentPage = pagina;
    const loadingEl = document.getElementById("loading");
    const tabelaEl = document.getElementById("tabela-candidatos");
    const vazioEl = document.getElementById("vazio");

    if (loadingEl) loadingEl.style.display = "block";
    if (tabelaEl) tabelaEl.style.display = "none";
    if (vazioEl) vazioEl.style.display = "none";

    let url = `/api/candidatos?pagina=${pagina}&por_pagina=${window.porPagina}`;
    const status = document.getElementById("filtro-status")?.value;
    const empresa = document.getElementById("filtro-empresa")?.value;
    const secretaria = document.getElementById("filtro-secretaria")?.value;
    const indicacao = document.getElementById("filtro-indicacao")?.value;
    const busca = document.getElementById("filtro-busca")?.value;

    if (status) url += `&status=${status}`;
    if (empresa) url += `&empresa_id=${empresa}`;
    if (secretaria) url += `&secretaria_id=${secretaria}`;
    if (indicacao) url += `&indicacao=${encodeURIComponent(indicacao)}`;
    if (busca) url += `&busca=${encodeURIComponent(busca)}`;

    const response = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` }});
    if (!response.ok) throw new Error("Erro ao buscar candidatos");

    const data = await response.json();
    window.totalCandidatos = data.total;
    window.totalPagesGlobal = data.paginas;
    window.candidatosAtuais = data.candidatos || [];
    window.totalItemsGlobal = window.totalCandidatos;

    atualizarEstatisticas();

    if (loadingEl) loadingEl.style.display = "none";
    if (!data.candidatos || data.candidatos.length === 0) {
      if (vazioEl) vazioEl.style.display = "block";
    } else {
      renderizarTabela(data.candidatos);
      if (tabelaEl) tabelaEl.style.display = "table";
    }
    renderizarPaginacao(data.paginas, pagina);
  } catch (error) {
    if (document.getElementById("loading")) document.getElementById("loading").style.display = "none";
    if (window.AppAlert) window.AppAlert.error("Falha ao procurar: " + error.message);
  }
}

function renderizarTabela(candidatos) {
  const tbody = document.getElementById("tbody-candidatos");
  if (!tbody) return;
  tbody.innerHTML = "";

  const statusClasses = {
    pendente: "bg-warning text-dark",
    aprovado: "bg-info text-dark",
    recusado: "bg-danger text-white",
    contratado: "bg-success text-white",
    desligado: "bg-danger text-white",
  };

  candidatos.forEach((candidato) => {
    const row = document.createElement("tr");
    row.className = "align-middle";

    // FOTO
    const fotoCelula = document.createElement("td");
    const urlFoto = candidato.foto ? getUrlFoto(candidato.foto) : fotoPadrao;
    fotoCelula.innerHTML = `<img src="${urlFoto}" onerror="this.src='${fotoPadrao}'" alt="Foto" class="rounded-circle shadow-sm" style="width: 50px; height: 50px; object-fit: cover; cursor: pointer;" onclick="abrirModalVisualizacao(${candidato.id})">`;
    row.appendChild(fotoCelula);

    row.innerHTML += `<td><strong>${candidato.nome}</strong></td>
                      <td>${formatarCPF(candidato.cpf)}</td>
                      <td>${candidato.cargo}<br><small class="text-muted">${candidato.setor || '-'}</small></td>
                      <td>${candidato.empresa_nome || "-"}</td>
                      <td>${candidato.secretaria_nome || "-"}</td>
                      <td class="text-truncate" style="max-width: 200px;" data-indicacao>${candidato.observacoes || "Não informado"}</td>`;

    const statusCelula = document.createElement("td");
    const badgeClass = statusClasses[candidato.status] || "bg-secondary text-white";
    statusCelula.innerHTML = `<span class="badge ${badgeClass} px-3 py-2 rounded-pill">${candidato.status.toUpperCase()}</span>`;
    row.appendChild(statusCelula);

    const acoesCelula = document.createElement("td");
    acoesCelula.className = "text-end";
    const perfilAtual = window.userInfo?.perfil;
    const permissoesAtual = window.userInfo?.permissoes || {};

    let acoesHtml = `<div style="display: flex; gap: 8px; justify-content: flex-end;">`;
    acoesHtml += `<button class="btn btn-sm btn-outline-primary" title="Visualizar" onclick="abrirModalVisualizacao(${candidato.id})"><i class="fas fa-eye"></i></button>`;

    if ((perfilAtual === "aprovador" || !!permissoesAtual["editar_candidato"]) && (candidato.status === "pendente" || candidato.status === "recusado")) {
      acoesHtml += `<button class="btn btn-sm btn-outline-warning" title="Editar" onclick="abrirModalEditar(${candidato.id})"><i class="fas fa-edit"></i></button>`;
    }
    if ((perfilAtual === "aprovador" || !!permissoesAtual["excluir_candidato"]) && candidato.status === "pendente") {
      acoesHtml += `<button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="deletarCandidato(${candidato.id})"><i class="fas fa-trash"></i></button>`;
    }
    acoesHtml += `</div>`;
    acoesCelula.innerHTML = acoesHtml;
    row.appendChild(acoesCelula);
    tbody.appendChild(row);
  });
}

function renderizarPaginacao(totalPaginas, paginaAtualParam) {
  const container = document.getElementById("paginacao");
  if (!container || totalPaginas <= 1) {
    if(container) container.innerHTML = "";
    return;
  }
  let html = '<ul class="pagination mb-0 shadow-sm flex-wrap justify-content-center">';
  html += `<li class="page-item ${paginaAtualParam <= 1 ? "disabled" : ""}"><a class="page-link" href="#" onclick="event.preventDefault(); if(${paginaAtualParam} > 1) buscarCandidatos(${paginaAtualParam - 1})">Anterior</a></li>`;

  let startPage = Math.max(1, paginaAtualParam - 2);
  let endPage = Math.min(totalPaginas, paginaAtualParam + 2);

  if (startPage > 1) {
    html += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); buscarCandidatos(1)">1</a></li>`;
    if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<li class="page-item ${i === paginaAtualParam ? "active" : ""}"><a class="page-link" href="#" onclick="event.preventDefault(); buscarCandidatos(${i})">${i}</a></li>`;
  }

  if (endPage < totalPaginas) {
    if (endPage < totalPaginas - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    html += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); buscarCandidatos(${totalPaginas})">${totalPaginas}</a></li>`;
  }
  html += `<li class="page-item ${paginaAtualParam >= totalPaginas ? "disabled" : ""}"><a class="page-link" href="#" onclick="event.preventDefault(); if(${paginaAtualParam} < ${totalPaginas}) buscarCandidatos(${paginaAtualParam + 1})">Próximo</a></li></ul>`;
  container.innerHTML = html;
  
  // Adiciona o contador de registros
  const tableInfo = document.getElementById("tableInfo");
  if (tableInfo) {
    const porPagina = window.porPagina || 15;
    const startRecord = (paginaAtualParam - 1) * porPagina + 1;
    const endRecord = Math.min(paginaAtualParam * porPagina, window.totalCandidatos);
    tableInfo.textContent = `Exibindo ${startRecord}–${endRecord} de ${window.totalCandidatos} registros  |  Página ${paginaAtualParam} de ${totalPaginas}`;
  }
}

// ==========================================
// VISUALIZAÇÃO E APROVAÇÕES
// ==========================================
async function abrirModalVisualizacao(candidatoId) {
  try {
    const response = await fetch(`/api/candidatos/${candidatoId}`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
    if (!response.ok) throw new Error("Erro ao carregar os dados do candidato");
    const data = await response.json();
    const candidato = data.candidato || data;
    window.candidatoSelecionado = candidato;
    window.indiceAtualModal = window.candidatosAtuais.findIndex((c) => c.id === candidatoId);
    if (window.indiceAtualModal === -1) window.indiceAtualModal = 0;

    preencherModalCandidato(candidato);
    if (data.aprovacoes || candidato.aprovacoes) {
      renderizarAprovacoes(data.aprovacoes || candidato.aprovacoes, candidato.status);
    } else {
      buscarAprovacoes(candidato.id, candidato.status);
    }

    const btnAprovar = document.getElementById("btn-aprovar");
    const btnRecusar = document.getElementById("btn-recusar");
    const btnReiniciar = document.getElementById("btn-reiniciar-fluxo");
    const perfilLogado = window.userInfo?.perfil;
    const nivelAprovador = window.userInfo?.nivel_aprovacao;
    let podeAprovarAgora = false;
    let jaVotou = false;

    if (data.aprovacoes || candidato.aprovacoes) {
      const aprovacoes = data.aprovacoes || candidato.aprovacoes;
      jaVotou = aprovacoes.some(a => a.nivel_aprovacao === nivelAprovador);
    }

    if (perfilLogado === "aprovador" && candidato.status === "pendente") {
      podeAprovarAgora = true;
    }

    if (podeAprovarAgora && !jaVotou) {
      if (btnAprovar) btnAprovar.style.display = "inline-block";
      if (btnRecusar) btnRecusar.style.display = "inline-block";
      if (btnReiniciar) btnReiniciar.style.display = "none";
    } else {
      if (btnAprovar) btnAprovar.style.display = "none";
      if (btnRecusar) btnRecusar.style.display = "none";
    }

    if (jaVotou && perfilLogado === "aprovador") {
      if (btnReiniciar) btnReiniciar.style.display = "inline-block";
    } else {
      if (btnReiniciar) btnReiniciar.style.display = "none";
    }

    atualizarBotoesNavegacao();
    if (window.modalVisualizarInstancia) window.modalVisualizarInstancia.show();
  } catch (error) {
    if (window.AppAlert) window.AppAlert.error("Erro ao carregar candidato: " + error.message);
  }
}

function preencherModalCandidato(candidato) {
  if (document.getElementById("modal-nome")) document.getElementById("modal-nome").textContent = candidato.nome;
  if (document.getElementById("modal-email")) document.getElementById("modal-email").textContent = candidato.email;
  if (document.getElementById("modal-cpf")) document.getElementById("modal-cpf").textContent = candidato.cpf;
  if (document.getElementById("modal-cargo")) document.getElementById("modal-cargo").textContent = candidato.cargo;
  
  // Exibição do SETOR no Modal
  if (document.getElementById("modal-setor")) {
    document.getElementById("modal-setor").textContent = candidato.setor || "-";
  } else if (document.getElementById("detalheSetor")) {
    document.getElementById("detalheSetor").textContent = candidato.setor || "-";
  }
  
  if (document.getElementById("modal-secretaria")) document.getElementById("modal-secretaria").textContent = candidato.secretaria_nome || "-";
  if (document.getElementById("modal-indicacao")) document.getElementById("modal-indicacao").textContent = candidato.observacoes || "Não informado";

  const dataInicioEl = document.getElementById("modal-data-inicio");
  if (dataInicioEl) {
    if (candidato.data_inicio_prevista) {
      const [ano, mes, dia] = candidato.data_inicio_prevista.split("-");
      dataInicioEl.textContent = `${dia}/${mes}/${ano}`;
    } else { dataInicioEl.textContent = "-"; }
  }

  const rastreabilidade = candidato.rastreabilidade || {};
  if (document.getElementById("modal-usuario-criador")) document.getElementById("modal-usuario-criador").textContent = rastreabilidade.usuario_solicitante_nome ? `${rastreabilidade.usuario_solicitante_nome} (${rastreabilidade.usuario_solicitante_matricula || "S/M"})` : "-";
  if (document.getElementById("modal-secretaria-criador")) document.getElementById("modal-secretaria-criador").textContent = rastreabilidade.secretaria_solicitante_nome || "-";
  
  if (document.getElementById("modal-data-criacao")) {
    if(candidato.data_criacao){
      const dataCriacaoUtc = candidato.data_criacao.replace(" ", "T") + "Z";
      document.getElementById("modal-data-criacao").textContent = new Date(dataCriacaoUtc).toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}).replace(",", " às");
    } else {
       document.getElementById("modal-data-criacao").textContent = "-";
    }
  }

  const fotoEl = document.getElementById("modal-foto");
  if (fotoEl) {
    fotoEl.src = candidato.foto ? getUrlFoto(candidato.foto) : fotoPadrao;
    fotoEl.onerror = () => { fotoEl.src = fotoPadrao; };
    fotoEl.style.display = "block";
  }

  const contadorEl = document.getElementById("contadorModal");
  if (contadorEl) {
    const totalFiltrado = Number(window.totalItemsGlobal) || 0;
    const posicaoGlobal = (Number(window.currentPage) - 1) * Number(window.porPagina) + Number(window.indiceAtualModal) + 1;
    contadorEl.textContent = totalFiltrado === 0 ? "0 de 0" : `${posicaoGlobal} de ${totalFiltrado}`;
  }
}

async function buscarAprovacoes(candidatoId, status) {
  try {
    const response = await fetch(`/api/candidatos/${candidatoId}/aprovacoes`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` }});
    if (response.ok) {
      const data = await response.json();
      renderizarAprovacoes(data.aprovacoes || [], status);
    }
  } catch (e) { console.error(e); }
}

function renderizarAprovacoes(aprovacoes, status) {
  const container = document.getElementById("modal-aprovacoes");
  if (!container) return;
  
  if (!aprovacoes || aprovacoes.length === 0) {
    container.innerHTML = '<p class="text-muted mb-0"><i class="fas fa-info-circle me-1"></i>Sem registo de aprovações.</p>';
    return;
  }

  const niveis = ["vice_prefeito", "prefeito", "planejamento"];
  const labels = { vice_prefeito: "Vice-Prefeito", prefeito: "Prefeito", planejamento: "Planejamento" };

  let html = "";
  niveis.forEach((nivel) => {
    const aprovacao = aprovacoes.find((a) => a.nivel_aprovacao === nivel);
    if (aprovacao) {
      const isAprovado = aprovacao.acao === "aprovado";
      const icon = isAprovado ? '<i class="fas fa-check-circle text-success"></i>' : '<i class="fas fa-times-circle text-danger"></i>';
      const borderClass = isAprovado ? "border-success" : "border-danger";
      const dataEHora = new Date(aprovacao.data_aprovacao.replace(" ", "T") + "Z").toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}).replace(",", " às");
      
      html += `<div class="card mb-2 border-start border-4 ${borderClass} shadow-sm bg-transparent">
                 <div class="card-body py-2">
                    <h6 class="card-title mb-1">${icon} ${labels[nivel]}</h6>
                    <p class="card-text small text-muted mb-0">Por: ${aprovacao.aprovador_nome || "Utilizador"} em ${dataEHora}${aprovacao.motivo ? `<br>Observação: <em>"${aprovacao.motivo}"</em>` : ""}</p>
                 </div>
               </div>`;
    } else {
      html += `<div class="card mb-2 border-start border-4 border-secondary shadow-sm opacity-50 bg-transparent">
                 <div class="card-body py-2">
                    <h6 class="card-title mb-1"><i class="fas fa-hourglass-half text-secondary"></i> ${labels[nivel]}</h6>
                    <p class="card-text small text-muted mb-0">A aguardar aprovação</p>
                 </div>
               </div>`;
    }
  });
  container.innerHTML = html;
}

function atualizarBotoesNavegacao() {
  if (document.getElementById("btnPrevCandidato")) document.getElementById("btnPrevCandidato").disabled = (window.currentPage === 1 && window.indiceAtualModal === 0);
  if (document.getElementById("btnNextCandidato")) document.getElementById("btnNextCandidato").disabled = (window.currentPage === window.totalPagesGlobal && window.indiceAtualModal === window.candidatosAtuais.length - 1);
}

async function navegarCandidato(direcao) {
  if (direcao === "proximo") {
    if (window.indiceAtualModal < window.candidatosAtuais.length - 1) {
      window.indiceAtualModal++;
      abrirModalVisualizacao(window.candidatosAtuais[window.indiceAtualModal].id);
    } else if (window.currentPage < window.totalPagesGlobal) {
      await buscarCandidatos(window.currentPage + 1);
      if (window.candidatosAtuais.length > 0) {
        window.indiceAtualModal = 0;
        abrirModalVisualizacao(window.candidatosAtuais[0].id);
      }
    }
  } else if (direcao === "anterior") {
    if (window.indiceAtualModal > 0) {
      window.indiceAtualModal--;
      abrirModalVisualizacao(window.candidatosAtuais[window.indiceAtualModal].id);
    } else if (window.currentPage > 1) {
      await buscarCandidatos(window.currentPage - 1);
      if (window.candidatosAtuais.length > 0) {
        window.indiceAtualModal = window.candidatosAtuais.length - 1;
        abrirModalVisualizacao(window.candidatosAtuais[window.indiceAtualModal].id);
      }
    }
  }
}

// ==========================================
// AÇÕES DO CANDIDATO (APROVAR/RECUSAR/ELIMINAR)
// ==========================================
async function aprovarCandidato() {
  if (!window.candidatoSelecionado) return;

  const modalVisEl = document.getElementById('modalVisualizar');
  if (window.modalVisualizarInstancia) window.modalVisualizarInstancia._config.focus = false;

  const result = await Swal.fire({
    title: "Aprovar Candidato",
    target: modalVisEl || document.body,
    html: `
      <div style="text-align: left; margin: 20px 0;">
        <label for="motivo-input" style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Observação (Opcional)</label>
        <textarea id="motivo-input" class="form-control" placeholder="Adicione uma observação se desejar..." 
          style="height: 120px !important; width: 100%; display: block !important;"></textarea>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-check"></i> Confirmar Aprovação',
    confirmButtonColor: "#198754",
    cancelButtonText: 'Cancelar',
    allowOutsideClick: false,
    allowEscapeKey: false,
    focusConfirm: false,
    didOpen: () => {
      const ta = document.getElementById('motivo-input');
      if (ta) { setTimeout(() => { ta.focus(); ta.click(); }, 150); }
    },
    preConfirm: () => document.getElementById('motivo-input')?.value || ''
  });

  if (window.modalVisualizarInstancia) window.modalVisualizarInstancia._config.focus = true;

  if (result.isConfirmed) {
    const motivo = result.value || '';
    try {
      const response = await fetch(`/api/candidatos/${window.candidatoSelecionado.id}/aprovar`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, "Content-Type": "application/json" }, body: JSON.stringify({ motivo: motivo }) });
      if (!response.ok) throw new Error((await response.json()).erro || "Erro ao aprovar");
      if (window.AppAlert) window.AppAlert.success("Candidato aprovado com sucesso!");
      if (window.modalVisualizarInstancia) window.modalVisualizarInstancia.hide();
      buscarCandidatos(window.paginaAtual);
    } catch (error) { if(window.AppAlert) window.AppAlert.error(error.message); }
  }
}

async function recusarCandidato() {
  if (!window.candidatoSelecionado) return;

  const modalVisEl = document.getElementById('modalVisualizar');
  if (window.modalVisualizarInstancia) window.modalVisualizarInstancia._config.focus = false;

  const result = await Swal.fire({
    title: "Recusar Candidato",
    target: modalVisEl || document.body,
    html: `
      <div style="text-align: left; margin: 20px 0;">
        <label for="motivo-recusa-input" style="display: block; margin-bottom: 8px; font-weight: 500; color: #d32f2f;">Motivo da Recusa (Obrigatório)</label>
        <textarea id="motivo-recusa-input" class="form-control" placeholder="Indique o motivo da recusa..." 
          style="height: 120px !important; width: 100%; display: block !important; border: 2px solid #d32f2f !important;"></textarea>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-times"></i> Confirmar Recusa',
    confirmButtonColor: "#dc3545",
    cancelButtonText: 'Cancelar',
    allowOutsideClick: false,
    allowEscapeKey: false,
    focusConfirm: false,
    didOpen: () => {
      const ta = document.getElementById('motivo-recusa-input');
      if (ta) { setTimeout(() => { ta.focus(); ta.click(); }, 150); }
    },
    preConfirm: () => {
      const motivo = document.getElementById('motivo-recusa-input')?.value?.trim() || '';
      if (!motivo) {
        Swal.showValidationMessage('Indique o motivo da recusa.');
        return false;
      }
      return motivo;
    }
  });

  if (window.modalVisualizarInstancia) window.modalVisualizarInstancia._config.focus = true;

  if (result.isConfirmed) {
    const valor = result.value || '';
    try {
      const response = await fetch(`/api/candidatos/${window.candidatoSelecionado.id}/recusar`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, "Content-Type": "application/json" }, body: JSON.stringify({ motivo: valor }) });
      if (!response.ok) throw new Error((await response.json()).erro || "Erro ao recusar");
      if (window.AppAlert) window.AppAlert.success("Candidato recusado com sucesso!");
      if (window.modalVisualizarInstancia) window.modalVisualizarInstancia.hide();
      buscarCandidatos(window.paginaAtual);
    } catch (error) { if(window.AppAlert) window.AppAlert.error(error.message); }
  }
}

async function reiniciarFluxoCandidato() {
  if (!window.candidatoSelecionado) return;
  const { isConfirmed } = await Swal.fire({ title: "Reiniciar Fluxo", text: `Deseja reiniciar seu voto para ${window.candidatoSelecionado.nome}? Seu voto anterior será removido.`, icon: "warning", showCancelButton: true, confirmButtonText: '<i class="fas fa-redo"></i> Reiniciar', confirmButtonColor: "#ffc107" });
  if (isConfirmed) {
    try {
      const response = await fetch(`/api/candidatos/${window.candidatoSelecionado.id}/reiniciar-fluxo`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
      if (!response.ok) throw new Error((await response.json()).erro || "Erro ao reiniciar fluxo");
      if (window.AppAlert) window.AppAlert.success("Fluxo reiniciado! Você pode votar novamente.");
      if (window.modalVisualizarInstancia) window.modalVisualizarInstancia.hide();
      buscarCandidatos(window.paginaAtual);
    } catch (error) { if(window.AppAlert) window.AppAlert.error(error.message); }
  }
}

async function deletarCandidato(candidatoId) {
  const { isConfirmed } = await Swal.fire({ title: "Eliminar Candidato", text: "Esta ação não pode ser desfeita.", icon: "warning", showCancelButton: true, confirmButtonText: '<i class="fas fa-trash"></i> Eliminar', confirmButtonColor: "#dc3545" });
  if (isConfirmed) {
    try {
      const response = await fetch(`/api/candidatos/${candidatoId}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` }});
      if (!response.ok) throw new Error((await response.json()).erro || "Erro ao eliminar");
      if (window.AppAlert) window.AppAlert.success("Candidato eliminado com sucesso!");
      buscarCandidatos(window.paginaAtual);
    } catch (error) { if (window.AppAlert) window.AppAlert.error(error.message); }
  }
}

// ==========================================
// CRIAR E EDITAR CANDIDATO
// ==========================================
function abrirModalCriar() {
  if (window.modalCriarInstancia) {
      document.getElementById("form-criar-candidato").reset();
      const previewEl = document.getElementById("preview-foto");
      if (previewEl) previewEl.style.display = "none";
      window.fotoBase64 = null;
      window.modalCriarInstancia.show();
  }
}

window.arquivoFotoCriar = null;

function previewImagem(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) { 
      if (window.AppAlert) window.AppAlert.error("A foto deve ter no máximo 5MB.");
      input.value = ""; return; 
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      const previewEl = document.getElementById("preview-foto");
      if (previewEl) { previewEl.src = e.target.result; previewEl.style.display = "block"; }
      window.arquivoFotoCriar = file; 
    };
    reader.readAsDataURL(file);
  }
}

async function criarCandidato(event) {
  event.preventDefault();
  const nome = document.getElementById("criar-nome")?.value.trim();
  const email = document.getElementById("criar-email")?.value.trim();
  const cpf = document.getElementById("criar-cpf")?.value.trim();
  const cargo = document.getElementById("criar-cargo")?.value.trim();
  const setor = document.getElementById("criar-setor")?.value.trim(); // <-- SETOR ADICIONADO AQUI
  const dataInicio = document.getElementById("criar-data-inicio")?.value;
  const empresaId = document.getElementById("criar-empresa")?.value;
  const secretariaId = document.getElementById("criar-secretaria")?.value;
  const telefone = document.getElementById("criar-telefone")?.value.trim();
  const observacoes = document.getElementById("criar-observacoes")?.value.trim();

  if (!nome || !email || !cpf || !cargo || !empresaId || !secretariaId) {
      if (window.AppAlert) window.AppAlert.error("Preencha todos os campos obrigatórios.");
      return;
  }
  if (!validarCPF(cpf)) {
      if (window.AppAlert) window.AppAlert.error("CPF inválido.");
      return;
  }

  try {
      const formData = new FormData();
      formData.append("nome", nome); 
      formData.append("email", email); 
      formData.append("cpf", cpf);
      formData.append("cargo", cargo); 
      formData.append("setor", setor || ""); // <-- ENVIANDO PARA O BACKEND
      formData.append("data_inicio_prevista", dataInicio || "");
      formData.append("empresa_id", empresaId); 
      formData.append("secretaria_id", secretariaId);
      formData.append("telefone", telefone || ""); 
      formData.append("observacoes", observacoes || "");
      
      if (window.arquivoFotoCriar) formData.append("foto", window.arquivoFotoCriar);

      const response = await fetch("/api/candidatos", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` }, body: formData });
      if (!response.ok) throw new Error((await response.json()).erro || "Erro ao criar candidato");

      if (window.AppAlert) window.AppAlert.success("Candidato criado com sucesso!");
      if (window.modalCriarInstancia) window.modalCriarInstancia.hide();
      buscarCandidatos(1);
  } catch (error) { if (window.AppAlert) window.AppAlert.error(error.message); }
}

async function abrirModalEditar(candidatoId) {
  try {
    const response = await fetch(`/api/candidatos/${candidatoId}`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
    if (!response.ok) throw new Error("Erro ao carregar candidato");

    const candidato = (await response.json()).candidato || await response.json();
    if (document.getElementById("editar-id")) document.getElementById("editar-id").value = candidato.id;
    if (document.getElementById("editar-nome")) document.getElementById("editar-nome").value = candidato.nome;
    if (document.getElementById("editar-email")) document.getElementById("editar-email").value = candidato.email;
    if (document.getElementById("editar-cpf")) document.getElementById("editar-cpf").value = candidato.cpf;
    if (document.getElementById("editar-cargo")) document.getElementById("editar-cargo").value = candidato.cargo;
    if (document.getElementById("editar-setor")) document.getElementById("editar-setor").value = candidato.setor || ""; // <-- CARREGANDO O SETOR NA EDIÇÃO
    if (document.getElementById("editar-telefone")) document.getElementById("editar-telefone").value = candidato.telefone || "";
    if (document.getElementById("editar-data-inicio")) document.getElementById("editar-data-inicio").value = candidato.data_inicio_prevista || "";
    if (document.getElementById("editar-observacoes")) document.getElementById("editar-observacoes").value = candidato.observacoes || "";

    const selEmpresa = document.getElementById("editar-empresa");
    if (selEmpresa) {
      selEmpresa.innerHTML = '<option value="">Selecione a empresa...</option>';
      window.empresas.forEach(e => selEmpresa.innerHTML += `<option value="${e.id}" ${e.id === candidato.empresa_id ? "selected" : ""}>${e.nome}</option>`);
    }

    const selSecretaria = document.getElementById("editar-secretaria");
    if (selSecretaria) {
      selSecretaria.innerHTML = '<option value="">Selecione a secretaria...</option>';
      window.secretarias.forEach(s => selSecretaria.innerHTML += `<option value="${s.id}" ${s.id === candidato.secretaria_id ? "selected" : ""}>${s.nome}</option>`);
    }

    window.arquivoFotoEditar = null;
    const previewEdicao = document.getElementById("preview-foto-editar");
    if (previewEdicao) {
      if (candidato.foto) { previewEdicao.src = getUrlFoto(candidato.foto); previewEdicao.style.display = "block"; } 
      else { previewEdicao.src = ""; previewEdicao.style.display = "none"; }
    }

    if (window.modalEditarInstancia) window.modalEditarInstancia.show();
  } catch (error) { if (window.AppAlert) window.AppAlert.error("Erro ao carregar candidato: " + error.message); }
}

function previewImagemEditar(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      if (window.AppAlert) window.AppAlert.error("A imagem excede 5MB.");
      input.value = ""; return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const previewEl = document.getElementById("preview-foto-editar");
      if (previewEl) { previewEl.src = e.target.result; previewEl.style.display = "block"; }
      window.arquivoFotoEditar = file;
    };
    reader.readAsDataURL(file);
  }
}

async function salvarEdicaoCandidato(event) {
  event.preventDefault();

  const candidatoId = document.getElementById("editar-id")?.value;
  const nome = document.getElementById("editar-nome")?.value.trim();
  const email = document.getElementById("editar-email")?.value.trim();
  const cpf = document.getElementById("editar-cpf")?.value.trim();
  const cargo = document.getElementById("editar-cargo")?.value.trim();
  const setor = document.getElementById("editar-setor")?.value.trim(); // <-- CAPTURANDO SETOR
  const dataInicio = document.getElementById("editar-data-inicio")?.value;
  const empresaId = document.getElementById("editar-empresa")?.value;
  const secretariaId = document.getElementById("editar-secretaria")?.value;
  const telefone = document.getElementById("editar-telefone")?.value.trim();
  const observacoes = document.getElementById("editar-observacoes")?.value.trim();

  if (!nome || !email || !cpf || !cargo || !empresaId || !secretariaId) {
    if (window.AppAlert) window.AppAlert.error("Preencha todos os campos obrigatórios.");
    return;
  }
  if (!validarCPF(cpf)) {
    if (window.AppAlert) window.AppAlert.error("CPF inválido.");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("nome", nome);
    formData.append("email", email);
    formData.append("cpf", cpf);
    formData.append("cargo", cargo);
    formData.append("setor", setor || ""); // <-- ENVIANDO PARA O BACKEND
    formData.append("data_inicio_prevista", dataInicio || "");
    formData.append("empresa_id", empresaId);
    formData.append("secretaria_id", secretariaId);
    formData.append("telefone", telefone);
    formData.append("observacoes", observacoes);

    if (window.arquivoFotoEditar) formData.append("foto", window.arquivoFotoEditar);

    const response = await fetch(`/api/candidatos/${candidatoId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || "Erro ao atualizar candidato");

    if (window.AppAlert) window.AppAlert.success("Candidato atualizado com sucesso!");
    if (window.modalEditarInstancia) window.modalEditarInstancia.hide();
    
    window.arquivoFotoEditar = null;
    buscarCandidatos(window.paginaAtual);
  } catch (error) {
    console.error("Erro na submissão:", error);
    if (window.AppAlert) window.AppAlert.error(error.message);
  }
}

// ==========================================
// FILTROS E ESTATÍSTICAS
// ==========================================
function limparFiltros() {
  const fStatus = document.getElementById("filtro-status");
  const fEmpresa = document.getElementById("filtro-empresa");
  const fSecretaria = document.getElementById("filtro-secretaria");
  const fIndicacao = document.getElementById("filtro-indicacao");
  const fBusca = document.getElementById("filtro-busca");

  if (fStatus) fStatus.value = "";
  if (fEmpresa) fEmpresa.value = "";
  if (fSecretaria) fSecretaria.value = "";
  if (fIndicacao) fIndicacao.value = "";
  if (fBusca) fBusca.value = "";

  buscarCandidatos(1);
}

async function atualizarEstatisticas() {
  try {
    const response = await fetch("/api/candidatos/stats", { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } });
    if (response.ok) {
      const data = await response.json();
      if (document.getElementById("stat-pendentes")) document.getElementById("stat-pendentes").textContent = data.pendentes || 0;
      if (document.getElementById("stat-aprovados")) document.getElementById("stat-aprovados").textContent = data.aprovados || 0;
      if (document.getElementById("stat-recusados")) document.getElementById("stat-recusados").textContent = data.recusados || 0;
      if (document.getElementById("stat-contratados")) document.getElementById("stat-contratados").textContent = data.contratados || 0;
    }
  } catch (error) { console.error("Erro estatísticas:", error); }
}

function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;
  soma = 0;
  for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(10, 11))) return false;
  return true;
}