// Carrega empresas e secretarias ao abrir a página
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando formulário de contratações...');
    
    // Aguardar um pouco para garantir que o token foi carregado
    setTimeout(() => {
        carregarEmpresas();
        carregarSecretarias();
    }, 100);
    
    // Configurar data mínima no campo de data de início
    const dataInicioInput = document.getElementById('criar-data-inicio');
    if (dataInicioInput) {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        const dataMinima = `${ano}-${mes}-${dia}`;
        dataInicioInput.min = dataMinima;
        console.log('Data mínima configurada para:', dataMinima);
    }
    
    // Adicionar listeners para máscaras
    const cpfInput = document.getElementById('criar-cpf');
    const telefoneInput = document.getElementById('criar-telefone');
    const formContratacao = document.getElementById('formContratacao');
    
    if (cpfInput) {
        cpfInput.addEventListener('input', formatarCPF);
        cpfInput.addEventListener('blur', verificarCPFExistente);
        console.log('Listener de CPF adicionado');
    }
    
    if (telefoneInput) {
        telefoneInput.addEventListener('input', formatarTelefone);
        console.log('Listener de Telefone adicionado');
    }
    
    if (formContratacao) {
        formContratacao.addEventListener('submit', salvarCandidato);
        console.log('Listener de formulário adicionado');
    }

    // Ativa o prefixo no campo de indicação
    configurarCampoIndicacao('indicacao');
});

// ==========================================
// FUNÇÃO AUXILIAR: FORÇAR PREFIXO INDICAÇÃO
// ==========================================
function configurarCampoIndicacao(idCampo) {
    const campo = document.getElementById(idCampo);
    if (!campo) return;

    const prefixo = "Indicado por: ";

    // Formata o valor existente
    let valorAtual = campo.value.trim();
    if (!valorAtual.startsWith(prefixo)) {
        campo.value = valorAtual ? `${prefixo}${valorAtual}` : prefixo;
    }

    if (campo.dataset.indicacaoConfigurada === "true") return;
    campo.dataset.indicacaoConfigurada = "true";

    campo.addEventListener('input', function() {
        if (!this.value.startsWith(prefixo)) {
            this.value = prefixo;
        }
    });

    campo.addEventListener('keydown', function(e) {
        // Impede de apagar o prefixo com Backspace ou Delete
        if ((this.selectionStart <= prefixo.length) && 
            (e.key === 'Backspace' || e.key === 'Delete')) {
            e.preventDefault();
        }
    });

    campo.addEventListener('click', function() {
        // Se clicar no meio do prefixo, joga o cursor para o final dele
        if (this.selectionStart < prefixo.length) {
            this.setSelectionRange(prefixo.length, prefixo.length);
        }
    });
}

// ==========================================
// VALIDAÇÃO DE CPF JÁ CADASTRADO
// ==========================================
async function verificarCPFExistente() {
    const cpfInput = document.getElementById('criar-cpf');
    if (!cpfInput) return;

    const cpfLimpo = cpfInput.value.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) return;

    const token = obterToken();
    if (!token) return;

    try {
        const res = await fetch(`/api/candidatos/verificar-cpf?cpf=${cpfLimpo}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) return;
        const data = await res.json();

        if (!data.encontrado) return;

        const det = data.detalhes;
        let mensagem = '';
        let titulo = '';

        if (data.origem === 'desligado') {
            titulo = 'Funcionário Desligado Encontrado';
            mensagem = `Este CPF pertence a <strong>${det.nome}</strong>, que consta como <strong>funcionário desligado</strong> no sistema (cargo: ${det.cargo || 'não informado'}).<br><br>Não é possível cadastrar este candidato.`;
        } else {
            const statusMap = {
                'pendente': 'Pendente de aprovação',
                'aprov_vice': 'Aprovado pelo Vice-Prefeito',
                'aprov_pref': 'Aprovado pelo Prefeito',
                'contratado': 'Contratado',
                'aprovado': 'Aprovado'
            };
            titulo = 'Candidato Já Cadastrado';
            mensagem = `Este CPF pertence a <strong>${det.nome}</strong>, que já possui cadastro ativo no sistema com status <strong>${statusMap[det.status] || det.status}</strong>.<br><br>Não é possível cadastrar este candidato.`;
        }

        await Swal.fire({
            title: titulo,
            html: mensagem,
            icon: 'error',
            confirmButtonColor: '#d33',
            confirmButtonText: 'OK'
        });

        // Limpa todo o formulário e retorna foco ao CPF
        const form = document.getElementById('formContratacao');
        if (form) form.reset();
        // Reinicia o campo de indicação com o prefixo
        configurarCampoIndicacao('indicacao');
        // Esconde preview de foto se existir
        const previewFoto = document.getElementById('preview-foto');
        if (previewFoto) previewFoto.style.display = 'none';
        // Foca no CPF para o usuário digitar um novo
        cpfInput.focus();

    } catch (err) {
        console.warn('Erro ao verificar CPF:', err);
    }
}

function formatarCPF(event) {
    let value = event.target.value;
    let cpf = value.replace(/\D/g, '');
    
    if (cpf.length > 11) {
        cpf = cpf.slice(0, 11);
    }
    
    let formatted = '';
    if (cpf.length > 0) {
        formatted = cpf.slice(0, 3);
    }
    if (cpf.length > 3) {
        formatted += '.' + cpf.slice(3, 6);
    }
    if (cpf.length > 6) {
        formatted += '.' + cpf.slice(6, 9);
    }
    if (cpf.length > 9) {
        formatted += '-' + cpf.slice(9, 11);
    }
    
    event.target.value = formatted;
}

function formatarTelefone(event) {
    let value = event.target.value;
    let telefone = value.replace(/\D/g, '');
    
    if (telefone.length > 11) {
        telefone = telefone.slice(0, 11);
    }
    
    let formatted = '';
    if (telefone.length > 0) {
        formatted = '(' + telefone.slice(0, 2);
    }
    if (telefone.length > 2) {
        formatted += ') ' + telefone.slice(2, 7);
    }
    if (telefone.length > 7) {
        formatted += '-' + telefone.slice(7, 11);
    }
    
    event.target.value = formatted;
}

function obterToken() {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    console.log('Token obtido:', token ? 'Presente (primeiros 20 chars: ' + token.substring(0, 20) + '...)' : 'Ausente');
    return token;
}

function carregarEmpresas() {
    const token = obterToken();
    
    if (!token) {
        console.error('Token não encontrado para carregar empresas');
        return;
    }
    
    const headers = { 'Authorization': 'Bearer ' + token };
    
    console.log('Iniciando carregamento de empresas...');
    fetch('/api/empresas', { headers })
        .then(response => {
            console.log('Resposta ao carregar empresas:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error('Erro ' + response.status + ': ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('Empresas carregadas com sucesso:', data);
            const select = document.getElementById('criar-empresa');
            if (!select) {
                console.error('Elemento criar-empresa não encontrado');
                return;
            }
            select.innerHTML = '<option value="">Selecione uma empresa</option>';
            
            let empresas = [];
            if (data.empresas && Array.isArray(data.empresas)) {
                empresas = data.empresas;
            } else if (Array.isArray(data)) {
                empresas = data;
            }
            
            console.log('Total de empresas a adicionar:', empresas.length);
            empresas.forEach(empresa => {
                const option = document.createElement('option');
                option.value = empresa.id;
                option.textContent = empresa.nome || empresa.razao_social || 'Sem Nome';
                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Erro ao carregar empresas:', error);
            console.error('Detalhes do erro:', error.message);
        });
}

function carregarSecretarias() {
    const token = obterToken();
    
    if (!token) {
        console.error('Token não encontrado para carregar secretarias');
        return;
    }
    
    const headers = { 'Authorization': 'Bearer ' + token };
    
    console.log('Iniciando carregamento de secretarias...');
    fetch('/api/secretarias', { headers })
        .then(response => {
            console.log('Resposta ao carregar secretarias:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error('Erro ' + response.status + ': ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('Secretarias carregadas com sucesso:', data);
            const select = document.getElementById('criar-secretaria');
            if (!select) {
                console.error('Elemento criar-secretaria não encontrado');
                return;
            }
            select.innerHTML = '<option value="">Selecione uma secretaria</option>';
            
            // Se o usuário é ativador, mostrar apenas sua secretaria
            const userSecretariaId = localStorage.getItem('user_secretaria_id');
            const userPerfil = localStorage.getItem('user_perfil');
            
            let secretarias = [];
            if (data.secretarias && Array.isArray(data.secretarias)) {
                secretarias = data.secretarias;
            } else if (Array.isArray(data)) {
                secretarias = data;
            }
            
            console.log('Total de secretarias a adicionar:', secretarias.length);
            secretarias.forEach(secretaria => {
                // Se é ativador e não é sua secretaria, pular
                if (userPerfil === 'ativador' && secretaria.id != userSecretariaId) {
                    return;
                }
                
                const option = document.createElement('option');
                option.value = secretaria.id;
                option.textContent = secretaria.nome;
                
                // Se é ativador, selecionar automaticamente sua secretaria
                if (userPerfil === 'ativador' && secretaria.id == userSecretariaId) {
                    option.selected = true;
                }
                
                select.appendChild(option);
            });
            
            // Se é ativador, desabilitar o campo
            if (userPerfil === 'ativador') {
                select.disabled = true;
            }
        })
        .catch(error => {
            console.error('Erro ao carregar secretarias:', error);
            console.error('Detalhes do erro:', error.message);
        });
}

function previewImagem(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewImg = document.getElementById('preview-img');
            const previewFoto = document.getElementById('preview-foto');
            if (previewImg && previewFoto) {
                previewImg.src = e.target.result;
                previewFoto.style.display = 'block';
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function salvarCandidato(event) {
    event.preventDefault();

    // Verificação de CPF no submit (segunda linha de defesa)
    const cpfInput = document.getElementById('criar-cpf');
    const cpfLimpo = cpfInput ? cpfInput.value.replace(/\D/g, '') : '';
    if (cpfLimpo.length === 11) {
        const token = obterToken();
        if (token) {
            try {
                const res = await fetch(`/api/candidatos/verificar-cpf?cpf=${cpfLimpo}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.encontrado) {
                        return;
                    }
                }
            } catch (err) {
                console.warn('Erro ao verificar CPF no submit:', err);
            }
        }
    }

    // FIX: prefixo com espaço correto para bater com o definido em configurarCampoIndicacao
    const prefixoIndicacao = "Indicado por: ";
    const indicacaoVal = document.getElementById('indicacao').value;
    // Só exige a indicação de quem enxerga o campo (admin, Prefeito e Vice-Prefeito)
    if (window.podeVerIndicacao && window.podeVerIndicacao() && (indicacaoVal.trim() === prefixoIndicacao.trim() || indicacaoVal.trim() === "")) {
        if (typeof Swal !== 'undefined') {
            Swal.fire('Atenção!', 'Por favor, informe o nome da indicação após "Indicado por: ".', 'warning');
        } else {
            alert('Por favor, informe o nome da indicação após "Indicado por: ".');
        }
        document.getElementById('indicacao').focus();
        return;
    }
    
    const formData = new FormData();
    formData.append('nome', document.getElementById('criar-nome').value);
    formData.append('email', document.getElementById('criar-email').value);
    formData.append('cpf', document.getElementById('criar-cpf').value.replace(/\D/g, ''));
    formData.append('telefone', document.getElementById('criar-telefone').value.replace(/\D/g, ''));
    formData.append('cargo', document.getElementById('criar-cargo').value);
    formData.append('setor', document.getElementById('criar-setor').value);
    formData.append('empresa_id', document.getElementById('criar-empresa').value);
    formData.append('secretaria_id', document.getElementById('criar-secretaria').value);
    formData.append('data_inicio_prevista', document.getElementById('criar-data-inicio').value);
    formData.append('observacoes', document.getElementById('indicacao').value);
        
    const fotoInput = document.getElementById('criar-foto');
    if (fotoInput.files && fotoInput.files[0]) {
        formData.append('foto', fotoInput.files[0]);
    }
    
    const token = obterToken();
    if (!token) {
        Swal.fire('Erro', 'Token não encontrado. Por favor, faça login novamente.', 'error');
        return;
    }

    // DEBUG: loga os campos sendo enviados para facilitar diagnóstico
    console.log('Campos do FormData a enviar:');
    for (const [chave, valor] of formData.entries()) {
        if (chave !== 'foto') {
            console.log(` ${chave}:`, valor);
        } else {
            console.log(` foto: [arquivo presente]`);
        }
    }
    
    console.log('Iniciando envio do formulário de contratação...');
    
    const btnSubmit = document.querySelector('#formContratacao button[type="submit"]');
    let originalText = '';
    if (btnSubmit) {
        originalText = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
    }

    // IMPORTANTE: Quando usando FormData com arquivo, NÃO definir Content-Type
    // O navegador define automaticamente como multipart/form-data
    try {
        const response = await fetch('/api/candidatos', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            },
            body: formData
        });

        console.log('Resposta ao salvar candidato:', response.status, response.statusText);

        // FIX: lê o corpo JSON antes de lançar erro, para expor a mensagem real do servidor
        let responseData;
        try {
            responseData = await response.json();
        } catch (parseErr) {
            responseData = null;
        }

        if (!response.ok) {
            // Monta mensagem de erro com detalhes vindos do servidor
            const erroServidor = responseData?.erro || responseData?.message || response.statusText;
            const tipoErro = responseData?.tipo_erro ? ` (${responseData.tipo_erro})` : '';
            const detalhes = responseData?.detalhes
                ? '\n\nDetalhes técnicos (copie para o suporte):\n' + responseData.detalhes.split('\n').slice(-5).join('\n')
                : '';
            console.error('Erro do servidor:', responseData);
            throw new Error(`Erro ${response.status}: ${erroServidor}${tipoErro}${detalhes}`);
        }

        console.log('Candidato salvo com sucesso:', responseData);

        if (responseData?.erro) {
            Swal.fire('Erro', responseData.erro, 'error');
        } else {
            await Swal.fire('Sucesso', 'Candidato cadastrado com sucesso!', 'success');
            document.getElementById('formContratacao').reset();
            const previewFoto = document.getElementById('preview-foto');
            if (previewFoto) {
                previewFoto.style.display = 'none';
            }
            // Reseta a indicação para voltar com o valor padrão ao invés de vazio
            configurarCampoIndicacao('indicacao');
        }

    } catch (error) {
        console.error('Erro ao salvar candidato:', error);
        console.error('Detalhes do erro:', error.message);
        Swal.fire('Erro', 'Erro ao salvar candidato: ' + error.message, 'error');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalText;
        }
    }
}