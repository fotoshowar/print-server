/**
 * Migración de DB: db.json (JSON simple) → SQLite3 (DB robusta)
 *
 * Uso:
 * node db-migrate.js              - Migrar
 * node db-migrate.js --dry-run   - Ver qué haría sin ejecutar
 * node db-migrate.js --backup    - Crear backup antes de migrar
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'db.json');
const NEW_DB_PATH = path.join(__dirname, 'print-server.db');
const BACKUP_PATH = path.join(__dirname, `db-backup-${Date.now()}.json`);

const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP = process.argv.includes('--backup');

// =================== HELPERS ===================

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function calculateHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath);
  return `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
}

function now() {
  return new Date().toISOString();
}

// =================== CARGAR DB ACTUAL ===================

console.log('📂 Cargando db.json...');
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ db.json no encontrado');
  process.exit(1);
}

const oldDB = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

console.log(`✅ ${Object.keys(oldDB.photos || {}).length} fotos encontradas`);
console.log(`📊 Stats:`, oldDB.stats || {});

if (BACKUP) {
  console.log(`💾 Creando backup: ${BACKUP_PATH}`);
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log('✅ Backup creado');
}

// =================== PREPARAR NUEVA DB ===================

console.log('\n🗄️ Preparando nueva DB (SQLite3)...');

if (!DRY_RUN) {
  if (fs.existsSync(NEW_DB_PATH)) {
    console.log('⚠️  print-server.db ya existe, respaldando...');
    fs.copyFileSync(NEW_DB_PATH, `${NEW_DB_PATH}.old`);
  }
}

const db = new Database(DRY_RUN ? ':memory:' : NEW_DB_PATH);

// Habilitar modo WAL para mejor rendimiento
db.pragma('journal_mode = WAL');

// =================== CREAR TABLAS ===================

console.log('📝 Creando tablas...');

db.exec(`
  -- PHOTOS
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    date TEXT NOT NULL,
    local_path TEXT NOT NULL,
    thumb_path TEXT NOT NULL,

    size INTEGER NOT NULL,
    thumb_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    is_horizontal INTEGER NOT NULL,

    share_code TEXT NOT NULL UNIQUE,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT,
    sync_started_at TEXT,

    printed INTEGER DEFAULT 0,
    downloaded INTEGER DEFAULT 0,

    sync_status TEXT DEFAULT 'pending', -- pending | syncing | uploaded | failed | skipped
    remote_photo_id TEXT,
    remote_url TEXT,
    remote_gallery_id TEXT,
    remote_s3_key TEXT,

    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    last_error_at TEXT,

    hash TEXT,
    deleted INTEGER DEFAULT 0,
    deleted_at TEXT
  );

  -- GALLERIES
  CREATE TABLE IF NOT EXISTS galleries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    local_date TEXT NOT NULL,

    remote_gallery_id TEXT UNIQUE,
    remote_url TEXT,
    remote_active INTEGER DEFAULT 1,
    remote_private INTEGER DEFAULT 0,

    auto_sync INTEGER DEFAULT 1,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_sync_at TEXT,

    photo_count INTEGER DEFAULT 0,
    synced_count INTEGER DEFAULT 0,
    pending_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0
  );

  -- SYNC_LOGS
  CREATE TABLE IF NOT EXISTS sync_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    operation TEXT NOT NULL, -- upload_photo | update_metadata | delete_photo | create_gallery
    photo_id TEXT,
    gallery_id TEXT,

    status TEXT NOT NULL, -- success | failed | partial

    details_json TEXT, -- JSON serializado
    error TEXT,

    attempt INTEGER DEFAULT 1,
    automatic INTEGER DEFAULT 1
  );

  -- SYNC_QUEUE
  CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    priority TEXT DEFAULT 'normal', -- low | normal | high

    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,

    status TEXT DEFAULT 'pending', -- pending | processing | completed | failed
    started_at TEXT,
    completed_at TEXT,

    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TEXT,

    last_error TEXT
  );

  -- SETTINGS
  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'settings',

    -- SYNC
    sync_enabled INTEGER DEFAULT 1,
    sync_interval_minutes INTEGER DEFAULT 5,
    max_concurrent_uploads INTEGER DEFAULT 3,
    auto_create_gallery INTEGER DEFAULT 1,
    default_gallery_id TEXT,
    compress_before_upload INTEGER DEFAULT 1,
    compression_quality INTEGER DEFAULT 85,

    -- FOTOSHOW
    fotoshow_api_url TEXT DEFAULT 'https://www.fotoshow.online/api',
    fotoshow_api_key TEXT,
    photographer_id TEXT,
    desktop_token TEXT,

    -- CLOUD
    r2_bucket TEXT,
    r2_endpoint TEXT,

    -- TIMESTAMPS
    last_sync_at TEXT,
    updated_at TEXT
  );

  -- STATS
  CREATE TABLE IF NOT EXISTS stats (
    id TEXT PRIMARY KEY DEFAULT 'stats',

    -- PHOTOS
    photos_total INTEGER DEFAULT 0,
    photos_by_date_json TEXT, -- JSON: {"2026-03-31": 2, ...}
    photos_by_sync_status_json TEXT, -- JSON: {"uploaded": 200, ...}

    -- GALLERIES
    galleries_total INTEGER DEFAULT 0,
    galleries_active INTEGER DEFAULT 0,
    galleries_auto_sync INTEGER DEFAULT 0,

    -- SYNC
    sync_total_operations INTEGER DEFAULT 0,
    sync_successful INTEGER DEFAULT 0,
    sync_failed INTEGER DEFAULT 0,

    -- USAGE
    usage_total_printed INTEGER DEFAULT 0,
    usage_total_downloaded INTEGER DEFAULT 0,

    updated_at TEXT
  );
`);

// =================== CREAR ÍNDICES ===================

console.log('📌 Creando índices...');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_photos_date ON photos(date);
  CREATE INDEX IF NOT EXISTS idx_photos_sync_status ON photos(sync_status);
  CREATE INDEX IF NOT EXISTS idx_photos_gallery ON photos(remote_gallery_id);
  CREATE INDEX IF NOT EXISTS idx_photos_hash ON photos(hash);
  CREATE INDEX IF NOT EXISTS idx_photos_deleted ON photos(deleted);

  CREATE INDEX IF NOT EXISTS idx_galleries_remote ON galleries(remote_gallery_id);
  CREATE INDEX IF NOT EXISTS idx_galleries_autosync ON galleries(auto_sync);
  CREATE INDEX IF NOT EXISTS idx_galleries_date ON galleries(local_date);

  CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, priority);
  CREATE INDEX IF NOT EXISTS idx_sync_queue_retry ON sync_queue(next_retry_at);

  CREATE INDEX IF NOT EXISTS idx_sync_logs_timestamp ON sync_logs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_sync_logs_photo ON sync_logs(photo_id);
  CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
`);

// =================== PREPARED STATEMENTS ===================

console.log('⚡ Preparando statements...');

const insertPhoto = db.prepare(`
  INSERT INTO photos (
    id, filename, original_name, date, local_path, thumb_path,
    size, thumb_size, width, height, is_horizontal,
    share_code,
    created_at, updated_at,
    printed, downloaded,
    sync_status, hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertSyncQueue = db.prepare(`
  INSERT INTO sync_queue (
    id, created_at, priority, operation, payload_json, status
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const insertSettings = db.prepare(`
  INSERT OR REPLACE INTO settings (
    id, sync_enabled, sync_interval_minutes, max_concurrent_uploads,
    auto_create_gallery, compress_before_upload, compression_quality,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertStats = db.prepare(`
  INSERT OR REPLACE INTO stats (
    id, photos_total, usage_total_printed, usage_total_downloaded, updated_at
  ) VALUES (?, ?, ?, ?, ?)
`);

// =================== MIGRAR FOTOS ===================

console.log('\n🔄 Migrando fotos...');

const photosByDate = {};
const photosBySyncStatus = { pending: 0, uploaded: 0 };

let migratedCount = 0;
for (const [filename, photo] of Object.entries(oldDB.photos || {})) {
  const photoId = generateUUID();
  const localPath = path.join(__dirname, 'uploads', photo.date, filename);
  const thumbPath = path.join(__dirname, 'thumbs', photo.date, filename);
  const hash = calculateHash(localPath);

  insertPhoto.run(
    photoId,
    filename,
    photo.originalName || filename,
    photo.date,
    localPath,
    thumbPath,

    photo.size,
    photo.thumbSize,
    photo.width,
    photo.height,
    photo.isHorizontal ? 1 : 0,

    photo.shareCode,

    photo.uploadedAt || now(),
    now(),

    photo.printed || 0,
    photo.downloaded || 0,

    'pending',  // status inicial: pendiente de sync
    hash
  );

  // Agregar a cola de sincronización
  insertSyncQueue.run(
    generateUUID(),
    now(),
    'normal',
    'upload_photo',
    JSON.stringify({ photoId }),
    'pending'
  );

  // Estadísticas por fecha
  if (!photosByDate[photo.date]) photosByDate[photo.date] = 0;
  photosByDate[photo.date]++;
  photosBySyncStatus.pending++;

  migratedCount++;

  if (migratedCount % 50 === 0) {
    console.log(`   → ${migratedCount} fotos migradas...`);
  }
}

console.log(`✅ ${migratedCount} fotos migradas`);

// =================== CREAR GALERÍAS (POR FECHA) ===================

console.log('\n🎨 Creando galerías por fecha...');

const insertGallery = db.prepare(`
  INSERT INTO galleries (
    id, name, local_date,
    auto_sync,
    created_at, updated_at,
    photo_count, pending_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let galleryCount = 0;
for (const [date, count] of Object.entries(photosByDate)) {
  const galleryId = generateUUID();
  const displayName = formatDateForGallery(date);

  insertGallery.run(
    galleryId,
    displayName,
    date,
    1,  // auto_sync = true
    now(),
    now(),
    count,
    count  // todas están pending
  );

  // Actualizar fotos para apuntar a esta galería
  db.prepare(`
    UPDATE photos
    SET remote_gallery_id = ?
    WHERE date = ?
  `).run(galleryId, date);

  galleryCount++;
}

console.log(`✅ ${galleryCount} galerías creadas`);

// =================== INSERTAR SETTINGS DEFAULT ===================

console.log('\n⚙️  Creando settings...');

insertSettings.run(
  'settings',
  1,  // sync_enabled
  5,  // sync_interval_minutes
  3,  // max_concurrent_uploads
  1,  // auto_create_gallery
  1,  // compress_before_upload
  85, // compression_quality
  now()
);

// =================== INSERTAR STATS ===================

console.log('\n📊 Creando stats...');

upsertStats.run(
  'stats',
  migratedCount,
  oldDB.stats?.totalPrinted || 0,
  oldDB.stats?.totalDownloaded || 0,
  now()
);

// Actualizar stats con JSON
db.prepare(`
  UPDATE stats
  SET photos_by_date_json = ?,
      photos_by_sync_status_json = ?,
      galleries_total = ?,
      galleries_auto_sync = ?
  WHERE id = 'stats'
`).run(
  JSON.stringify(photosByDate),
  JSON.stringify(photosBySyncStatus),
  galleryCount,
  galleryCount
);

// =================== FINALIZAR ===================

if (DRY_RUN) {
  console.log('\n✅ DRY RUN completado (sin cambios)');
  db.close();
} else {
  console.log('\n✅ Migración completada!');
  console.log(`📁 Nueva DB: ${NEW_DB_PATH}`);
  console.log(`💾 Backup: ${BACKUP}`);

  console.log('\n📊 Resumen:');
  console.log(`   - Fotos migradas: ${migratedCount}`);
  console.log(`   - Galerías creadas: ${galleryCount}`);
  console.log(`   - Items en sync queue: ${migratedCount}`);
  console.log(`   - Sync status: ${photosBySyncStatus.pending} pendientes`);

  db.close();
}

// =================== HELPER ===================

function formatDateForGallery(date) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (date === today) return '📸 Hoy';
  if (date === yesterday) return '📸 Ayer';

  const [year, month, day] = date.split('-');
  return `📅 ${day}/${month}/${year}`;
}
