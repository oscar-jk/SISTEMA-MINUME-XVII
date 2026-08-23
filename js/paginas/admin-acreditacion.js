import { montarShell } from '../core/shell.js';
import { render } from '../modules/admin-acreditacion.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
