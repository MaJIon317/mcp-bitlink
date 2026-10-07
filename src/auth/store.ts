import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export function tokenHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/** Persistent records, with secrets encrypted using an operator-managed AES-256 key. */
export class OAuthStore {
    private readonly db: DatabaseSync;
    constructor(path: string, private readonly key: Buffer) {
        if (key.length !== 32) throw new Error('OAUTH_ENCRYPTION_KEY must decode to 32 bytes');
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        this.db = new DatabaseSync(path);
        chmodSync(path, 0o600);
        this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)');
    }
    put(id: string, value: unknown, expires: number) {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
        cipher.setAAD(Buffer.from(id));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
        const data = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
        this.db.prepare('INSERT OR REPLACE INTO records VALUES (?, ?, ?)').run(id, data, expires);
        this.db.prepare('DELETE FROM records WHERE expires <= ?').run(Date.now());
    }
    get<T>(id: string): T | null {
        const row = this.db.prepare('SELECT value FROM records WHERE id = ? AND expires > ?').get(id, Date.now());
        if (!row) return null;
        const data = Buffer.from(row.value as string, 'base64');
        const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
        decipher.setAAD(Buffer.from(id));
        decipher.setAuthTag(data.subarray(12, 28));
        return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString()) as T;
    }
    take<T>(id: string): T | null {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const value = this.get<T>(id);
            this.delete(id);
            this.db.exec('COMMIT');
            return value;
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    delete(id: string) { this.db.prepare('DELETE FROM records WHERE id = ?').run(id); }
    close() { this.db.close(); }
}
