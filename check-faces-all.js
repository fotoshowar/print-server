/**
 * Analizar TODAS las fotos buscando Face Detection
 */

const exiftool = require('exiftool-vendored').exiftool;
const fs = require('fs');
const path = require('path');

const FOLDER = 'C:\\Users\\Usuario01\\Desktop\\Nueva carpeta (4)';

async function analyzeFile(filename) {
  const filepath = path.join(FOLDER, filename);

  try {
    const tags = await exiftool.read(filepath);

    return {
      filename,
      facesDetected: tags.FacesDetected || 0,
      faceInfoOffset: tags.FaceInfoOffset,
      faceInfoLength: tags.FaceInfoLength,
      dateTimeOriginal: tags.DateTimeOriginal?.rawValue || 'N/A',
      fileSize: tags.FileSize || 'N/A'
    };
  } catch (error) {
    return {
      filename,
      error: error.message
    };
  }
}

async function main() {
  console.log('🔍 Analizando TODAS las fotos buscando Face Detection...\n');

  const files = fs.readdirSync(FOLDER).filter(f => f.endsWith('.JPG'));
  console.log(`📂 Total de fotos: ${files.length}\n`);

  const results = [];
  let progress = 0;

  for (const file of files) {
    progress++;
    if (progress % 50 === 0) {
      console.log(`   Progreso: ${progress}/${files.length} (${Math.round(progress/files.length*100)}%)`);
    }

    const result = await analyzeFile(file);
    results.push(result);
  }

  const photosWithFaces = results.filter(r => r.facesDetected > 0);
  const photosWithoutFaces = results.filter(r => r.facesDetected === 0);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 RESUMEN FINAL:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Con caras detectadas: ${photosWithFaces.length}`);
  console.log(`❌ Sin caras detectadas: ${photosWithoutFaces.length}`);
  console.log(`📈 Porcentaje con caras: ${((photosWithFaces.length / results.length) * 100).toFixed(1)}%`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (photosWithFaces.length > 0) {
    console.log('📸 FOTOS CON CARAS DETECTADAS:\n');

    for (const photo of photosWithFaces) {
      console.log(`   ${photo.filename} (${photo.facesDetected} cara(s)) - ${photo.dateTimeOriginal}`);
    }

    // Análisis detallado de la primera
    console.log(`\n🔍 Análisis detallado de la primera foto con caras:\n`);
    const firstWithFace = photosWithFaces[0];
    const filepath = path.join(FOLDER, firstWithFace.filename);
    const tags = await exiftool.read(filepath);

    console.log(`Archivo: ${firstWithFace.filename}`);
    console.log(`Caras detectadas: ${firstWithFace.facesDetected}`);
    console.log(`Fecha: ${firstWithFace.dateTimeOriginal}`);
    console.log(`Tamaño: ${firstWithFace.fileSize}\n`);

    const faceTags = Object.entries(tags).filter(([key]) =>
      key.toLowerCase().includes('face') ||
      key.toLowerCase().includes('region') ||
      key.toLowerCase().includes('area')
    );

    if (faceTags.length > 0) {
      console.log('🎯 Tags relacionados:\n');
      for (const [key, value] of faceTags) {
        console.log(`   ${key}:`, JSON.stringify(value, null, 2));
      }
    }

    // Guardar datos completos
    const outputPath = path.join(__dirname, 'face-detection-found.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      photo: firstWithFace,
      allTags: tags
    }, null, 2));
    console.log(`\n💾 Datos completos guardados en: ${outputPath}`);
  } else {
    console.log('⚠️  Ninguna foto tiene caras detectadas.\n');
    console.log('Analicemos algunas fechas para entender el contexto:\n');

    // Mostrar fechas de algunas fotos
    const sampleDates = results.slice(0, 20).map(r => r.dateTimeOriginal);
    const uniqueDates = [...new Set(sampleDates)];

    console.log('Fechas encontradas en las primeras 20 fotos:');
    for (const date of uniqueDates) {
      const count = results.filter(r => r.dateTimeOriginal === date).length;
      console.log(`   ${date}: ${count} fotos`);
    }
  }

  await exiftool.end();
}

main();
