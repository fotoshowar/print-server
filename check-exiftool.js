/**
 * Script para analizar metadatos EXIF usando exiftool-vendored
 * Esta librería tiene mejor soporte para MakerNotes de Sony
 */

const exiftool = require('exiftool-vendored').exiftool;
const path = require('path');

const FOLDER = 'C:\\Users\\Usuario01\\Desktop\\Nueva carpeta (4)';
const filename = 'DSC04050.JPG';
const filepath = path.join(FOLDER, filename);

console.log('🔍 Analizando metadatos EXIF con exiftool-vendored:', filename);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function analyze() {
  try {
    const tags = await exiftool.read(filepath);

    console.log('✅ Metadatos leídos con éxito!\n');

    // Mostrar datos generales
    console.log('📷 Información de la cámara:');
    console.log('   Make:', tags.Make || 'N/A');
    console.log('   Model:', tags.Model || 'N/A');
    console.log('   Software:', tags.Software || 'N/A');
    console.log('   DateTimeOriginal:', tags.DateTimeOriginal || 'N/A');
    console.log('');

    // Mostrar dimensiones
    console.log('📐 Dimensiones:');
    console.log('   ImageWidth:', tags.ImageWidth || 'N/A');
    console.log('   ImageHeight:', tags.ImageHeight || 'N/A');
    console.log('');

    // Buscar datos de face detection
    console.log('🔎 Buscando información de Face Detection:\n');

    const faceKeys = Object.keys(tags).filter(key =>
      key.toLowerCase().includes('face') ||
      key.toLowerCase().includes('detect')
    );

    if (faceKeys.length > 0) {
      console.log(`   ✅ Encontrados ${faceKeys.length} tags relacionados con faces:`);
      for (const key of faceKeys) {
        console.log(`      ${key}:`, tags[key]);
      }
    } else {
      console.log('   ❌ No se encontraron tags explícitos de "Face"');
    }

    // Buscar tags de Sony específicos
    console.log('\n🔧 Buscando tags de Sony (Sony*):\n');

    const sonyKeys = Object.keys(tags).filter(key =>
      key.toLowerCase().includes('sony')
    );

    if (sonyKeys.length > 0) {
      console.log(`   ✅ Encontrados ${sonyKeys.length} tags de Sony:`);
      for (const key of sonyKeys) {
        console.log(`      ${key}:`, tags[key]);
      }
    } else {
      console.log('   ❌ No se encontraron tags de Sony');
    }

    // Mostrar todos los tags que empiezan con números (Sony usa tags numéricos)
    console.log('\n🔢 Tags numéricos (posibles tags de Sony):\n');

    const numericKeys = Object.keys(tags).filter(key => /^\d+$/.test(key));

    if (numericKeys.length > 0) {
      console.log(`   ✅ Encontrados ${numericKeys.length} tags numéricos:`);
      for (const key of numericKeys.slice(0, 20)) { // Solo mostrar los primeros 20
        console.log(`      Tag ${key}:`, tags[key]);
      }
      if (numericKeys.length > 20) {
        console.log(`      ... y ${numericKeys.length - 20} más`);
      }
    } else {
      console.log('   ❌ No se encontraron tags numéricos');
    }

    // Mostrar tags que contienen "Region" (Sony usa esto para face regions)
    console.log('\n📍 Tags con "Region" o "Area":\n');

    const regionKeys = Object.keys(tags).filter(key =>
      key.toLowerCase().includes('region') ||
      key.toLowerCase().includes('area')
    );

    if (regionKeys.length > 0) {
      console.log(`   ✅ Encontrados ${regionKeys.length} tags de region/area:`);
      for (const key of regionKeys) {
        console.log(`      ${key}:`, tags[key]);
      }
    } else {
      console.log('   ❌ No se encontraron tags de region/area');
    }

    // Conteo total de tags
    console.log(`\n📊 Total de tags encontrados: ${Object.keys(tags).length}`);
    console.log('');

    // Guardar todos los tags en un archivo para análisis
    const fs = require('fs');
    const outputPath = path.join(__dirname, 'exif-tags-all.json');
    fs.writeFileSync(outputPath, JSON.stringify(tags, null, 2));
    console.log(`💾 Todos los tags guardados en: ${outputPath}`);

  } catch (error) {
    console.log('❌ Error:', error.message);
  } finally {
    await exiftool.end();
  }
}

analyze();
