/**
 * FotoShow Print Server — Windows version
 * Usa PowerShell / mspaint para imprimir
 */
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const crypto = require('crypto');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_PRINTER = process.env.DEFAULT_PRINTER || '';
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'descarga.fotoshow.online';

// Directorios
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const THUMBS_DIR = path.join(__dirname, 'thumbs');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(THUMBS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

// =================== DB ===================
const DB_PATH = path.join(__dirname, 'db.json');

function loadDB() {
  if (fs.existsSync(DB_PATH)) {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  }
  return { photos: {}, stats: { totalUploaded: 0, totalPrinted: 0, totalDownloaded: 0 } };
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// =================== STORAGE ===================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = getToday();
    const dayDir = path.join(UPLOADS_DIR, today);
    fs.mkdirSync(dayDir, { recursive: true });
    cb(null, dayDir);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `foto-${ts}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imagenes'));
  },
  limits: { fileSize: 30 * 1024 * 1024, files: 200 }
});

// =================== HELPERS ===================
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function generateShareCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

async function generateThumbnail(originalPath, filename, date) {
  const thumbDir = path.join(THUMBS_DIR, date);
  fs.mkdirSync(thumbDir, { recursive: true });
  const thumbPath = path.join(thumbDir, filename);

  try {
    const metadata = await sharp(originalPath).metadata();
    const isHorizontal = (metadata.width || 0) > (metadata.height || 0);

    await sharp(originalPath)
      .rotate()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toFile(thumbPath);

    return {
      thumbPath, width: metadata.width, height: metadata.height,
      isHorizontal, size: fs.statSync(thumbPath).size
    };
  } catch (err) {
    console.error(`[THUMB ERROR] ${filename}:`, err.message);
    fs.copyFileSync(originalPath, thumbPath);
    return { thumbPath, width: 0, height: 0, isHorizontal: false, size: 0 };
  }
}

// =================== IMPRESIÓN (auto Windows / Linux) ===================
const IS_WINDOWS = process.platform === 'win32';
console.log(`[INIT] Sistema operativo: ${IS_WINDOWS ? 'Windows' : 'Linux/Pi'}`);

// Windows: PowerShell + PrintDocument
function printWithPS(filepath, printerName, options = {}) {
  const { paperSize, isHorizontal } = options;
  const printer = printerName || DEFAULT_PRINTER;
  const size = paperSize || 'A4';

  // Siempre A4 físico. A5 = mitad superior de A4.
  // A4 en centésimas de pulgada: 827 x 1169
  // Margen 0.5cm ≈ 20 centésimas de pulgada
  const isA5 = size === 'A5';

  // Para A5: área de dibujo = mitad superior del A4 con margen
  // mitad de 1169 = 584
  const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${filepath.replace(/\\/g, '\\\\')}')
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '${printer}'
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('A4', 827, 1169)
$pd.add_PrintPage({
  param($sender, $e)
  $pw = $e.PageBounds.Width
  $ph = $e.PageBounds.Height
  $margin = 20
  ${isA5 ? `# A5: solo mitad superior de la hoja A4
  $areaW = $pw - ($margin * 2)
  $areaH = [int]($ph / 2) - ($margin * 2)
  $originX = $margin
  $originY = $margin` : `# A4: hoja completa
  $areaW = $pw - ($margin * 2)
  $areaH = $ph - ($margin * 2)
  $originX = $margin
  $originY = $margin`}
  $sw = $areaW / $img.Width
  $sh = $areaH / $img.Height
  $scale = [Math]::Min($sw, $sh)
  $fw = [int]($img.Width * $scale)
  $fh = [int]($img.Height * $scale)
  $x = $originX + [int](($areaW - $fw) / 2)
  $y = $originY + [int](($areaH - $fh) / 2)
  $e.Graphics.DrawImage($img, $x, $y, $fw, $fh)
  $e.HasMorePages = $false
})
$pd.Print()
$img.Dispose()
Write-Host "OK"
`;

  const tempScript = path.join(__dirname, `print_${Date.now()}.ps1`);
  fs.writeFileSync(tempScript, psScript);

  return new Promise((resolve, reject) => {
    exec(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 30000 }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tempScript); } catch(e) {}
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

// Linux/Pi: CUPS (lp)
function printWithCUPS(filepath, printerName, options = {}) {
  const { paperSize, isHorizontal } = options;
  return new Promise((resolve, reject) => {
    // Sanitizar nombre: si no es un nombre CUPS válido, usar default
    const safeName = (printerName && /^[a-zA-Z0-9_-]+$/.test(printerName)) ? printerName : DEFAULT_PRINTER;
    let cmd = `lp -d "${safeName}"`;
    cmd += paperSize === 'A5' ? ' -o media=a5' : ' -o media=a4';
    cmd += ' -o MediaType=PSGLOS_HIGH';
    if (isHorizontal) cmd += ' -o landscape';
    cmd += ' -o fit-to-page';
    cmd += ` "${filepath}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

// Función unificada — elige según SO automáticamente
function printFile(filepath, printerName, options = {}) {
  if (IS_WINDOWS) return printWithPS(filepath, printerName, options);
  return printWithCUPS(filepath, printerName, options);
}

// =================== RUTAS API ===================

// Subir fotos
app.post('/api/upload', upload.array('photos', 200), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron imagenes' });
  }

  const db = loadDB();
  const results = [];
  const today = getToday();

  for (const file of req.files) {
    const shareCode = generateShareCode();
    const thumbInfo = await generateThumbnail(file.path, file.filename, today);

    const photoData = {
      filename: file.filename,
      originalName: file.originalname,
      date: today,
      size: file.size,
      thumbSize: thumbInfo.size,
      width: thumbInfo.width,
      height: thumbInfo.height,
      isHorizontal: thumbInfo.isHorizontal,
      shareCode,
      uploadedAt: new Date().toISOString(),
      printed: 0,
      downloaded: 0
    };

    db.photos[file.filename] = photoData;
    db.stats.totalUploaded++;
    results.push(photoData);
  }

  saveDB(db);
  console.log(`[UPLOAD] ${results.length} foto(s) - ${today}`);
  res.json({ success: true, photos: results });
});

// Listar fotos
app.get('/api/photos', (req, res) => {
  const db = loadDB();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const dateFilter = req.query.date || null;

  let photos = Object.values(db.photos)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  if (dateFilter) photos = photos.filter(p => p.date === dateFilter);

  photos = photos.filter(p => {
    const origPath = path.join(UPLOADS_DIR, p.date || getToday(), p.filename);
    const oldPath = path.join(UPLOADS_DIR, p.filename);
    return fs.existsSync(origPath) || fs.existsSync(oldPath);
  });

  const total = photos.length;
  const paginated = photos.slice((page - 1) * limit, page * limit);

  const grouped = {};
  for (const p of paginated) {
    const date = p.date || 'sin-fecha';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(p);
  }

  res.json({ total, page, limit, pages: Math.ceil(total / limit), dates: Object.keys(grouped).sort().reverse(), groups: grouped });
});

// Eliminar foto
app.delete('/api/photos/:filename', (req, res) => {
  const { filename } = req.params;
  const db = loadDB();
  const photo = db.photos[filename];
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

  const date = photo.date || getToday();
  const origPath = path.join(UPLOADS_DIR, date, filename);
  const oldPath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(origPath)) fs.unlinkSync(origPath);
  else if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

  const thumbPath = path.join(THUMBS_DIR, date, filename);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

  delete db.photos[filename];
  saveDB(db);
  res.json({ success: true });
});

// Imprimir foto — CUPS
app.post('/api/print', async (req, res) => {
  const { filename, printer, size } = req.body;

  if (!filename) return res.status(400).json({ error: 'Falta el nombre del archivo' });

  const db = loadDB();
  const photo = db.photos[filename];
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

  const date = photo.date || getToday();
  let filepath = path.join(UPLOADS_DIR, date, filename);
  if (!fs.existsSync(filepath)) filepath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  const printSize = size || 'A4';
  const isHorizontal = photo.isHorizontal || false;
  const orientation = isHorizontal ? 'Landscape' : 'Portrait';

  console.log(`[PRINT] ${filename} -> ${printer || 'default'} (${printSize} ${orientation})`);

  try {
    await printFile(filepath, printer, { paperSize: printSize, isHorizontal });

    const db2 = loadDB();
    if (db2.photos[filename]) db2.photos[filename].printed++;
    db2.stats.totalPrinted++;
    saveDB(db2);

    res.json({ success: true, message: `Enviado a imprimir (${printSize} ${orientation})` });
  } catch (err) {
    console.error('[PRINT ERROR]', err.message);
    res.status(500).json({ error: 'Error al imprimir', detail: err.message });
  }
});

// Imprimir HD — procesa el archivo original en el server (sin canvas del navegador)
app.post('/api/print-hd', async (req, res) => {
  const { filename, size, rotation = 0, zoom = 1, offsetX = 0, offsetY = 0, printer } = req.body;

  console.log(`[PRINT-HD] Recibido: filename="${filename}", size="${size}", rotation=${rotation}, zoom=${zoom}`);

  if (!filename) return res.status(400).json({ error: 'Falta filename' });

  const db = loadDB();
  const photo = db.photos[filename];
  if (!photo) {
    console.error(`[PRINT-HD] Foto no encontrada en BD:`, Object.keys(db.photos).slice(0, 5));
    return res.status(404).json({ error: 'Foto no encontrada en BD' });
  }

  const date = photo.date || getToday();
  let filepath = path.join(UPLOADS_DIR, date, filename);
  console.log(`[PRINT-HD] Buscando archivo: ${filepath}`);

  if (!fs.existsSync(filepath)) {
    filepath = path.join(UPLOADS_DIR, filename);
    console.log(`[PRINT-HD] Intento fallido. Buscando en ruta alternativa: ${filepath}`);
  }

  if (!fs.existsSync(filepath)) {
    console.error(`[PRINT-HD] Archivo no encontrado:`, filepath);
    return res.status(404).json({ error: 'Archivo no encontrado', path: filepath });
  }

  const stats = fs.statSync(filepath);
  console.log(`[PRINT-HD] Archivo encontrado: ${filepath} (${stats.size} bytes)`);

  const printSize = size || 'A4';
  // Dimensiones de salida 300dpi: A4=2480×3508, A5=2480×1754 (mitad superior apaisada)
  const OUT = printSize === 'A5' ? { w: 2480, h: 1754 } : { w: 2480, h: 3508 };
  // Preview del modal: A4=200×283, A5=200×141
  const PREVIEW_W = 200;
  const scaleHD = OUT.w / PREVIEW_W; // 12.4

  let finalPath = path.join(__dirname, `hd_${Date.now()}.jpg`);

  try {
    // 1. Auto-rotar por EXIF
    console.log(`[PRINT-HD] 1. Leyendo con Sharp y detectando EXIF...`);
    let imgBuf = await sharp(filepath).rotate().toBuffer();
    console.log(`[PRINT-HD] 1. OK - Buffer generado (${imgBuf.length} bytes)`);

    // 2. Rotación del usuario (si la hay)
    if (rotation !== 0) {
      console.log(`[PRINT-HD] 2. Aplicando rotación del usuario: ${rotation}°`);
      imgBuf = await sharp(imgBuf)
        .rotate(rotation, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toBuffer();
      console.log(`[PRINT-HD] 2. OK - Rotación aplicada`);
    }

    console.log(`[PRINT-HD] 3. Leyendo metadata...`);
    const meta = await sharp(imgBuf).metadata();
    console.log(`[PRINT-HD] 3. OK - Metadata: ${meta.width}x${meta.height} (${meta.format})`);

    // 3. Escalar imagen para salida HD
    const scaledW = Math.max(1, Math.round(meta.width * zoom * scaleHD));
    const scaledH = Math.max(1, Math.round(meta.height * zoom * scaleHD));

    const scaledBuf = await sharp(imgBuf)
      .resize(scaledW, scaledH)
      .toBuffer();

    // 4. Posición: centro del papel + offset (escalado a HD)
    let compLeft = Math.round(OUT.w / 2 + offsetX * scaleHD - scaledW / 2);
    let compTop = Math.round(OUT.h / 2 + offsetY * scaleHD - scaledH / 2);

    // 5. Si la imagen se sale del canvas (posiciones negativas), recortar la parte visible
    let compBuf = scaledBuf;
    if (compLeft < 0 || compTop < 0) {
      const cropLeft = Math.max(0, -compLeft);
      const cropTop = Math.max(0, -compTop);
      const cropW = Math.min(scaledW - cropLeft, OUT.w);
      const cropH = Math.min(scaledH - cropTop, OUT.h);
      if (cropW > 0 && cropH > 0) {
        compBuf = await sharp(scaledBuf)
          .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
          .toBuffer();
      }
      compLeft = Math.max(0, compLeft);
      compTop = Math.max(0, compTop);
    }

    // 6. Componer sobre canvas blanco
    await sharp({
      create: { width: OUT.w, height: OUT.h, channels: 3, background: { r: 255, g: 255, b: 255 } }
    })
      .composite([{ input: compBuf, left: compLeft, top: compTop }])
      .jpeg({ quality: 100 })
      .toFile(finalPath);

    // 7. Para A5: montar en A4 completo (mitad superior)
    if (printSize === 'A5') {
      const a5Buf = fs.readFileSync(finalPath);
      await sharp({
        create: { width: 2480, height: 3508, channels: 3, background: { r: 255, g: 255, b: 255 } }
      })
        .composite([{ input: a5Buf, top: 0, left: 0 }])
        .jpeg({ quality: 100 })
        .toFile(finalPath);
    }

    // 8. Imprimir siempre como A4 físico
    await printFile(finalPath, printer, { paperSize: 'A4', isHorizontal: false });

    const db2 = loadDB();
    if (db2.photos[filename]) db2.photos[filename].printed++;
    db2.stats.totalPrinted++;
    saveDB(db2);

    console.log(`[PRINT-HD] ✅ ${filename} -> ${printSize} rot=${rotation} zoom=${zoom?.toFixed(3)} (original HD)`);
    res.json({ success: true, message: `Imprimiendo ${printSize} (calidad HD original)` });
  } catch (err) {
    console.error('[PRINT-HD ERROR] Excepción completa:');
    console.error('  Mensaje:', err.message);
    console.error('  Stack:', err.stack);
    if (err.code) console.error('  Código:', err.code);
    res.status(500).json({ error: 'Error al procesar imagen', detail: err.message, code: err.code });
  } finally {
    if (finalPath && fs.existsSync(finalPath)) {
      try { fs.unlinkSync(finalPath); } catch(e) {}
    }
  }
});

// Imprimir con recorte personalizado (desde canvas del modal) — LEGACY
// Imprimir con recorte del canvas
app.post('/api/print-crop', async (req, res) => {
  const { filename, size, cropDataURL, printer } = req.body;
  if (!filename || !cropDataURL) return res.status(400).json({ error: 'Faltan datos' });

  const db = loadDB();
  const photo = db.photos[filename];
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

  const date = photo.date || getToday();
  let origPath = path.join(UPLOADS_DIR, date, filename);
  if (!fs.existsSync(origPath)) origPath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(origPath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  const printSize = size || 'A4';
  let finalPath = null;

  try {
    // Decodificar el canvas
    const base64 = cropDataURL.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    // Detectar formato (JPEG o PNG)
    const isPNG = cropDataURL.startsWith('data:image/png');
    const ext = isPNG ? 'png' : 'jpg';
    finalPath = path.join(__dirname, `crop_${Date.now()}.${ext}`);

    if (printSize === 'A5') {
      // A5 = mitad superior de A4 físico (21x~15cm, apaisado)
      // El canvas manda 2480x1754. Lo montamos arriba de un A4 blanco (2480x3508)
      // y mandamos a CUPS como A4 para que quede en la mitad superior.
      const cropBuffer = isPNG ? buffer : await sharp(buffer).png().toBuffer();
      await sharp({
        create: { width: 2480, height: 3508, channels: 3, background: { r: 255, g: 255, b: 255 } }
      })
        .composite([{ input: cropBuffer, top: 0, left: 0 }])
        .png()
        .toFile(finalPath);

      await printFile(finalPath, printer, { paperSize: 'A4', isHorizontal: false });
    } else {
      // A4: guardar y mandar directo
      if (isPNG) {
        fs.writeFileSync(finalPath, buffer);
      } else {
        await sharp(buffer)
          .jpeg({ quality: 100, mozjpeg: true })
          .toFile(finalPath);
      }

      await printFile(finalPath, printer, { paperSize: 'A4', isHorizontal: false });
    }

    const db2 = loadDB();
    if (db2.photos[filename]) db2.photos[filename].printed++;
    db2.stats.totalPrinted++;
    saveDB(db2);

    console.log(`[PRINT-CROP] ${filename} -> ${printSize} (${ext.toUpperCase()} calidad máxima)`);
    res.json({ success: true, message: `Enviado (${printSize} - calidad máxima)` });
  } catch (err) {
    console.error('[PRINT-CROP ERROR]', err.message);
    res.status(500).json({ error: 'Error al imprimir', detail: err.message });
  } finally {
    if (finalPath && fs.existsSync(finalPath)) {
      try { fs.unlinkSync(finalPath); } catch(e) {}
    }
  }
});

// Imprimir hoja índice — CUPS
app.post('/api/print-index', async (req, res) => {
  const { filenames, cols, rows, printer } = req.body;
  const db = loadDB();

  if (!filenames || filenames.length === 0) {
    return res.status(400).json({ error: 'No se enviaron fotos' });
  }

  const numCols = Math.max(1, Math.min(10, parseInt(cols) || 5));
  const numRows = Math.max(1, Math.min(12, parseInt(rows) || 7));
  const perPage = numCols * numRows;
  const totalPages = Math.ceil(filenames.length / perPage);

  console.log(`[INDEX] ${filenames.length} fotos, ${numCols}x${numRows}, ${totalPages} pagina(s)`);

  const PAGE_W = 1240;
  const PAGE_H = 1754;
  const MARGIN = 20;
  const GAP = 6;
  const LABEL_H = 14;
  const TITLE_H = 32;

  const cellW = Math.floor((PAGE_W - MARGIN * 2 - GAP * (numCols - 1)) / numCols);
  const cellH = Math.floor((PAGE_H - MARGIN * 2 - GAP * (numRows - 1) - TITLE_H) / numRows);

  const indexPaths = [];

  try {
    for (let page = 0; page < totalPages; page++) {
      const pagePhotos = filenames.slice(page * perPage, (page + 1) * perPage);
      const composites = [];

      const pageLabel = totalPages > 1 ? ` (${page + 1}/${totalPages})` : '';
      const titleSvg = `<svg width="${PAGE_W}" height="${TITLE_H}">
        <text x="${PAGE_W/2}" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="black">
          FotoShow${pageLabel} — ${pagePhotos.length} fotos
        </text>
      </svg>`;
      composites.push({ input: Buffer.from(titleSvg), top: MARGIN, left: 0 });

      for (let i = 0; i < pagePhotos.length; i++) {
        const fname = pagePhotos[i];
        const photo = db.photos[fname];
        if (!photo) continue;

        const date = photo.date || getToday();
        const col = i % numCols;
        const row = Math.floor(i / numCols);
        const x = MARGIN + col * (cellW + GAP);
        const y = MARGIN + TITLE_H + row * (cellH + GAP);

        let imgPath = path.join(THUMBS_DIR, date, fname);
        if (!fs.existsSync(imgPath)) imgPath = path.join(UPLOADS_DIR, date, fname);
        if (!fs.existsSync(imgPath)) continue;

        try {
          const resized = await sharp(imgPath)
            .rotate()
            .resize(cellW, cellH - LABEL_H, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toBuffer();
          composites.push({ input: resized, top: y, left: x });

          const globalNum = page * perPage + i + 1;
          const numSvg = `<svg width="${cellW}" height="${LABEL_H}">
            <rect width="${cellW}" height="${LABEL_H}" fill="white"/>
            <text x="${cellW/2}" y="11" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="black">#${globalNum}</text>
          </svg>`;
          composites.push({ input: Buffer.from(numSvg), top: y + cellH - LABEL_H, left: x });
        } catch (e) {
          console.error(`[INDEX] Error foto ${fname}:`, e.message);
        }
      }

      const pageBuffer = await sharp({
        create: { width: PAGE_W, height: PAGE_H, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite(composites).jpeg({ quality: 90 }).toBuffer();

      const pagePath = path.join(__dirname, `index_${Date.now()}_p${page}.jpg`);
      fs.writeFileSync(pagePath, pageBuffer);
      indexPaths.push(pagePath);
    }

    for (const indexPath of indexPaths) {
      try {
        await printFile(indexPath, printer, { paperSize: 'A4' });
      } catch (e) {
        console.error('[INDEX PRINT ERROR]', e.message);
      }
      try { fs.unlinkSync(indexPath); } catch(e) {}
    }

    res.json({ success: true, message: `${totalPages} hoja(s) índice impresas (${filenames.length} fotos, ${numCols}x${numRows})` });
  } catch (err) {
    console.error('[INDEX ERROR]', err);
    indexPaths.forEach(p => { try { fs.unlinkSync(p); } catch(e) {} });
    res.status(500).json({ error: 'Error generando hoja indice' });
  }
});

// =================== COMPARTIR / DESCARGAR ===================

app.get('/foto/:code', (req, res) => {
  const { code } = req.params;
  const db = loadDB();
  const photo = Object.values(db.photos).find(p => p.shareCode === code.toUpperCase());
  if (!photo) return res.status(404).send('Foto no encontrada');

  res.send(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>📸 Tu Foto - FotoShow</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
  :root{--fs-green:#ADFF2F;--fs-bg:#0a0a0a;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Poppins',sans-serif;background:var(--fs-bg);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;}
  .card{background:#111;border:1px solid rgba(173,255,47,0.14);border-radius:20px;padding:24px;max-width:400px;width:100%;text-align:center;}
  .card img{width:100%;border-radius:12px;margin:16px 0;}
  .card h2{font-size:1.2rem;color:var(--fs-green);margin-bottom:4px;}
  .card p{color:rgba(226,232,240,0.55);font-size:0.85rem;margin-bottom:16px;}
  .dl-btn{display:block;background:var(--fs-green);color:#0a0a0a;border:none;border-radius:12px;padding:14px;font-size:1.1rem;font-weight:700;text-decoration:none;width:100%;font-family:'Poppins',sans-serif;}
  .dl-btn:hover{background:#7CFC00;}
  .logo{font-size:1.5rem;font-weight:900;color:var(--fs-green);margin-bottom:8px;}
</style></head><body>
<div class="card">
  <div class="logo">FotoShow</div>
  <h2>Tu Foto</h2>
  <p>Código: ${photo.shareCode}</p>
  <img src="/thumbs/${photo.date || 'sin-fecha'}/${photo.filename}" alt="Foto">
  <a href="/api/download/${photo.filename}" class="dl-btn">⬇️ Descargar Foto HD</a>
</div></body></html>`);
});

app.get('/api/download/:filename', (req, res) => {
  const { filename } = req.params;
  const db = loadDB();
  const photo = db.photos[filename];
  if (!photo) return res.status(404).send('Foto no encontrada');

  const date = photo.date || getToday();
  let filepath = path.join(UPLOADS_DIR, date, filename);
  if (!fs.existsSync(filepath)) filepath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).send('Archivo no encontrado');

  const db2 = loadDB();
  if (db2.photos[filename]) db2.photos[filename].downloaded++;
  db2.stats.totalDownloaded++;
  saveDB(db2);

  res.download(filepath, `FotoShow-${photo.shareCode}.jpg`);
});

app.get('/api/share/:filename', (req, res) => {
  const { filename } = req.params;
  const db = loadDB();
  const photo = db.photos[filename];
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

  const shareURL = `https://${PUBLIC_DOMAIN}/foto/${photo.shareCode}`;
  const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareURL)}`;

  res.json({ shareCode: photo.shareCode, shareURL, qrURL, filename: photo.filename, downloaded: photo.downloaded, printed: photo.printed });
});

app.get('/api/stats', (req, res) => {
  const db = loadDB();
  res.json(db.stats);
});

// Listar impresoras
app.get('/api/printers', (req, res) => {
  if (IS_WINDOWS) {
    exec('powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"', (err, stdout) => {
      if (err) return res.json([DEFAULT_PRINTER].filter(Boolean));
      const printers = (stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
      res.json(printers);
    });
  } else {
    exec('lpstat -a 2>/dev/null', (err, stdout) => {
      if (err) return res.json([DEFAULT_PRINTER].filter(Boolean));
      const printers = (stdout || '').split('\n').map(l => l.split(' ')[0]).filter(Boolean);
      res.json(printers);
    });
  }
});

// =================== COLA DE IMPRESIÓN ===================
// Listar trabajos de la cola
app.get('/api/print-queue', (req, res) => {
  if (IS_WINDOWS) {
    return res.json([]);
  }
  exec('lpstat -o 2>/dev/null', (err, stdout) => {
    if (err || !stdout.trim()) return res.json([]);
    const jobs = stdout.trim().split('\n').map(line => {
      // Format: "EPSON_L805-123 user 1024 Wed 15 Apr 2026 21:18:22"
      const match = line.match(/^(\S+)-(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;
      return { id: match[2], printer: match[1], user: match[3], size: match[4], date: match[5].trim() };
    }).filter(Boolean);
    res.json(jobs);
  });
});

// Cancelar un trabajo
app.post('/api/print-queue/cancel', (req, res) => {
  const { jobId } = req.body;
  if (!jobId || !/^\d+$/.test(jobId)) return res.status(400).json({ error: 'Job ID inválido' });
  exec(`cancel ${jobId}`, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Cancelar todos los trabajos
app.post('/api/print-queue/cancel-all', (req, res) => {
  exec(`cancel -a`, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Mover un trabajo al principio de la cola (darle prioridad)
app.post('/api/print-queue/prioritize', (req, res) => {
  const { jobId } = req.body;
  if (!jobId || !/^\d+$/.test(jobId)) return res.status(400).json({ error: 'Job ID inválido' });
  exec(`lp -i ${jobId} -q 100`, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Servir archivos
app.use('/thumbs', express.static(THUMBS_DIR, { maxAge: '1h' }));
app.use('/uploads', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, express.static(UPLOADS_DIR));

// =================== INICIAR ===================
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n🖨️  FotoShow Print Server v3.0 (Windows)`);
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Red:      http://${localIP}:${PORT}`);
  console.log(`   Internet: https://${PUBLIC_DOMAIN}`);
  console.log(`\n   📸 Abrí http://${localIP}:${PORT} desde tu celular!\n`);
});
