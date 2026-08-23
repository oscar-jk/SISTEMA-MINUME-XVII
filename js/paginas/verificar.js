import { montarShell } from '../core/shell.js';
import { parametroUrl } from '../core/parametros.js';
import { render } from '../modules/verificar.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'), parametroUrl('c'));
});
