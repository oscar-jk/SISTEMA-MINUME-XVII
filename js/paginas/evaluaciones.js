import { montarShell } from '../core/shell.js';
import { render } from '../modules/evaluaciones.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
