import { montarShell } from '../core/shell.js';
import { render } from '../modules/tablero.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
