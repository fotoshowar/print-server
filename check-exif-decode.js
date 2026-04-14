/**
 * Script para analizar metadatos EXIF usando librería 'exif'
 */

const ExifImage = require('exif').ExifImage;
const path = require('path');

const FOLDER = 'C:\\Users\\Usuario01\\Desktop\\Nueva carpeta (4)';
const filename = 'DSC04050.JPG';
const filepath = path.join(FOLDER, filename);

console.log('🔍 Analizando metadatos EXIF con librería "exif":', filename);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  new ExifImage({ image: filepath }, function (error, exifData) {
    if (error) {
      console.log('❌ Error:', error.message);
      return;
    }

    console.log('✅ Metadatos EXIF decodificados con éxito!\n');

    // Mostrar datos generales
    console.log('📷 Información de la cámara:');
    console.log('   Make:', exifData.image?.Make || 'N/A');
    console.log('   Model:', exifData.image?.Model || 'N/A');
    console.log('   Software:', exifData.image?.Software || 'N/A');
    console.log('   DateTime:', exifData.image?.DateTime || 'N/A');
    console.log('');

    // Mostrar datos de la foto
    console.log('📸 Datos de la foto:');
    console.log('   Orientación:', exifData.image?.Orientation || 'N/A');
    console.log('   XResolution:', exifData.image?.XResolution || 'N/A');
    console.log('   YResolution:', exifData.image?.YResolution || 'N/A');
    console.log('   ResolutionUnit:', exifData.image?.ResolutionUnit || 'N/A');
    console.log('');

    // Mostrar datos EXIF
    console.log('⚙️  Datos EXIF:');
    if (exifData.exif) {
      console.log('   DateTimeOriginal:', exifData.exif.DateTimeOriginal || 'N/A');
      console.log('   CreateDate:', exifData.exif.CreateDate || 'N/A');
      console.log('   ExposureTime:', exifData.exif.ExposureTime || 'N/A');
      console.log('   FNumber:', exifData.exif.FNumber || 'N/A');
      console.log('   ISOSpeedRatings:', exifData.exif.ISOSpeedRatings || 'N/A');
      console.log('   FocalLength:', exifData.exif.FocalLength || 'N/A');
      console.log('   LensModel:', exifData.exif.LensModel || 'N/A');
      console.log('   MeteringMode:', exifData.exif.MeteringMode || 'N/A');
      console.log('   Flash:', exifData.exif.Flash || 'N/A');
    } else {
      console.log('   (No hay datos EXIF)');
    }
    console.log('');

    // Buscar datos de face detection
    console.log('🔎 Buscando información de Face Detection:');

    let foundFaceData = false;

    // Buscar en todos los campos
    function searchInObject(obj, prefix = '') {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        // Si el key contiene "Face" o "face"
        if (key.toLowerCase().includes('face')) {
          foundFaceData = true;
          console.log(`   ✓ Encontrado: ${fullKey} =`, value);
        }

        // Si el valor contiene "face"
        if (typeof value === 'string' && value.toLowerCase().includes('face')) {
          foundFaceData = true;
          console.log(`   ✓ Encontrado valor con "face": ${fullKey} =`, value);
        }

        // Buscar recursivamente en objetos anidados
        if (typeof value === 'object' && value !== null) {
          searchInObject(value, fullKey);
        }
      }
    }

    searchInObject(exifData);

    if (!foundFaceData) {
      console.log('   ❌ No se encontró información de Face Detection');
    }

    // Mostrar todos los campos disponibles (para diagnóstico)
    console.log('\n📦 Todos los campos disponibles:');
    console.log('   Image:', Object.keys(exifData.image || {}).join(', '));
    console.log('   Exif:', Object.keys(exifData.exif || {}).join(', '));
    console.log('   GPS:', Object.keys(exifData.gps || {}).join(', '));
    console.log('   Interop:', Object.keys(exifData.interop || {}).join(', '));
    console.log('   Makernote:', Object.keys(exifData.makernote || {}).join(', '));
    console.log('');

    // Mostrar makernote completo (Sony suele guardar datos específicos aquí)
    if (exifData.makernote && Object.keys(exifData.makernote).length > 0) {
      console.log('🔧 Makernote completo (Sony specific):');
      console.log(JSON.stringify(exifData.makernote, null, 2));
    }

  });
} catch (error) {
  console.log('❌ Error:', error.message);
}
