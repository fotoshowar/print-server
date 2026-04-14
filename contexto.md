# FotoShow - Contexto del Proyecto

## 📋 INFORMACIÓN GENERAL

**Nombre:** FotoShow  
**Descripción:** Plataforma de venta de fotos con búsqueda facial IA para eventos deportivos, conciertos y clubes.  
**URL principal:** https://fotoshow.online  
**Repositorio:** https://github.com/fotoshowar/fotoshow-v2  
**Stack:** FastAPI (Python), PostgreSQL (Supabase), Cloudflare R2 (storage), Next.js-like HTML/JS  
**Deployment:** VPS en Vultr, Docker, nginx, systemd  

---

## 🗂️ ESTRUCTURA DE ARCHIVOS

```
/root/fotoshow/
├── main.py                 # Entry point, routes estáticos, PWA
├── config.py               # Configuración (DB, R2, AI, Google, etc.)
├── database.py             # Session DB, init_db
├── models.py               # SQLAlchemy models (Photographer, Gallery, Photo, Order, etc.)
├── schemas.py              # Pydantic schemas (API request/response)
├── requirements.txt        # Dependencias Python
├── ai_worker.py            # Worker IA (InsightFace + EasyOCR) - TCP server puerto 54321
├── static/                 # Archivos estáticos (HTML, CSS, JS)
│   ├── index.html          # Home
│   ├── dashboard.html      # Panel del fotógrafo
│   ├── gallery.html        # Galería pública
│   ├── galleries.html     # Lista de galerías del fotógrafo
│   ├── photographer.html  # Perfil público del fotógrafo
│   ├── clubes.html        # Landing page para clubes
│   ├── delivery.html      # Página de entrega de fotos compradas
│   ├── mis-fotos.html     # Fotos compradas por el usuario
│   └── css/fotoshow.css   # Estilos comunes
├── routers/
│   ├── auth.py            # Autenticación (Google OAuth, buyer login)
│   ├── public.py          # API pública (galerías, búsqueda facial, etc.)
│   ├── galleries.py       # CRUD de galerías
│   ├── orders.py          # Creación de órdenes, checkout, reenvío de entrega
│   ├── photos.py          # Upload de fotos, rotación, eliminación
│   ├── buyer.py           # Vista de compras del usuario
│   ├── mercadopago.py     # Webhook de MP, integración de pagos
│   ├── desktop.py         # API para app desktop (sync, notificaciones WS)
│   ├── delivery.py        # Gestión de tokens de entrega
│   └── whatsapp.py        # Bot de WhatsApp
├── services/
│   ├── ai_service.py      # Cliente HTTP/TCP para AI worker
│   ├── watermark_service.py # Generación de watermark con Pillow
│   ├── storage.py         # Abstracción de storage (S3/R2/local)
│   ├── r2_service.py      # Cloudflare R2 implementation
│   ├── mp_service.py      # Mercado Pago API
│   └── email_service.py   # Envío de emails con Resend
├── alembic/               # Migraciones de DB
└── deploy/                # Scripts de deployment, docker-compose
```

---

## 🏗️ MODELO DE DATOS

### Entidades principales

**Photographer** - Fotógrafo
- `id`, `email`, `name`, `alias`, `password`
- `phone`, `wa_phone` (WhatsApp conectado al bot)
- `mp_access_token`, `mp_user_id` (Mercado Pago)
- `plan`, `plan_expires_at` (free, pro_monthly, pro_annual)
- `commission_rate` (comisión de plataforma, default 0.10)

**Gallery** - Galería
- `id`, `photographer_id`, `name`, `description`
- `location`, `event_date`, `cover_photo_url`
- `price_per_photo`
- `status`: draft | active | inactive | private
- `visits`

**Photo** - Foto
- `id`, `gallery_id`, `photographer_id`, `filename`, `file_size`, `width`, `height`
- `s3_key` (original en R2)
- `s3_thumbnail_key` (800px)
- `s3_watermark_key` (full-res con watermark)
- `tiny_thumb` (base64 32x32 para preview)
- `faces_count`, `bib_numbers`, `processed`, `ocr_processed`
- `face_embeddings` (vector 512d para búsqueda facial)
- `desktop_source`, `path_hash`

**Order** - Orden de compra
- `id`, `photographer_id`, `gallery_id`, `buyer_id`
- `buyer_email`, `buyer_name`, `buyer_phone`
- `mp_preference_id`, `mp_payment_id`
- `status`: pending | paid | paid_pending_id | delivered | failed | refunded
- `total_amount`, `platform_fee`, `photographer_amount`
- `email_sent_at` (cuando se envió el email de entrega)

**OrderItem** - Item de orden
- `id`, `order_id`, `photo_id`, `price`

**Buyer** - Comprador (login con Google)
- `id`, `google_id`, `email`, `name`, `avatar_url`
- `mp_user_id`, `mp_verified`

**DeliveryToken** - Token de entrega de fotos
- `id`, `token` (UUID), `order_id`, `buyer_email`, `expires_at`

**FaceEmbedding** - Embeddings de caras
- `id`, `photo_id`, `photographer_id`, `embedding` (vector 512d), `bbox`

**SearchSession** - Sesión de búsqueda
- `id`, `gallery_id`, `results` (JSON), `search_type`, `paid`

---

## 🔧 STACK TECNOLÓGICO

### Backend
- **Framework:** FastAPI
- **Python:** 3.12
- **DB:** PostgreSQL (Supabase) con extensión pgvector
- **ORM:** SQLAlchemy (async)
- **Storage:** Cloudflare R2 (S3-compatible)
- **AI:** InsightFace (embeddings faciales), EasyOCR (números dorsales)
- **Pagos:** Mercado Pago
- **Email:** Resend
- **Auth:** Google OAuth + JWT
- **WebSocket:** Notificaciones de ventas al desktop
- **Web Server:** Uvicorn + nginx

### Frontend
- **Framework:** HTML5 + Vanilla JS (no framework JS)
- **CSS:** Bootstrap 5.3 + custom CSS
- **Estado:** localStorage para carrito, sesión del fotógrafo
- **Iconos:** Bootstrap Icons 1.11.3

### Desktop App
- **Framework:** C# (.NET)
- **Comunicación:** Named pipes + WebSocket
- **AI local:** ai_worker.exe (TCP puerto 54321 o 54400)
- **Integración:** Manda fotos al backend via API + recibe notificaciones WS

---

## 🚀 FUNCIONALIDADES PRINCIPALES

### Para fotógrafos
1. **Dashboard** - Vista general, estadísticas, gestión de galerías y ventas
2. **Crear galerías** - Nombre, precio, ubicación, fecha, estado, descuentos
3. **Subir fotos** - Web (drag&drop) o desktop app
4. **Procesamiento IA** - Detección de caras, números dorsales, embeddings
5. **Búsqueda facial** - Los usuarios suben selfie, encuentran sus fotos
6. **Venta** - Checkout via Mercado Pago, email de entrega
7. **WhatsApp bot** - Integración opcional para enviar fotos por WhatsApp
8. **Reenvío de entrega** - Manual desde dashboard si el email falló

### Para usuarios/compradores
1. **Buscar foto** - Subir selfie o seleccionar cara en una foto existente
2. **Ver galerías** - Explorar galerías públicas (si no son privadas)
3. **Comprar fotos** - Agregar al carrito, pagar con MP
4. **Descargar** - Link de entrega (72h vigente) para descargar fotos compradas
5. **Login con Google** - Para verificar identidad antes de entrega

### Para clubes (landing /clubes)
- Modelo de negocio: fotos gratis para el club, venta a los padres
- Kit de entrenamiento para entrenadores
- Workflow: organización → producción → edición → venta

---

## 🔐 PROTECCIÓN DE FOTOS

### Capa 1: Watermark server-side
- Archivo generado con Pillow (`watermark_service.py`)
- Guardado en R2: `s3_watermark_key`
- Texto "FOTOSHOW" repetido diagonalmente
- Se usa en la galería pública (`public.py` → `_photo_to_out()`)

### Capa 2: Watermark CSS overlay
- Generado con Canvas en `gallery.html`
- `WM_PATTERN` - tile 200x100px, opacidad 0.25
- Repetido en toda la imagen con CSS `background-repeat`
- Es visual, NO protege la descarga real

### Capa 3: Bloqueos de descarga
- `oncontextmenu="return false"` - bloquea botón derecho
- `ondragstart="return false;"` - bloquea arrastrar
- Event listeners JS: Ctrl+S, Ctrl+P, Ctrl+U, Ctrl+C, F12, Ctrl+Shift+I
- CSS: `pointer-events:none`, `user-select:none`, `-webkit-user-drag:none`

**Nota:** El usuario experto puede saltar estas protecciones, pero sirven como disuasivo.

---

## ⚙️ CONFIGURACIÓN IMPORTANTE

### Archivo `.env`
```bash
# Database
DATABASE_URL=postgresql+asyncpg://postgres:PASS@db.gfriigyzsbfugahlriut.supabase.co:5432/postgres

# Storage (R2)
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=fotoshow
R2_PUBLIC_URL=https://pub-4a2bb082723242e7abc54f95febc3df7.r2.dev

# AI
AI_SERVER_URL=https://api.fotoshow.online  # Opcional
AI_SERVER_KEY=xxx  # Opcional
AI_WORKER_HOST=localhost
AI_WORKER_PORT=54321

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://fotoshow.online/api/auth/google/callback

# Mercado Pago
MP_ACCESS_TOKEN=xxx  # Token de plataforma (fallback)

# Email (Resend)
RESEND_API_KEY=re_xxx

# Base URL
BASE_URL=https://fotoshow.online
```

### Comandos útiles
```bash
# Iniciar servicio
sudo systemctl restart fotoshow

# Ver logs
sudo journalctl -u fotoshow -f

# Ver estado
sudo systemctl is-active fotoshow

# Migraciones de DB
cd /root/fotoshow
alembic upgrade head

# Crear nueva migración
alembic revision --autogenerate -m "descripcion"

# Tests AI worker (TCP)
python3 -c "
import asyncio, json
async def test():
    reader, writer = await asyncio.wait_for(
        asyncio.open_connection('localhost', 54321),
        timeout=5
    )
    writer.write(json.dumps({'action':'health'}) + '\n'.encode())
    await writer.drain()
    line = await asyncio.wait_for(reader.readline(), timeout=5)
    print(json.loads(line.decode()))
asyncio.run(test())
"
```

---

## 📊 ESTADO ACTUAL

### Últimos cambios (2026-04-12)
- ✅ Landing page de clubes (`/clubes`)
- ✅ Reenvío de entrega manual desde dashboard
- ✅ Fix de webhook duplicado de MP (reenvía email si nunca se envió)
- ✅ Campo `email_sent_at` en `Order` para rastrear entrega
- ✅ Bajada de threshold de búsqueda facial de 0.75 a 0.55
- ✅ Botón de perfil del fotógrafo en galería
- ✅ Fix de WhatsApp en perfil (usa phone si no tiene WA conectado)
- ✅ Limpieza de estado de búsqueda al ver todas las fotos
- ✅ Activación de watermark real del servidor (no solo CSS)
- ✅ Watermark CSS más grande e invasivo (200x100px, opacidad 0.25)
- ✅ Bloqueos adicionales de descarga (teclas, selección)

### Usuarios premium (pro_annual)
- fotoshowonlinear@gmail.com → vence 2027-04-04
- guillermozaniratto99@gmail.com → vence 2027-04-04
- almacendetartas1@gmail.com → vence 2027-04-04

### Estadísticas de DB
- ~2150 fotos
- 2149 con watermark generado
- ~1800 fotos con embeddings faciales

---

## 🚧 PENDIENTES / ROADMAP

### Corto plazo (validación)
- **Galerías de clubes** con sub-categorías (folders)
- **Opción de impresión** (digital vs digital+impresa, envío vs retiro)
- **Mejora de dashboard** con vista de clubes y tracking de kits

### Mediano plazo
- **Gestión de clubes** sin tablas nuevas (convenio de nombres + JSON en description)
- **Personalización de watermark** por fotógrafo
- **Analytics/Reportes** por galería y por fotógrafo

### Largo plazo
- **Portafolio del fotógrafo** (selección manual de mejores fotos)
- **Videos/reels** para clubes
- **Sponsors** en fotos

---

## 🐛 PROBLEMAS CONOCIDOS

1. **Búsqueda facial** - A veces no encuentra caras si el ángulo es muy distinto o la persona cambió mucho. Threshold ajustado a 0.55 pero puede requerir tunear más.

2. **Webhook duplicado de MP** - MP envía notificaciones múltiples. Fix implementado con `email_sent_at` y reenvío automático si nunca se envió.

3. **Galerías privadas** - No se pueden navegar todas las fotos, solo buscar por cara. Esto es por diseño.

4. **Desktop app** - Puerto 54321 excluido por Hyper-V/Docker en Windows. Cambiado a 54400 pero se debe documentar mejor.

---

## 📝 NOTAS PARA NUEVOS DESARROLLADORES

1. **Siempre hacer git pull** antes de trabajar en el servidor
2. **Commit y push** después de cambios importantes
3. **Reiniciar servicio** después de cambios en Python: `sudo systemctl restart fotoshow`
4. **Cambios estáticos** (HTML/CSS/JS) no requieren reinicio, solo F5
5. **Migraciones de DB** requerirán `alembic upgrade head` en producción
6. **No exponer URLs originales** en la API pública, usar siempre watermark o thumbnail
7. **Validar en localhost** antes de hacer cambios en producción
8. **Los logs están en `journalctl -u fotoshow -f`**

---

## 📞 CONTACTO

- **Propietario:** Basito (Basito)
- **Telegram:** 6627778321
- **Email:** (definir)
- **Proyecto GitHub:** https://github.com/fotoshowar/fotoshow-v2

---

_Última actualización: 2026-04-12_
