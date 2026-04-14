/**
 * Script para analizar metadatos EXIF de fotos Sony A6000
 * Busca información de Face Detection
 */

const ExifReader = require('exifreader');
const fs = require('fs');
const path = require('path');

const FOLDER = 'C:\\Users\\Usuario01\\Desktop\\Nueva carpeta (4)';

// Analizar algunas fotos al azar
const photosToCheck = [
  'DSC04046.JPG',
  'DSC04050.JPG',
  'DSC04060.JPG',
  'DSC04080.JPG',
  'DSC04100.JPG',
  'DSC04150.JPG',
  'DSC04200.JPG',
  'DSC04300.JPG',
  'DSC04400.JPG',
  'DSC04500.JPG'
];

console.log('🔍 Analizando metadatos EXIF de fotos Sony A6000...\n');

for (const filename of photosToCheck) {
  const filepath = path.join(FOLDER, filename);

  if (!fs.existsSync(filepath)) {
    console.log(`❌ ${filename} - No encontrada`);
    continue;
  }

  try {
    const tags = ExifReader.load(filepath);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📸 ${filename}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Información básica de la cámara
    if (tags.Make) console.log(`📷 Cámara: ${tags.Make.description || tags.Make.value}`);
    if (tags.Model) console.log(`📷 Modelo: ${tags.Model.description || tags.Model.value}`);
    if (tags.DateTimeOriginal) console.log(`📅 Fecha: ${tags.DateTimeOriginal.description || tags.DateTimeOriginal.value}`);

    // Buscar información de face detection
    console.log(`\n🔎 Buscando información de Face Detection:`);

    let foundFaceData = false;

    // Buscar en diferentes lugares donde Sony podría guardar esto
    const faceKeys = [
      'MakerNotes',
      'SonyMakerNotes',
      'FaceRegions',
      'FaceCount',
      'FaceWidth',
      'FaceHeight',
      'FaceArea',
      'FaceDetectInfo',
      'FaceInfo',
      'SonyImageHeight',
      'SonyImageWidth',
      'SonyDateTime',
      'SonyModelID'
    ];

    for (const key of faceKeys) {
      if (tags[key]) {
        foundFaceData = true;
        console.log(`  ✓ ${key}:`);
        const value = tags[key];

        if (value.description) {
          console.log(`    ${value.description}`);
        } else if (value.value) {
          if (typeof value.value === 'object') {
            console.log(`    ${JSON.stringify(value.value, null, 2)}`);
          } else {
            console.log(`    ${value.value}`);
          }
        } else {
          console.log(`    ${value}`);
        }
      }
    }

    // Buscar en tags numéricos de MakerNotes (Sony usa estos)
    if (tags['MakerNotes']) {
      console.log(`\n  📦 MakerNotes detectado - buscando dentro:`);
      const makerNotes = tags['MakerNotes'];

      // Sony a veces guarda face info en tags específicos dentro de MakerNotes
      const sonyFaceTags = [
        0x0052, // Face regions offset
        0x0053, // Face regions size
        0x0054, // Face count
        0x9400, // Face detect area
        0x9401, // Face detect info
        0x9402  // Face detect count
      ];

      for (const tag of sonyFaceTags) {
        const hexTag = '0x' + tag.toString(16).toUpperCase().padStart(4, '0');
        if (makerNotes[hexTag]) {
          foundFaceData = true;
          console.log(`    ✓ Tag ${hexTag}:`, makerNotes[hexTag].description || makerNotes[hexTag].value || makerNotes[hexTag]);
        }
      }
    }

    // Buscar tags que contengan "Face" o "FaceDetect"
    console.log(`\n  🔍 Buscando tags con "Face":`);
    for (const [key, value] of Object.entries(tags)) {
      if (key.toLowerCase().includes('face')) {
        foundFaceData = true;
        console.log(`    ✓ ${key}:`, value.description || value.value || value);
      }
    }

    if (!foundFaceData) {
      console.log(`  ❌ No se encontró información de Face Detection en esta foto`);
    }

    // Mostrar tamaño de imagen para referencia
    if (tags.PixelXDimension && tags.PixelYDimension) {
      console.log(`\n📐 Dimensiones: ${tags.PixelXDimension.description || tags.PixelXDimension.value} x ${tags.PixelYDimension.description || tags.PixelYDimension.value} px`);
    }

  } catch (error) {
    console.log(`❌ Error leyendo ${filename}:`, error.message);
  }
}

console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✅ Análisis completado`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
