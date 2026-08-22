import { montarShell } from '../core/shell.js';
import { render } from '../modules/espacios.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
