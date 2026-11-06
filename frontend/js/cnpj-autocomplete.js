/**
 * cnpj-autocomplete.js
 * Máscara em tempo real e consulta à BrasilAPI
 */
document.addEventListener('DOMContentLoaded', () => {
    // Suportar tanto o formulário de criação quanto o de edição
    const cnpjInput = document.getElementById('cnpj');
    const editCnpjInput = document.getElementById('editCnpj');
    const form = document.getElementById('createEmpresaForm');
    const editForm = document.getElementById('editEmpresaForm');

    // Função para aplicar máscara e buscar dados
    function configurarCNPJ(input, formElement) {
        if (!input || !formElement) return;

        // 1. MÁSCARA AUTOMÁTICA
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, ''); 
            if (value.length > 14) value = value.slice(0, 14);

            if (value.length > 12) {
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5');
            } else if (value.length > 8) {
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
            } else if (value.length > 5) {
                value = value.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
            } else if (value.length > 2) {
                value = value.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
            }
            e.target.value = value;
        });

        // 2. CONSULTA AO SAIR DO CAMPO (BLUR)
        input.addEventListener('blur', async () => {
            const cnpjValue = input.value.replace(/\D/g, '');
            
            if (cnpjValue.length === 14) {
                try {
                    input.classList.add('cnpj-loading');
                    console.log("A consultar CNPJ: " + cnpjValue);
                    
                    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjValue}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        
                        // Preenchimento dos campos
                        formElement.nome.value = data.razao_social || '';
                        formElement.email.value = data.email || '';
                        
                        // Preenche o telefone e "acorda" a máscara de formatação na mesma hora
                        formElement.telefone.value = data.ddd_telefone_1 || '';
                        if (formElement.telefone.value) {
                            formElement.telefone.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        
                        const endereco = [
                            data.logradouro, 
                            data.numero, 
                            data.bairro, 
                            `${data.municipio}/${data.uf}`
                        ].filter(Boolean).join(', ');

                        formElement.endereco.value = endereco;
                    }
                } catch (error) {
                    console.error('Erro na API de CNPJ:', error);
                } finally {
                    input.classList.remove('cnpj-loading');
                }
            }
        });
    }

    // Aplicar a configuração ao formulário de criação
    configurarCNPJ(cnpjInput, form);

    // Aplicar a configuração ao formulário de edição
    configurarCNPJ(editCnpjInput, editForm);

});