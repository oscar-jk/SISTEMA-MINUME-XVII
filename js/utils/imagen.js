// Compresión de imágenes en el navegador antes de subir, con tope de
// tamaño. Solo Canvas API — sin dependencias, no hay paso de build.
export async function comprimirImagen(archivo, { maxLadoPx = 1600, topeBytes = 800 * 1024 } = {}) {
  const bitmap = await createImageBitmap(archivo);
  let ladoMayor = Math.max(bitmap.width, bitmap.height);
  let escala = ladoMayor > maxLadoPx ? maxLadoPx / ladoMayor : 1;

  let calidad = 0.82;
  let intentos = 0;

  while (intentos < 6) {
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', calidad));

    if (blob.size <= topeBytes) {
      return blob;
    }

    // Todavía muy pesada: baja calidad primero, y si ya está en el piso,
    // reduce también el tamaño.
    if (calidad > 0.4) {
      calidad -= 0.15;
    } else {
      escala *= 0.8;
    }
    intentos++;
  }

  throw new Error('La foto sigue pesando demasiado incluso comprimida. Intenta con otra imagen.');
}
