// Vision Jeans — Dashboard Login

import { auth }                              from './firebase-config.js';
import { signInWithEmailAndPassword,
         onAuthStateChanged }                from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

onAuthStateChanged(auth, user => {
  if (user) window.location.href = 'index.html';
});

const form     = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const errorEl  = document.getElementById('loginError');
const errorMsg = document.getElementById('loginErrorMsg');

form?.addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return;

  setLoading(true);
  errorEl?.classList.remove('show');

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = 'index.html';
  } catch (err) {
    setLoading(false);
    errorMsg.textContent = mapError(err.code);
    errorEl?.classList.add('show');
  }
});

function setLoading(on) {
  if (on) {
    loginBtn._h = loginBtn.innerHTML;
    loginBtn.innerHTML = `<div class="spinner"></div> Entrando...`;
    loginBtn.disabled = true;
  } else {
    loginBtn.innerHTML = loginBtn._h;
    loginBtn.disabled = false;
  }
}

function mapError(code) {
  return ({
    'auth/user-not-found':        'Usuário não encontrado.',
    'auth/wrong-password':        'Senha incorreta.',
    'auth/invalid-email':         'E-mail inválido.',
    'auth/invalid-credential':    'E-mail ou senha incorretos.',
    'auth/too-many-requests':     'Muitas tentativas. Tente mais tarde.',
    'auth/network-request-failed':'Erro de conexão.',
  })[code] || 'Erro ao fazer login. Tente novamente.';
}
