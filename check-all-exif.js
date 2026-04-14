/**
 * Script para analizar TODOS los metadatos EXIF de una foto Sony A6000
 */

const ExifReader = require('exifreader');
const fs = require('fs');
const path = require('path');

const FOLDER = 'C:\\Users\\Usuario01\\Desktop\\Nueva carpeta (4)';
const filename = 'DSC04050.JPG'; // Una foto al azar
const filepath = path.join(FOLDER, filename);

console.log('🔍 Analizando TODOS los metadatos EXIF de:', filename);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  const tags = ExifReader.load(filepath);

  // Mostrar todos los tags disponibles
  console.log('📦 TODOS los tags encontrados:\n');

  let tagCount = 0;
  for (const [key, value] of Object.entries(tags)) {
    tagCount++;

    console.log(`[${tagCount}] ${key}:`);

    if (value.description) {
      console.log(`    Description: ${value.description}`);
    }

    if (value.value !== undefined && value.value !== value.description) {
      if (typeof value.value === 'object') {
        console.log(`    Value:`, JSON.stringify(value.value, null, 2));
      } else {
        console.log(`    Value: ${value.value}`);
      }
    }

    if (value.type) {
      console.log(`    Type: ${value.type}`);
    }

    console.log('');
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Total de tags encontrados: ${tagCount}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

} catch (error) {
  console.log('❌ Error:', error.message);
  console.log(error);
}
