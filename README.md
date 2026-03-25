# 🖨️ FotoShow Print Server — Linux / Raspberry Pi

Sistema de impresión de fotos para eventos con acceso web local y opcionalmente desde internet.

## Características

- 📱 **Web app responsiva** - funciona en celular y PC
- 🖨️ **Impresión automática** - A4/A5, detecta orientación
- 📋 **Hojas de contacto/índice** - configurable filas x columnas
- 🔄 **Auto-rotate** - corrige orientación desde EXIF
- 📊 **Organizado por fecha** - separa las fotos por día
- 🖼️ **Thumbnails rápidos** - carga instantánea
- 🌐 **Túnel SSH opcional** - acceso desde internet (descarga.fotoshow.online)

## Requisitos

- Ubuntu 20.04+ o Raspberry Pi OS (Bullseye/Bookworm)
- Impresora conectada (USB o red) con CUPS
- 2GB RAM mínimo (Raspberry Pi 4 recomendado)

## Instalación

```bash
# Clonar
git clone https://github.com/fotoshowar/print-pi.git
cd print-pi

# Instalar (como root)
sudo bash install.sh
```

El instalador automáticamente:
- Instala Node.js 22
- Configura CUPS
- Crea servicios systemd
- Habilita arranque automático

## Configurar impresora

### Opción 1: CUPS Web (recomendado)

1. Abrir `http://IP-RASPBERRY:631` en el navegador
2. Ir a "Administration" → "Add Printer"
3. Seleccionar la impresora y configurar driver
4. Marcar "Share This Printer"

### Opción 2: Comando

```bash
# Listar impresoras disponibles
lpstat -p

# Agregar impresora EPSON L805 (ejemplo)
sudo lpadmin -p EPSON_L805 -E -v usb://EPSON/L805 -m everywhere

# Setear como default
sudo lpoptions -d EPSON_L805

# Editar .env con el nombre de la impresora
sudo nano /opt/fotoshow-print/.env
# DEFAULT_PRINTER=EPSON_L805
```

## Uso

```bash
# Abrir en navegador
# Local:    http://localhost:3000
# Red:      http://192.168.1.X:3000
# Internet: https://descarga.fotoshow.online (con túnel activo)
```

### Subir fotos
- Arrastrar o seleccionar hasta 200 fotos
- Se organizan por fecha automáticamente

### Imprimir
- Tocar la foto → vista previa
- Botones A4/A5 → imprime con orientación correcta

### Hoja índice
- Aparece después de subir +10 fotos
- O botón "Índice" en cada día
- Seleccionar filas x columnas (3-8 × 4-10)
- Múltiples hojas si no entran todas

### Compartir
- Tocar "📤 QR" → código para descargar foto
- QR scaneable con cualquier app

## Comandos

```bash
# Estado del servicio
sudo systemctl status fotoshow-print

# Reiniciar servicio
sudo systemctl restart fotoshow-print

# Ver logs en tiempo real
sudo journalctl -u fotoshow-print -f

# Parar servicio
sudo systemctl stop fotoshow-print
```

## Túnel SSH (acceso internet)

```bash
# 1. Configurar SSH keys (una sola vez)
sudo ssh-keygen -t ed25519 -f /root/.ssh/fotoshow_key -N ""
sudo ssh-copy-id -i /root/.ssh/fotoshow_key root@207.148.15.8

# 2. Activar túnel
sudo systemctl enable --now fotoshow-tunnel

# 3. Tu app queda en https://descarga.fotoshow.online
```

## Raspberry Pi como hotspot WiFi

```bash
# Instalar hostapd y dnsmasq
sudo apt install hostapd dnsmasq

# Configurar /etc/hostapd/hostapd.conf:
cat << EOF | sudo tee /etc/hostapd/hostapd.conf
interface=wlan0
driver=nl80211
ssid=FotoShow
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=fotos2026
wpa_key_mgmt=WPA-PSK
wpa_pairwise=CCMP
EOF

# Configurar dnsmasq para DHCP en 192.168.4.x
# Los clientes se conectan al WiFi "FotoShow"
# y acceden a http://192.168.4.1:3000
```

## Estructura

```
/opt/fotoshow-print/
├── server.js          # Servidor (CUPS)
├── public/
│   └── index.html     # Web app
├── uploads/           # Fotos originales por día
├── thumbs/            # Thumbnails por día
├── db.json            # Base de datos
└── .env               # Configuración
```

## Configuración (.env)

```env
PORT=3000
DEFAULT_PRINTER=EPSON_L805
PUBLIC_DOMAIN=descarga.fotoshow.online

VPS_HOST=207.148.15.8
VPS_USER=root
VPS_PASSWORD=
VPS_TUNNEL_PORT=3001
```

## Troubleshooting

### Impresora no imprime
```bash
# Verificar impresora detectada
lpstat -p

# Ver cola de impresión
lpq

# Cancelar trabajos pendientes
cancel -a

# Probar impresión manual
echo "Test" | lpr -d EPSON_L805
```

### Servicio no arranca
```bash
# Ver logs detallados
sudo journalctl -u fotoshow-print -n 50 --no-pager

# Verificar puerto ocupado
sudo lsof -i :3000
```

### Túnel SSH falla
```bash
# Verificar conexión SSH
ssh -v root@207.148.15.8

# Verificar puerto en VPS
ssh root@207.148.15.8 "netstat -tuln | grep 3001"
```

## Soporte

- Impresoras soportadas: CUPS (HP, EPSON, Canon, Brother, etc.)
- Pi 4B recomendado para +100 fotos/día
- USB WiFi para mejor estabilidad

## Licencia

MIT - FotoShow 2024
