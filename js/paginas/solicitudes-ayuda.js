import { montarShell } from '../core/shell.js';
import { render } from '../modules/solicitudes-ayuda.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
