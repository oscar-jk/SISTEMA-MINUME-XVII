// Única página pública de todo el sistema: sin montarShell(), sin
// compuerta de sesión — cualquiera con el enlace puede registrarse.
import { render } from '../modules/registro.js';

render(document.getElementById('app-contenido'));
