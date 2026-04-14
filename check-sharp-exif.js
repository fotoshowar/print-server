/**
 * Script para analizar metadatos EXIF usando Sharp
 */

const sharp = require('sharp');
const path = require('path');

const FOLDER = 'C:\\Users\\Usuario01\\Desktop\\Nueva carpeta (4)';
const filename = 'DSC04050.JPG';
const filepath = path.join(FOLDER, filename);

console.log('🔍 Analizando metadatos EXIF con Sharp:', filename);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function analyze() {
  try {
    const metadata = await sharp(filepath).metadata();

    console.log('📐 Dimensiones:', `${metadata.width} x ${metadata.height} px`);
    console.log('🎨 Formato:', metadata.format);
    console.log('📏 Espacio de color:', metadata.space);
    console.log('📊 Tamaño:', `${(metadata.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('');

    if (metadata.exif) {
      console.log('✅ Datos EXIF encontrados!');
      console.log('Longitud de buffer EXIF:', metadata.exif.length, 'bytes');
      console.log('');

      // El buffer EXIF está en binario, necesitamos decodificarlo
      // Sharp no lo decodifica automáticamente, solo lo extrae
      console.log('⚠️  Sharp extrae el buffer EXIF pero no lo decodifica.');
      console.log('⚠️  Necesitamos una librería adicional para leer el contenido.');
      console.log('');
    } else {
      console.log('❌ No se encontraron datos EXIF');
    }

    if (metadata.iptc) {
      console.log('✅ Datos IPTC encontrados!');
      console.log('Longitud de buffer IPTC:', metadata.iptc.length, 'bytes');
      console.log('');
    }

    if (metadata.xmp) {
      console.log('✅ Datos XMP encontrados!');
      console.log('Longitud de buffer XMP:', metadata.xmp.length, 'bytes');
      console.log('');
    }

    if (metadata.tiff) {
      console.log('✅ Metadatos TIFF encontrados:');
      console.log(JSON.stringify(metadata.tiff, null, 2));
      console.log('');
    }

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

analyze();
