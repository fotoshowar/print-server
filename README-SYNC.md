# 📦 Integración Print Server + fotoshow.online

## 🎯 Objetivo
Sincronizar automáticamente las fotos subidas al Print Server con fotoshow.online en segundo plano.

## 📝 Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| **DB-DESIGN.md** | Diseño completo de la nueva DB SQLite3 |
| **db-migrate.js** | Script para migrar db.json → SQLite |
| **sync-worker.js** | Background worker que procesa la cola de sync |
| **INTEGRATION-GUIDE.md** | Guía paso a paso de integración |
| **ARCHITECTURE.md** | Diagrama de arquitectura y flujos |
| **README-SYNC.md** | Este archivo |

---

## ⚡ Qué hace el sistema

1. **Foto subida al Print Server** → Se guarda localmente + se agrega a cola de sincronización
2. **Worker detecta foto pendiente** → Cada 30s revisa la cola
3. **Worker procesa sync**:
   - Obtiene presigned URL de R2
   - Sube foto original a R2
   - Envia thumbnail + metadata a fotoshow.online
   - Marca foto como "uploaded"
4. **Foto disponible en tienda** → Cliente puede comprar y descargar

---

## 🛠️ Pasos para Implementar

### 1. Instalar dependencias
```bash
cd print-server
npm install better-sqlite3 node-fetch form-data
```

### 2. Migrar base de datos
```bash
# Ver qué hará primero
node db-migrate.js --dry-run

# Si todo bien, migrar con backup
node db-migrate.js --backup
```

### 3. Configurar API Key de fotoshow.online
Necesitas el JWT token del fotógrafo.

#### Obtener token:
1. Ir a https://www.fotoshow.online/dashboard
2. Buscar "API Keys" o "Desktop Tokens"
3. Copiar el token

#### Guardar en DB:
```javascript
const Database = require('better-sqlite3');
const db = new Database('print-server.db');

db.prepare(`
  UPDATE settings
  SET fotoshow_api_key = ?,
      photographer_id = ?,
      sync_enabled = 1
  WHERE id = 'settings'
`).run('TU_JWT_TOKEN', 'TU_FOTOGRAFO_ID');

db.close();
```

### 4. Integrar worker en `server.js`

Al final de `server.js`, agregar:

```javascript
// =================== SYNC WORKER ===================
const worker = require('./sync-worker');

app.listen(PORT, () => {
  console.log(`🚀 Server corriendo en http://localhost:${PORT}`);
  worker.start();  // ← Iniciar worker
});

process.on('SIGTERM', () => {
  worker.stop();
  process.exit(0);
});
```

### 5. Actualizar endpoint `/api/upload`

Después de procesar cada foto, agregar a cola:

```javascript
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
```

---

## ✅ Testing

### Verificar migración
```bash
sqlite3 print-server.db
.tables
# Debería ver: photos, galleries, sync_logs, sync_queue, settings, stats
```

### Iniciar servidor
```bash
node server.js
# Deberías ver:
# 🚀 Server corriendo en http://localhost:3000
# 🚀 Iniciando Sync Worker...
```

### Subir foto
1. Abre http://localhost:3000
2. Sube una foto
3. Observa logs del worker
4. Verifica en DB:
   ```bash
   sqlite3 print-server.db
   SELECT * FROM photos WHERE filename = 'foto-...' ORDER BY updated_at DESC LIMIT 1;
   ```

### Ver logs de sync
```bash
sqlite3 print-server.db
SELECT * FROM sync_logs ORDER BY timestamp DESC LIMIT 10;
```

---

## 🔍 Monitoreo

### Ver estado de sync
```sql
SELECT sync_status, COUNT(*) as count
FROM photos
GROUP BY sync_status;
```

### Ver cola pendiente
```sql
SELECT * FROM sync_queue WHERE status = 'pending';
```

### Ver errores
```sql
SELECT * FROM sync_logs WHERE status = 'failed'
ORDER BY timestamp DESC LIMIT 10;
```

---

## ⚠️ Troubleshooting Común

### Worker no inicia
- Verificar que `sync-worker.js` existe en el directorio
- Verificar que `better-sqlite3` está instalado: `npm list better-sqlite3`

### Fotos no se sincronizan
- Verificar settings: `SELECT * FROM settings;`
  - `sync_enabled` debe ser `1`
  - `fotoshow_api_key` no debe ser NULL
- Verificar cola: `SELECT * FROM sync_queue WHERE status = 'pending';`

### Error 401 Unauthorized
- API key expiró
- Obtener nuevo token desde fotoshow.online
- Actualizar en DB

### Error "Archivo no encontrado"
- Verificar que las fotos existen en disco
- Verificar que `local_path` en DB es correcto

---

## 📊 Archivos Nuevos Estructura

```
print-server/
├── db.json                    ← DB actual (antes de migrar)
├── db-migrate.js              ← Script de migración
├── print-server.db            ← Nueva DB SQLite (después de migrar)
├── sync-worker.js             ← Background worker
├── server.js                  ← Server Express (modificar)
├── DB-DESIGN.md               ← Diseño de DB
├── INTEGRATION-GUIDE.md       ← Guía detallada
├── ARCHITECTURE.md            ← Diagrama de arquitectura
└── README-SYNC.md             ← Este archivo
```

---

## 🎓 Documentación Adicional

- **DB Design Completo:** Leer `DB-DESIGN.md`
- **Guía de Integración:** Leer `INTEGRATION-GUIDE.md`
- **Arquitectura:** Leer `ARCHITECTURE.md`

---

## 🚀 Próximos Pasos

1. ✅ Diseñar DB robusta
2. ✅ Crear script de migración
3. ✅ Crear background worker
4. ⏳ Instalar dependencias
5. ⏳ Ejecutar migración
6. ⏳ Configurar API key
7. ⏳ Integrar worker en server.js
8. ⏳ Testing
9. ⏳ Deploy

---

## 💡 Notas Importantes

- La sincronización es **en segundo plano**, no bloquea el uso del Print Server
- Las fotos se suben **directamente a Cloudflare R2**, no pasan por el servidor de fotoshow.online
- Si el worker falla, automáticamente **reintenta** hasta 3 veces con backoff exponencial
- Puedes ver el **estado de sincronización** en tiempo real consultando la DB
- La DB SQLite se puede **backupear fácilmente** copiando el archivo `print-server.db`

---

## 📞 Soporte

Si tienes problemas:

1. Revisar logs del worker en consola
2. Verificar tablas en DB: `sqlite3 print-server.db .tables`
3. Verificar settings: `SELECT * FROM settings;`
4. Verificar logs de sync: `SELECT * FROM sync_logs ORDER BY timestamp DESC LIMIT 10;`

---

**Listo para implementar!** 🎉
