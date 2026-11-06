document.addEventListener("DOMContentLoaded", async function () {
  const token = localStorage.getItem('access_token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const form = document.getElementById('configForm');

  async function carregarConfiguracoes() {
    try {
      const res = await fetch('/api/configuracoes', {
        headers: { Authorization: 'Bearer ' + token }
      });

      if (!res.ok) {
        throw new Error('Falha ao carregar configurações. Apenas administradores podem acessar.');
      }

      const data = await res.json();

      // Popula parâmetros gerais
      for (const [chave, valor] of Object.entries(data.configuracoes)) {
        const input = document.getElementById(chave);
        if (input) input.value = valor;
      }

      // Popula containers de permissões
      const padraoContainer = document.getElementById('perfil-padrao-content');
      const adminContainer = document.getElementById('perfil-admin-content');
      padraoContainer.innerHTML = '';
      adminContainer.innerHTML = '';

      const recursos = Object.keys(data.permissoes).sort();
      const pageResources = recursos.filter(r => r.startsWith('acessar_'));
      const actionResources = recursos.filter(r => !r.startsWith('acessar_'));

      const populatePermissions = (container, perfil, permissoes) => {
        const createCheckboxDiv = (recurso) => {
          const isChecked = permissoes[recurso] ? permissoes[recurso][perfil] : false;
          const label = recurso.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const div = document.createElement('div');
          div.className = 'form-check';
          div.innerHTML = `
            <input class="form-check-input" type="checkbox" id="check-${perfil}-${recurso}" data-recurso="${recurso}" data-perfil="${perfil}" ${isChecked ? 'checked' : ''}>
            <label class="form-check-label" for="check-${perfil}-${recurso}">${label}</label>
          `;
          return div;
        };

        const perfilTitle = perfil.charAt(0).toUpperCase() + perfil.slice(1);
        container.innerHTML = `<h6>Páginas que o perfil <strong>${perfilTitle}</strong> pode acessar:</h6>`;
        pageResources.forEach(recurso => container.appendChild(createCheckboxDiv(recurso)));

        if (actionResources.length > 0) {
          const hr = document.createElement('hr');
          const h6 = document.createElement('h6');
          h6.innerHTML = 'Outras Permissões:';
          container.appendChild(hr);
          container.appendChild(h6);
          actionResources.forEach(recurso => container.appendChild(createCheckboxDiv(recurso)));
        }
      }

      populatePermissions(padraoContainer, 'padrao', data.permissoes);
      populatePermissions(adminContainer, 'admin', data.permissoes);

    } catch (error) {
      alert(error.message);
      window.location.href = 'dashboard.html';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dadosParaSalvar = { configuracoes: {}, permissoes: {} };

    document.querySelectorAll('#configForm input[type="number"]').forEach(input => {
      dadosParaSalvar.configuracoes[input.name] = input.value;
    });

    document.querySelectorAll('#perfil-tabs-content input[type="checkbox"]').forEach(input => {
      const recurso = input.dataset.recurso;
      const perfil = input.dataset.perfil;
      if (!dadosParaSalvar.permissoes[recurso]) dadosParaSalvar.permissoes[recurso] = {};
      dadosParaSalvar.permissoes[recurso][perfil] = input.checked;
    });

    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(dadosParaSalvar)
      });

      const data = await res.json();
      alert(data.mensagem || data.erro);
      if (res.ok) location.reload();

    } catch (error) {
      alert('Erro ao salvar as configurações.');
    }
  });

  carregarConfiguracoes();
});