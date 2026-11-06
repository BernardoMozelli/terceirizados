/**
 * Super Modal Fullscreen para Gestão Estratégica de Funcionários
 */

let superModalInstancia = null;
let funcionarioAtualId = null;
let funcionarioAtualSecretariaId = null; 

function setTextoSeguro(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
}

function setValorSeguro(id, valor) {
    const el = document.getElementById(id);
    if (el) el.value = valor;
}

function getUrlFotoSuperModal(caminhoFoto) {
    if (!caminhoFoto || caminhoFoto === "null" || caminhoFoto === "undefined") return null;
    if (caminhoFoto.startsWith("http") || caminhoFoto.startsWith("data:")) return caminhoFoto;
    // Usar a rota unificada /api/arquivos/ que resolve automaticamente
    // os caminhos tanto em uploads/ quanto em static/uploads/
    let caminho = caminhoFoto.replace(/^\/+/, "");
    return `/api/arquivos/${caminho}`;
}

document.addEventListener("DOMContentLoaded", function () {
    const modalEl = document.getElementById("superModalFuncionario");
    if (modalEl) {
        superModalInstancia = new bootstrap.Modal(modalEl, { backdrop: "static", keyboard: false });
        modalEl.addEventListener("show.bs.modal", function () {
            const dialog = modalEl.querySelector(".modal-dialog");
            if (dialog) { dialog.classList.remove("modal-fullscreen"); dialog.removeAttribute("style"); }
        });
    }

    vincularEventosSuperModal();
    vincularPesquisaModal();
});

function vincularEventosSuperModal() {
    // 1. Regra do prefixo "Indicado por:"
    const obsInput = document.getElementById("superModalObservacaoInput");
    if (obsInput) {
        obsInput.addEventListener("input", function() {
            if (!this.value.startsWith("Indicado por: ")) this.value = "Indicado por: ";
        });
    }

    // 2. Botão de salvar edições 
    const btnSalvar = document.getElementById("superModalSalvarDados");
    if (btnSalvar) btnSalvar.addEventListener("click", salvarEdicaoFuncionario);

    // 3. Toggle de status 
    const toggleAtivo = document.getElementById("superModalToggleAtivo");
    if (toggleAtivo) toggleAtivo.addEventListener("change", function() { handleToggleAtivo(this.checked); });

    // 4. Upload de nova foto
    const btnUpload = document.getElementById("superModalBtnUploadFoto");
    const inputFoto = document.getElementById("superModalInputFoto");
    if (btnUpload && inputFoto) {
        btnUpload.addEventListener("click", () => inputFoto.click());
        inputFoto.addEventListener("change", handleFotoUpload);
    }

    // 5. Botão de Transferir 
    const btnTransferir = document.getElementById("superModalBtnTransferir");
    if (btnTransferir) {
        btnTransferir.addEventListener("click", function() {
            if (funcionarioAtualId) {
                const nomeFuncionario = document.getElementById("superModalNome").textContent;
                document.getElementById("transferFuncionarioName").textContent = nomeFuncionario;
                document.getElementById("transferFuncionarioId").value = funcionarioAtualId;

                if (superModalInstancia) superModalInstancia._config.focus = false;

                const modalTransferenciaEl = document.getElementById("modalTransferirFuncionario");
                if (modalTransferenciaEl) {
                    const modalInstancia = new bootstrap.Modal(modalTransferenciaEl);
                    modalInstancia.show();

                    modalTransferenciaEl.addEventListener('hidden.bs.modal', function () {
                        if (superModalInstancia) superModalInstancia._config.focus = true;
                    }, { once: true });
                }
            }
        });
    }

    // 6. Botão de Desligar 
    const btnDesligar = document.getElementById("superModalBtnDesligar");
    if (btnDesligar) btnDesligar.addEventListener("click", abrirModalDesligamento);

    // 7. Evento para ampliar a foto de perfil em tela cheia (Zoom)
    const imgPerfil = document.getElementById("superModalFotoImg");
    if (imgPerfil) {
        imgPerfil.style.cursor = "pointer";
        imgPerfil.title = "Clique para ampliar";

        imgPerfil.addEventListener("click", function() {
            if (this.src.includes("data:image/svg+xml")) return;

            const modalElement = document.getElementById("superModalFuncionario");
            Swal.fire({
                target: modalElement,
                imageUrl: this.src,
                imageAlt: 'Foto Ampliada do Funcionário',
                showConfirmButton: false,
                showCloseButton: true,
                width: '650px',
                padding: '1em',
                backdrop: `rgba(0,0,0,0.85)`,
                customClass: { image: 'img-fluid rounded shadow' }
            });
        });
    }
}

function navegarSuperModal(direcao) {
    if (!funcionarioAtualId) return;

    const botoesAbertura = Array.from(document.querySelectorAll('#funcionariosTable .btn-primary[onclick^="abrirSuperModal"]'));
    if (botoesAbertura.length === 0) return;

    const indexAtual = botoesAbertura.findIndex(btn => btn.getAttribute('onclick').includes(`abrirSuperModal(${funcionarioAtualId})`));

    if (indexAtual !== -1) {
        const novoIndex = indexAtual + direcao;

        if (novoIndex >= 0 && novoIndex < botoesAbertura.length) {
            botoesAbertura[novoIndex].click();
        } else {
            if (direcao > 0) {
                const itensPaginacao = document.querySelectorAll('#paginationContainer .page-item');
                const btnProximo = itensPaginacao.length > 0 ? itensPaginacao[itensPaginacao.length - 1] : null;

                if (btnProximo && !btnProximo.classList.contains('disabled')) {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Carregando a próxima página...', showConfirmButton: false, timer: 1500 });
                    const linkProximo = btnProximo.querySelector('.page-link');
                    if(linkProximo) linkProximo.click(); 

                    setTimeout(() => {
                        const novosBotoes = document.querySelectorAll('#funcionariosTable .btn-primary[onclick^="abrirSuperModal"]');
                        if (novosBotoes.length > 0) novosBotoes[0].click();
                    }, 1200);
                } else {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Fim de todos os registos.', showConfirmButton: false, timer: 2000 });
                }
            } else {
                const itensPaginacao = document.querySelectorAll('#paginationContainer .page-item');
                const btnAnterior = itensPaginacao.length > 0 ? itensPaginacao[0] : null;

                if (btnAnterior && !btnAnterior.classList.contains('disabled')) {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'A carregar página anterior...', showConfirmButton: false, timer: 1500 });
                    const linkAnterior = btnAnterior.querySelector('.page-link');
                    if(linkAnterior) linkAnterior.click(); 

                    setTimeout(() => {
                        const novosBotoes = document.querySelectorAll('#funcionariosTable .btn-primary[onclick^="abrirSuperModal"]');
                        if (novosBotoes.length > 0) novosBotoes[novosBotoes.length - 1].click();
                    }, 1200);
                } else {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Este é o primeiro funcionário.', showConfirmButton: false, timer: 2000 });
                }
            }
        }
    }
}


function vincularPesquisaModal() {
    // Busca rápida dentro da Central de Gestão: digite nome ou CPF (com ou sem pontuação)
    const inputPesquisa = document.getElementById("superModalPesquisaInput");
    const dropdown = document.getElementById("superModalPesquisaDropdown");
    if (!inputPesquisa || !dropdown) return;

    const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmtCpf = (c) => { const d = String(c || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : (c || "-"); };
    let debounceTimeout, controle = null, ativo = -1;

    const fechar = () => { dropdown.style.display = "none"; ativo = -1; };
    const itens = () => Array.from(dropdown.querySelectorAll(".sm-res"));
    const marcar = (i) => {
        const lista = itens(); if (!lista.length) return;
        ativo = (i + lista.length) % lista.length;
        lista.forEach((el, n) => el.classList.toggle("active", n === ativo));
        lista[ativo].scrollIntoView({ block: "nearest" });
    };
    const escolher = (id) => { fechar(); inputPesquisa.value = ""; abrirSuperModal(id); };

    inputPesquisa.addEventListener("input", function () {
        clearTimeout(debounceTimeout);
        const query = this.value.trim();
        const soDigitos = query.replace(/\D/g, "");
        if (query.length < 2 && soDigitos.length < 3) { fechar(); return; }

        dropdown.innerHTML = '<li class="px-3 py-2 text-muted small"><span class="spinner-border spinner-border-sm me-2"></span>Buscando...</li>';
        dropdown.style.display = "block";

        debounceTimeout = setTimeout(async () => {
            try {
                if (controle) controle.abort();
                controle = new AbortController();
                const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
                const response = await fetch(`/api/funcionarios?filtro_geral=${encodeURIComponent(query)}&per_page=10&page=1`, {
                    headers: { "Authorization": `Bearer ${token}` }, signal: controle.signal
                });
                if (!response.ok) throw new Error("Erro na busca");
                const data = await response.json();
                const lista = data.funcionarios || data.data || [];

                ativo = -1;
                if (lista.length === 0) {
                    dropdown.innerHTML = '<li class="px-3 py-2 text-muted small">Nenhum funcionário ativo encontrado.</li>';
                } else {
                    dropdown.innerHTML = lista.map(f => `
                        <li><a class="dropdown-item sm-res" href="#" data-id="${Number(f.id)}">
                            <span class="sm-res-nome">${esc(f.nome)}</span>
                            <small>CPF ${esc(fmtCpf(f.cpf))} · Mat. ${esc(f.matricula || "-")}</small>
                        </a></li>`).join("");
                }
                dropdown.style.display = "block";
            } catch (error) {
                if (error.name !== "AbortError") {
                    console.error("Erro ao pesquisar:", error);
                    dropdown.innerHTML = '<li class="px-3 py-2 text-danger small">Não foi possível buscar agora.</li>';
                }
            }
        }, 350);
    });

    dropdown.addEventListener("click", (e) => {
        const a = e.target.closest(".sm-res");
        if (!a) return;
        e.preventDefault();
        escolher(a.dataset.id);
    });

    inputPesquisa.addEventListener("keydown", (e) => {
        if (dropdown.style.display !== "block") return;
        if (e.key === "ArrowDown") { e.preventDefault(); marcar(ativo + 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); marcar(ativo - 1); }
        else if (e.key === "Enter") {
            e.preventDefault();
            const lista = itens();
            const alvo = lista[ativo >= 0 ? ativo : 0];
            if (alvo) escolher(alvo.dataset.id);
        } else if (e.key === "Escape") { e.stopPropagation(); fechar(); }
    });

    document.addEventListener("click", function (e) {
        if (!inputPesquisa.contains(e.target) && !dropdown.contains(e.target)) fechar();
    });
}

async function abrirSuperModal(id) {
    try {
        funcionarioAtualId = id;
        const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
        
        const response = await fetch(`/api/funcionarios/detalhes/${id}`, { headers: { "Authorization": `Bearer ${token}` } });
        if (!response.ok) throw new Error("Não foi possível carregar os dados");
        
        const data = await response.json();
        preencherDadosModal(data);
        if (superModalInstancia) superModalInstancia.show();
    } catch (error) {
        console.error("Erro ao abrir Super Modal:", error);
        Swal.fire("Erro", "Erro ao abrir o modal de gestão.", "error");
    }
}

function preencherDadosModal(data) {
    const f = data.funcionario || data;
    funcionarioAtualId = f.id;
    window.funcionarioAtualSecretariaId = f.secretaria_id;

    // 1. CAPTURA DE PERMISSÕES (Objeto injetado no login)
    const perms = window.userInfo?.permissoes || {};

    // ---------------------------------------------------------
    // 2. BOTÃO DESLIGAR (TRAVA DE SEGURANÇA REFORÇADA)
    // ---------------------------------------------------------
    const btnDesligar = document.getElementById("superModalBtnDesligar");
    const isAtivo = f.status_contratual === 1 || f.ativo === true;

    if (btnDesligar) {
        // Se a permissão for explicitamente FALSE (Perfil Padrão), mata o botão
        if (perms.desligar_funcionario === false) {
            btnDesligar.style.setProperty("display", "none", "important");
        } else {
            // Caso contrário (Admin, Ativador, Aprovador), mostra e aplica a lógica de status
            btnDesligar.style.setProperty("display", "inline-block", "important");
            
            if (isAtivo) {
                btnDesligar.disabled = false;
                btnDesligar.innerHTML = '<i class="fas fa-user-slash me-2"></i>Desligar Funcionário';
                btnDesligar.classList.remove("btn-secondary");
                btnDesligar.classList.add("btn-danger");
            } else {
                btnDesligar.disabled = true;
                btnDesligar.innerHTML = '<i class="fas fa-user-slash me-2"></i>Funcionário Desligado';
                btnDesligar.classList.remove("btn-danger");
                btnDesligar.classList.add("btn-secondary");
            }
        }
    }

    // ---------------------------------------------------------
    // 3. BOTÃO TRANSFERIR (TRAVA DE SEGURANÇA)
    // ---------------------------------------------------------
    const btnTransferir = document.getElementById("superModalBtnTransferir");
    if (btnTransferir) {
        if (perms.solicitar_transferencia === false) {
            btnTransferir.style.setProperty("display", "none", "important");
        } else {
            btnTransferir.style.setProperty("display", "inline-block", "important");
        }
    }

    // ---------------------------------------------------------
    // 4. PREENCHIMENTO DE CAMPOS E TEXTOS
    // ---------------------------------------------------------
    setTextoSeguro("superModalNome", f.nome || "Sem Nome");
    setValorSeguro("superModalNomeInput", f.nome || "");
    setValorSeguro("superModalCargoInput", f.cargo || "");
    setValorSeguro("superModalSetorInput", f.setor || ""); 
    setValorSeguro("superModalCpfInput", f.cpf || "");
    setValorSeguro("superModalMatriculaInput", f.matricula || "");

    // Tratamento de Observação / Indicação
    // Priorizar a indicação retornada pelo backend (do candidato)
    let indicacao = f.observacao || data.indicacao || f.indicacao || "";
    let indicacaoLimpa = indicacao;
    
    // Limpar e formatar a indicação
    if (indicacao.includes("Contratado via candidato")) {
        indicacaoLimpa = indicacao.split("Contratado via")[0].replace("Indicado por:", "").trim();
    }
    if (indicacaoLimpa && !indicacaoLimpa.startsWith("Indicado por: ")) {
        indicacaoLimpa = "Indicado por: " + indicacaoLimpa.replace("Indicado por:", "").trim();
    } else if (!indicacaoLimpa || indicacaoLimpa === "Indicado por:") {
        indicacaoLimpa = "Indicado por: ";
    }
    setValorSeguro("superModalObservacaoInput", indicacaoLimpa);

    setTextoSeguro("superModalEmpresa", f.empresa_nome || "-");
    setTextoSeguro("superModalSecretaria", f.secretaria_nome || "-");
    setTextoSeguro("superModalSetor", f.setor || "-"); 

    // Status de Fluxo
    let statusTexto = f.status || f.status_aprovacao || "CONTRATADO";
    if (statusTexto.toLowerCase() === "cadastrado") statusTexto = "CONTRATADO";
    setTextoSeguro("superModalStatusFluxo", statusTexto);

    // Toggle de Status (Ativo/Inativo)
    const toggle = document.getElementById("superModalToggleAtivo");
    if (toggle) {
        toggle.checked = isAtivo;
        atualizarLabelStatus(isAtivo);
    }

    // ---------------------------------------------------------
    // 5. TRATAMENTO DA FOTO
    // ---------------------------------------------------------
    const imgPerfil = document.getElementById("superModalFotoImg");
    if (imgPerfil) {
        const avatarPadrao = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Ccircle cx=%2750%27 cy=%2750%27 r=%2750%27 fill=%27%23e0e0e0%27/%3E%3Ccircle cx=%2750%27 cy=%2738%27 r=%2718%27 fill=%27%23bdbdbd%27/%3E%3Cellipse cx=%2750%27 cy=%2785%27 rx=%2728%27 ry=%2720%27 fill=%27%23bdbdbd%27/%3E%3C/svg%3E";
        const fotoUrl = data.foto_url || f.foto || f.foto_url;
        
        if (fotoUrl && fotoUrl !== "null") {
            imgPerfil.src = getUrlFotoSuperModal(fotoUrl);
        } else {
            imgPerfil.src = avatarPadrao;
        }
        imgPerfil.onerror = function() { this.src = avatarPadrao; };
    }

    // ---------------------------------------------------------
    // 6. HISTÓRICO E CARDS DE FLUXO
    // ---------------------------------------------------------
    if (typeof renderizarHistorico === "function") {
        renderizarHistorico(data.historico_aprovacoes || []);
    }

    const cardAcoes = document.getElementById("superModalAcoesBotoesCard");
    if (cardAcoes) {
        cardAcoes.style.display = data.tem_fluxo_pendente ? "block" : "none";
    }
}

function atualizarLabelStatus(isAtivo) {
    const textSpan = document.getElementById("superModalStatusText");
    if (textSpan) {
        textSpan.textContent = isAtivo ? "ATIVO" : "INATIVO";
        textSpan.className = isAtivo ? "badge bg-success py-2 px-3" : "badge bg-danger py-2 px-3";
    }
}

async function salvarEdicaoFuncionario() {
    if (!funcionarioAtualId) return;
    const nome = document.getElementById("superModalNomeInput").value.trim();
    const cargo = document.getElementById("superModalCargoInput").value.trim();
    const setor = document.getElementById("superModalSetorInput").value.trim(); 
    const observacao = document.getElementById("superModalObservacaoInput").value.trim();
    const matricula = document.getElementById("superModalMatriculaInput").value.trim();

    if (!nome || !cargo || !setor) { 
        Swal.fire("Aviso", "Nome, Cargo e Setor são obrigatórios.", "warning"); 
        return; 
    }

    try {
        const token = localStorage.getItem("access_token");
        const response = await fetch(`/api/funcionarios/atualizar/${funcionarioAtualId}`, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(
                (window.podeVerIndicacao && window.podeVerIndicacao())
                    ? { nome, cargo, setor, observacao, matricula }
                    : { nome, cargo, setor, matricula }
            )
        });

        if (!response.ok) throw new Error("Erro ao salvar.");

        // 1. Atualiza os textos dentro do próprio modal
        setTextoSeguro("superModalNome", nome);
        setTextoSeguro("superModalSetor", setor);

        // 2. Atualiza a linha da tabela diretamente no DOM (feedback imediato)
        const btnAbertura = document.querySelector(
            `#funcionariosTable button[onclick="abrirSuperModal(${funcionarioAtualId})"]`
        );
        if (btnAbertura) {
            const tr = btnAbertura.closest("tr");
            if (tr) {
                const cells = tr.querySelectorAll("td");
                if (cells[1]) cells[1].textContent = matricula;
                if (cells[2]) cells[2].textContent = nome;
                if (cells[3]) cells[3].textContent = cargo;
                if (cells[7]) cells[7].textContent = setor;
            }
        }

        // 3. Dispara evento para o funcionarios.js recarregar a tabela em background
        document.dispatchEvent(new CustomEvent("funcionarioAtualizado", {
            detail: { id: funcionarioAtualId, nome, cargo, setor, matricula }
        }));

        Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Dados salvos!", showConfirmButton: false, timer: 2000 });

    } catch (error) { 
        Swal.fire("Erro", "Não foi possível salvar as alterações.", "error"); 
    }
}

async function handleToggleAtivo(novoStatus) {
    if (!funcionarioAtualId) return;
    const toggle = document.getElementById("superModalToggleAtivo");

    if (!novoStatus) {
        if (toggle) toggle.checked = true; 
        Swal.fire({
            icon: "warning",
            title: "Use o botão de desligamento",
            html: `Para desligar um funcionário, utilize o botão <b>"Desligar Funcionário"</b> abaixo.<br><br>
                   <small class="text-muted">Isso garante o bloqueio correto no AD e o registo do motivo.</small>`,
            confirmButtonColor: "#dc3545",
            confirmButtonText: "Entendido"
        });
        return;
    }

    try {
        const token = localStorage.getItem("access_token");
        const response = await fetch(`/api/funcionarios/${funcionarioAtualId}`, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status_contratual: 1 })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.erro || "Falha ao reativar.");
        }
        atualizarLabelStatus(true);

        const btnDesligar = document.getElementById("superModalBtnDesligar");
        if (btnDesligar) {
            btnDesligar.disabled = false;
            btnDesligar.innerHTML = '<i class="fas fa-user-slash me-2"></i>Desligar Funcionário';
            btnDesligar.classList.remove("btn-secondary");
            btnDesligar.classList.add("btn-danger");
        }

        Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Acesso Reativado!", showConfirmButton: false, timer: 2000 });
        if (typeof carregarFuncionarios === "function") carregarFuncionarios();
    } catch (error) {
        if (toggle) toggle.checked = false;
        Swal.fire("Erro", error.message || "Falha ao reativar.", "error");
    }
}

function abrirModalDesligamento() {
    const toggle = document.getElementById("superModalToggleAtivo");
    if (toggle && !toggle.checked) {
        Swal.fire({ icon: "info", title: "Colaborador já inativo", text: "Este colaborador já consta como inativo no sistema." });
        return;
    }

    const nomeInput = document.getElementById("superModalNomeInput");
    const nome = nomeInput ? nomeInput.value.trim() : "o funcionário";
    const modalElement = document.getElementById("superModalFuncionario");

    Swal.fire({
        title: "Confirmar Desligamento",
        target: modalElement, 
        html: `
            <div style="text-align: left;">
                Você está prestes a desligar <b>${nome}</b>.<br><br>
                <span class="text-danger small">
                    <i class="fas fa-exclamation-triangle me-1"></i>
                    A conta será <strong>bloqueada no AD</strong> e o status alterado para 
                    <strong>Desligado</strong> no sistema.
                </span>
                <div class="mt-3">
                    <label class="form-label small fw-bold">Motivo (opcional)</label>
                    <textarea id="swal-motivo-desligamento" class="form-control" 
                        style="height: 80px !important; width: 100%; display: block !important;"
                        placeholder="Ex: Fim do contrato, pedido de demissão..."></textarea>
                </div>
            </div>
        `,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc3545",
        cancelButtonColor: "#6c757d",
        confirmButtonText: 'Confirmar Desligamento',
        cancelButtonText: "Cancelar",
        didOpen: () => {
            if (superModalInstancia) superModalInstancia._config.focus = false;
            const ta = document.getElementById("swal-motivo-desligamento");
            if (ta) { setTimeout(() => { ta.focus(); ta.click(); }, 150); }
        },
        preConfirm: () => {
            const motivo = document.getElementById("swal-motivo-desligamento").value.trim();
            return motivo || "Desligado através do módulo funcionários";
        }
    }).then((result) => {
        if (superModalInstancia) superModalInstancia._config.focus = true;
        if (result.isConfirmed) executarDesligamento(result.value);
    });
}

async function executarDesligamento(motivo) {
    // 1. Identifica o próximo ID antes de atualizarmos os filtros
    let proximoId = null;
    const botoes = Array.from(document.querySelectorAll('#funcionariosTable button[onclick*="abrirSuperModal"], #funcionariosTable a[onclick*="abrirSuperModal"]'));
    const indexAtual = botoes.findIndex(btn => btn.getAttribute('onclick').includes(`abrirSuperModal(${funcionarioAtualId})`));

    if (indexAtual !== -1 && indexAtual + 1 < botoes.length) {
        const match = botoes[indexAtual + 1].getAttribute('onclick').match(/abrirSuperModal\((\d+)\)/);
        if (match) proximoId = match[1];
    }

    try {
        const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");

        const response = await fetch(`/api/confirmacoes_status/confirmar_status`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify([{
                funcionario_id: funcionarioAtualId,
                status_confirmado: "0",
                observacao: motivo
            }])
        });

        const resData = await response.json();
        if (!response.ok) {
            Swal.fire("Erro", resData.erro || "Falha no desligamento.", "error");
            return;
        }

        const temErroAD = resData.ad_errors && resData.ad_errors.length > 0;
        let htmlMsg = resData.mensagem || "Funcionário desligado com sucesso.";

        if (temErroAD) {
            htmlMsg += '<br><br><div style="text-align:left;background:#fff3cd;color:#856404;padding:10px;border-radius:5px;font-size:0.9em;border:1px solid #ffeeba;">';
            htmlMsg += "<strong>Aviso do Active Directory:</strong><br>";
            htmlMsg += resData.ad_errors.join("<br>");
            htmlMsg += "</div>";
        }

        // Aguarda fechar o SweetAlert
        await Swal.fire({
            icon: temErroAD ? "warning" : "success",
            title: temErroAD ? "Desligado com Avisos" : "Desligado!",
            html: htmlMsg,
            confirmButtonColor: "#198754"
        });

        // ==========================================
        // FLUXO DE RECARREGAMENTO E PRÓXIMO 
        // ==========================================
        
        // Esvazia o campo de pesquisa
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.value = ""; 

        // Força a tabela a buscar os dados novamente na página 1 (sem filtro)
        if (typeof carregarFuncionarios === "function") {
            try {
                // Aguarda a tabela terminar de desenhar o HTML novo
                await carregarFuncionarios("", 1);
            } catch (e) {}
        } else {
            const searchBtn = document.getElementById("searchBtn");
            if (searchBtn) searchBtn.click();
        }

        // Delay rápido para garantir que o DOM HTML terminou de piscar
        setTimeout(() => {
            if (proximoId) {
                // Se havia alguém abaixo dele na hora que clicou, abre ele!
                abrirSuperModal(proximoId);
            } else {
                // Se não havia proximoId (era resultado único da pesquisa, por exemplo),
                // o sistema vai pegar O PRIMEIRO NOME que apareceu na tabela nova
                const novosBotoes = Array.from(document.querySelectorAll('#funcionariosTable button[onclick*="abrirSuperModal"], #funcionariosTable a[onclick*="abrirSuperModal"]'));
                if (novosBotoes.length > 0) {
                    const match = novosBotoes[0].getAttribute('onclick').match(/abrirSuperModal\((\d+)\)/);
                    if (match) abrirSuperModal(match[1]);
                } else {
                    // Se a tabela voltou magicamente vazia, então fecha o modal.
                    if (superModalInstancia) superModalInstancia.hide();
                }
            }
        }, 500);

    } catch (error) {
        Swal.fire("Erro", "Falha de comunicação com o servidor.", "error");
    }
}

async function handleFotoUpload(event) {
    const arquivo = event.target.files[0];
    if (!arquivo || !funcionarioAtualId) return;
    if (!arquivo.type.startsWith("image/")) { Swal.fire("Erro", "Selecione uma imagem válida.", "error"); return; }

    try {
        const formData = new FormData();
        formData.append("foto", arquivo);
        // Fallback correto: localStorage → sessionStorage
        const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
        const response = await fetch(`/api/funcionarios/upload-foto/${funcionarioAtualId}`, {
            method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.erro || `Erro ${response.status}`);
        }
        const resData = await response.json();
        const imgPerfil = document.getElementById("superModalFotoImg");
        if (imgPerfil) imgPerfil.src = getUrlFotoSuperModal(resData.foto_url) + "?t=" + Date.now();
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Foto atualizada!', showConfirmButton: false, timer: 2000 });
        if (typeof carregarFuncionarios === "function") carregarFuncionarios();
    } catch (error) { Swal.fire("Erro", error.message || "Falha no upload.", "error"); } finally { event.target.value = ""; }
}

function renderizarHistorico(historico) {
    const container = document.getElementById("superModalHistoricoContainer");
    if (!container) return;
    if (!historico || historico.length === 0) {
        container.innerHTML = `<div class="text-center text-muted p-4"><i class="fas fa-inbox fa-2x mb-2"></i><p>Sem histórico registado.</p></div>`;
        return;
    }
    
    let html = "";
    historico.forEach(item => {
        const acaoLower = item.acao.toLowerCase();
        
        // Cores Dinâmicas e Lógicas
        let badgeClass = "bg-secondary";
        let iconClass = "fa-info";
        let dotClass = "padrao";

        if (acaoLower === 'aprovado' || acaoLower === 'reativado') {
            badgeClass = "bg-success"; // VERDE para aprovado e reativado
            iconClass = acaoLower === 'reativado' ? "fa-undo" : "fa-check";
            dotClass = "aprovado";
        } else if (acaoLower === 'desligado' || acaoLower === 'desligamento') {
            badgeClass = "bg-danger"; // VERMELHO para desligado
            iconClass = "fa-user-slash";
            dotClass = "desligamento";
        } else if (acaoLower === 'recusado') {
            badgeClass = "bg-danger"; // VERMELHO para recusado
            iconClass = "fa-times";
            dotClass = "recusado";
        }

        html += `
            <div class="timeline-item">
                <div class="timeline-dot ${dotClass}"><i class="fas ${iconClass}"></i></div>
                <div class="timeline-content ${dotClass}">
                    <strong>${item.nivel ? item.nivel.toUpperCase() : "AÇÃO"}</strong>
                    <div class="d-flex justify-content-between">
                        <span>${item.aprovador_nome || "Sistema"}</span>
                        <span class="badge ${badgeClass}">${item.acao.toUpperCase()}</span>
                    </div>
                    <small><i class="fas fa-calendar-alt me-1"></i> ${item.data}</small>
                    ${item.motivo ? `<div class="mt-2 p-2 bg-white rounded border small text-dark"><strong>Motivo:</strong> ${item.motivo}</div>` : ''}
                </div>
            </div>`;
    });
    container.innerHTML = html;
}