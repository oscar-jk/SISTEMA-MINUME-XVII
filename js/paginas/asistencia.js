import { montarShell } from '../core/shell.js';
import { render } from '../modules/asistencia.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
