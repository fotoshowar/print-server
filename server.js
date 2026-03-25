require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// =================== CONFIGURACION ===================

const PRINTERS = {
  'EPSON L805 Series': 'EPSON L805 Series',
  'EPSON L805 Series (Copiar 1)': 'EPSON L805 Series (Copiar 1)',
  'Canon G1010 series': 'Canon G1010 series'
};

const DEFAULT_PRINTER = 'EPSON L805 Series';

// Base de datos simple en JSON
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
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `foto-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imagenes'));
  },
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
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
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// =================== RUTAS API ===================

// Subir foto(s)
app.post('/api/upload', upload.array('photos', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron imagenes' });
  }

  const db = loadDB();
  const results = req.files.map(file => {
    const shareCode = generateShareCode();
    const photoData = {
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      shareCode,
      uploadedAt: new Date().toISOString(),
      printed: 0,
      downloaded: 0
    };
    db.photos[file.filename] = photoData;
    db.stats.totalUploaded++;
    return photoData;
  });

  saveDB(db);

  res.json({ success: true, photos: results });
});

// Listar fotos
app.get('/api/photos', (req, res) => {
  const db = loadDB();
  const uploadsDir = path.join(__dirname, 'uploads');

  const photos = Object.values(db.photos)
    .filter(p => fs.existsSync(path.join(uploadsDir, p.filename)))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  res.json(photos);
});

// Eliminar foto
app.delete('/api/photos/:filename', (req, res) => {
  const { filename } = req.params;
  const filepath = path.join(__dirname, 'uploads', filename);
  const db = loadDB();

  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    delete db.photos[filename];
    saveDB(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Foto no encontrada' });
  }
});

// Imprimir foto
app.post('/api/print', (req, res) => {
  const { filename, printer, size } = req.body;

  if (!filename) return res.status(400).json({ error: 'Falta el nombre del archivo' });

  const filepath = path.join(__dirname, 'uploads', filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Foto no encontrada' });
  }

  const printerName = printer || DEFAULT_PRINTER;
  const printSize = size || 'A4'; // A4 o A5

  // Dimensiones en centesimas de pulgada
  // A4: 210mm x 297mm = 8.27" x 11.69" = 827 x 1169
  // A5: 148mm x 210mm = 5.83" x 8.27" = 583 x 827
  const dimensions = {
    'A4': { w: 827, h: 1169 },
    'A5': { w: 583, h: 827 }
  };

  const dim = dimensions[printSize] || dimensions['A4'];

  console.log(`[PRINT] ${filename} -> ${printerName} (${printSize})`);

  const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${filepath.replace(/\\/g, '\\\\')}')
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '${printerName}'
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('${printSize}', ${dim.w}, ${dim.h})
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

    // Actualizar stats
    const db = loadDB();
    if (db.photos[filename]) db.photos[filename].printed++;
    db.stats.totalPrinted++;
    saveDB(db);

    res.json({ success: true, message: `Enviado a ${printerName} en ${printSize}` });
  });
});

// =================== COMPARTIR / DESCARGAR ===================

// Pagina publica de descarga por codigo
app.get('/foto/:code', (req, res) => {
  const { code } = req.params;
  const db = loadDB();

  const photo = Object.values(db.photos).find(p => p.shareCode === code.toUpperCase());
  if (!photo) return res.status(404).send('Foto no encontrada');

  const localIP = getLocalIP();

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📸 Descarga tu foto</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { background: white; border-radius: 20px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
    .card img { width: 100%; border-radius: 12px; margin: 16px 0; }
    .card h2 { font-size: 1.3rem; margin-bottom: 4px; }
    .card p { color: #6b7280; font-size: 0.9rem; margin-bottom: 16px; }
    .download-btn { display: inline-block; background: #2563eb; color: white; border: none; border-radius: 12px; padding: 14px 32px; font-size: 1.1rem; font-weight: 700; text-decoration: none; cursor: pointer; transition: background 0.2s; width: 100%; }
    .download-btn:hover { background: #1d4ed8; }
    .logo { font-size: 2rem; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">📸</div>
    <h2>Tu Foto</h2>
    <p>Codigo: ${photo.shareCode}</p>
    <img src="/uploads/${photo.filename}" alt="Foto">
    <a href="/api/download/${photo.filename}" class="download-btn">⬇️ Descargar Foto</a>
  </div>
</body>
</html>`);
});

// Descargar foto (fuerza descarga)
app.get('/api/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filepath = path.join(__dirname, 'uploads', filename);

  if (!fs.existsSync(filepath)) return res.status(404).send('Foto no encontrada');

  // Actualizar stats
  const db = loadDB();
  if (db.photos[filename]) db.photos[filename].downloaded++;
  db.stats.totalDownloaded++;
  saveDB(db);

  res.download(filepath, `foto-${Date.now()}.jpg`);
});

// Obtener info de compartir (codigo + QR URL)
app.get('/api/share/:filename', (req, res) => {
  const { filename } = req.params;
  const db = loadDB();
  const photo = db.photos[filename];

  if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

  // Usar dominio publico si existe, sino IP local
  const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'descarga.fotoshow.online';
  const shareURL = `https://${PUBLIC_DOMAIN}/foto/${photo.shareCode}`;

  // URL para generar QR via API publica
  const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareURL)}`;

  res.json({
    shareCode: photo.shareCode,
    shareURL,
    qrURL,
    filename: photo.filename,
    downloaded: photo.downloaded,
    printed: photo.printed
  });
});

// Stats
app.get('/api/stats', (req, res) => {
  const db = loadDB();
  res.json(db.stats);
});

// Listar impresoras
app.get('/api/printers', (req, res) => {
  res.json(Object.keys(PRINTERS));
});

// Servir fotos (sin cache)
app.use('/uploads', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}, express.static('uploads'));

// =================== INICIAR ===================
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n🖨️  Print Server corriendo!`);
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Red:      http://${localIP}:${PORT}`);
  console.log(`   Fotos:    http://${localIP}:${PORT}/foto/CODIGO`);
  console.log(`\n   Abre http://${localIP}:${PORT} desde tu celular!\n`);
});
