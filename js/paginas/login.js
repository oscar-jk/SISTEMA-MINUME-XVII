import { iniciar, iniciarSesion } from '../core/sesion.js';
import { getEstado, subscribe } from '../core/store.js';
import { mensajeError } from '../ui/aviso.js';

function iniciarFormulario() {
  const form = document.getElementById('form-login');
  const errorEl = document.getElementById('login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const datos = new FormData(form);
      await iniciarSesion(datos.get('correo'), datos.get('codigo'));
    } catch (err) {
      errorEl.textContent = mensajeError(err);
      errorEl.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });
}

function main() {
  iniciarFormulario();
  subscribe(() => {
    const { sesion, cargando, errorSesion } = getEstado();
    if (cargando) return;
    if (sesion) {
      location.href = '/mis-tareas.html';
      return;
    }
    if (errorSesion) {
      const errorEl = document.getElementById('login-error');
      errorEl.textContent = errorSesion;
      errorEl.hidden = false;
    }
  });
  iniciar();
}

main();
