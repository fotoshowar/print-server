# Arquitectura - FotoShow Print Server + fotoshow.online

## 🏗️ Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                    FOTOGRAPHY WORKFLOW                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Cliente    │─────▶│  Print Server   │─────▶│ fotoshow.online │
│   (Browser)  │      │   (Local PC)    │      │   (VPS)       │
└──────────────┘      └──────────────────┘      └──────────────┘
                           │                         │
                           ▼                         ▼
                      ┌──────────┐           ┌────────────┐
                      │ SQLite3  │           │ PostgreSQL │
                      │ (Local)  │           │  (Cloud)   │
                      └──────────┘           └────────────┘
                                                      │
                                                      ▼
                                              ┌─────────────┐
                                              │  Cloudflare │
                                              │     R2      │
                                              └─────────────┘
```

---

## 📊 Flujo de Datos

### 1. Usuario sube foto al Print Server

```
Usuario
   │
   │  POST /api/upload
   │  (multipart/form-data)
   ▼
Print Server (Express)
   │
   ├─▶ Guardar en uploads/YYYY-MM-DD/
   ├─▶ Generar thumbnail con Sharp
   ├─▶ Guardar thumbnail en thumbs/YYYY-MM-DD/
   ├─▶ Calcular SHA256 hash
   ├─▶ Crear registro en DB (photos)
   │
   └─▶ AGREGAR A SYNC QUEUE
       │
       └─▶ sync_queue.insert({
              operation: 'upload_photo',
              payload: { photoId },
              status: 'pending'
            })
```

### 2. Background Worker procesa cola (cada 30s)

```
Sync Worker (node process)
   │
   │  setInterval(30s)
   │
   ├─▶ SELECT * FROM sync_queue
   │      WHERE status = 'pending'
   │      LIMIT 3 (max concurrent)
   │
   ├─▶ Para cada item:
   │      │
   │      ├─▶ Marcar status = 'processing'
   │      │
   │      └─▶ Ejecutar operación (upload_photo)
   │              │
   │              ├─▶ Actualizar photo.sync_status = 'syncing'
   │              │
   │              ├─▶ GET /api/desktop/original-upload-url
   │              │      (Obtener presigned URL de R2)
   │              │
   │              ├─▶ PUT presigned URL
   │              │      (Subir original a R2)
   │              │
   │              ├─▶ POST /api/desktop/sync
   │              │      (Enviar thumbnail + metadata)
   │              │
   │              └─▶ Actualizar photo.sync_status = 'uploaded'
   │
   ├─▶ Crear sync_log (success/failed)
   │
   └─▶ Marcar item = 'completed' o 'failed'
```

### 3. Cliente compra foto en fotoshow.online

```
Cliente
   │
   │  Ver galería en fotoshow.online
   ▼
fotoshow.online
   │
   ├─▶ Mostrar fotos con watermark
   ├─▶ Cliente selecciona fotos
   ├─▶ POST /api/orders/create
   │      (Crear orden Mercado Pago)
   │
   └─▶ Redirigir a checkout
           │
           ▼
      Mercado Pago
           │
           ▼ (pago exitoso)
      Webhook MP
           │
           ▼
      fotoshow.online
           │
           ├─▶ Orden marcada como 'paid'
           ├─▶ Generar delivery token
           └─▶ Enviar email con delivery link
```

### 4. Cliente descarga foto original

```
Cliente
   │
   │  Abrir delivery link
   │  https://www.fotoshow.online/delivery/TOKEN
   ▼
fotoshow.online
   │
   ├─▶ Verificar token válido
   ├─▶ Verificar orden pagada
   ├─▶ Mostrar lista de fotos compradas
   │
   └─▶ GET /api/delivery/TOKEN/photos
           │
           ▼
      Cloudflare R2
           │
           ▼ (descarga)
      Cliente (recibe original sin watermark)
```

---

## 🗄️ Estructura de Datos

### Tablas Principales

```
photos ──────────────────────┬───────────── sync_queue
│                            │
│  id: UUID                  │  id: UUID
│  filename: string          │  operation: string
│  local_path: string        │  payload: JSON
│  thumb_path: string        │  status: pending/processing/
│  sync_status: enum         │           completed/failed
│  remote_photo_id: UUID     │  priority: enum
│  remote_gallery_id: UUID   │  retry_count: int
│  remote_s3_key: string    │
│  hash: SHA256              │
│  deleted: boolean          │
└─────────────────────────────┘

galleries                    sync_logs
│                            │
│  id: UUID                  │  timestamp: ISO8601
│  name: string              │  operation: enum
│  remote_gallery_id: UUID    │  status: success/failed/
│  auto_sync: boolean        │           partial
│  last_sync_at: ISO8601     │  photo_id: UUID
│  photo_count: int          │  error: string
└────────────────────────────┘

settings                     stats
│                            │
│  sync_enabled: boolean      │  photos_total: int
│  sync_interval: int         │  photos_by_status: JSON
│  fotoshow_api_key: JWT     │  sync_total: int
│  photographer_id: UUID      │  sync_success_rate: float
└────────────────────────────┘
```

---

## 🔗 Relaciones

```
galleries 1──N photos
   │            │
   └────────────┴─> gallery.photos = [photoId, photoId, ...]

sync_queue 1──1 photos
   │
   └─> queue.payload.photoId → photo.id

sync_logs 1──N photos
   │
   └─> log.photoId → photo.id

sync_logs 1──N galleries
   │
   └─> log.galleryId → gallery.id
```

---

## 🔄 Estados de Sincronización

### Photo.sync_status

```
pending → syncing → uploaded
            │
            └──→ failed → pending (retry)
                       │
                       └──→ failed (max retries exceeded)
```

### SyncQueue.status

```
pending → processing → completed
         │
         └──→ failed → pending (retry with backoff)
                      │
                      └──→ failed (max retries exceeded)
```

---

## 🛡️ Mecanismos de Robustez

### 1. Deduplicación
```
Si photo.hash existe en DB:
  - Preguntar al usuario si es duplicado
  - Crear symlink en lugar de copiar
```

### 2. Retries con Backoff
```
Retry 1: 30s
Retry 2: 2min
Retry 3: 10min
> 3: Mark as failed
```

### 3. Orphan Cleanup
```
Cada hora:
  SELECT * FROM sync_queue
  WHERE status = 'processing'
    AND started_at < datetime('now', '-30 minutes')
  → Revertir a 'pending' para reintentar
```

### 4. Health Checks
```
Worker loop:
  1. Verificar conexión con fotoshow.online
  2. Verificar acceso a R2
  3. Si error: pausar sync, notificar en logs
```

### 5. Atomic Updates
```
Usar transactions en SQLite para:
  - Actualizar photo + crear sync_log en una operación
  - Evitar estados inconsistentes
```

---

## 📈 Métricas

### Dashboard Stats
```
Photos:
  - Total subidas: 238
  - Pendientes de sync: 30
  - En sync: 5
  - Sync exitosos: 200
  - Sync fallidos: 3

Galleries:
  - Total: 5
  - Auto-sync activas: 3

Sync:
  - Operaciones totales: 250
  - Tasa de éxito: 96%
  - Última sync: Hace 2 minutos

Usage:
  - Fotos impresas: 68
  - Fotos descargadas: 13
```

---

## 🔒 Seguridad

### API Keys
- JWT token guardado en DB (encrypted en prod)
- Never en frontend
- Rotación cada 30 días

### Uploads
- Validación de MIME types
- Límite de tamaño: 30MB
- Límite de cantidad: 200 por request

### R2 Access
- Presigned URLs de 5 minutos
- No exponer credenciales de R2
- Path hashing por fecha

---

## 🚀 Performance

### Optimizaciones
1. **Concurrent uploads** - Hasta 3 simultáneos
2. **Thumbnails locales** - Generar una sola vez
3. **SQLite WAL mode** - Mejora rendimiento
4. **Índices** - Queries rápidos en DB
5. **Presigned URLs** - Upload directo a R2 sin pasar por server

### Tiempos estimados
- Subir foto (2MB) a R2: ~2-5s
- Sync metadata: ~500ms
- Total por foto: ~3-6s
- Sync de 10 fotos: ~30s (3 concurrentes)

---

## 📝 Logs

### Sync Logs
```json
{
  "timestamp": "2026-03-31T03:00:00.000Z",
  "operation": "upload_photo",
  "status": "success",
  "photoId": "photo-uuid-v4",
  "details": {
    "filename": "foto-1774924869939.jpg",
    "remotePhotoId": "remote-uuid-v4",
    "s3Key": "photos/2026-03-31/foto-...",
    "uploadTimeMs": 2340
  }
}
```

### Error Logs
```json
{
  "timestamp": "2026-03-31T03:05:00.000Z",
  "operation": "upload_photo",
  "status": "failed",
  "photoId": "photo-uuid-v4",
  "error": "Error al subir a R2: 403 Forbidden"
}
```

---

## 🔮 Futuro

### Roadmap
- [ ] UI para ver estado de sync en tiempo real
- [ ] Progress bar de sincronización
- [ ] Notificaciones push de errores
- [ ] Sincronización bidireccional
- [ ] Offline mode con cache
- [ ] Búsqueda facial en el Print Server
- [ ] AI auto-tagging de fotos
