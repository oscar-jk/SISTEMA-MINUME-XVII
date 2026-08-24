import { montarShell } from '../core/shell.js';
import { render } from '../modules/admin-desarrollador.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
