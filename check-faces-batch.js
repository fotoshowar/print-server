/**
 * Script para buscar fotos con Face Detection activo
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
  console.log('🔍 Buscando fotos con Face Detection activo...\n');

  // Obtener todas las fotos
  const files = fs.readdirSync(FOLDER).filter(f => f.endsWith('.JPG'));

  console.log(`📂 Total de fotos encontradas: ${files.length}\n`);

  // Analizar las primeras 50 fotos
  const filesToCheck = files.slice(0, 50);

  const results = [];
  for (const file of filesToCheck) {
    const result = await analyzeFile(file);
    results.push(result);

    if (result.facesDetected > 0) {
      console.log(`✅ ${file}: ${result.facesDetected} cara(s) detectada(s) 📸 ${result.dateTimeOriginal}`);
    }
  }

  // Resumen
  const photosWithFaces = results.filter(r => r.facesDetected > 0);
  const photosWithoutFaces = results.filter(r => r.facesDetected === 0);
  const photosWithErrors = results.filter(r => r.error);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 RESUMEN (de ${results.length} fotos analizadas):`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Con caras detectadas: ${photosWithFaces.length}`);
  console.log(`❌ Sin caras detectadas: ${photosWithoutFaces.length}`);
  console.log(`⚠️  Con errores: ${photosWithErrors.length}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Mostrar detalles de fotos con caras
  if (photosWithFaces.length > 0) {
    console.log('📸 FOTOS CON CARAS DETECTADAS:\n');
    for (const photo of photosWithFaces) {
      console.log(`   ${photo.filename}`);
      console.log(`      Caras: ${photo.facesDetected}`);
      console.log(`      Fecha: ${photo.dateTimeOriginal}`);
      console.log(`      Tamaño: ${photo.fileSize}`);
      console.log(`      FaceInfoOffset: ${photo.faceInfoOffset}`);
      console.log(`      FaceInfoLength: ${photo.faceInfoLength}`);
      console.log('');
    }

    // Analizar en profundidad la primera foto con caras
    const firstWithFace = photosWithFaces[0];
    console.log(`🔍 Análisis detallado de: ${firstWithFace.filename}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const filepath = path.join(FOLDER, firstWithFace.filename);
    const tags = await exiftool.read(filepath);

    // Buscar todos los tags relacionados con faces
    const faceTags = Object.entries(tags).filter(([key]) =>
      key.toLowerCase().includes('face')
    );

    if (faceTags.length > 0) {
      console.log('🎯 Tags relacionados con Face Detection:\n');
      for (const [key, value] of faceTags) {
        console.log(`   ${key}:`, JSON.stringify(value, null, 2));
      }
    }
  } else {
    console.log('⚠️  No se encontraron fotos con caras detectadas en las primeras 50.');
    console.log('   Esto puede significar:');
    console.log('   1. El Face Detection estaba desactivado');
    console.log('   2. Las fotos no tienen personas');
    console.log('   3. La cámara no guardó la información');
  }

  await exiftool.end();
}

main();
