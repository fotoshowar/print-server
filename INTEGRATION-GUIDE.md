# Guía de Integración - Print Server ↔ fotoshow.online

## 📋 Archivos Nuevos

1. **DB-DESIGN.md** - Diseño completo de la nueva DB
2. **db-migrate.js** - Script de migración de JSON → SQLite
3. **sync-worker.js** - Background worker para sincronización
4. **INTEGRATION-GUIDE.md** - Este archivo

---

## 🚀 Pasos para Integración

### 1. Instalar dependencias

```bash
cd print-server
npm install better-sqlite3 node-fetch form-data
```

### 2. Ejecutar migración de DB

```bash
# Primero ver qué hará (dry-run)
node db-migrate.js --dry-run

# Si todo bien, migrar
node db-migrate.js --backup
```

Esto creará:
- `print-server.db` - Nueva DB SQLite
- `db-backup-XXXXXX.json` - Backup del JSON anterior
- `print-server.db.old` - Backup si ya existía

### 3. Configurar API Key de fotoshow.online

Necesitas el OAuth token del fotógrafo para conectar con fotoshow.online.

**Opción A: Desde el panel admin de fotoshow.online**
- Ir a https://www.fotoshow.online/dashboard
- Buscar sección de "API Keys" o "Desktop Tokens"
- Copiar el token

**Opción B: Iniciar sesión desde la API**
```bash
# Hacer login con Google
curl "https://www.fotoshow.online/api/auth/google"

# Esto abrirá el navegador, inicia sesión y obtén el JWT
```

### 4. Actualizar configuración en DB

Abre `print-server.db` con cualquier cliente SQLite (DB Browser for SQLite, etc.):

```sql
UPDATE settings
SET fotoshow_api_key = 'TU_JWT_TOKEN_AQUI',
    photographer_id = 'TU_ID_AQUI',
    sync_enabled = 1
WHERE id = 'settings';
```

O desde Node.js:

```javascript
const Database = require('better-sqlite3');
const db = new Database('print-server.db');

db.prepare(`
  UPDATE settings
  SET fotoshow_api_key = ?,
      photographer_id = ?,
      sync_enabled = 1
  WHERE id = 'settings'
`).run('TU_JWT_TOKEN', 'TU_ID');

db.close();
```

### 5. Integrar worker en `server.js`

Al final de `server.js`, agregar:

```javascript
// =================== SYNC WORKER ===================
const worker = require('./sync-worker');

// Iniciar worker después de que el servidor escuche
app.listen(PORT, () => {
  console.log(`🚀 Server corriendo en http://localhost:${PORT}`);

  // Iniciar worker en segundo plano
  worker.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando...');
  worker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT recibido, cerrando...');
  worker.stop();
  process.exit(0);
});
```

### 6. Actualizar endpoint `/api/upload`

En el endpoint de upload actual, agregar lógica para crear cola:

```javascript
app.post('/api/upload', upload.array('photos', 200), async (req, res) => {
  // ... código existente ...

  // AGREGAR: Después de procesar cada foto
  for (const file of req.files) {
    const photo = db.photos[file.filename];  // o equivalente en SQLite

    // Crear registro en DB si no existe
    // ...

    // Agregar a cola de sincronización
    const db = new Database('print-server.db');
    db.prepare(`
      INSERT INTO sync_queue (id, created_at, priority, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      new Date().toISOString(),
      'normal',
      'upload_photo',
      JSON.stringify({ photoId: photo.id }),
      'pending'
    );
    db.close();
  }

  res.json({ success: true, photos: uploadedFiles });
});
```

---

## 🧪 Testing

### Test 1: Verificar migración

```bash
sqlite3 print-server.db
.tables
# Debería ver: photos, galleries, sync_logs, sync_queue, settings, stats

SELECT COUNT(*) FROM photos;
# Debería mostrar el mismo número que en db.json

SELECT * FROM settings;
# Verificar que sync_enabled = 1
```

### Test 2: Verificar cola

```bash
sqlite3 print-server.db
SELECT COUNT(*) FROM sync_queue WHERE status = 'pending';
# Debería ser igual al número de fotos

SELECT * FROM sync_queue LIMIT 5;
# Ver primeros items en cola
```

### Test 3: Iniciar servidor

```bash
node server.js
# Deberías ver:
# 🚀 Server corriendo en http://localhost:3000
# 🚀 Iniciando Sync Worker...
```

### Test 4: Subir foto desde la web

1. Abre http://localhost:3000
2. Sube una foto
3. Observa logs del worker
4. Verifica en DB:

```sql
SELECT * FROM photos WHERE filename = 'foto-...' ORDER BY updated_at DESC LIMIT 1;
# sync_status debería cambiar: pending → syncing → uploaded

SELECT * FROM sync_logs ORDER BY timestamp DESC LIMIT 5;
# Ver logs de sincronización
```

### Test 5: Verificar subida a fotoshow.online

1. Ve a https://www.fotoshow.online/dashboard
2. Buscar la galería creada automáticamente
3. Verificar que la foto esté ahí

---

## 📊 Monitoreo

### Ver estado del worker

```bash
sqlite3 print-server.db
SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT 10;
```

### Ver fotos por estado de sync

```sql
SELECT sync_status, COUNT(*) as count
FROM photos
GROUP BY sync_status;
```

### Ver logs recientes

```sql
SELECT * FROM sync_logs
ORDER BY timestamp DESC
LIMIT 20;
```

### Ver errores

```sql
SELECT * FROM sync_logs
WHERE status = 'failed'
ORDER BY timestamp DESC
LIMIT 10;
```

---

## 🐛 Troubleshooting

### Worker no inicia

**Síntoma:** No ves "🚀 Iniciando Sync Worker..."

**Solución:**
1. Verificar que `sync-worker.js` esté en el mismo directorio que `server.js`
2. Verificar que `better-sqlite3` está instalado: `npm list better-sqlite3`
3. Verificar logs: `console.log` statements en worker

### Fotos no se sincronizan

**Síntoma:** sync_status permanece en "pending"

**Solución:**
1. Verificar settings: `SELECT * FROM settings;`
   - `sync_enabled` debe ser `1`
   - `fotoshow_api_key` no debe ser NULL
2. Verificar cola: `SELECT * FROM sync_queue WHERE status = 'pending';`
3. Verificar logs: `SELECT * FROM sync_logs ORDER BY timestamp DESC LIMIT 10;`
4. Verificar conexión con fotoshow.online:
   ```bash
   curl https://www.fotoshow.online/api-status
   ```

### Error 401 Unauthorized

**Síntoma:** Logs muestran "Error al obtener presigned URL: 401"

**Solución:**
1. Tu API key expiró
2. Obtener nuevo token desde fotoshow.online
3. Actualizar en DB:
   ```sql
   UPDATE settings SET fotoshow_api_key = 'NUEVO_TOKEN' WHERE id = 'settings';
   ```

### Error "Archivo no encontrado"

**Síntoma:** "Archivo no encontrado: uploads/..."

**Solución:**
1. Verificar que las fotos existen en disco
2. Verificar que `local_path` en DB es correcto
3. Verificar permisos de archivos

### Worker consume mucha CPU

**Síntoma:** CPU al 100% por el worker

**Solución:**
1. Reducir `max_concurrent_uploads` en settings:
   ```sql
   UPDATE settings SET max_concurrent_uploads = 1 WHERE id = 'settings';
   ```
2. Aumentar `sync_interval_minutes`:
   ```sql
   UPDATE settings SET sync_interval_minutes = 10 WHERE id = 'settings';
   ```

---

## 📈 Roadmap

### Fase 1 (Actual)
- ✅ Migración de DB a SQLite
- ✅ Worker de sincronización en segundo plano
- ✅ Upload automático a R2 + fotoshow.online

### Fase 2 (Próxima)
- [ ] Creación automática de galerías
- [ ] Panel web para ver estado de sync
- [ ] Notificaciones de errores (toast en UI)
- [ ] Reintentos manuales desde UI

### Fase 3 (Futuro)
- [ ] Sincronización bidireccional
- [ ] Conflict resolution (foto modificada local vs remota)
- [ ] Offline mode con cache de fotos
- [ ] Progress bar de sincronización en UI

---

## 🔗 Recursos

- **DB Design:** `DB-DESIGN.md`
- **SQLite Docs:** https://www.sqlite.org/docs.html
- **better-sqlite3:** https://github.com/WiseLibs/better-sqlite3
- **fotoshow.online API:** https://www.fotoshow.online/api/docs
