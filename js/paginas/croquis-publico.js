// Segunda página pública del sistema (junto a registro.html): sin
// montarShell(), sin compuerta de sesión — cualquiera con el enlace ve
// el plano.
import { render } from '../modules/croquis-publico.js';

render(document.getElementById('app-contenido'));
