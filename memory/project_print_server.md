---
name: Print Server on Raspberry Pi
description: Local print server running on Raspberry Pi exposed via Cloudflare tunnel at fotoshow.site
type: project
originSessionId: 6c02b2ae-48ea-4e50-aae6-3985149bc2d7
---
Print server Node.js corriendo en Raspberry Pi (usuario fotoshow, Linux ARM64).

- **Ubicación:** /home/fotoshow/print-server/
- **Puerto:** 3000 (localhost)
- **Dominio público:** fotoshow.site (via Cloudflare Tunnel)
- **Tunnel ID:** a62b9fd1-9391-4c0c-b10f-311a40141d63 (nombre: fotoshow-tunnel)
- **Impresora:** EPSON L805
- **Stack:** Express + Sharp + Multer + EXIF tools
- **Servicios systemd:** node server.js + cloudflared tunnel

**Why:** El print server permite ofrecer impresión física de fotos vendidas en la plataforma FotoShow. Corre local en la Raspberry Pi conectada a la impresora EPSON L805.

**How to apply:** El servidor principal (VPS en Vultr, fotoshow.online) se comunica con este print server (fotoshow.site) para enviar trabajos de impresión.
