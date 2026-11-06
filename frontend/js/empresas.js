/**
 * pmsl-terceiros: empresas.js
 */

document.addEventListener("DOMContentLoaded", function () {
    const token = localStorage.getItem('access_token');
    const tableBody = document.querySelector('#empresasTable tbody');
    const createForm = document.getElementById('createEmpresaForm');
    const editForm = document.getElementById('editEmpresaForm');
    const paginationContainer = document.getElementById("paginationContainer");
    const createModalElement = document.getElementById('modalCriarEmpresa');
    const editModalElement = document.getElementById('modalEditarEmpresa');
    
    const createModal = bootstrap.Modal.getOrCreateInstance(createModalElement);
    const editModal = bootstrap.Modal.getOrCreateInstance(editModalElement);

    let currentPage = 1;
    const itemsPerPage = 15;

    // =========================================================
    // FUNÇÕES DE FORMATAÇÃO (MÁSCARAS)
    // =========================================================

    function formatarCNPJExibicao(cnpj) {
        if (!cnpj) return "";
        const n = cnpj.replace(/\D/g, "");
        if (n.length !== 14) return cnpj;
        return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }

    function formatarTelefoneVisual(telefone) {
        if (!telefone || telefone.trim() === "") return "-";
        const t = String(telefone).replace(/\D/g, "");
        if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`; // Celular
        if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`; // Fixo
        return telefone; 
    }

    function mascararTelefone(event) {
        let input = event.target;
        let value = input.value.replace(/\D/g, ""); 

        if (!value) {
            input.value = "";
            return;
        }

        if (value.length > 11) value = value.substring(0, 11); 

        if (value.length > 10) {
            value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
        } else if (value.length > 5) {
            value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
        } else if (value.length > 2) {
            value = value.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
        } else {
            value = value.replace(/^(\d*)/, "($1");
        }

        input.value = value;
    }

    // Aplica a máscara nos inputs de telefone (Criação e Edição)
    const inputTelefoneCreate = createForm ? (createForm.querySelector('input[name="telefone"]') || document.getElementById('telefone')) : null;
    if (inputTelefoneCreate) inputTelefoneCreate.addEventListener('input', mascararTelefone);

    const inputTelefoneEdit = document.getElementById('editTelefone');
    if (inputTelefoneEdit) inputTelefoneEdit.addEventListener('input', mascararTelefone);


    // =========================================================
    // BOTÃO LIMPAR (CADASTRO)
    // =========================================================
    
    const btnLimpar = document.getElementById("btnLimparEmpresa");
    if (btnLimpar) {
        btnLimpar.addEventListener("click", () => {
            if (createForm) {
                createForm.reset();
                createForm.querySelectorAll('.is-invalid, .is-valid').forEach(el => {
                    el.classList.remove('is-invalid', 'is-valid');
                });
                
                const primeiroCampo = createForm.querySelector('input[name="cnpj"]');
                if (primeiroCampo) primeiroCampo.focus();
            }
        });
    }

    // =========================================================
    // TABELA E PAGINAÇÃO
    // =========================================================

    async function carregarEmpresas(page = 1) {
        try {
            const res = await fetch(`/api/empresas?page=${page}&per_page=${itemsPerPage}`, {
                headers: { 'Authorization': 'Bearer ' + token },
            });

            if (res.ok) {
                const data = await res.json();
                tableBody.innerHTML = '';
                currentPage = data.current_page || 1;

                if (data.empresas.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted p-4">Nenhuma empresa registada.</td></tr>';
                    renderPagination(0);
                    return;
                }

                data.empresas.forEach(e => {
                    const tr = document.createElement('tr');
                    
                    tr.innerHTML = `
                        <td class="align-middle">${e.id}</td>
                        <td class="align-middle fw-bold">${e.nome}</td>
                        <td class="align-middle">${formatarCNPJExibicao(e.cnpj)}</td>
                        <td class="align-middle">${e.endereco || '-'}</td>
                        <td class="align-middle">${formatarTelefoneVisual(e.telefone)}</td>
                        <td class="align-middle">${e.email || '-'}</td>
                        <td class="align-middle text-center">
                            <div class="d-flex justify-content-center gap-2">
                                <button class="btn btn-sm btn-link btn-edit-modal" data-id="${e.id}" title="Editar" data-permission="editar_empresa">
                                    <i class="fas fa-pen"></i>
                                </button>
                                <button class="btn btn-sm btn-link text-danger btn-delete-inline" data-id="${e.id}" title="Excluir" data-permission="excluir_empresa">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });

                renderPagination(data.total_pages);
                
                if (typeof controlarVisibilidadeElementos === 'function') {
                    controlarVisibilidadeElementos();
                }

            } else if (res.status === 401) {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error("Erro ao carregar empresas:", error);
            if (window.AppAlert) AppAlert.error("Erro ao carregar a lista de empresas.");
        }
    }

    function renderPagination(totalPages) {
        if (!paginationContainer) return;
        paginationContainer.innerHTML = "";
        if (totalPages <= 1) return;

        const nav = document.createElement("ul");
        nav.className = "pagination justify-content-center mb-0";

        for (let i = 1; i <= totalPages; i++) {
            const li = document.createElement("li");
            li.className = `page-item ${i === currentPage ? "active" : ""}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            li.addEventListener("click", (e) => {
                e.preventDefault();
                carregarEmpresas(i);
            });
            nav.appendChild(li);
        }
        paginationContainer.appendChild(nav);
    }

    // =========================================================
    // AÇÕES DA TABELA (EDITAR E EXCLUIR)
    // =========================================================

    document.addEventListener("click", async (event) => {
        const btn = event.target.closest("button");
        if (!btn) return;

        const id = btn.dataset.id;
        if (!id) return;

        if (btn.classList.contains("btn-edit-modal")) {
            try {
                const res = await fetch(`/api/empresas/${id}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });

                if (res.ok) {
                    const empresa = await res.json();
                    
                    document.getElementById('editEmpresaId').value = empresa.id;
                    document.getElementById('editNome').value = empresa.nome || '';
                    document.getElementById('editCnpj').value = formatarCNPJExibicao(empresa.cnpj) || '';
                    document.getElementById('editEndereco').value = empresa.endereco || '';
                    document.getElementById('editTelefone').value = formatarTelefoneVisual(empresa.telefone) || ''; 
                    document.getElementById('editEmail').value = empresa.email || '';

                    editModal.show();
                } else {
                    if (window.AppAlert) AppAlert.error('Erro ao carregar dados da empresa.');
                }
            } catch (error) {
                console.error("Erro ao carregar empresa para edição:", error);
                if (window.AppAlert) AppAlert.error("Erro ao carregar dados da empresa.");
            }
        }
        else if (btn.classList.contains("btn-delete-inline")) {
            if (window.AppAlert) {
                AppAlert.confirm(
                    'Tem a certeza?', 
                    'Esta ação eliminará a empresa permanentemente. Não é possível excluir empresas com funcionários vinculados.', 
                    async () => {
                        executarDelecao(id);
                    }
                );
            } else {
                Swal.fire({
                    title: 'Tem a certeza?',
                    text: 'Esta ação eliminará a empresa permanentemente.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Sim, excluir!',
                    cancelButtonText: 'Cancelar'
                }).then((result) => {
                    if (result.isConfirmed) executarDelecao(id);
                });
            }
        }
    });

    async function executarDelecao(id) {
        try {
            const res = await fetch(`/api/empresas/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            
            if (res.ok) {
                if (window.AppAlert) AppAlert.toast("Empresa excluída com sucesso!");
                carregarEmpresas(currentPage);
            } else {
                const err = await res.json();
                if (window.AppAlert) AppAlert.error(err.erro || "Falha ao excluir empresa.");
            }
        } catch (error) {
            if (window.AppAlert) AppAlert.error("Erro ao processar exclusão.");
        }
    }

    // =========================================================
    // SUBMISSÃO DE FORMULÁRIOS (CRIAR E ATUALIZAR)
    // =========================================================

    createForm.addEventListener('submit', async e => {
        e.preventDefault();
        
        // Validação adicional de obrigatoriedade
        const nomeVal = createForm.nome.value.trim();
        const cnpjVal = createForm.cnpj.value.replace(/\D/g, '');
        const enderecoVal = createForm.endereco.value.trim();

        if (!nomeVal || !cnpjVal || !enderecoVal) {
            if (window.AppAlert) {
                AppAlert.error('Por favor, preencha os campos obrigatórios: CNPJ, Razão Social e Endereço.');
            } else {
                Swal.fire('Atenção', 'Os campos CNPJ, Razão Social e Endereço são obrigatórios.', 'warning');
            }
            return;
        }

        const btnSalvar = createForm.querySelector('button[type="submit"]');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

        const telefoneInput = createForm.querySelector('input[name="telefone"]') || document.getElementById('telefone');

        const novaEmpresa = {
            nome: nomeVal,
            cnpj: cnpjVal,
            endereco: enderecoVal,
            telefone: telefoneInput ? telefoneInput.value.replace(/\D/g, '') : '',
            email: createForm.email.value.trim(),
        };

        try {
            const res = await fetch('/api/empresas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(novaEmpresa),
            });

            if (res.ok) {
                if (window.AppAlert) {
                    AppAlert.success('Empresa cadastrada com sucesso!').then(() => {
                        createForm.reset();
                        createModal.hide();
                        carregarEmpresas();
                    });
                }
            } else {
                const err = await res.json();
                if (window.AppAlert) AppAlert.error(err.erro || 'Erro ao criar empresa.');
            }
        } catch (err) {
            if (window.AppAlert) AppAlert.error("Erro de ligação ao servidor.");
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = originalText;
        }
    });

    editForm.addEventListener('submit', async e => {
        e.preventDefault();
        
        // Validação adicional de obrigatoriedade
        const nomeVal = document.getElementById('editNome').value.trim();
        const cnpjVal = document.getElementById('editCnpj').value.replace(/\D/g, '');
        const enderecoVal = document.getElementById('editEndereco').value.trim();

        if (!nomeVal || !cnpjVal || !enderecoVal) {
            if (window.AppAlert) {
                AppAlert.error('Por favor, preencha os campos obrigatórios: CNPJ, Razão Social e Endereço.');
            } else {
                Swal.fire('Atenção', 'Os campos CNPJ, Razão Social e Endereço são obrigatórios.', 'warning');
            }
            return;
        }

        const btnSalvar = editForm.querySelector('button[type="submit"]');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Atualizando...';

        const empresaId = document.getElementById('editEmpresaId').value;
        const empresaAtualizada = {
            nome: nomeVal,
            cnpj: cnpjVal,
            endereco: enderecoVal,
            telefone: document.getElementById('editTelefone').value.replace(/\D/g, ''),
            email: document.getElementById('editEmail').value.trim(),
        };

        try {
            const res = await fetch(`/api/empresas/${empresaId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(empresaAtualizada),
            });

            if (res.ok) {
                if (window.AppAlert) {
                    AppAlert.success('Empresa atualizada com sucesso!').then(() => {
                        editForm.reset();
                        editModal.hide();
                        carregarEmpresas(currentPage);
                    });
                }
            } else {
                const err = await res.json();
                if (window.AppAlert) AppAlert.error(err.erro || 'Erro ao atualizar empresa.');
            }
        } catch (err) {
            if (window.AppAlert) AppAlert.error("Erro de ligação ao servidor.");
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = originalText;
        }
    });

    carregarEmpresas();
});