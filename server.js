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
const https = require('https');

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

// Crea un canvas A4 con la foto en la mitad superior (A5 landscape), devuelve PDF
async function prepareA5Canvas(filepath) {
  const A4_W = 2480, A4_H = 3508;
  const A5_W = 2480, A5_H = 1748;

  const resized = await sharp(filepath)
    .resize(A5_W, A5_H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const base = filepath.replace(/\.[^.]+$/, '') + `_a5_${Date.now()}`;
  const tempJpeg = base + '.jpg';
  const tempPdf  = base + '.pdf';

  await sharp({ create: { width: A4_W, height: A4_H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: resized, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .withMetadata({ density: 300 })
    .toFile(tempJpeg);

  await new Promise((resolve, reject) => {
    exec(`img2pdf -o "${tempPdf}" "${tempJpeg}"`, (err) => {
      try { fs.unlinkSync(tempJpeg); } catch(e) {}
      if (err) reject(new Error('img2pdf falló: ' + err.message));
      else resolve();
    });
  });

  return tempPdf;
}

// Linux/Pi: verifica impresora disponible y luego imprime con CUPS
function checkPrinterStatus(printerName) {
  return new Promise((resolve) => {
    exec(`lpstat -p "${printerName}" 2>&1`, (error, stdout) => {
      const output = (stdout || '').toLowerCase();
      if (output.includes('disabled') || output.includes('not accepting')) {
        resolve({ available: false, reason: stdout.trim() });
      } else if (output.includes('idle') || output.includes('ready') || output.includes('printing') || output.includes('enabled')) {
        resolve({ available: true, reason: stdout.trim() });
      } else if (error) {
        resolve({ available: false, reason: `Impresora no encontrada: ${printerName}` });
      } else {
        // Si lpstat no da info clara, intentar igual
        resolve({ available: true, reason: stdout.trim() });
      }
    });
  });
}

function printWithCUPS(filepath, printerName, options = {}) {
  return new Promise(async (resolve, reject) => {
    const safeName = (printerName && /^[a-zA-Z0-9_-]+$/.test(printerName)) ? printerName : DEFAULT_PRINTER;

    const status = await checkPrinterStatus(safeName);
    if (!status.available) {
      console.error(`[CUPS] ❌ Impresora no disponible: ${status.reason}`);
      return reject(new Error(`Impresora no disponible: ${status.reason}`));
    }

    let printPath = filepath;
    let tempFile = null;
    if (options.size === 'a5') {
      console.log(`[CUPS] Preparando canvas A5...`);
      tempFile = await prepareA5Canvas(filepath);
      printPath = tempFile;
    }

    const mediaType = options.mediaType || 'PMPHOTO_NORMAL';
    const quality = options.quality || 'Normal';
    const safePath = printPath.replace(/'/g, "'\\''");
    const cmd = `lp -d '${safeName}' -o MediaType=${mediaType} -o PrintQuality=${quality} '${safePath}'`;
    console.log(`[CUPS] cmd: ${cmd}`);

    exec(cmd, (error, stdout, stderr) => {
      if (tempFile) try { fs.unlinkSync(tempFile); } catch(e) {}
      if (error) {
        console.error(`[CUPS] ❌ Error lp: ${stderr || error.message}`);
        reject(new Error(stderr || error.message));
      } else {
        const jobId = stdout.trim();
        console.log(`[CUPS] ✅ Trabajo enviado: ${jobId}`);
        resolve(jobId);
      }
    });
  });
}

function printFile(filepath, printerName, options = {}) {
  if (IS_WINDOWS) return printWithPS(filepath, printerName, options);
  return printWithCUPS(filepath, printerName, options);
}

// =================== CONFIG (auth) ===================

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {};
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// =================== RUTAS AUTH ===================

// Callback que recibe el token de fotoshow.online tras el login con Google
app.get('/auth/callback', (req, res) => {
  const { token, name, id } = req.query;
  if (!token) return res.status(400).send('Token faltante');

  const cfg = loadConfig();
  cfg.photographer = { id: parseInt(id), name: decodeURIComponent(name), token };
  saveConfig(cfg);

  const safeName = JSON.stringify(decodeURIComponent(name));
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Conectado</title>
<style>body{font-family:sans-serif;background:#0a0a0a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;}
.ok{font-size:2rem;color:#ADFF2F;}</style></head><body>
<div class="ok">✓</div><p>Conectado como <strong>${safeName.slice(1,-1)}</strong></p><p style="color:#666;font-size:0.85rem">Podés cerrar esta ventana.</p>
<script>
  try { window.opener && window.opener.postMessage({ type:'auth-success', name:${safeName} }, '*'); } catch(e){}
  setTimeout(() => window.close(), 1500);
</script></body></html>`);
});

app.get('/api/auth/status', (req, res) => {
  const cfg = loadConfig();
  if (cfg.photographer?.token) {
    res.json({ connected: true, name: cfg.photographer.name, id: cfg.photographer.id });
  } else {
    res.json({ connected: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const cfg = loadConfig();
  delete cfg.photographer;
  saveConfig(cfg);
  res.json({ success: true });
});

// =================== RUTAS CLOUD (proxy a fotoshow.online) ===================

const FOTOSHOW_BASE = process.env.FOTOSHOW_API_BASE || 'https://fotoshow.online';

function getToken() {
  return loadConfig().photographer?.token || null;
}

function cloudRequest(method, endpoint, body = null) {
  const token = getToken();
  if (!token) return Promise.reject(new Error('No autenticado'));

  const bodyStr = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    function doRequest(urlStr) {
      const url = new URL(urlStr);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      };
      if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

      const req = https.request(options, res => {
        if (res.statusCode === 307 || res.statusCode === 301 || res.statusCode === 302) {
          return doRequest(res.headers.location);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    }
    doRequest(FOTOSHOW_BASE + endpoint);
  });
}

// Listar galerías del fotógrafo
app.get('/api/cloud/galleries', async (req, res) => {
  try {
    const r = await cloudRequest('GET', '/api/galleries');
    res.status(r.status).json(r.body);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Crear galería
app.post('/api/cloud/galleries', async (req, res) => {
  try {
    const r = await cloudRequest('POST', '/api/galleries', req.body);
    res.status(r.status).json(r.body);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

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

// Imprimir foto — idéntico al print-agent: foto original directo a CUPS
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

  console.log(`[PRINT] ${filename} -> ${printer || 'default'} (${size || 'a4'})`);

  try {
    const jobId = await printFile(filepath, printer, { size });

    const db2 = loadDB();
    if (db2.photos[filename]) db2.photos[filename].printed++;
    db2.stats.totalPrinted++;
    saveDB(db2);

    res.json({ success: true, message: 'Enviado a imprimir', job: jobId });
  } catch (err) {
    console.error('[PRINT ERROR]', err.message);
    res.status(500).json({ error: 'Error al imprimir', detail: err.message });
  }
});

// Mantener /api/print-hd y /api/print-crop como alias
app.post('/api/print-hd', (req, res) => {
  req.body.printer = req.body.printer || 'EPSON_L805';
  return app._router.handle(Object.assign(req, { url: '/api/print', method: 'POST' }), res, () => {});
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

app.get('/api/camera/status', (req, res) => {
  try {
    if (fs.existsSync('/tmp/camara_status.json')) {
      res.json(JSON.parse(fs.readFileSync('/tmp/camara_status.json', 'utf8')));
    } else {
      res.json({ state: 'offline', message: 'Monitor no iniciado' });
    }
  } catch(e) {
    res.json({ state: 'offline', message: 'Error leyendo estado' });
  }
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

// Estado detallado de la impresora — combina lpstat + log CUPS
app.get('/api/printer-status', (req, res) => {
  if (IS_WINDOWS) return res.json({ status: 'unknown', message: 'Windows', available: true });
  const printer = DEFAULT_PRINTER || 'EPSON_L805';

  // Correr los tres queries en paralelo
  Promise.all([
    // 1. Estado básico CUPS
    new Promise(resolve => exec(`lpstat -p "${printer}" 2>&1`, (e, o) => resolve(o || ''))),
    // 2. Últimas 60 líneas del log buscando errores de hardware
    new Promise(resolve => exec('tail -60 /var/log/cups/error_log 2>/dev/null', (e, o) => resolve(o || ''))),
    // 3. Cola actual
    new Promise(resolve => exec('lpstat -o 2>/dev/null', (e, o) => resolve(o || ''))),
  ]).then(([lpOut, logOut, queueOut]) => {
    const out = lpOut.trim();
    let status = 'unknown';
    let printingJob = null;
    let alerts = [];

    // Estado CUPS
    if (out.includes('is idle')) status = 'idle';
    else if (out.includes('now printing')) {
      status = 'printing';
      const m = out.match(/printing (\S+?)\./);
      if (m) printingJob = m[1];
    } else if (out.includes('stopped') || out.includes('disabled') || out.includes('not ready')) {
      status = 'error';
    }

    // Parsear log — solo errores de los últimos 5 minutos
    const logLines = logOut.split('\n');
    const jobErrors = [];
    let lastStateReason = 'none';
    let paperEmpty = false;
    let filterFail = false;
    const RECENT_MS = 5 * 60 * 1000; // 5 minutos
    const now = Date.now();

    for (const line of logLines) {
      if (!line.includes(printer) && !line.includes('Job')) continue;

      // Extraer timestamp del log: [27/May/2026:09:13:12 -0300]
      const tsMatch = line.match(/\[(\d{2}\/\w+\/\d{4}:\d{2}:\d{2}:\d{2})\s([+-]\d{4})\]/);
      if (tsMatch) {
        const parsed = new Date(`${tsMatch[1].replace(/\//g, ' ').replace(/:/, ' ')} ${tsMatch[2]}`);
        if (!isNaN(parsed) && (now - parsed.getTime()) > RECENT_MS) continue; // ignorar si >5min
      }

      if (line.includes('printer-state-reasons=') && !line.includes('=none')) {
        const m = line.match(/printer-state-reasons=(\S+)/);
        if (m) lastStateReason = m[1];
      }
      if (/media.empty|media.needed|out.of.paper|no.paper|paper.out/i.test(line)) {
        paperEmpty = true;
        if (!alerts.includes('Sin papel')) alerts.push('Sin papel — revisá la bandeja');
      }
      if (/imagetoraster.*status 1|filter.*stopped.*status 1|The print file could not/i.test(line)) {
        filterFail = true;
      }
      if (/ERROR.*Job|Job.*ERROR/i.test(line)) {
        const m = line.match(/\[Job (\d+)\].*?ERROR[:\s]+(.{0,80})/i);
        if (m && !jobErrors.includes(m[2])) jobErrors.push(`Job ${m[1]}: ${m[2].trim()}`);
      }
    }

    // Detectar trabajo stuck en cola
    const queueJobs = queueOut.trim().split('\n').filter(Boolean);
    const stuckJobs = queueJobs.filter(l => {
      const dateMatch = l.match(/(\w{3} \d{1,2} \w{3} \d{4})/);
      if (!dateMatch) return false;
      const jobDate = new Date(dateMatch[0]);
      return (Date.now() - jobDate.getTime()) > 5 * 60 * 1000; // >5 min = stuck
    });

    if (filterFail) alerts.push('Error de filtro (imagetoraster) — convertir foto');
    if (stuckJobs.length) alerts.push(`${stuckJobs.length} trabajo(s) posiblemente atascado(s)`);
    if (lastStateReason !== 'none') alerts.push(`Estado impresora: ${lastStateReason}`);

    // Si CUPS dice idle pero hay alertas del log, promover a warning
    if (status === 'idle' && alerts.length) status = 'warning';

    res.json({
      status,
      message: out,
      printing_job: printingJob,
      printer,
      available: !['error'].includes(status),
      alerts,
      last_state_reason: lastStateReason,
      paper_empty: paperEmpty,
      filter_error: filterFail,
      queue_count: queueJobs.filter(Boolean).length,
    });
  });
});

// Servir archivos
// =================== FOTOS CÁMARA ===================
const FOTOS_DIR = path.join(__dirname, 'uploads');
const FOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.arw', '.cr2', '.nef', '.raw']);

function esFoto(nombre) {
  return FOTO_EXT.has(path.extname(nombre).toLowerCase());
}

// Listar carpetas
app.get('/api/fotos', (req, res) => {
  if (!fs.existsSync(FOTOS_DIR)) return res.json([]);
  const items = fs.readdirSync(FOTOS_DIR);
  const carpetas = [];
  // Fotos sueltas en raíz
  const sueltas = items.filter(f => {
    try { return fs.statSync(path.join(FOTOS_DIR, f)).isFile() && esFoto(f); } catch { return false; }
  });
  if (sueltas.length) carpetas.push({ nombre: '_raiz', cantidad: sueltas.length });
  // Subcarpetas
  items.filter(f => {
    try { return fs.statSync(path.join(FOTOS_DIR, f)).isDirectory(); } catch { return false; }
  }).sort().reverse().forEach(dir => {
    const fotos = fs.readdirSync(path.join(FOTOS_DIR, dir)).filter(esFoto);
    carpetas.push({ nombre: dir, cantidad: fotos.length });
  });
  res.json(carpetas);
});

// Listar fotos de una carpeta
app.get('/api/fotos/:carpeta', (req, res) => {
  const base = req.params.carpeta === '_raiz' ? FOTOS_DIR : path.join(FOTOS_DIR, req.params.carpeta);
  if (!fs.existsSync(base)) return res.status(404).json({ error: 'No encontrada' });
  const fotos = fs.readdirSync(base).filter(f => {
    try { return fs.statSync(path.join(base, f)).isFile() && esFoto(f); } catch { return false; }
  }).sort();
  res.json({ carpeta: req.params.carpeta, fotos });
});

// Servir foto individual
app.get('/api/fotos/:carpeta/imagen/:filename', (req, res) => {
  const base = req.params.carpeta === '_raiz' ? FOTOS_DIR : path.join(FOTOS_DIR, req.params.carpeta);
  const ruta = path.join(base, req.params.filename);
  if (!ruta.startsWith(FOTOS_DIR) || !fs.existsSync(ruta)) return res.status(404).send('No encontrada');
  res.sendFile(ruta);
});

// Descargar carpeta como ZIP usando comando zip del sistema
app.get('/api/fotos/:carpeta/zip', (req, res) => {
  const carpeta = req.params.carpeta;
  const base = carpeta === '_raiz' ? FOTOS_DIR : path.join(FOTOS_DIR, carpeta);
  if (!fs.existsSync(base)) return res.status(404).send('No encontrada');

  const fotos = fs.readdirSync(base).filter(f => {
    try { return fs.statSync(path.join(base, f)).isFile() && esFoto(f); } catch { return false; }
  });
  if (!fotos.length) return res.status(404).send('No hay fotos');

  const nombreZip = `fotos_${carpeta}.zip`;
  res.setHeader('Content-Disposition', `attachment; filename="${nombreZip}"`);
  res.setHeader('Content-Type', 'application/zip');

  const archivos = fotos.map(f => `"${path.join(base, f)}"`).join(' ');
  const proc = exec(`zip -j - ${archivos}`);
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => console.error('[ZIP]', d));
  proc.on('error', err => { console.error('[ZIP error]', err); res.status(500).end(); });
});

// Página fotos cámara
app.get('/fotos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'fotos.html')));

// Página cola de impresión
app.get('/queue', (req, res) => res.sendFile(path.join(__dirname, 'public', 'queue.html')));

// Limpiar estado: cancelar todo + re-habilitar impresora
app.post('/api/printer-reset', (req, res) => {
  const printer = DEFAULT_PRINTER || 'EPSON_L805';
  exec(`cancel -a "${printer}" ; cupsenable "${printer}" ; cupsaccept "${printer}"`, (err, stdout, stderr) => {
    res.json({ success: true, message: 'Cola limpiada e impresora re-habilitada' });
  });
});

// Últimas líneas del log de CUPS (solo errores/warnings)
app.get('/api/cups-log', (req, res) => {
  exec('tail -40 /var/log/cups/error_log 2>/dev/null', (err, stdout) => {
    if (err || !stdout) return res.json({ lines: [] });
    const lines = stdout.trim().split('\n')
      .filter(l => /\[Job|ERROR|WARN|imagetoraster|filter|stopped/.test(l))
      .slice(-20);
    res.json({ lines });
  });
});

// Carrusel — fotos de la última N hora(s)
app.get('/api/carrusel', (req, res) => {
  const ahora = Date.now();
  const horas = Math.max(0.5, Math.min(24, parseFloat(req.query.horas) || 1));
  const limite = horas * 3600 * 1000;
  const fotos = [];

  if (!fs.existsSync(UPLOADS_DIR)) return res.json({ fotos: [], total: 0 });

  function scanDir(dir) {
    let items;
    try { items = fs.readdirSync(dir); } catch(e) { return; }
    for (const item of items) {
      const full = path.join(dir, item);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          scanDir(full);
        } else if (esFoto(item) && (ahora - stat.mtimeMs) <= limite) {
          const rel = path.relative(UPLOADS_DIR, full).replace(/\\/g, '/');
          const parts = rel.split('/');
          const carpeta = parts.length > 1 ? parts[0] : '_raiz';
          fotos.push({
            filename: item,
            carpeta,
            url: `/uploads/${rel}`,
            thumb: `/thumbs/${rel}`,
            mtime: stat.mtimeMs,
          });
        }
      } catch(e) {}
    }
  }

  scanDir(UPLOADS_DIR);
  fotos.sort((a, b) => a.mtime - b.mtime);
  res.json({ fotos, total: fotos.length, horas });
});

app.get('/carrusel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'carrusel.html')));

app.use('/thumbs', express.static(THUMBS_DIR, { maxAge: '1h' }));
app.use('/uploads', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, express.static(UPLOADS_DIR));

// =================== PROXY WIFI MANAGER (/redes) ===================
const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Terminal web (/terminal → ttyd :7681)
const terminalProxy = createProxyMiddleware({
  target: 'http://localhost:7681',
  changeOrigin: true,
  ws: true,
});
app.use('/terminal', terminalProxy);

app.use('/redes', (req, res) => {
  const target = req.url || '/';
  const options = {
    hostname: 'localhost',
    port: 80,
    path: target,
    method: req.method,
    headers: { ...req.headers, host: 'localhost' },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxy.on('error', () => res.status(502).send('WiFi Manager no disponible'));
  req.pipe(proxy, { end: true });
});

// =================== INICIAR ===================
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/terminal')) {
    req.url = req.url.replace(/^\/terminal/, '') || '/';
    terminalProxy.upgrade(req, socket, head);
  }
});
server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n🖨️  FotoShow Print Server v3.0 (Windows)`);
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Red:      http://${localIP}:${PORT}`);
  console.log(`   Internet: https://${PUBLIC_DOMAIN}`);
  console.log(`\n   📸 Abrí http://${localIP}:${PORT} desde tu celular!\n`);
});
