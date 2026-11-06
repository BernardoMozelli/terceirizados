document.addEventListener("DOMContentLoaded", async function () {
  const token = localStorage.getItem('access_token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  // Verificar se o usuário é admin
  async function verificarAcessoDashboard() {
    try {
      const res = await fetch('/api/usuarios/me', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('Não autorizado');
      
      const userData = await res.json();
      window.userInfo = userData;
      
      // Se não é admin ou aprovador, redireciona para funcionarios
      if (userData.perfil !== 'admin' && userData.perfil !== 'Administrador' && userData.perfil !== 'aprovador') {
        window.location.href = 'funcionarios.html';
        return false;
      }
      return true;
    } catch (error) {
      console.error('Erro ao verificar acesso:', error);
      window.location.href = 'funcionarios.html';
      return false;
    }
  }

  // Aguardar verificação antes de carregar o dashboard
  verificarAcessoDashboard().then(temAcesso => {
    if (!temAcesso) return;
    // Continuar com o carregamento normal do dashboard
    carregarDashboard();
  });

  function carregarDashboard() {

  // Paleta de cores 
  const cores = [
    '#0066cc', '#ff6b6b', '#4ecdc4', '#f9ca24', '#6c5ce7',
    '#fd79a8', '#00b894', '#e17055', '#0984e3', '#fdcb6e',
    '#55efc4', '#81ecec', '#74b9ff', '#a29bfe', '#dfe6e9'
  ];

  // CORREÇÃO 1: Ler as variáveis do document.body em vez de document.documentElement
  function getCSSVariable(varName) {
    return getComputedStyle(document.body).getPropertyValue(varName).trim();
  }

  // NOVA FUNÇÃO: Define uma cor de grade mais visível para o modo escuro
  function getGridColor() {
    return document.body.classList.contains('dark-theme') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  }

  function gerarCores(tamanho) {
    return Array.from({ length: tamanho }, (_, i) => cores[i % cores.length]);
  }

  // 1. CARREGA OS CARDS DE KPI
  async function carregarKPIs() {
    try {
      const [resAtivos, resMetrics] = await Promise.all([
        fetch('/api/dashboard/terceirizados-ativos', { headers: { Authorization: 'Bearer ' + token } }),
        fetch('/api/dashboard/metrics', { headers: { Authorization: 'Bearer ' + token } })
      ]);

      if (!resAtivos.ok || !resMetrics.ok) throw new Error('Erro ao carregar KPIs');

      const dataAtivos = await resAtivos.json();
      const dataMetrics = await resMetrics.json();
      
      const container = document.getElementById('kpi-container');
      if(!container) return;
      
      container.innerHTML = `
        <div class="stat-box active">
          <h4>${dataAtivos.total_ativos || 0}</h4>
          <p>Ativos</p>
        </div>
        <div class="stat-box inactive">
          <h4>${dataAtivos.total_inativos || 0}</h4>
          <p>Inativos</p>
        </div>
        <div class="stat-box total">
          <h4>${dataAtivos.total_geral || 0}</h4>
          <p>Total de Funcionários</p>
        </div>
        <div class="stat-box empresas" style="background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);">
          <h4>${dataMetrics.total_empresas || 0}</h4>
          <p>Empresas Parceiras</p>
        </div>
      `;
    } catch (error) {
      console.error("Erro nos KPIs:", error);
      const container = document.getElementById('kpi-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar KPIs</div>';
    }
  }

  // 2. GRÁFICO: STATUS
  async function carregarGraficoStatus() {
    try {
      const res = await fetch('/api/dashboard/terceirizados-ativos', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const container = document.getElementById('status-container');
      if(!container) return;
      
      container.innerHTML = `
        <div class="chart-container" style="position: relative; min-height: 300px; display: flex; align-items: center; justify-content: center;">
          <canvas id="chart-status" style="max-height: 280px;"></canvas>
          <div style="position: absolute; top: 60%; left: 50%; transform: translate(-50%, -10%); text-align: center;">
            <h3 style="margin: 0; font-size: 2.5rem; font-weight: 700; color: #0066cc;">${data.percentual_ativos || 0}%</h3>
            <span style="color: var(--text-secondary); font-size: 0.95rem; font-weight: 600;">ATIVOS</span>
          </div>
        </div>
      `;
      
      const ctx = document.getElementById('chart-status');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Ativos', 'Inativos'],
          datasets: [{
            data: [data.total_ativos || 0, data.total_inativos || 0],
            backgroundColor: ['#28a745', '#dc3545'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          circumference: 180,
          rotation: -90,
          cutout: '75%',
          plugins: { 
            legend: { 
              display: true, 
              position: 'top',
              labels: { color: getCSSVariable('--text-primary'), padding: 20 }
            }
          }
        }
      });
    } catch (error) {
      console.error("Erro no gráfico de status:", error);
      const container = document.getElementById('status-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar dados</div>';
    }
  }

  // 3. GRÁFICO: TOP 10 CARGOS
  async function carregarFuncionariosPorCargo() {
    try {
      const res = await fetch('/api/dashboard/funcionarios-por-cargo', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const container = document.getElementById('funcionarios-cargo-container');
      if(!container) return;
      
      if (!data.dados || data.dados.length === 0) {
        container.innerHTML = '<p class="text-muted text-center mt-5">Nenhum dado disponível</p>';
        return;
      }

      const cargoMap = {};
      data.dados.forEach(item => {
        if (!cargoMap[item.cargo]) cargoMap[item.cargo] = 0;
        cargoMap[item.cargo] += item.total;
      });
      
      const labelsTodos = Object.keys(cargoMap).sort((a, b) => cargoMap[b] - cargoMap[a]);
      const labels = labelsTodos.slice(0, 10); 
      const valores = labels.map(cargo => cargoMap[cargo]);
      
      container.innerHTML = `
        <div class="chart-container" style="position: relative; min-height: 350px;">
          <canvas id="chart-cargo"></canvas>
        </div>
      `;
      
      const ctx = document.getElementById('chart-cargo');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Volume de Funcionários',
            data: valores,
            backgroundColor: gerarCores(labels.length),
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: getCSSVariable('--text-primary') }
            }
          },
          scales: {
            x: { ticks: { color: getCSSVariable('--text-primary') }, grid: { color: getGridColor() } },
            y: { ticks: { color: getCSSVariable('--text-primary') }, grid: { display: false } }
          }
        }
      });
    } catch (error) {
      console.error("Erro no gráfico de cargos:", error);
      const container = document.getElementById('funcionarios-cargo-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar dados</div>';
    }
  }

  // 4. GRÁFICO: EMPRESAS
  async function carregarTerceirizadosPorEmpresa() {
    try {
      const res = await fetch('/api/dashboard/terceirizados-por-empresa', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const container = document.getElementById('terceirizados-empresa-container');
      if(!container) return;
      
      if (!data.dados || data.dados.length === 0) {
        container.innerHTML = '<p class="text-muted text-center mt-5">Nenhum dado disponível</p>';
        return;
      }

      data.dados.sort((a, b) => b.total - a.total);
      const labels = data.dados.map(item => item.empresa);
      const valores = data.dados.map(item => item.total);
      
      container.innerHTML = `
        <div class="chart-container" style="position: relative; min-height: 350px;">
          <canvas id="chart-empresa"></canvas>
        </div>
      `;
      
      const ctx = document.getElementById('chart-empresa');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Total de Terceirizados',
            data: valores,
            backgroundColor: gerarCores(labels.length),
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { 
              display: true,
              position: 'top',
              labels: { color: getCSSVariable('--text-primary') }
            } 
          },
          scales: {
            x: { ticks: { color: getCSSVariable('--text-primary') }, grid: { color: getGridColor() } },
            y: { ticks: { color: getCSSVariable('--text-primary') }, grid: { display: false } }
          }
        }
      });
    } catch (error) {
      console.error("Erro no gráfico de empresas:", error);
      const container = document.getElementById('terceirizados-empresa-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar dados</div>';
    }
  }

  // 5. GRÁFICO: SECRETARIAS
  async function carregarFuncionariosPorSecretaria() {
    try {
      const res = await fetch('/api/dashboard/funcionarios-por-secretaria', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const container = document.getElementById('funcionarios-secretaria-container');
      if(!container) return;
      
      if (!data.dados || data.dados.length === 0) {
        container.innerHTML = '<p class="text-muted text-center mt-5">Nenhum dado disponível</p>';
        return;
      }

      const secretariaMap = {};
      data.dados.forEach(item => {
        if (!secretariaMap[item.secretaria]) secretariaMap[item.secretaria] = 0;
        secretariaMap[item.secretaria] += item.total;
      });
      
      const labels = Object.keys(secretariaMap).sort((a, b) => secretariaMap[b] - secretariaMap[a]);
      const valores = labels.map(secretaria => secretariaMap[secretaria]);
      
      container.innerHTML = `
        <div class="chart-container" style="position: relative; min-height: 350px;">
          <canvas id="chart-secretaria"></canvas>
        </div>
      `;
      
      const ctx = document.getElementById('chart-secretaria');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Total de Alocados',
            data: valores,
            backgroundColor: gerarCores(labels.length), 
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { 
              display: true,
              position: 'top',
              labels: { color: getCSSVariable('--text-primary') }
            } 
          },
          scales: {
            y: { ticks: { color: getCSSVariable('--text-primary') }, grid: { color: getGridColor() } },
            x: { ticks: { color: getCSSVariable('--text-primary'), maxRotation: 45, minRotation: 45 }, grid: { display: false } }
          }
        }
      });
    } catch (error) {
      console.error("Erro no gráfico de secretarias:", error);
      const container = document.getElementById('funcionarios-secretaria-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar dados</div>';
    }
  }

  // 6. GRÁFICO: CANDIDATOS PENDENTES
  async function carregarCandidatosPendentes() {
    try {
      const res = await fetch('/api/dashboard/candidatos-pendentes', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const container = document.getElementById('candidatos-pendentes-container');
      if(!container) return;
      
      const total = data.total || 0;
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <h3 style="font-size: 3rem; font-weight: 700; color: #ff9800; margin: 0;">${total}</h3>
          <p style="color: var(--text-secondary); margin-top: 0.5rem; font-size: 1rem;">Candidatos Aguardando Aprovação</p>
        </div>
      `;
    } catch (error) {
      console.error("Erro ao carregar candidatos pendentes:", error);
      const container = document.getElementById('candidatos-pendentes-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar dados</div>';
    }
  }

  // 7. GRÁFICO: APROVAÇÕES POR PERÍODO
  async function carregarAprovacoesPorPeriodo() {
    try {
      const res = await fetch('/api/dashboard/aprovacoes-por-periodo', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const container = document.getElementById('aprovacoes-periodo-container');
      if(!container) return;
      
      if (!data.dados || data.dados.length === 0) {
        container.innerHTML = '<p class="text-muted text-center mt-5">Nenhum dado disponível</p>';
        return;
      }

      const labels = data.dados.map(item => item.periodo || item.mes || 'N/A');
      const valores = data.dados.map(item => item.total || 0);
      
      container.innerHTML = `
        <div class="chart-container" style="position: relative; min-height: 350px;">
          <canvas id="chart-aprovacoes-periodo"></canvas>
        </div>
      `;
      
      const ctx = document.getElementById('chart-aprovacoes-periodo');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Aprovações',
            data: valores,
            borderColor: '#0066cc',
            backgroundColor: 'rgba(0, 102, 204, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: '#0066cc',
            pointBorderColor: '#fff',
            pointBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: getCSSVariable('--text-primary') }
            }
          },
          scales: {
            x: { ticks: { color: getCSSVariable('--text-primary') }, grid: { color: getGridColor() } },
            y: { ticks: { color: getCSSVariable('--text-primary') }, grid: { color: getGridColor() } }
          }
        }
      });
    } catch (error) {
      console.error("Erro no gráfico de aprovações por período:", error);
      const container = document.getElementById('aprovacoes-periodo-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar dados</div>';
    }
  }

  // 8. GRÁFICO: APROVAÇÕES POR EMPRESA
  async function carregarAprovacoesPorEmpresa() {
    try {
      const res = await fetch('/api/dashboard/aprovacoes-por-empresa', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const container = document.getElementById('aprovacoes-empresa-container');
      if(!container) return;
      
      if (!data.dados || data.dados.length === 0) {
        container.innerHTML = '<p class="text-muted text-center mt-5">Nenhum dado disponível</p>';
        return;
      }

      data.dados.sort((a, b) => b.total - a.total);
      const labels = data.dados.map(item => item.empresa || 'N/A');
      const valores = data.dados.map(item => item.total || 0);
      
      container.innerHTML = `
        <div class="chart-container" style="position: relative; min-height: 350px;">
          <canvas id="chart-aprovacoes-empresa"></canvas>
        </div>
      `;
      
      const ctx = document.getElementById('chart-aprovacoes-empresa');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Total de Aprovações',
            data: valores,
            backgroundColor: gerarCores(labels.length),
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: getCSSVariable('--text-primary') }
            }
          },
          scales: {
            x: { ticks: { color: getCSSVariable('--text-primary') }, grid: { color: getGridColor() } },
            y: { ticks: { color: getCSSVariable('--text-primary') }, grid: { display: false } }
          }
        }
      });
    } catch (error) {
      console.error("Erro no gráfico de aprovações por empresa:", error);
      const container = document.getElementById('aprovacoes-empresa-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar dados</div>';
    }
  }

  // 9. GRÁFICO: APROVAÇÕES POR SECRETARIA
  async function carregarAprovacoesPorSecretaria() {
    try {
      const res = await fetch('/api/dashboard/aprovacoes-por-secretaria', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Erro ao carregar dados');
      const data = await res.json();
      const container = document.getElementById('aprovacoes-secretaria-container');
      if(!container) return;
      
      if (!data.dados || data.dados.length === 0) {
        container.innerHTML = '<p class="text-muted text-center mt-5">Nenhum dado disponível</p>';
        return;
      }

      const secretariaMap = {};
      data.dados.forEach(item => {
        if (!secretariaMap[item.secretaria]) secretariaMap[item.secretaria] = 0;
        secretariaMap[item.secretaria] += item.total;
      });
      
      const labels = Object.keys(secretariaMap).sort((a, b) => secretariaMap[b] - secretariaMap[a]);
      const valores = labels.map(secretaria => secretariaMap[secretaria]);
      
      container.innerHTML = `
        <div class="chart-container" style="position: relative; min-height: 350px;">
          <canvas id="chart-aprovacoes-secretaria"></canvas>
        </div>
      `;
      
      const ctx = document.getElementById('chart-aprovacoes-secretaria');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Total de Aprovações',
            data: valores,
            backgroundColor: gerarCores(labels.length),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: getCSSVariable('--text-primary') }
            }
          },
          scales: {
            y: { ticks: { color: getCSSVariable('--text-primary') }, grid: { color: getGridColor() } },
            x: { ticks: { color: getCSSVariable('--text-primary'), maxRotation: 45, minRotation: 45 }, grid: { display: false } }
          }
        }
      });
    } catch (error) {
      console.error("Erro no gráfico de aprovações por secretaria:", error);
      const container = document.getElementById('aprovacoes-secretaria-container');
      if(container) container.innerHTML = '<div class="error-message">Erro ao carregar dados</div>';
    }
  }

  // Chama as funções iniciais
  carregarKPIs();
  carregarCandidatosPendentes();
  carregarAprovacoesPorPeriodo();
  carregarAprovacoesPorEmpresa();
  carregarAprovacoesPorSecretaria();
  carregarGraficoStatus();
  carregarFuncionariosPorCargo();
  carregarTerceirizadosPorEmpresa();
  carregarFuncionariosPorSecretaria();

  // ATUALIZADOR DINÂMICO: Muda as cores dos gráficos instantaneamente ao trocar o tema
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        const novaCorTexto = getCSSVariable('--text-primary');
        const novaCorGrid = getGridColor();
        
        if (typeof Chart !== 'undefined' && Chart.instances) {
          for (let id in Chart.instances) {
            let chart = Chart.instances[id];
            
            // Atualiza cor da Legenda
            if (chart.options.plugins?.legend?.labels) {
              chart.options.plugins.legend.labels.color = novaCorTexto;
            }
            
            // Atualiza cor dos Eixos e da Grade
            if (chart.options.scales) {
              if (chart.options.scales.x) {
                if (chart.options.scales.x.ticks) chart.options.scales.x.ticks.color = novaCorTexto;
                if (chart.options.scales.x.grid?.color) chart.options.scales.x.grid.color = novaCorGrid;
              }
              if (chart.options.scales.y) {
                if (chart.options.scales.y.ticks) chart.options.scales.y.ticks.color = novaCorTexto;
                if (chart.options.scales.y.grid?.color) chart.options.scales.y.grid.color = novaCorGrid;
              }
            }
            chart.update(); // Re-renderiza com as novas cores
          }
        }
      }
    });
  });
  
    // Fica a "observar" o document.body à procura de mudanças de classe (modo claro/escuro)
    observer.observe(document.body, { attributes: true });
  } // Fim da função carregarDashboard
});