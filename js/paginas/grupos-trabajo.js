import { montarShell } from '../core/shell.js';
import { render } from '../modules/grupos-trabajo.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
