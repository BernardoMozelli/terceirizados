/**
 * pmsl-terceiros: login.js
 * Gerenciamento de tema e autenticação na página de login
 */

// ========================================================================
// GERENCIAMENTO DE TEMA
// ========================================================================

const themeToggle = document.getElementById('themeToggle');
const body = document.body;

// Carregar tema salvo
const savedTheme = localStorage.getItem('theme') || 'claro';
if (savedTheme === 'escuro') {
  body.classList.add('dark-theme');
  themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

// Toggle de tema
themeToggle.addEventListener('click', () => {
  const isDark = body.classList.toggle('dark-theme');
  localStorage.setItem('theme', isDark ? 'escuro' : 'claro');
  themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
});

// ========================================================================
// GERENCIAMENTO DE LOGIN
// ========================================================================

const form = document.getElementById('loginForm');
const senhaInput = document.getElementById('senha');
const togglePasswordBtn = document.getElementById('togglePassword');
const alertBox = document.getElementById('alert');
const alertText = document.getElementById('alertText');

// Toggle de visibilidade de senha
togglePasswordBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const type = senhaInput.getAttribute('type') === 'password' ? 'text' : 'password';
  senhaInput.setAttribute('type', type);

  const icon = togglePasswordBtn.querySelector('i');
  if (type === 'text') {
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
});

// Envio do formulário
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  alertBox.classList.remove('show');

  const email = form.email.value.trim();
  const senha = form.senha.value.trim();

  if (!email || !senha) {
    alertText.textContent = 'Por favor, preencha todos os campos';
    alertBox.classList.add('show');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });

    if (!res.ok) {
      throw new Error('Email ou senha inválidos');
    }

    const data = await res.json();
    const tema = body.classList.contains('dark-theme') ? 'escuro' : 'claro';
    try {
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('theme', tema);
    } catch (e) {
      sessionStorage.setItem('access_token', data.access_token);
      sessionStorage.setItem('theme', tema);
    }
    window.location.href = 'inicio.html';
  } catch (err) {
    alertText.textContent = err.message;
    alertBox.classList.add('show');
  }
});

// Limpar alerta ao digitar
form.email.addEventListener('input', () => {
  alertBox.classList.remove('show');
});
form.senha.addEventListener('input', () => {
  alertBox.classList.remove('show');
});
