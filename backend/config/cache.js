const { createClient } = require('redis');
require('dotenv').config();

class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlSeconds) {
    const expiry = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null;
    // Keep a deep copy or buffer as is to avoid reference mutations
    let valToStore = value;
    if (value && typeof value === 'object' && !(value instanceof Buffer)) {
      valToStore = JSON.parse(JSON.stringify(value));
    }
    this.store.set(key, { value: valToStore, expiry });
  }

  del(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

let redisClient = null;
const memoryCache = new MemoryCache();
let useMemoryOnly = false;

if (process.env.REDIS_URL) {
  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => {
        if (retries > 2) {
          console.warn('Redis reconnection failed twice. Switching to memory cache fallback.');
          useMemoryOnly = true;
          return new Error('Redis connection lost');
        }
        return Math.min(retries * 500, 2000);
      }
    }
  });

  redisClient.on('error', (err) => {
    // Suppress spamming logs on connection errors, but notify switch
    if (!useMemoryOnly) {
      console.warn('Redis connection issue, falling back to memory cache.');
      useMemoryOnly = true;
    }
  });

  redisClient.on('connect', () => {
    console.log('Redis client connected successfully.');
    useMemoryOnly = false;
  });

  redisClient.connect().catch((err) => {
    console.warn('Could not establish initial Redis connection, using in-memory cache.');
    useMemoryOnly = true;
  });
} else {
  console.log('No REDIS_URL configured, utilizing in-memory cache.');
  useMemoryOnly = true;
}

const cache = {
  async get(key) {
    if (useMemoryOnly) {
      return memoryCache.get(key);
    }
    try {
      const data = await redisClient.get(key);
      if (!data) return null;
      try {
        return JSON.parse(data);
      } catch {
        return data; // Return raw format (e.g. if plain string or buffer representation)
      }
    } catch (err) {
      return memoryCache.get(key);
    }
  },

  async set(key, value, ttlSeconds) {
    if (useMemoryOnly) {
      memoryCache.set(key, value, ttlSeconds);
      return;
    }
    try {
      const strValue = typeof value === 'object' && !(value instanceof Buffer) ? JSON.stringify(value) : value;
      if (ttlSeconds) {
        await redisClient.set(key, strValue, { EX: ttlSeconds });
      } else {
        await redisClient.set(key, strValue);
      }
    } catch (err) {
      memoryCache.set(key, value, ttlSeconds);
    }
  },

  async del(key) {
    if (useMemoryOnly) {
      memoryCache.del(key);
      return;
    }
    try {
      await redisClient.del(key);
    } catch (err) {
      memoryCache.del(key);
    }
  }
};

module.exports = cache;
