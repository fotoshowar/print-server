---
name: FotoShow Main Platform
description: Main FotoShow platform - FastAPI, PostgreSQL, Cloudflare R2, AI facial search on VPS Vultr
type: project
originSessionId: 6c02b2ae-48ea-4e50-aae6-3985149bc2d7
---
Plataforma principal de venta de fotos con búsqueda facial IA.

- **URL:** https://fotoshow.online
- **Stack:** FastAPI (Python 3.12), PostgreSQL (Supabase + pgvector), Cloudflare R2, InsightFace + EasyOCR
- **Deploy:** VPS Vultr, Docker, nginx, systemd
- **Pagos:** Mercado Pago
- **Desktop app:** C# (.NET), sync de fotos via API + WebSocket
- **~2150 fotos**, ~1800 con embeddings faciales
- **3 usuarios pro_annual** (vencen 2027-04-04)

**Why:** Negocio de fotografía deportiva donde fotógrafos suben fotos, compradores buscan por selfie (IA facial) y compran.

**How to apply:** El print server en la Raspberry Pi es un componente complementario para ofrecer impresión física además de entrega digital.
