import { montarShell } from '../core/shell.js';
import { render } from '../modules/calendario.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
