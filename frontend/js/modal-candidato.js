/**
 * Modal de Visualização de Candidatos (Slideshow)
 * Gerencia a abertura, navegação e ações de aprovação/recusa de candidatos
 */

let candidatosParaNavegacao = [];
let indiceCandidatoAtual = 0;
let modalCandidatoInstancia = null;

// Helper para garantir a URL correta das fotos
function getUrlFotoCandidato(caminhoFoto) {
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
    window.location.origin === "file://"
  ) {
    // Ambiente de Desenvolvimento (Local)
    base = "http://127.0.0.1:5000";
  } else {
    // Ambiente de Produção (Servidor)
    // Captura automaticamente o protocolo + domínio + porta do servidor atual
    base = window.location.origin;
  }

  let caminho = caminhoFoto.startsWith("/")
    ? caminhoFoto.substring(1)
    : caminhoFoto;
  return `${base}/api/arquivos/${caminho}`.replace(/([^:]\/)\/+/g, "$1");
}

// Inicializar o modal quando o documento estiver pronto
document.addEventListener("DOMContentLoaded", function () {
  const modalEl = document.getElementById("modalVisualizarCandidato");
  if (modalEl) {
    modalCandidatoInstancia = new bootstrap.Modal(modalEl);
  }

  // Botões de navegação
  const btnAnterior = document.getElementById("btnAnteriorCandidato");
  const btnProximo = document.getElementById("btnProximoCandidato");

  if (btnAnterior) {
    btnAnterior.addEventListener("click", () => {
      if (indiceCandidatoAtual > 0) {
        indiceCandidatoAtual--;
        carregarCandidatoNoModal(candidatosParaNavegacao[indiceCandidatoAtual]);
      }
    });
  }

  if (btnProximo) {
    btnProximo.addEventListener("click", () => {
      if (indiceCandidatoAtual < candidatosParaNavegacao.length - 1) {
        indiceCandidatoAtual++;
        carregarCandidatoNoModal(candidatosParaNavegacao[indiceCandidatoAtual]);
      }
    });
  }

  // Botões de Aprovação e Recusa
  const btnAprovar = document.getElementById("btnAprovarCandidato");
  const btnRecusar = document.getElementById("btnRecusarCandidato");

  if (btnAprovar) {
    btnAprovar.addEventListener("click", async () => {
      const candidato = candidatosParaNavegacao[indiceCandidatoAtual];
      if (candidato) {
        await aprovarCandidato(candidato.id);
      }
    });
  }

  if (btnRecusar) {
    btnRecusar.addEventListener("click", async () => {
      const candidato = candidatosParaNavegacao[indiceCandidatoAtual];
      if (candidato) {
        await recusarCandidato(candidato.id);
      }
    });
  }
});

/**
 * Abre o modal de visualização de candidato com navegação
 * @param {Array} funcionarios - Lista de funcionários da tabela atual
 * @param {number} indexInicial - Índice do funcionário clicado
 */
window.abrirModalVisualizacaoCandidato = async function (
  funcionarios,
  indexInicial = 0,
) {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  if (!token) {
    if (typeof Swal !== "undefined") {
      Swal.fire(
        "Erro",
        "Token não encontrado. Por favor, faça login novamente.",
        "error",
      );
    }
    return;
  }

  // Armazenar a lista de funcionários para navegação
  candidatosParaNavegacao = funcionarios;
  indiceCandidatoAtual = indexInicial;

  // Carregar o candidato inicial
  const funcionarioAtual = funcionarios[indexInicial];
  if (funcionarioAtual) {
    await carregarCandidatoNoModal(funcionarioAtual);

    // Mostrar o modal
    if (modalCandidatoInstancia) {
      modalCandidatoInstancia.show();
    }
  }
};

/**
 * Carrega os dados do candidato no modal
 * @param {Object} funcionario - Dados do funcionário
 */
async function carregarCandidatoNoModal(funcionario) {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  try {
    // Atualizar indicador de navegação
    const indicador = document.getElementById("indicadorCandidato");
    if (indicador) {
      indicador.textContent = `${indiceCandidatoAtual + 1} de ${candidatosParaNavegacao.length}`;
    }

    // Atualizar botões de navegação
    const btnAnterior = document.getElementById("btnAnteriorCandidato");
    const btnProximo = document.getElementById("btnProximoCandidato");

    if (btnAnterior) {
      btnAnterior.disabled = indiceCandidatoAtual === 0;
    }
    if (btnProximo) {
      btnProximo.disabled =
        indiceCandidatoAtual === candidatosParaNavegacao.length - 1;
    }

    // Preencher informações básicas do funcionário
    document.getElementById("candidatoNomeModal").textContent =
      funcionario.nome || "-";
    document.getElementById("candidatoNome").textContent =
      funcionario.nome || "-";
    document.getElementById("candidatoEmail").textContent =
      funcionario.email || "-";
    document.getElementById("candidatoTelefone").textContent =
      funcionario.telefone || "-";
    document.getElementById("candidatoCpf").textContent =
      funcionario.cpf || "-";
    document.getElementById("candidatoEmpresa").textContent =
      funcionario.empresa_nome || "-";
    document.getElementById("candidatoSecretaria").textContent =
      funcionario.secretaria_nome || "-";
    document.getElementById("candidatoCargo").textContent =
      funcionario.cargo || "-";
    document.getElementById("candidatoDataInicio").textContent =
      funcionario.data_inicio_prevista || "-";
    document.getElementById("candidatoObservacoes").textContent =
      funcionario.observacoes || "-";

    // Carregar foto
    const fotoImg = document.getElementById("candidatoFoto");
    const fotoPlaceholder = document.getElementById("fotoPlaceholder");

    if (funcionario.foto) {
      const urlFoto = getUrlFotoCandidato(funcionario.foto);
      fotoImg.src = urlFoto;
      fotoImg.style.display = "block";
      if (fotoPlaceholder) fotoPlaceholder.style.display = "none";
    } else {
      fotoImg.style.display = "none";
      if (fotoPlaceholder) fotoPlaceholder.style.display = "block";
    }

    // Limpar campo de motivo
    const motivoInput = document.getElementById("motivoAprovacao");
    if (motivoInput) motivoInput.value = "";

    // Tentar buscar dados do candidato (se vinculado)
    // Primeiro, tentar buscar por CPF
    let candidatoData = null;
    try {
      const resCandidato = await fetch(
        `/api/candidatos?busca=${encodeURIComponent(funcionario.cpf)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (resCandidato.ok) {
        const dataCandidatos = await resCandidato.json();
        if (dataCandidatos.candidatos && dataCandidatos.candidatos.length > 0) {
          candidatoData = dataCandidatos.candidatos[0];
        }
      }
    } catch (error) {
      console.log("Não foi possível buscar dados do candidato:", error);
    }

    // Carregar histórico de aprovações
    await carregarHistoricoAprovacoes(candidatoData);

    // Controlar visibilidade dos botões de aprovação/recusa
    controlarBotoesAprovacao(candidatoData);
  } catch (error) {
    console.error("Erro ao carregar candidato no modal:", error);
    if (typeof Swal !== "undefined") {
      Swal.fire("Erro", "Erro ao carregar dados do candidato.", "error");
    }
  }
}

/**
 * Carrega e exibe o histórico de aprovações
 * @param {Object} candidatoData - Dados do candidato
 */
async function carregarHistoricoAprovacoes(candidatoData) {
  const historicoContainer = document.getElementById("historicoAprovacoes");

  if (!historicoContainer) return;

  // Se não há dados do candidato, exibir mensagem
  if (!candidatoData || !candidatoData.id) {
    historicoContainer.innerHTML =
      '<p class="text-muted small mb-0">Funcionário não vinculado a candidato em processo de aprovação.</p>';
    return;
  }

  try {
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");
    const res = await fetch(`/api/candidatos/${candidatoData.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      historicoContainer.innerHTML =
        '<p class="text-muted small mb-0">Sem histórico de aprovações.</p>';
      return;
    }

    const data = await res.json();
    const aprovacoes = data.aprovacoes || [];

    // Definir os níveis de aprovação esperados
    const niveis = ["vice_prefeito", "prefeito", "planejamento"];
    const nivelNomes = {
      vice_prefeito: "Vice-Prefeito",
      prefeito: "Prefeito",
      planejamento: "Planejamento",
    };

    let html = "";

    niveis.forEach((nivel) => {
      const aprovacao = aprovacoes.find((a) => a.nivel_aprovacao === nivel);
      const statusClass = aprovacao
        ? aprovacao.acao === "aprovado"
          ? "bg-success text-white"
          : "bg-danger text-white"
        : "bg-warning text-dark";
      const statusIcon = aprovacao
        ? aprovacao.acao === "aprovado"
          ? "fa-check-circle"
          : "fa-times-circle"
        : "fa-clock";
      const statusTexto = aprovacao
        ? aprovacao.acao === "aprovado"
          ? "Aprovado"
          : "Recusado"
        : "Pendente";
      const aprovadorNome = aprovacao
        ? aprovacao.aprovador_nome || "Sistema"
        : "-";

      html += `
                <div class="mb-2">
                    <div class="d-flex align-items-center">
                        <span class="badge ${statusClass} px-3 py-2 me-2 flex-shrink-0">
                            <i class="fas ${statusIcon} me-1"></i>${statusTexto}
                        </span>
                        <div>
                            <strong>${nivelNomes[nivel]}</strong>
                            <br>
                            <small class="text-muted">Por: ${aprovadorNome}</small>
                        </div>
                    </div>
                </div>
            `;
    });

    historicoContainer.innerHTML = html;
  } catch (error) {
    console.error("Erro ao carregar histórico de aprovações:", error);
    historicoContainer.innerHTML =
      '<p class="text-muted small mb-0">Erro ao carregar histórico.</p>';
  }
}

/**
 * Controla a visibilidade dos botões de aprovação e recusa
 * @param {Object} candidatoData - Dados do candidato
 */
function controlarBotoesAprovacao(candidatoData) {
  const btnAprovar = document.getElementById("btnAprovarCandidato");
  const btnRecusar = document.getElementById("btnRecusarCandidato");

  // Ocultar botões por padrão
  if (btnAprovar) btnAprovar.style.display = "none";
  if (btnRecusar) btnRecusar.style.display = "none";

  // Verificar se o usuário é aprovador
  if (!window.userInfo) return;

  const perfil = (window.userInfo.perfil || "").toLowerCase();
  const permissoes = window.userInfo.permissoes || {};

  // Apenas aprovadores podem aprovar/recusar
  const podeAprovar =
    perfil === "aprovador" || permissoes["aprovar_candidato"] === true;
  const podeRecusar =
    perfil === "aprovador" || permissoes["recusar_candidato"] === true;

  // Mostrar botões apenas se o usuário tem permissão E o candidato está em processo de aprovação
  if (candidatoData && candidatoData.id) {
    if (podeAprovar && btnAprovar) {
      btnAprovar.style.display = "block";
    }
    if (podeRecusar && btnRecusar) {
      btnRecusar.style.display = "block";
    }
  }
}

/**
 * Aprova um candidato
 * @param {number} candidatoId - ID do candidato
 */
async function aprovarCandidato(candidatoId) {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");
  const motivo = document.getElementById("motivoAprovacao")?.value || "";

  try {
    const res = await fetch(`/api/candidatos/${candidatoId}/aprovar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ motivo }),
    });

    if (res.ok) {
      if (typeof Swal !== "undefined") {
        Swal.fire("Sucesso!", "Candidato aprovado com sucesso!", "success");
      }

      // Fechar o modal e recarregar a tabela
      if (modalCandidatoInstancia) {
        modalCandidatoInstancia.hide();
      }

      // Recarregar funcionários
      if (typeof carregarFuncionarios === "function") {
        carregarFuncionarios();
      }
    } else {
      const erro = await res.json();
      throw new Error(erro.erro || "Erro ao aprovar candidato");
    }
  } catch (error) {
    console.error("Erro ao aprovar candidato:", error);
    if (typeof Swal !== "undefined") {
      Swal.fire("Erro", error.message, "error");
    }
  }
}

/**
 * Recusa um candidato
 * @param {number} candidatoId - ID do candidato
 */
async function recusarCandidato(candidatoId) {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");
  const motivo = document.getElementById("motivoAprovacao")?.value || "";

  if (!motivo) {
    if (typeof Swal !== "undefined") {
      Swal.fire("Aviso", "Por favor, descreva o motivo da recusa.", "warning");
    }
    return;
  }

  try {
    const res = await fetch(`/api/candidatos/${candidatoId}/recusar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ motivo }),
    });

    if (res.ok) {
      if (typeof Swal !== "undefined") {
        Swal.fire("Sucesso!", "Candidato recusado com sucesso!", "success");
      }

      // Fechar o modal e recarregar a tabela
      if (modalCandidatoInstancia) {
        modalCandidatoInstancia.hide();
      }

      // Recarregar funcionários
      if (typeof carregarFuncionarios === "function") {
        carregarFuncionarios();
      }
    } else {
      const erro = await res.json();
      throw new Error(erro.erro || "Erro ao recusar candidato");
    }
  } catch (error) {
    console.error("Erro ao recusar candidato:", error);
    if (typeof Swal !== "undefined") {
      Swal.fire("Erro", error.message, "error");
    }
  }
}
