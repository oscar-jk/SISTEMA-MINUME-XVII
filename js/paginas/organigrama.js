import { montarShell } from '../core/shell.js';
import { render } from '../modules/organigrama.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
