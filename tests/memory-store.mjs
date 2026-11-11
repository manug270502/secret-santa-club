function cloneData(value) {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  if (typeof value === 'string') return value;
  return structuredClone(value);
}

export class MemoryBlobStore {
  constructor() {
    this.entries = new Map();
    this.revision = 0;
  }

  nextEtag() {
    this.revision += 1;
    return `"memory-${this.revision}"`;
  }

  async set(key, value, options = {}) {
    const current = this.entries.get(key);
    if (options.onlyIfNew && current) return { modified: false };
    if (options.onlyIfMatch && (!current || current.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = this.nextEtag();
    this.entries.set(key, {
      data: cloneData(value),
      metadata: structuredClone(options.metadata || {}),
      etag,
    });
    return { modified: true, etag };
  }

  async setJSON(key, value, options = {}) {
    return this.set(key, structuredClone(value), options);
  }

  async get(key, options = {}) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    return this.convert(entry.data, options.type);
  }

  async getWithMetadata(key, options = {}) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    return {
      data: this.convert(entry.data, options.type),
      metadata: structuredClone(entry.metadata),
      etag: entry.etag,
    };
  }

  convert(data, type) {
    if (type === 'json') {
      if (typeof data === 'string') return JSON.parse(data);
      return structuredClone(data);
    }
    if (type === 'arrayBuffer') {
      if (data instanceof ArrayBuffer) return data.slice(0);
      if (typeof data === 'string') return new TextEncoder().encode(data).buffer;
      return new TextEncoder().encode(JSON.stringify(data)).buffer;
    }
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    return JSON.stringify(data);
  }

  async delete(key) {
    this.entries.delete(key);
  }

  async list(options = {}) {
    const prefix = String(options.prefix || '');
    const blobs = [...this.entries.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, entry]) => ({ key, etag: entry.etag }))
      .sort((left, right) => left.key.localeCompare(right.key));
    return { blobs, directories: [] };
  }

  keys() {
    return [...this.entries.keys()];
  }

  raw(key) {
    const entry = this.entries.get(key);
    return entry ? structuredClone(entry.data) : null;
  }
}
