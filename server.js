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
const DEFAULT_PRINTER = process.env.DEFAULT_PRINTER || 'EPSON L805 Series';
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'descarga.fotoshow.online';

// Directorios
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const THUMBS_DIR = path.join(__dirname, 'thumbs');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(THUMBS_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
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
    const today = new Date().toISOString().slice(0, 10); // 2026-03-25
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

// Generar thumbnail con sharp
async function generateThumbnail(originalPath, filename, date) {
  const thumbDir = path.join(THUMBS_DIR, date);
  fs.mkdirSync(thumbDir, { recursive: true });
  const thumbPath = path.join(thumbDir, filename);

  try {
    const metadata = await sharp(originalPath).metadata();
    const isHorizontal = (metadata.width || 0) > (metadata.height || 0);

    await sharp(originalPath)
      .rotate() // auto-rotate based on EXIF
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toFile(thumbPath);

    return {
      thumbPath,
      width: metadata.width,
      height: metadata.height,
      isHorizontal,
      size: fs.statSync(thumbPath).size
    };
  } catch (err) {
    console.error(`[THUMB ERROR] ${filename}:`, err.message);
    // Fallback: copiar original como thumb
    fs.copyFileSync(originalPath, thumbPath);
    return { thumbPath, width: 0, height: 0, isHorizontal: false, size: 0 };
  }
}

// =================== RUTAS API ===================

// Subir foto(s) — genera thumbnail automáticamente
app.post('/api/upload', upload.array('photos', 200), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron imagenes' });
  }

  const db = loadDB();
  const results = [];
  const today = getToday();

  for (const file of req.files) {
    const shareCode = generateShareCode();

    // Generar thumbnail
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
  console.log(`[UPLOAD] ${results.length} foto(s) subida(s) - ${today}`);
  res.json({ success: true, photos: results });
});

// Listar fotos (con paginación y agrupación por día)
app.get('/api/photos', (req, res) => {
  const db = loadDB();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const dateFilter = req.query.date || null;

  let photos = Object.values(db.photos)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  if (dateFilter) {
    photos = photos.filter(p => p.date === dateFilter);
  }

  // Verificar que los archivos existen
  photos = photos.filter(p => {
    const origPath = path.join(UPLOADS_DIR, p.date || getToday(), p.filename);
    // Fallback para fotos viejas sin date
    const oldPath = path.join(UPLOADS_DIR, p.filename);
    return fs.existsSync(origPath) || fs.existsSync(oldPath);
  });

  const total = photos.length;
  const paginated = photos.slice((page - 1) * limit, page * limit);

  // Agrupar por día
  const grouped = {};
  for (const p of paginated) {
    const date = p.date || 'sin-fecha';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(p);
  }

  res.json({
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    dates: Object.keys(grouped).sort().reverse(),
    groups: grouped
  });
});

// Listar días disponibles
app.get('/api/dates', (req, res) => {
  const db = loadDB();
  const dates = {};
  for (const p of Object.values(db.photos)) {
    const d = p.date || 'sin-fecha';
    dates[d] = (dates[d] || 0) + 1;
  }
  res.json(dates);
});

// Eliminar foto
app.delete('/api/photos/:filename', (req, res) => {
  const { filename } = req.params;
  const db = loadDB();
  const photo = db.photos[filename];

  if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

  const date = photo.date || getToday();

  // Borrar original
  const origPath = path.join(UPLOADS_DIR, date, filename);
  const oldPath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(origPath)) fs.unlinkSync(origPath);
  else if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

  // Borrar thumbnail
  const thumbPath = path.join(THUMBS_DIR, date, filename);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

  delete db.photos[filename];
  saveDB(db);
  res.json({ success: true });
});

// Imprimir foto — detecta orientación automáticamente
app.post('/api/print', (req, res) => {
  const { filename, printer, size } = req.body;

  if (!filename) return res.status(400).json({ error: 'Falta el nombre del archivo' });

  const db = loadDB();
  const photo = db.photos[filename];
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada en DB' });

  const date = photo.date || getToday();
  let filepath = path.join(UPLOADS_DIR, date, filename);
  if (!fs.existsSync(filepath)) filepath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  const printerName = printer || DEFAULT_PRINTER;
  const printSize = size || 'A4';

  // Detectar orientación de la imagen
  const isHorizontal = photo.isHorizontal || false;

  // Dimensiones en centésimas de pulgada
  // Si la imagen es horizontal, invertir ancho/alto del papel (landscape)
  const dimensions = {
    'A4': isHorizontal ? { w: 1169, h: 827 } : { w: 827, h: 1169 },
    'A5': isHorizontal ? { w: 827, h: 583 } : { w: 583, h: 827 }
  };

  const dim = dimensions[printSize] || dimensions['A4'];
  const orientation = isHorizontal ? 'Landscape' : 'Portrait';

  console.log(`[PRINT] ${filename} -> ${printerName} (${printSize} ${orientation}) [${photo.width}x${photo.height}]`);

  const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${filepath.replace(/\\/g, '\\\\')}')

# Auto-rotar segun EXIF
foreach ($prop in $img.PropertyItems) {
  if ($prop.Id -eq 0x0112) {
    $orientation = [BitConverter]::ToUInt16($prop.Value, 0)
    switch ($orientation) {
      3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
      6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
      8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
    }
    break
  }
}

$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '${printerName}'
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('${printSize}', ${dim.w}, ${dim.h})
${isHorizontal ? "$pd.DefaultPageSettings.Landscape = $true" : ""}
$pd.add_PrintPage({
  param($sender, $e)
  $pw = $e.PageBounds.Width
  $ph = $e.PageBounds.Height
  $margin = 10
  $maxW = $pw - ($margin * 2)
  $maxH = $ph - ($margin * 2)
  $sw = $maxW / $img.Width
  $sh = $maxH / $img.Height
  $scale = [Math]::Min($sw, $sh)
  $fw = [int]($img.Width * $scale)
  $fh = [int]($img.Height * $scale)
  $x = [int](($pw - $fw) / 2)
  $y = [int](($ph - $fh) / 2)
  $e.Graphics.DrawImage($img, $x, $y, $fw, $fh)
  $e.HasMorePages = $false
})
$pd.Print()
$img.Dispose()
Write-Host "OK"
`;

  const tempScript = path.join(__dirname, `print_${Date.now()}.ps1`);
  fs.writeFileSync(tempScript, psScript);

  exec(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, (error, stdout, stderr) => {
    try { fs.unlinkSync(tempScript); } catch(e) {}

    if (error) {
      console.error('[PRINT ERROR]', error.message);
      return res.status(500).json({ error: 'Error al imprimir', detail: error.message });
    }

    const db2 = loadDB();
    if (db2.photos[filename]) db2.photos[filename].printed++;
    db2.stats.totalPrinted++;
    saveDB(db2);

    res.json({ success: true, message: `Enviado a ${printerName} en ${printSize} (${orientation})` });
  });
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

// Descargar original
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

// Info de compartir
app.get('/api/share/:filename', (req, res) => {
  const { filename } = req.params;
  const db = loadDB();
  const photo = db.photos[filename];
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

  const shareURL = `https://${PUBLIC_DOMAIN}/foto/${photo.shareCode}`;
  const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareURL)}`;

  res.json({ shareCode: photo.shareCode, shareURL, qrURL, filename: photo.filename, downloaded: photo.downloaded, printed: photo.printed });
});

// Imprimir hoja indice - por lote de fotos, configurable filas x columnas, multi-pagina
app.post('/api/print-index', async (req, res) => {
  const { filenames, cols, rows, printer } = req.body;
  const printerName = printer || DEFAULT_PRINTER;
  const db = loadDB();

  if (!filenames || filenames.length === 0) {
    return res.status(400).json({ error: 'No se enviaron fotos' });
  }

  const numCols = Math.max(1, Math.min(10, parseInt(cols) || 5));
  const numRows = Math.max(1, Math.min(12, parseInt(rows) || 7));
  const perPage = numCols * numRows;
  const totalPages = Math.ceil(filenames.length / perPage);

  console.log(`[INDEX] ${filenames.length} fotos, ${numCols}x${numRows}, ${totalPages} pagina(s)`);

  // A4 a 150 DPI: 1240 x 1754 px
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

      // Titulo
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

    // Imprimir todas las paginas
    let printed = 0;
    for (const indexPath of indexPaths) {
      const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${indexPath.replace(/\\/g, '\\\\')}')
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '${printerName}'
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('A4', 827, 1169)
$pd.add_PrintPage({
  param($sender, $e)
  $e.Graphics.DrawImage($img, 0, 0, $e.PageBounds.Width, $e.PageBounds.Height)
  $e.HasMorePages = $false
})
$pd.Print()
$img.Dispose()
Write-Host "OK"
`;
      const tempScript = path.join(__dirname, `pi_${Date.now()}.ps1`);
      fs.writeFileSync(tempScript, psScript);

      await new Promise((resolve) => {
        exec(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, () => {
          try { fs.unlinkSync(tempScript); } catch(e) {}
          try { fs.unlinkSync(indexPath); } catch(e) {}
          printed++;
          resolve();
        });
      });
    }

    res.json({ success: true, message: `${totalPages} hoja(s) índice impresas (${filenames.length} fotos, ${numCols}x${numRows})` });

  } catch (err) {
    console.error('[INDEX ERROR]', err);
    indexPaths.forEach(p => { try { fs.unlinkSync(p); } catch(e) {} });
    res.status(500).json({ error: 'Error generando hoja indice' });
  }
});

// Stats
app.get('/api/stats', (req, res) => {
  const db = loadDB();
  res.json(db.stats);
});

// Impresoras
app.get('/api/printers', (req, res) => {
  res.json(['EPSON L805 Series', 'EPSON L805 Series (Copiar 1)', 'Canon G1010 series']);
});

// Servir thumbnails (sin cache para dev, con cache en prod)
app.use('/thumbs', express.static(THUMBS_DIR, { maxAge: '1h' }));

// Servir originales (solo para descarga/impresión)
app.use('/uploads', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, express.static(UPLOADS_DIR));

// =================== INICIAR ===================
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n🖨️  FotoShow Print Server v3.0`);
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Red:      http://${localIP}:${PORT}`);
  console.log(`   Internet: https://${PUBLIC_DOMAIN}`);
  console.log(`\n   📸 Abrí http://${localIP}:${PORT} desde tu celular!\n`);
});
