import { montarShell } from '../core/shell.js';
import { parametroUrl } from '../core/parametros.js';
import { render } from '../modules/tareas.js';

montarShell().then(() => {
  render(document.getElementById('app-contenido'), parametroUrl('filtro'));
});
