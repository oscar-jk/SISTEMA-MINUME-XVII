import { montarShell } from '../core/shell.js';
import { render } from '../modules/bitacora.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
