/**
 * Análisis completo de metadatos EXIF útiles para FotoShow
 */

const exiftool = require('exiftool-vendored').exiftool;
const path = require('path');

const FOLDER = 'C:\\Users\\Usuario01\\Desktop\\Nueva carpeta (4)';
const filename = 'DSC04097.JPG'; // Foto con 1 cara
const filepath = path.join(FOLDER, filename);

async function analyzeMetadata() {
  console.log('🔍 Análisis completo de metadatos EXIF útiles');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const tags = await exiftool.read(filepath);

  // Categorizar la información útil
  const usefulData = {
    // Información de la cámara
    camera: {
      make: tags.Make,
      model: tags.Model,
      software: tags.Software,
      lensModel: tags.LensModel,
      firmwareVersion: tags.SoftwareVersion
    },

    // Información de captura
    capture: {
      dateTimeOriginal: tags.DateTimeOriginal?.rawValue,
      exposureTime: tags.ExposureTime,
      fNumber: tags.FNumber,
      iso: tags.ISO,
      focalLength: tags.FocalLength,
      focalLengthIn35mmFormat: tags.FocalLengthIn35mmFormat,
      meteringMode: tags.MeteringMode,
      flash: tags.Flash,
      whiteBalance: tags.WhiteBalance,
      exposureMode: tags.ExposureMode,
      sceneCaptureType: tags.SceneCaptureType
    },

    // Información de la imagen
    image: {
      width: tags.ImageWidth,
      height: tags.ImageHeight,
      orientation: tags.Orientation,
      colorSpace: tags.ColorSpace,
      compressedBitsPerPixel: tags.CompressedBitsPerPixel
    },

    // Información de Sony específica
    sony: {
      sonyModelID: tags.SonyModelID,
      sonyImageWidth: tags.SonyImageWidth,
      sonyImageHeight: tags.SonyImageHeight,
      sonyImageWidthMax: tags.SonyImageWidthMax,
      sonyImageHeightMax: tags.SonyImageHeightMax,
      sonyISO: tags.SonyISO,
      sonyExposureTime: tags.SonyExposureTime,
      sonyFNumber: tags.SonyFNumber,
      sonyDateTime: tags.SonyDateTime?.rawValue,
      sonyDateTime2: tags.SonyDateTime2?.rawValue
    },

    // Face Detection
    faceDetection: {
      facesDetected: tags.FacesDetected,
      faceInfoOffset: tags.FaceInfoOffset,
      faceInfoLength: tags.FaceInfoLength
    },

    // Enfoque
    focus: {
      afAreaMode: tags.AFAreaMode,
      afAreaModeSetting: tags.AFAreaModeSetting,
      afPointUsed: tags.AFPointUsed,
      focusMode: tags.FocusMode
    },

    // Calidad de imagen
    quality: {
      contrast: tags.Contrast,
      saturation: tags.Saturation,
      sharpness: tags.Sharpness,
      customRendered: tags.CustomRendered
    },

    // Otras utilidades
    other: {
      fileModifyDate: tags.FileModifyDate?.rawValue,
      rating: tags.Rating,
      brightness: tags.Brightness
    }
  };

  // Buscar más tags de Sony que puedan ser útiles
  const sonySpecific = Object.entries(tags).filter(([key]) =>
    key.toLowerCase().startsWith('sony') &&
    !usefulData.sony[key]
  );

  if (sonySpecific.length > 0) {
    usefulData.sony.extras = {};
    sonySpecific.forEach(([key, value]) => {
      usefulData.sony.extras[key] = value;
    });
  }

  // Buscar tags con números (pueden ser más datos de Sony)
  const numericTags = Object.entries(tags).filter(([key]) => /^\d+$/.test(key));

  if (numericTags.length > 0) {
    usefulData.numericTags = numericTags.map(([key, value]) => ({
      tag: key,
      value: value
    }));
  }

  // Mostrar resultados
  console.log('📷 INFORMACIÓN DE LA CÁMARA:\n');
  Object.entries(usefulData.camera).forEach(([key, value]) => {
    console.log(`   ${key}:`, value);
  });

  console.log('\n📸 INFORMACIÓN DE CAPTURA:\n');
  Object.entries(usefulData.capture).forEach(([key, value]) => {
    console.log(`   ${key}:`, value);
  });

  console.log('\n🖼️  INFORMACIÓN DE LA IMAGEN:\n');
  Object.entries(usefulData.image).forEach(([key, value]) => {
    console.log(`   ${key}:`, value);
  });

  console.log('\n🔧 INFORMACIÓN DE SONY ESPECÍFICA:\n');
  Object.entries(usefulData.sony).forEach(([key, value]) => {
    if (key !== 'extras') {
      console.log(`   ${key}:`, value);
    }
  });

  if (usefulData.sony.extras) {
    console.log('\n   📦 Extras de Sony:');
    Object.entries(usefulData.sony.extras).forEach(([key, value]) => {
      console.log(`      ${key}:`, value);
    });
  }

  console.log('\n🎯 DETECCIÓN DE CARAS:\n');
  Object.entries(usefulData.faceDetection).forEach(([key, value]) => {
    console.log(`   ${key}:`, value);
  });

  // Mostrar posiciones de caras si existen
  for (let i = 1; i <= (usefulData.faceDetection.facesDetected || 0); i++) {
    const positionKey = `Face${i}Position`;
    if (tags[positionKey]) {
      console.log(`   ${positionKey}:`, tags[positionKey]);
    }
  }

  console.log('\n🎯 ENFOQUE:\n');
  Object.entries(usefulData.focus).forEach(([key, value]) => {
    console.log(`   ${key}:`, value);
  });

  console.log('\n🎨 CALIDAD DE IMAGEN:\n');
  Object.entries(usefulData.quality).forEach(([key, value]) => {
    console.log(`   ${key}:`, value);
  });

  console.log('\n📊 OTRAS UTILIDADES:\n');
  Object.entries(usefulData.other).forEach(([key, value]) => {
    console.log(`   ${key}:`, value);
  });

  if (usefulData.numericTags && usefulData.numericTags.length > 0) {
    console.log('\n🔢 TAGS NUMÉRICOS (posibles datos adicionales):\n');
    usefulData.numericTags.slice(0, 10).forEach(({tag, value}) => {
      console.log(`   Tag ${tag}:`, value);
    });
    if (usefulData.numericTags.length > 10) {
      console.log(`   ... y ${usefulData.numericTags.length - 10} más`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💾 Guardando análisis en JSON...');

  const fs = require('fs');
  const outputPath = path.join(__dirname, 'metadata-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    filename,
    usefulData,
    allTagsCount: Object.keys(tags).length,
    facesDetected: usefulData.faceDetection.facesDetected
  }, null, 2));

  console.log(`✅ Guardado en: ${outputPath}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await exiftool.end();
}

analyzeMetadata();
