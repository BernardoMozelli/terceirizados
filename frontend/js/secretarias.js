document.addEventListener("DOMContentLoaded", function () {
    const secretariasTableBody = document.querySelector('#secretariasTable tbody');
    
    // Elementos do Modal de Criação
    const modalCriarElement = document.getElementById('modalCriarSecretaria');
    const modalCriar = new bootstrap.Modal(modalCriarElement);
    const formCriar = document.getElementById('createSecretariaForm');

    // Elementos do Modal de Edição
    const modalEditarElement = document.getElementById('modalEditarSecretaria');
    const modalEditar = new bootstrap.Modal(modalEditarElement);
    const formEditar = document.getElementById('editSecretariaForm');

    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // --- CARREGAR SECRETARIAS COM VALIDAÇÃO DE PERFIL ---
    async function carregarSecretarias() {
        try {
            // 1. Garantir que temos o perfil do utilizador antes de continuar
            let perfil = 'padrao';
            if (window.userInfo && window.userInfo.perfil) {
                perfil = window.userInfo.perfil;
            } else {
                // Se o layout.js ainda não carregou, buscamos rapidinho aqui
                const resUser = await fetch('/api/usuarios/me', {
                    headers: { Authorization: 'Bearer ' + token }
                });
                if (resUser.ok) {
                    const userData = await resUser.json();
                    window.userInfo = userData;
                    perfil = userData.perfil;
                }
            }

            const temAcessoTotal = (perfil === 'admin' || perfil === 'aprovador');

            // 2. Carregar a lista de secretarias
            let res = await fetch('/api/secretarias', {
                headers: { Authorization: 'Bearer ' + token },
            });

            if (res.ok) {
                const data = await res.json();
                secretariasTableBody.innerHTML = '';
                
                let listaSecretarias = Array.isArray(data) ? data : (data.secretarias || []);

                // Ajustar visibilidade do botão "Nova Secretaria"
                const btnNova = document.getElementById('btnNovaSecretaria') || document.querySelector('[data-bs-target="#modalCriarSecretaria"]');
                if (btnNova) {
                    btnNova.classList.toggle('d-none', !temAcessoTotal);
                    btnNova.style.display = temAcessoTotal ? 'inline-block' : 'none';
                }

                listaSecretarias.forEach(sec => {
                    const tr = document.createElement('tr');
                    
                    let acoesHtml = '';
                    if (temAcessoTotal) {
                        acoesHtml = `
                            <button class="btn btn-sm btn-link btn-edit" data-id="${sec.id}" data-nome="${sec.nome}" title="Editar">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="btn btn-sm btn-link text-danger btn-delete" data-id="${sec.id}" data-nome="${sec.nome}" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        `;
                    } else {
                        acoesHtml = `<span class="text-muted"><i class="fas fa-lock" title="Acesso Restrito"></i></span>`;
                    }

                    tr.innerHTML = `
                        <td>${sec.id}</td>
                        <td>${sec.nome}</td>
                        <td class="text-end">${acoesHtml}</td>
                    `;
                    secretariasTableBody.appendChild(tr);
                });

            } else {
                window.AppAlert.error('Falha ao carregar secretarias');
            }
        } catch (error) {
            console.error('Erro:', error);
            window.AppAlert.error('Erro de conexão com o servidor.');
        }
    }

    // --- DELEGAÇÃO DE EVENTOS PARA A TABELA (EDITAR E EXCLUIR) ---
    secretariasTableBody.addEventListener('click', function(e) {
        const btnEdit = e.target.closest('.btn-edit');
        const btnDelete = e.target.closest('.btn-delete');

        // Ação de Abrir Modal de Edição
        if (btnEdit) {
            const id = btnEdit.dataset.id;
            const nome = btnEdit.dataset.nome;
            
            document.getElementById('editSecretariaId').value = id;
            document.getElementById('editNome').value = nome;
            
            modalEditar.show();
        }

        // Ação de Exclusão
        if (btnDelete) {
            const id = btnDelete.dataset.id;
            const nome = btnDelete.dataset.nome;
            
            window.AppAlert.confirm(
                'Excluir Secretaria',
                `Tem certeza que deseja excluir a secretaria "${nome}"?`,
                async () => {
                    try {
                        let res = await fetch(`/api/secretarias/${id}`, {
                            method: 'DELETE',
                            headers: { Authorization: 'Bearer ' + token }
                        });
                        
                        if (res.status === 404) {
                            res = await fetch(`/secretarias/${id}`, {
                                method: 'DELETE',
                                headers: { Authorization: 'Bearer ' + token }
                            });
                        }

                        if (res.ok) {
                            window.AppAlert.success('Secretaria excluída com sucesso!');
                            carregarSecretarias();
                        } else {
                            const data = await res.json();
                            window.AppAlert.error(data.erro || 'Erro ao excluir secretaria.');
                        }
                    } catch (error) {
                        window.AppAlert.error('Erro de conexão ao excluir.');
                    }
                }
            );
        }
    });

    // --- CRIAR SECRETARIA ---
    formCriar.addEventListener('submit', async function (e) {
        e.preventDefault();
        const nome = document.getElementById('nome').value;

        try {
            let res = await fetch('/api/secretarias', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token
                },
                body: JSON.stringify({ nome })
            });

            if (res.status === 404) {
                res = await fetch('/secretarias', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token
                    },
                    body: JSON.stringify({ nome })
                });
            }

            if (res.ok) {
                window.AppAlert.success('Secretaria criada com sucesso!');
                modalCriar.hide();
                formCriar.reset();
                carregarSecretarias();
            } else {
                const data = await res.json();
                window.AppAlert.error(data.erro || 'Erro ao criar secretaria.');
            }
        } catch (error) {
            window.AppAlert.error('Erro de conexão com o servidor.');
        }
    });

    // --- EDITAR SECRETARIA (SALVAR) ---
    formEditar.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = document.getElementById('editSecretariaId').value;
        const nome = document.getElementById('editNome').value;

        try {
            let res = await fetch(`/api/secretarias/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token
                },
                body: JSON.stringify({ nome })
            });

            if (res.status === 404) {
                res = await fetch(`/secretarias/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token
                    },
                    body: JSON.stringify({ nome })
                });
            }

            if (res.ok) {
                window.AppAlert.success('Secretaria atualizada com sucesso!');
                modalEditar.hide();
                formEditar.reset();
                carregarSecretarias();
            } else {
                const data = await res.json();
                window.AppAlert.error(data.erro || 'Erro ao atualizar secretaria.');
            }
        } catch (error) {
            window.AppAlert.error('Erro de conexão com o servidor.');
        }
    });

    // Carga inicial
    carregarSecretarias();
});