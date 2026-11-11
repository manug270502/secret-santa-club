import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function filenameForKey(key) {
  return Buffer.from(key, 'utf8').toString('base64url');
}

function cloneArrayBuffer(buffer) {
  return buffer.slice(0);
}

export class FileBlobStore {
  constructor(directory) {
    this.directory = directory;
    this.locks = new Map();
  }

  async ensureDirectory() {
    await fs.mkdir(this.directory, { recursive: true });
  }

  paths(key) {
    const name = filenameForKey(key);
    return {
      data: path.join(this.directory, `${name}.blob`),
      meta: path.join(this.directory, `${name}.json`),
    };
  }

  async readEntry(key) {
    await this.ensureDirectory();
    const files = this.paths(key);
    try {
      const [data, metadataText] = await Promise.all([
        fs.readFile(files.data),
        fs.readFile(files.meta, 'utf8'),
      ]);
      const record = JSON.parse(metadataText);
      return {
        data,
        metadata: record.metadata || {},
        etag: record.etag,
        format: record.format || 'binary',
      };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async withLock(key, operation) {
    const previous = this.locks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === queued) this.locks.delete(key);
    }
  }

  async write(key, buffer, options, format) {
    return this.withLock(key, async () => {
      const current = await this.readEntry(key);
      if (options.onlyIfNew && current) return { modified: false };
      if (options.onlyIfMatch && (!current || current.etag !== options.onlyIfMatch)) return { modified: false };
      const files = this.paths(key);
      const etag = `"${crypto.createHash('sha256').update(buffer).update(String(Date.now())).digest('base64url')}"`;
      const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const dataTemp = `${files.data}.${suffix}.tmp`;
      const metaTemp = `${files.meta}.${suffix}.tmp`;
      await this.ensureDirectory();
      await fs.writeFile(dataTemp, buffer);
      await fs.writeFile(metaTemp, JSON.stringify({ etag, metadata: options.metadata || {}, format }, null, 2));
      await fs.rename(dataTemp, files.data);
      await fs.rename(metaTemp, files.meta);
      return { modified: true, etag };
    });
  }

  async set(key, value, options = {}) {
    let buffer;
    if (value instanceof ArrayBuffer) buffer = Buffer.from(value);
    else if (ArrayBuffer.isView(value)) buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    else if (typeof value === 'string') buffer = Buffer.from(value, 'utf8');
    else buffer = Buffer.from(JSON.stringify(value), 'utf8');
    return this.write(key, buffer, options, 'binary');
  }

  async setJSON(key, value, options = {}) {
    return this.write(key, Buffer.from(JSON.stringify(value), 'utf8'), options, 'json');
  }

  convert(entry, type) {
    if (type === 'arrayBuffer') {
      const copy = Uint8Array.from(entry.data);
      return cloneArrayBuffer(copy.buffer);
    }
    if (type === 'json') return JSON.parse(entry.data.toString('utf8'));
    return entry.data.toString('utf8');
  }

  async get(key, options = {}) {
    const entry = await this.readEntry(key);
    return entry ? this.convert(entry, options.type) : null;
  }

  async getWithMetadata(key, options = {}) {
    const entry = await this.readEntry(key);
    if (!entry) return null;
    return {
      data: this.convert(entry, options.type),
      metadata: structuredClone(entry.metadata),
      etag: entry.etag,
    };
  }

  async delete(key) {
    return this.withLock(key, async () => {
      const files = this.paths(key);
      await Promise.allSettled([fs.rm(files.data, { force: true }), fs.rm(files.meta, { force: true })]);
    });
  }
}
