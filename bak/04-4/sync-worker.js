/**
 * Background Worker - Sincronización con fotoshow.online
 *
 * Este worker corre en segundo plano y procesa la cola de sincronización.
 * Se inicia junto al servidor principal.
 */

const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'print-server.db');

// =================== CONFIG ===================

const WORKER_INTERVAL_MS = 30000;  // 30 segundos
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_RETRIES = 3;
const RETRY_BACKOFFS = [30000, 120000, 600000];  // 30s, 2min, 10min

// Cargar settings desde DB
let settings = loadSettings();

function loadSettings() {
  const db = new Database(DB_PATH);
  const row = db.prepare('SELECT * FROM settings WHERE id = "settings"').get();
  db.close();

  return row ? {
    enabled: row.sync_enabled === 1,
    interval: row.sync_interval_minutes * 60000 || WORKER_INTERVAL_MS,
    maxConcurrent: row.max_concurrent_uploads || MAX_CONCURRENT_UPLOADS,
    apiUrl: row.fotoshow_api_url || 'https://www.fotoshow.online/api',
    apiKey: row.fotoshow_api_key,
    photographerId: row.photographer_id,
    compressBeforeUpload: row.compress_before_upload === 1,
    compressionQuality: row.compression_quality || 85
  } : null;
}

// =================== DATABASE ===================

class SyncDB {
  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
  }

  close() {
    this.db.close();
  }

  // Obtener items pendientes de la cola
  getPendingQueueItems(limit) {
    return this.db.prepare(`
      SELECT * FROM sync_queue
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `).all(limit);
  }

  // Marcar item como processing
  markItemProcessing(id) {
    return this.db.prepare(`
      UPDATE sync_queue
      SET status = 'processing', started_at = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  // Marcar item como completado
  markItemCompleted(id) {
    return this.db.prepare(`
      UPDATE sync_queue
      SET status = 'completed', completed_at = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  // Marcar item como fallido
  markItemFailed(id, error) {
    const item = this.getItem(id);
    const retryCount = (item.retry_count || 0) + 1;
    const maxRetries = item.max_retries || MAX_RETRIES;

    let nextRetryAt = null;
    if (retryCount < maxRetries) {
      const backoff = RETRY_BACKOFFS[Math.min(retryCount, RETRY_BACKOFFS.length - 1)];
      const nextRetry = Date.now() + backoff;
      nextRetryAt = new Date(nextRetry).toISOString();
    }

    return this.db.prepare(`
      UPDATE sync_queue
      SET status = 'failed',
          retry_count = ?,
          next_retry_at = ?,
          last_error = ?
      WHERE id = ?
    `).run(retryCount, nextRetryAt, error?.message || error, id);
  }

  getItem(id) {
    return this.db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(id);
  }

  // Obtener foto por ID
  getPhoto(id) {
    return this.db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  }

  // Actualizar sync status de foto
  updatePhotoSyncStatus(photoId, status, updates = {}) {
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    this.db.prepare(`
      UPDATE photos
      SET sync_status = ?, ${setClause ? setClause + ',' : ''} updated_at = datetime('now')
      WHERE id = ?
    `).run(status, ...values, photoId);
  }

  // Crear log de sincronización
  createSyncLog(operation, status, { photoId, galleryId, details, error, automatic = true }) {
    const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO sync_logs (
        id, timestamp, operation, photo_id, gallery_id, status,
        details_json, error, automatic
      ) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      operation,
      photoId || null,
      galleryId || null,
      status,
      details ? JSON.stringify(details) : null,
      error || null,
      automatic ? 1 : 0
    );
  }

  // Actualizar stats
  updateStats() {
    const photosTotal = this.db.prepare('SELECT COUNT(*) as c FROM photos WHERE deleted = 0').get().c;
    const photosByStatus = this.db.prepare(`
      SELECT sync_status, COUNT(*) as c
      FROM photos
      WHERE deleted = 0
      GROUP BY sync_status
    `).all();

    const bySyncStatus = {};
    for (const row of photosByStatus) {
      bySyncStatus[row.sync_status] = row.c;
    }

    this.db.prepare(`
      UPDATE stats
      SET photos_total = ?,
          photos_by_sync_status_json = ?,
          updated_at = datetime('now')
      WHERE id = 'stats'
    `).run(photosTotal, JSON.stringify(bySyncStatus));
  }

  // Actualizar last_sync en settings
  updateLastSync() {
    this.db.prepare(`
      UPDATE settings
      SET last_sync_at = datetime('now')
      WHERE id = 'settings'
    `).run();
  }
}

// =================== SYNC OPERATIONS ===================

class SyncOperations {
  constructor(db, settings) {
    this.db = db;
    this.settings = settings;
  }

  async uploadPhoto(photoId) {
    const photo = this.db.getPhoto(photoId);
    if (!photo) throw new Error('Foto no encontrada');

    // Verificar si ya está subida
    if (photo.sync_status === 'uploaded') {
      console.log(`⏭️  Foto ${photo.filename} ya está subida`);
      this.db.createSyncLog('upload_photo', 'success', {
        photoId,
        details: { filename: photo.filename, skipped: true }
      });
      return;
    }

    console.log(`⬆️  Subiendo foto: ${photo.filename}`);

    try {
      // 1. Marcar como syncing
      this.db.updatePhotoSyncStatus(photoId, 'syncing', {
        sync_started_at: new Date().toISOString()
      });

      // 2. Verificar que el archivo existe
      if (!fs.existsSync(photo.local_path)) {
        throw new Error(`Archivo no encontrado: ${photo.local_path}`);
      }

      // 3. Obtener presigned URL de R2
      const urlResponse = await fetch(`${this.settings.apiUrl}/desktop/original-upload-url`, {
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`
        }
      });

      if (!urlResponse.ok) {
        throw new Error(`Error al obtener presigned URL: ${urlResponse.status}`);
      }

      const urlData = await urlResponse.json();
      const presignedUrl = urlData.upload_url;
      const s3Key = urlData.s3_key;

      // 4. Subir original a R2
      const fileBuffer = fs.readFileSync(photo.local_path);

      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': fileBuffer.length
        },
        body: fileBuffer
      });

      if (!uploadResponse.ok) {
        throw new Error(`Error al subir a R2: ${uploadResponse.status}`);
      }

      console.log(`✅ ${photo.filename} subida a R2`);

      // 5. Enviar thumbnail + metadata a fotoshow.online
      const formData = new FormData();
      formData.append('thumbnail', fs.createReadStream(photo.thumb_path), {
        filename: photo.filename
      });
      formData.append('filename', photo.filename);
      formData.append('original_name', photo.original_name);
      formData.append('width', photo.width);
      formData.append('height', photo.height);
      formData.append('size', photo.size);
      formData.append('s3_key', s3Key);
      formData.append('cloud_provider', 'r2');

      if (photo.remote_gallery_id) {
        formData.append('gallery_id', photo.remote_gallery_id);
      }

      const syncResponse = await fetch(`${this.settings.apiUrl}/desktop/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`
        },
        body: formData
      });

      if (!syncResponse.ok) {
        throw new Error(`Error al sync metadata: ${syncResponse.status}`);
      }

      const syncData = await syncResponse.json();

      console.log(`✅ ${photo.filename} sincronizada: ${syncData.photo_id}`);

      // 6. Actualizar foto como uploaded
      this.db.updatePhotoSyncStatus(photoId, 'uploaded', {
        remote_photo_id: syncData.photo_id,
        remote_s3_key: s3Key,
        remote_url: syncData.url || `https://r2.example.com/${s3Key}`,
        synced_at: new Date().toISOString(),
        retry_count: 0,
        last_error: null,
        last_error_at: null
      });

      // 7. Crear log
      this.db.createSyncLog('upload_photo', 'success', {
        photoId,
        details: {
          filename: photo.filename,
          remotePhotoId: syncData.photo_id,
          s3Key,
          uploadTimeMs: Date.now()
        }
      });

      console.log(`✅ Foto ${photo.filename} completada`);

    } catch (error) {
      console.error(`❌ Error subiendo ${photo.filename}:`, error.message);

      // Marcar como failed con error
      this.db.updatePhotoSyncStatus(photoId, 'failed', {
        last_error: error.message,
        last_error_at: new Date().toISOString()
      });

      // Crear log de error
      this.db.createSyncLog('upload_photo', 'failed', {
        photoId,
        details: { filename: photo.filename },
        error: error.message
      });

      throw error;
    }
  }

  async processQueueItem(item) {
    const payload = JSON.parse(item.payload_json);

    switch (item.operation) {
      case 'upload_photo':
        await this.uploadPhoto(payload.photoId);
        break;

      default:
        console.warn(`⚠️  Operación desconocida: ${item.operation}`);
    }
  }
}

// =================== WORKER MAIN ===================

class SyncWorker {
  constructor() {
    this.running = false;
    this.interval = null;
  }

  start() {
    if (this.running) {
      console.log('⚠️  Worker ya está corriendo');
      return;
    }

    console.log('🚀 Iniciando Sync Worker...');
    this.running = true;

    // Recargar settings
    settings = loadSettings();

    if (!settings || !settings.enabled) {
      console.log('⏸️  Sincronización deshabilitada');
      return;
    }

    // Iniciar loop
    this.runLoop();
    this.interval = setInterval(() => this.runLoop(), settings.interval);
  }

  stop() {
    console.log('🛑 Deteniendo Sync Worker...');
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async runLoop() {
    if (!this.running) return;

    const db = new SyncDB();
    const ops = new SyncOperations(db, settings);

    try {
      // Recargar settings por si cambiaron
      settings = loadSettings();
      if (!settings || !settings.enabled) {
        db.close();
        return;
      }

      // Obtener items pendientes
      const limit = settings.maxConcurrent;
      const items = db.getPendingQueueItems(limit);

      if (items.length === 0) {
        // console.log('💤 Cola vacía, nada que procesar');
        db.close();
        return;
      }

      console.log(`\n📋 Procesando ${items.length} item(s) de la cola...`);

      // Procesar cada item
      for (const item of items) {
        try {
          // Marcar como processing
          db.markItemProcessing(item.id);

          // Ejecutar operación
          await ops.processQueueItem(item);

          // Marcar como completado
          db.markItemCompleted(item.id);

        } catch (error) {
          // Marcar como fallido con retry logic
          db.markItemFailed(item.id, error);
          console.error(`❌ Item ${item.id} falló:`, error.message);
        }
      }

      // Actualizar stats
      db.updateStats();
      db.updateLastSync();

      console.log(`✅ Loop completado`);

    } catch (error) {
      console.error('❌ Error en worker loop:', error);
    } finally {
      db.close();
    }
  }
}

// =================== EXPORT ===================

const worker = new SyncWorker();

module.exports = worker;

// Auto-start si se ejecuta directamente
if (require.main === module) {
  worker.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Recibido SIGINT, cerrando worker...');
    worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n👋 Recibido SIGTERM, cerrando worker...');
    worker.stop();
    process.exit(0);
  });
}
