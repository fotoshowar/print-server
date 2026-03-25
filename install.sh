#!/bin/bash
# ============================================
# FotoShow Print Server - Instalador Ubuntu/Raspberry Pi
# ============================================
set -e

echo ""
echo "  =========================================="
echo "  🖨️  FotoShow Print Server - Instalador"
echo "  =========================================="
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

APP_DIR="/opt/fotoshow-print"
APP_USER="fotoshow"

# Verificar root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Ejecuta con sudo: sudo bash install.sh${NC}"
  exit 1
fi

echo -e "${GREEN}[1/7]${NC} Actualizando sistema..."
apt-get update -qq

echo -e "${GREEN}[2/7]${NC} Instalando dependencias..."
apt-get install -y -qq curl git cups cups-client printer-driver-gutenprint > /dev/null 2>&1

# Instalar Node.js 22 si no existe
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  echo -e "${GREEN}[3/7]${NC} Instalando Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
else
  echo -e "${GREEN}[3/7]${NC} Node.js $(node -v) ya instalado ✓"
fi

echo -e "${GREEN}[4/7]${NC} Configurando CUPS..."
# Permitir administración remota de CUPS
cupsctl --remote-admin --remote-any --share-printers
usermod -aG lpadmin root 2>/dev/null || true

# Crear usuario del servicio
if ! id "$APP_USER" &>/dev/null; then
  useradd -r -s /bin/false -d "$APP_DIR" "$APP_USER"
fi
usermod -aG lpadmin "$APP_USER" 2>/dev/null || true

echo -e "${GREEN}[5/7]${NC} Instalando aplicación en $APP_DIR..."
mkdir -p "$APP_DIR"

# Copiar archivos
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/server.js" ]; then
  echo "  Copiando archivos..."
  cp "$SCRIPT_DIR/server.js" "$APP_DIR/"
  cp "$SCRIPT_DIR/package.json" "$APP_DIR/"
  cp "$SCRIPT_DIR/package-lock.json" "$APP_DIR/" 2>/dev/null || true
  cp -r "$SCRIPT_DIR/public" "$APP_DIR/"
else
  echo -e "${RED}No se encontraron archivos del servidor.${NC}"
  exit 1
fi

# Crear directorios
mkdir -p "$APP_DIR/uploads" "$APP_DIR/thumbs"

# Crear .env si no existe
if [ ! -f "$APP_DIR/.env" ]; then
  echo -e "${YELLOW}[!]${NC} Creando .env — EDITALO con tus datos:"
  cat > "$APP_DIR/.env" << 'ENVFILE'
# FotoShow Print Server - Configuración
PORT=3000
DEFAULT_PRINTER=EPSON_L805
PUBLIC_DOMAIN=descarga.fotoshow.online

# VPS Tunnel (opcional)
VPS_HOST=207.148.15.8
VPS_USER=root
VPS_PASSWORD=
VPS_TUNNEL_PORT=3001
ENVFILE
  echo -e "${YELLOW}  Edita: sudo nano $APP_DIR/.env${NC}"
fi

# Instalar dependencias Node
echo -e "${GREEN}[6/7]${NC} Instalando dependencias Node.js..."
cd "$APP_DIR"
npm install --production > /dev/null 2>&1

# Permisos
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo -e "${GREEN}[7/7]${NC} Creando servicios systemd..."

# Servicio principal
cat > /etc/systemd/system/fotoshow-print.service << EOF
[Unit]
Description=FotoShow Print Server
After=network.target cups.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Servicio de túnel SSH (opcional)
cat > /etc/systemd/system/fotoshow-tunnel.service << EOF
[Unit]
Description=FotoShow SSH Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -N -R 0.0.0.0:3001:127.0.0.1:3000 root@207.148.15.8
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Habilitar servicio principal
systemctl daemon-reload
systemctl enable fotoshow-print
systemctl start fotoshow-print

echo ""
echo -e "${GREEN}  =========================================="
echo -e "  ✅ Instalación completa!"
echo -e "  ==========================================${NC}"
echo ""
echo "  🖨️  Print Server:  http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "  Comandos útiles:"
echo "    sudo systemctl status fotoshow-print    # Ver estado"
echo "    sudo systemctl restart fotoshow-print   # Reiniciar"
echo "    sudo journalctl -u fotoshow-print -f    # Ver logs"
echo ""
echo "  Para configurar impresora:"
echo "    http://$(hostname -I | awk '{print $1}'):631    # CUPS Web"
echo ""
echo "  Para activar túnel SSH:"
echo "    1. Edita /opt/fotoshow-print/.env con VPS_PASSWORD"
echo "    2. Configura SSH keys: ssh-copy-id root@207.148.15.8"
echo "    3. sudo systemctl enable --now fotoshow-tunnel"
echo ""
