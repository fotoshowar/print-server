# Base de Datos Robusta - FotoShow Print Server

## Overview
Diseño de base de datos para integración robusta con fotoshow.online, con sincronización automática en segundo plano.

---

## Estructura Propuesta

### 1. Colección `photos`
**Cada foto subida al Print Server**

```json
{
  "_id": "uuid-v4",
  "filename": "foto-1774924869939.jpg",
  "originalName": "DSC03380.JPG",
  "date": "2026-03-31",
  "localPath": "uploads/2026-03-31/foto-1774924869939.jpg",
  "thumbPath": "thumbs/2026-03-31/foto-1774924869939.jpg",

  "metadata": {
    "size": 2293760,
    "thumbSize": 25626,
    "width": 3008,
    "height": 2000,
    "isHorizontal": true
  },

  "shareCode": "95154C",

  "timestamps": {
    "createdAt": "2026-03-31T02:41:10.219Z",
    "updatedAt": "2026-03-31T02:41:10.219Z",
    "syncedAt": null,
    "syncStartedAt": null
  },

  "usage": {
    "printed": 0,
    "downloaded": 0
  },

  "sync": {
    "status": "pending",  // pending | syncing | uploaded | failed | skipped
    "remotePhotoId": null,  // ID de la foto en fotoshow.online
    "remoteUrl": null,  // URL completa de la foto en R2
    "remoteGalleryId": null,  // ID de la galería en fotoshow.online
    "remoteS3Key": null,  // S3 key en R2

    "retryCount": 0,
    "lastError": null,
    "lastErrorAt": null
  },

  "hash": "sha256:abc123...",  // Para detectar cambios
  "deleted": false,
  "deletedAt": null
}
```

---

### 2. Colección `galleries`
**Galerías locales que mapean a fotoshow.online**

```json
{
  "_id": "uuid-v4",
  "name": "Boda María y Juan",
  "localDate": "2026-03-31",

  "remote": {
    "galleryId": "gallery-uuid-v4",  // ID en fotoshow.online
    "url": "https://www.fotoshow.online/ph/bass/gallery-uuid-v4",
    "active": true,
    "private": false
  },

  "autoSync": true,  // ¿Subir fotos automáticamente a esta galería?

  "photos": [
    "photo-uuid-v4",  // Array de photo IDs
    "photo-uuid-v4-2"
  ],

  "timestamps": {
    "createdAt": "2026-03-31T02:00:00.000Z",
    "updatedAt": "2026-03-31T02:41:10.219Z",
    "lastSyncAt": "2026-03-31T03:00:00.000Z"
  },

  "stats": {
    "photoCount": 150,
    "syncedCount": 145,
    "pendingCount": 5,
    "failedCount": 0
  }
}
```

---

### 3. Colección `syncLogs`
**Log de todas las operaciones de sincronización**

```json
{
  "_id": "uuid-v4",
  "timestamp": "2026-03-31T03:00:00.000Z",

  "operation": "upload_photo",  // upload_photo | update_metadata | delete_photo | create_gallery

  "photoId": "photo-uuid-v4",  // Si aplica
  "galleryId": "gallery-uuid-v4",  // Si aplica

  "status": "success",  // success | failed | partial

  "details": {
    "filename": "foto-1774924869939.jpg",
    "remotePhotoId": "remote-uuid-v4",
    "uploadTimeMs": 2340
  },

  "error": null,  // Si status = "failed"

  "metadata": {
    "attempt": 1,
    "automatic": true  // ¿Fue sync automática o manual?
  }
}
```

---

### 4. Colección `syncQueue`
**Cola de operaciones pendientes para procesamiento en segundo plano**

```json
{
  "_id": "uuid-v4",
  "createdAt": "2026-03-31T02:45:00.000Z",
  "priority": "high",  // low | normal | high

  "operation": "upload_photo",

  "payload": {
    "photoId": "photo-uuid-v4",
    "galleryId": "gallery-uuid-v4"
  },

  "status": "pending",  // pending | processing | completed | failed
  "startedAt": null,
  "completedAt": null,

  "retryCount": 0,
  "maxRetries": 3,
  "nextRetryAt": "2026-03-31T02:50:00.000Z",

  "lastError": null
}
```

---

### 5. Colección `settings`
**Configuración general del Print Server**

```json
{
  "_id": "settings",

  "sync": {
    "enabled": true,
    "intervalMinutes": 5,
    "maxConcurrentUploads": 3,
    "autoCreateGallery": true,  // Crear galería automáticamente si no existe
    "defaultGalleryId": null,
    "compressBeforeUpload": true,
    "compressionQuality": 85
  },

  "fotoshow": {
    "apiUrl": "https://www.fotoshow.online/api",
    "apiKey": "xxx",  // OAuth token del fotógrafo
    "photographerId": "xxx",
    "desktopToken": "xxx"  // Token de sesión desktop
  },

  "cloud": {
    "r2Bucket": "fotoshow-photos",
    "r2Endpoint": "https://r2.example.com"
  },

  "timestamps": {
    "lastSyncAt": "2026-03-31T03:00:00.000Z",
    "updatedAt": "2026-03-31T02:00:00.000Z"
  }
}
```

---

### 6. Colección `stats`
**Estadísticas agregadas para dashboard**

```json
{
  "_id": "stats",

  "photos": {
    "total": 238,
    "byDate": {
      "2026-03-31": 2,
      "2026-03-28": 236
    },
    "bySyncStatus": {
      "uploaded": 200,
      "pending": 30,
      "syncing": 5,
      "failed": 3
    }
  },

  "galleries": {
    "total": 5,
    "active": 4,
    "autoSync": 3
  },

  "sync": {
    "totalOperations": 250,
    "successful": 240,
    "failed": 10,
    "successRate": 0.96
  },

  "usage": {
    "totalPrinted": 68,
    "totalDownloaded": 13
  },

  "updatedAt": "2026-03-31T03:00:00.000Z"
}
```

---

## Índices (Indexing)

Para consultas rápidas:

```
photos:
  - idx_date: { date: 1 }
  - idx_sync_status: { "sync.status": 1 }
  - idx_gallery: { "sync.remoteGalleryId": 1 }
  - idx_hash: { hash: 1 }

galleries:
  - idx_remote: { "remote.galleryId": 1 }
  - idx_autosync: { autoSync: 1 }
  - idx_date: { localDate: 1 }

syncQueue:
  - idx_status_priority: { status: 1, priority: 1 }
  - idx_next_retry: { nextRetryAt: 1 }

syncLogs:
  - idx_timestamp: { timestamp: -1 }
  - idx_photo: { photoId: 1 }
  - idx_status: { status: 1 }
```

---

## Flujo de Sincronización

### 1. Usuario sube foto al Print Server
```javascript
POST /api/upload
→ Guardar foto localmente
→ Crear registro en `photos` con sync.status = "pending"
→ Agregar a `syncQueue` con operation = "upload_photo"
```

### 2. Background Worker procesa cola
```javascript
Worker loop (cada 30s):
  → Buscar items en syncQueue con status = "pending"
  → Ordenar por priority (high → normal → low)
  → Procesar hasta 3 concurrentes
  → Para cada item:
    - Marcar status = "processing"
    - Ejecutar operación (upload_photo, etc.)
    - Actualizar photo.sync.status
    - Crear syncLog
    - Marcar item = "completed" o "failed"
```

### 3. Upload de foto
```javascript
1. GET /api/desktop/original-upload-url
   → Obtener presigned URL de R2
2. PUT foto original a R2
3. POST /api/desktop/sync
   → Enviar thumbnail + metadata
4. Actualizar photo:
   - sync.status = "uploaded"
   - remotePhotoId = ID de fotoshow.online
   - remoteS3Key = S3 key
   - remoteUrl = URL completa
   - syncedAt = now()
```

### 4. Creación automática de galería
```javascript
Si autoCreateGallery = true y galleryId no existe:
  1. Detectar evento basado en fecha/nombre
  2. POST /api/desktop/galleries
  3. Crear registro en `galleries`
  4. Asociar fotos a la galería
```

---

## Estrategias de Robustez

### 1. Reintento Automático
- Si una sync falla, incrementar retryCount
- Reintentar con backoff exponencial: 30s, 2min, 10min
- Después de maxRetries, marcar como failed y notificar

### 2. Deduplicación por Hash
- Calcular SHA256 de cada foto al subirla
- Si existe una foto con mismo hash:
  - Preguntar si es duplicado
  - Opcionalmente crear symlink en lugar de copiar

### 3. Conflict Resolution
- Si una foto cambia localmente después de sync:
  - Detectar cambio de hash
  - Marcar sync.status = "pending"
  - Re-sincronizar

### 4. Orphan Cleanup
- Periódicamente buscar fotos con sync.status = "syncing" por > 30min
- Revertir a "pending" para reintentar

### 5. Health Checks
- Verificar conexión con fotoshow.online
- Verificar acceso a R2
- Si hay problemas, pausar syncQueue y notificar

---

## API Endpoints Nuevos

### Sincronización
```
POST /api/sync/photo/:photoId       - Sincronizar foto manual
POST /api/sync/gallery/:galleryId  - Sincronizar galería manual
POST /api/sync/all                 - Sincronizar todo pendiente
GET  /api/sync/status              - Estado del worker de sync
GET  /api/sync/queue               - Ver cola de sincronización
POST /api/sync/retry/:itemId        - Reintentar item fallido
```

### Galerías
```
GET  /api/galleries               - Listar galerías
POST /api/galleries              - Crear galería
GET  /api/galleries/:id          - Ver galería
PATCH /api/galleries/:id         - Actualizar galería
DELETE /api/galleries/:id        - Borrar galería
```

### Configuración
```
GET  /api/settings               - Obtener config
PATCH /api/settings              - Actualizar config
```

### Logs
```
GET  /api/logs/sync              - Logs de sincronización
GET  /api/logs/sync/:photoId    - Logs de una foto específica
```

---

## Tecnología

### Opción A: SQLite3 (Recomendado)
- ✅ Sin servidor, archivo único
- ✅ Integración simple en Node.js
- ✅ Buen rendimiento para este caso de uso
- ✅ Fácil de backup (copiar archivo)

### Opción B: MongoDB
- ✅ Escalable
- ✅ JSON nativo
- ❌ Requiere servidor adicional
- ❌ Overkill para este caso

### Opción C: PostgreSQL
- ✅ Muy robusto
- ❌ Requiere servidor
- ❌ Setup complejo

**Recomendación: SQLite3 con ORM Prisma o TypeORM**
