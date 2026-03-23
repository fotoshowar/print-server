# 🖨️ Print Server - Servidor de Impresión Local

Servidor web local para imprimir fotos desde cualquier dispositivo en tu red WiFi.

## ✨ Características

- 📱 **Mobile-friendly** - Diseñado para usar desde el celular
- 📸 **Subir fotos** desde cualquier dispositivo en la red local
- 🖨️ **Imprimir en A4 o 10x15 cm** directo a tu impresora
- 🖼️ **Galería** con vista previa de las fotos subidas
- 🗑️ **Eliminar fotos** que ya no necesites
- 🔒 **100% local** - Nada sale de tu red

## 📋 Requisitos

- **Node.js** >= 18
- **Windows** (usa System.Drawing para imprimir)
- **Impresora** conectada a la PC

## 🚀 Instalación

```bash
git clone https://github.com/TU-USUARIO/print-server.git
cd print-server
npm install
```

## ⚙️ Configuración

Edita la variable `PRINTERS` en `server.js` con tus impresoras:

```javascript
const PRINTERS = {
  'EPSON L805 Series': 'EPSON L805 Series',
  'Canon G1010 series': 'Canon G1010 series'
};
```

## ▶️ Uso

```bash
npm start
```

El servidor arranca en el puerto 3000:
- **Local:** http://localhost:3000
- **Red:** http://TU-IP-LOCAL:3000

Abrí la URL desde tu celular (conectado a la misma red WiFi) y listo!

## 📱 Cómo funciona

1. Abrí la URL en tu celular
2. Tocá **"Seleccionar Fotos"**
3. Las fotos aparecen en la galería
4. Tocá **"🖨️ A4"** o **"📷 10×15"** para imprimir

## 🏗️ Estructura

```
print-server/
├── server.js          # Servidor Express
├── public/
│   └── index.html     # Web app (SPA)
├── uploads/           # Fotos subidas (local)
├── package.json
└── README.md
```

## 📝 API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/upload` | Subir foto (multipart) |
| `GET` | `/api/photos` | Listar fotos |
| `DELETE` | `/api/photos/:filename` | Eliminar foto |
| `POST` | `/api/print` | Imprimir foto |
| `GET` | `/api/printers` | Listar impresoras |

## 🔧 Autostart (Windows)

Para que arranque con Windows, crea un acceso directo a `start.bat` en:
```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

## 📄 Licencia

MIT
