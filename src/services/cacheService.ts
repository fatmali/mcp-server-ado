import NodeCache from 'node-cache';
import { logger } from '../utils/logger.js';

export class CacheService {
    private cache: NodeCache;
    
    constructor(ttlSeconds: number = 3600) {
        this.cache = new NodeCache({
            stdTTL: ttlSeconds,
            checkperiod: ttlSeconds * 0.2,
            useClones: false
        });

        // Handle cache errors
        this.cache.on('error', (err) => {
            logger.error('Cache error:', err);
        });
    }

    get<T>(key: string): T | undefined {
        try {
            return this.cache.get<T>(key);
        } catch (err) {
            logger.error('Error retrieving from cache:', err);
            return undefined;
        }
    }

    set(key: string, value: any, ttl: number): boolean {
        try {
            return this.cache.set(key, value, ttl);
        } catch (err) {
            logger.error('Error setting cache:', err);
            return false;
        }
    }

    del(key: string): number {
        try {
            return this.cache.del(key);
        } catch (err) {
            logger.error('Error deleting from cache:', err);
            return 0;
        }
    }

    flush(): void {
        try {
            this.cache.flushAll();
        } catch (err) {
            logger.error('Error flushing cache:', err);
        }
    }
}
