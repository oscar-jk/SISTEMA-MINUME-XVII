import { montarShell } from '../core/shell.js';
import { render } from '../modules/checklist.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'));
});
