const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

// --- FileStorage: local filesystem (data/ directory) ---

class FileStorage {
  constructor(dataDir, options = {}) {
    this.dataDir = dataDir;
    this.ttlDays = options.ttlDays ?? 5;
    this.maxFiles = options.maxFiles ?? 100;
    this.maxSizeMB = options.maxSizeMB ?? 20;
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  _getDataFiles() {
    try {
      return fs.readdirSync(this.dataDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const fp = path.join(this.dataDir, f);
          const stat = fs.statSync(fp);
          let created;
          try {
            const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
            created = new Date(data.created).getTime();
          } catch {
            created = stat.mtimeMs;
          }
          return { file: f, path: fp, size: stat.size, created };
        })
        .sort((a, b) => a.created - b.created);
    } catch {
      return [];
    }
  }

  async save(content) {
    this._enforceStorageCaps();
    const id = generateId();
    const record = { id, content, created: new Date().toISOString() };
    fs.writeFileSync(path.join(this.dataDir, `${id}.json`), JSON.stringify(record));
    return id;
  }

  async get(id) {
    const fp = path.join(this.dataDir, `${id}.json`);
    if (!fs.existsSync(fp)) return null;
    try {
      const record = JSON.parse(fs.readFileSync(fp, 'utf8'));
      return { content: record.content, created: record.created };
    } catch {
      return null;
    }
  }

  async remove(id) {
    const fp = path.join(this.dataDir, `${id}.json`);
    if (!fs.existsSync(fp)) return false;
    try {
      fs.unlinkSync(fp);
      return true;
    } catch {
      return false;
    }
  }

  async cleanup() {
    if (this.ttlDays <= 0) return 0;
    const cutoff = Date.now() - this.ttlDays * 86400000;
    const files = this._getDataFiles();
    let removed = 0;
    for (const f of files) {
      if (f.created < cutoff) {
        try { fs.unlinkSync(f.path); removed++; } catch {}
      }
    }
    if (removed > 0) console.log(`[cleanup] TTL sweep removed ${removed} expired file(s)`);
    return removed;
  }

  _enforceStorageCaps() {
    const files = this._getDataFiles();

    if (this.maxFiles > 0) {
      while (files.length > this.maxFiles) {
        const oldest = files.shift();
        try { fs.unlinkSync(oldest.path); } catch {}
        console.log(`[cleanup] Evicted ${oldest.file} (file count cap)`);
      }
    }

    if (this.maxSizeMB > 0) {
      const maxBytes = this.maxSizeMB * 1024 * 1024;
      let totalSize = files.reduce((sum, f) => sum + f.size, 0);
      while (totalSize > maxBytes && files.length > 0) {
        const oldest = files.shift();
        try { fs.unlinkSync(oldest.path); } catch {}
        totalSize -= oldest.size;
        console.log(`[cleanup] Evicted ${oldest.file} (size cap)`);
      }
    }
  }
}

// --- RedisStorage: Upstash Redis (serverless-friendly) ---

class RedisStorage {
  constructor(options = {}) {
    const { Redis } = require('@upstash/redis');
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    this.ttlSeconds = (options.ttlDays ?? 5) * 86400;
    this.prefix = 'diagram:';
  }

  async save(content) {
    const id = generateId();
    const record = { id, content, created: new Date().toISOString() };
    const opts = this.ttlSeconds > 0 ? { ex: this.ttlSeconds } : undefined;
    await this.redis.set(`${this.prefix}${id}`, JSON.stringify(record), opts);
    return id;
  }

  async get(id) {
    const raw = await this.redis.get(`${this.prefix}${id}`);
    if (!raw) return null;
    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { content: record.content, created: record.created };
  }

  async remove(id) {
    const count = await this.redis.del(`${this.prefix}${id}`);
    return count > 0;
  }

  async cleanup() {
    return 0;
  }
}

// --- Factory ---

function createStorage() {
  const ttlDays = parseInt(process.env.SHARE_TTL_DAYS, 10) || 5;

  if (process.env.UPSTASH_REDIS_REST_URL) {
    console.log('[storage] Using Upstash Redis');
    return new RedisStorage({ ttlDays });
  }

  const dataDir = path.join(__dirname, '..', 'data');
  const maxFiles = parseInt(process.env.SHARE_MAX_FILES, 10) || 100;
  const maxSizeMB = parseInt(process.env.SHARE_MAX_SIZE_MB, 10) || 20;
  console.log('[storage] Using local filesystem');
  return new FileStorage(dataDir, { ttlDays, maxFiles, maxSizeMB });
}

module.exports = { createStorage, FileStorage, RedisStorage };
