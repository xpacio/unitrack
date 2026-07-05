import { escAttr } from './helpers.js';

export function initAuthUI(auth, app) {
  const loginForm = document.getElementById('auth-login');
  const registerForm = document.getElementById('auth-register');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  const forgotError = document.getElementById('forgot-error');
  const forgotOk = document.getElementById('forgot-ok');
  const forgotEmail = document.getElementById('forgot-email');
  let forgotInterval = null;

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.authTab;
      document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
      document.getElementById(`auth-${target}`).classList.remove('hidden');
      loginError.textContent = '';
      registerError.textContent = '';
      forgotError.textContent = '';
      forgotOk.classList.add('hidden');
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      await auth.login(email, password);
      await app.onAuthenticated();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    const nombre = document.getElementById('register-nombre').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    try {
      await auth.register(email, password, nombre);
      await app.onAuthenticated();
    } catch (err) {
      registerError.textContent = err.message;
    }
  });

  document.getElementById('btn-user')?.addEventListener('click', () => {
    const avatar = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const name = auth.user?.nombre || auth.user?.email || 'Usuario';
    avatar.textContent = name.charAt(0).toUpperCase();
    nameEl.textContent = name;
    emailEl.textContent = auth.user?.email || '';
    document.getElementById('modal-user').classList.add('open');
    if (app.initUserModalSettings) app.initUserModalSettings();
  });

  document.getElementById('modal-user-close').addEventListener('click', () => {
    document.getElementById('modal-user').classList.remove('open');
  });
  document.getElementById('modal-user').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-user')) {
      document.getElementById('modal-user').classList.remove('open');
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    document.getElementById('modal-user').classList.remove('open');
    app.store?.destroy();
    localStorage.clear();
    app.store = null;
    try {
      await auth.logout();
    } catch {}
    app.showAuth();
  });

  document.getElementById('btn-reset-user')?.addEventListener('click', async () => {
    document.getElementById('modal-user').classList.remove('open');
    if (!confirm('¿Restablecer UniTrack? Se borrarán todos los datos locales y se cerrará tu sesión.')) return;
    await app.resetApp();
    location.reload();
  });

  const pwDisplay = document.getElementById('new-pw-display');
  const pwModal = document.getElementById('modal-change-pw');

  function generarPassword(len = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let pwd = '';
    for (let i = 0; i < len; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  document.getElementById('btn-change-pw')?.addEventListener('click', () => {
    pwDisplay.textContent = generarPassword();
    pwModal.classList.add('open');
  });

  document.getElementById('modal-change-pw-close')?.addEventListener('click', () => {
    pwModal.classList.remove('open');
  });
  pwModal?.addEventListener('click', (e) => {
    if (e.target === pwModal) pwModal.classList.remove('open');
  });

  document.getElementById('btn-gen-pw')?.addEventListener('click', () => {
    pwDisplay.textContent = generarPassword();
  });

  document.getElementById('btn-save-pw')?.addEventListener('click', async () => {
    const newPassword = pwDisplay.textContent;
    if (!newPassword || newPassword.length < 6) {
      alert('La clave debe tener al menos 6 caracteres.');
      return;
    }
    try {
      await auth.changePassword(newPassword);
      pwModal.classList.remove('open');
      document.getElementById('modal-user').classList.remove('open');
      app.store?.destroy();
      localStorage.clear();
      app.store = null;
      app.showAuth();
      alert('Clave cambiada. Inicia sesión con tu nueva clave.');
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('btn-cancel-pw')?.addEventListener('click', () => {
    pwModal.classList.remove('open');
  });

  document.getElementById('btn-forgot-send')?.addEventListener('click', async () => {
    const email = forgotEmail.value.trim();
    if (!email) {
      forgotError.textContent = 'Ingresa tu email';
      return;
    }
    forgotError.textContent = '';
    const btn = document.getElementById('btn-forgot-send');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const res = await fetch('/api/auth.php?action=forgot_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.status === 429 && data.retry_after) {
        let secs = data.retry_after;
        forgotError.textContent = `Espera ${secs}s antes de reintentar`;
        if (forgotInterval) clearInterval(forgotInterval);
        const iv = setInterval(() => {
          secs--;
          if (secs <= 0) {
            clearInterval(iv);
            forgotInterval = null;
            forgotError.textContent = '';
            btn.disabled = false;
            btn.textContent = 'Enviar enlace';
          } else {
            forgotError.textContent = `Espera ${secs}s antes de reintentar`;
          }
        }, 1000);
        forgotInterval = iv;
      } else {
        forgotOk.classList.remove('hidden');
        forgotEmail.value = '';
        btn.disabled = false;
        btn.textContent = 'Enviar enlace';
      }
    } catch {
      forgotError.textContent = 'Error de conexión';
      btn.disabled = false;
      btn.textContent = 'Enviar enlace';
    }
  });
}
