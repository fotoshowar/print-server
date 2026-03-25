# TODO - Print Server v3.0

## Arquitectura actual entendida:
- FotoShow API en https://fotoshow.online (FastAPI + Supabase + Cloudflare R2)
- Desktop API: POST /api/desktop/sync (thumbnail + embedding)
- Desktop API: POST /api/desktop/galleries (crear galeria)
- Desktop API: GET /api/desktop/original-upload-url (presigned URL para R2)
- R2 storage: thumbnails van a R2, originales via presigned URL
- Watermark service: genera thumbnails 800x800 y tiny previews 80x80

## Cambios pendientes v3.0:

### 1. Thumbnails locales (no servir originales)
- Al subir foto, generar thumbnail (800px max) con sharp/jimp
- Guardar thumbnail en /uploads/thumbs/
- Servir thumbnails en la galeria (rapido, poco peso)
- Original solo se usa para imprimir y subir a R2

### 2. Organizar por dias
- Fotos organizadas por fecha: /uploads/2026-03-25/
- Thumbnails: /uploads/thumbs/2026-03-25/
- En la UI: separar fotos por dia con headers de fecha

### 3. Sync con FotoShow API
- Auth: login como fotografo → obtener JWT token
- Al subir foto al print-server:
  1. Generar thumbnail local
  2. Subir thumbnail a FotoShow via POST /api/desktop/sync
  3. Obtener presigned URL via GET /api/desktop/original-upload-url
  4. Subir original a R2 directo (sin pasar por servidor)
- Crear galeria automatica del dia: POST /api/desktop/galleries {name: "Fotos 25/03/2026"}
- Precio: $4000 por foto digital
- Mostrar estado sync: 49/50 synced

### 4. Escala (cientos/miles de fotos por dia)
- Usar symlinks en vez de copiar archivos
- Lazy loading en la UI (intersection observer)
- Paginacion en la API
- Queue de sync (no bloquear upload)
- Batch upload a R2
