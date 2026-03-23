const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configurar almacenamiento de fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `foto-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imagenes'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB max
});

// Impresoras disponibles
const PRINTERS = {
  'EPSON L805 Series': 'EPSON L805 Series',
  'EPSON L805 Series (Copiar 1)': 'EPSON L805 Series (Copiar 1)',
  'Canon G1010 series': 'Canon G1010 series'
};

// =================== RUTAS API ===================

// Subir foto
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibio ninguna imagen' });
  }
  res.json({
    success: true,
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`,
    size: req.file.size
  });
});

// Listar fotos subidas
app.get('/api/photos', (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  const files = fs.readdirSync(uploadsDir)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .map(f => {
      const stats = fs.statSync(path.join(uploadsDir, f));
      return {
        filename: f,
        path: `/uploads/${f}`,
        size: stats.size,
        date: stats.mtime
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json(files);
});

// Eliminar foto
app.delete('/api/photos/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, 'uploads', filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
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

  const printerName = printer || 'EPSON L805 Series';
  const printSize = size || 'A4'; // A4 o 10x15

  console.log(`Imprimiendo: ${filename} en ${printerName} - ${printSize}`);

  // Script PowerShell de impresion
  const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${filepath.replace(/\\/g, '\\\\')}')
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '${printerName}'

# Configurar tamanio de papel
$paperWidth = ${printSize === 'A4' ? '827' : '394'}
$paperHeight = ${printSize === 'A4' ? '1169' : '591'}
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('${printSize}', $paperWidth, $paperHeight)

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
    fs.unlinkSync(tempScript); // Limpiar script temporal

    if (error) {
      console.error('Error al imprimir:', error);
      return res.status(500).json({ error: 'Error al imprimir', detail: error.message });
    }

    if (stdout.trim() === 'OK') {
      res.json({ success: true, message: `Foto enviada a ${printerName} en tamanio ${printSize}` });
    } else {
      res.json({ success: true, message: 'Trabajo de impresion enviado' });
    }
  });
});

// Servir fotos subidas
app.use('/uploads', express.static('uploads'));

// Listar impresoras
app.get('/api/printers', (req, res) => {
  res.json(Object.keys(PRINTERS));
});

// =================== INICIAR SERVIDOR ===================
app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }
  console.log(`\n🖨️  Servidor de impresion corriendo!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Red:     http://${localIP}:${PORT}`);
  console.log(`\n   Abre http://${localIP}:${PORT} desde tu celular!\n`);
});
