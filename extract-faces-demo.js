/**
 * DEMO: Extraer recortes de caras desde metadatos EXIF de Sony
 */

const exiftool = require('exiftool-vendored').exiftool;
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const FOLDER = 'C:\\Users\\Usuario01\\Desktop\\Nueva carpeta (4)';
const OUTPUT_FOLDER = path.join(__dirname, 'faces-extracted');

// Crear carpeta de salida
if (!fs.existsSync(OUTPUT_FOLDER)) {
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
}

/**
 * Parsear coordenadas de Face1Position: "x y width height"
 */
function parseFacePosition(positionStr) {
  const parts = positionStr.split(' ');
  return {
    x: parseInt(parts[0]),
    y: parseInt(parts[1]),
    width: parseInt(parts[2]),
    height: parseInt(parts[3])
  };
}

/**
 * Extraer caras de una foto
 */
async function extractFaces(filename) {
  const filepath = path.join(FOLDER, filename);
  const filenameWithoutExt = path.basename(filename, path.extname(filename));

  console.log(`\n📸 Procesando: ${filename}`);

  try {
    // Leer metadatos EXIF
    const tags = await exiftool.read(filepath);

    const facesDetected = tags.FacesDetected || 0;

    if (facesDetected === 0) {
      console.log(`   ❌ No se detectaron caras`);
      return;
    }

    console.log(`   ✅ ${facesDetected} cara(s) detectada(s)`);

    // Extraer cada cara
    for (let i = 1; i <= facesDetected; i++) {
      const positionKey = `Face${i}Position`;

      if (tags[positionKey]) {
        const faceCoords = parseFacePosition(tags[positionKey]);

        console.log(`   \n   Cara #${i}:`);
        console.log(`      Posición: x=${faceCoords.x}, y=${faceCoords.y}`);
        console.log(`      Tamaño: ${faceCoords.width}x${faceCoords.height}`);

        // Extraer recorte con Sharp
        const facePath = path.join(OUTPUT_FOLDER, `${filenameWithoutExt}_face_${i}.jpg`);

        await sharp(filepath)
          .extract({
            left: faceCoords.x,
            top: faceCoords.y,
            width: faceCoords.width,
            height: faceCoords.height
          })
          .resize(200, 200, { fit: 'cover' })  // Resize a 200x200
          .jpeg({ quality: 85 })
          .toFile(facePath);

        console.log(`      ✅ Guardado: ${path.basename(facePath)}`);
      }
    }

    // Guardar metadata de la foto
    const metadataPath = path.join(OUTPUT_FOLDER, `${filenameWithoutExt}_metadata.json`);
    fs.writeFileSync(metadataPath, JSON.stringify({
      filename,
      facesDetected,
      dateTime: tags.DateTimeOriginal?.rawValue || 'N/A',
      faces: Array.from({ length: facesDetected }, (_, i) => {
        const key = `Face${i + 1}Position`;
        return tags[key] ? { position: tags[key], parsed: parseFacePosition(tags[key]) } : null;
      }).filter(Boolean)
    }, null, 2));

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

/**
 * Procesar varias fotos con caras
 */
async function main() {
  console.log('🔍 Extrayendo caras desde metadatos EXIF de Sony A6000');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Fotos que tienen caras (del análisis anterior)
  const photosWithFaces = [
    'DSC04097.JPG',  // 1 cara
    'DSC04100.JPG',  // 1 cara
    'DSC04131.JPG',  // 4 caras
    'DSC04160.JPG',  // 2 caras
    'DSC04272.JPG',  // 3 caras
  ];

  for (const photo of photosWithFaces) {
    await extractFaces(photo);
  }

  // Generar collage de todas las caras
  console.log(`\n\n🎨 Generando collage de caras...`);

  const allFaces = fs.readdirSync(OUTPUT_FOLDER).filter(f => f.endsWith('.jpg') && f.includes('_face_'));

  console.log(`   Total de caras extraídas: ${allFaces.length}`);

  if (allFaces.length > 0) {
    // Contar filas y columnas para el collage
    const cols = Math.ceil(Math.sqrt(allFaces.length));
    const rows = Math.ceil(allFaces.length / cols);

    const faceSize = 200;
    const collageWidth = cols * faceSize;
    const collageHeight = rows * faceSize;

    console.log(`   Collage: ${cols}x${rows} (${collageWidth}x${collageHeight})`);

    // Crear collage
    const composites = [];

    for (let i = 0; i < allFaces.length; i++) {
      const facePath = path.join(OUTPUT_FOLDER, allFaces[i]);
      const col = i % cols;
      const row = Math.floor(i / cols);

      const faceBuffer = await sharp(facePath).toBuffer();

      composites.push({
        input: faceBuffer,
        top: row * faceSize,
        left: col * faceSize
      });
    }

    const collagePath = path.join(OUTPUT_FOLDER, 'faces-collage.jpg');

    await sharp({
      create: {
        width: collageWidth,
        height: collageHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
      .composite(composites)
      .jpeg({ quality: 90 })
      .toFile(collagePath);

    console.log(`   ✅ Collage guardado: ${collagePath}`);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Proceso completado`);
  console.log(`📁 Caras guardadas en: ${OUTPUT_FOLDER}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await exiftool.end();
}

main();
