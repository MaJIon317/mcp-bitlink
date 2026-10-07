import { readLimitedBody } from './body.js';

export interface OAuthClientMetadata { redirectUris: string[] }
export class ClientMetadataError extends Error {}

/** Resolve only operator-trusted HTTPS origins; never follow redirects or send credentials. */
export class ClientMetadataResolver {
    private readonly cache = new Map<string, { client: OAuthClientMetadata; expires: number }>();
    private readonly origins: Set<string>;
    constructor(origins: string[] = ['https://chatgpt.com'], private readonly timeoutMs = 10_000) {
        this.origins = new Set(origins.map(value => {
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
                throw new Error('Client metadata origins must be HTTPS origins without paths or credentials');
            }
            return url.origin;
        }));
    }
    async resolve(id: string): Promise<OAuthClientMetadata> {
        let url: URL;
        try { url = new URL(id); } catch { throw new ClientMetadataError('Invalid client metadata URL'); }
        if (id.length > 2048 || url.protocol !== 'https:' || url.pathname === '/' || url.username || url.password || url.hash || !this.origins.has(url.origin)) {
            throw new ClientMetadataError('Untrusted client metadata URL');
        }
        const cached = this.cache.get(id);
        if (cached && cached.expires > Date.now()) return cached.client;
        try {
            const response = await fetch(id, { redirect: 'error', credentials: 'omit',
                headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
            if (!response.ok || response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
                throw new ClientMetadataError('Client metadata must be an application/json response');
            }
            const data = JSON.parse(await readLimitedBody(response, 64 * 1024)) as Record<string, unknown>;
            if (!data || data.client_id !== id || typeof data.client_name !== 'string' || !data.client_name.trim() ||
                !Array.isArray(data.redirect_uris) || !data.redirect_uris.length || data.redirect_uris.length > 100) {
                throw new ClientMetadataError('Invalid client metadata identity or redirect URIs');
            }
            const redirectUris = data.redirect_uris.map(value => {
                if (typeof value !== 'string') throw new ClientMetadataError('Invalid redirect URI');
                const uri = new URL(value);
                if (uri.protocol !== 'https:' || uri.username || uri.password || uri.hash || value.includes('*')) throw new ClientMetadataError('Invalid redirect URI');
                return value;
            });
            const methods = data.token_endpoint_auth_methods_supported ?? [data.token_endpoint_auth_method ?? 'none'];
            if (!Array.isArray(methods) || !methods.every(method => typeof method === 'string') || !methods.includes('none') ||
                (data.response_types !== undefined && (!Array.isArray(data.response_types) || !data.response_types.includes('code'))) ||
                (data.grant_types !== undefined && (!Array.isArray(data.grant_types) || !data.grant_types.includes('authorization_code')))) {
                throw new ClientMetadataError('Client does not support public authorization-code exchange');
            }
            const client = { redirectUris };
            const cacheControl = response.headers.get('cache-control') ?? '';
            const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl)?.[1];
            const ttl = /(?:no-store|no-cache)/i.test(cacheControl) ? 0 : Math.min(maxAge ? Number(maxAge) * 1000 : 300_000, 300_000);
            const age = Number(response.headers.get('age') ?? 0) * 1000;
            const expires = Date.now() + Math.max(0, ttl - (Number.isFinite(age) ? age : ttl));
            for (const [key, value] of this.cache) if (value.expires <= Date.now()) this.cache.delete(key);
            if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
            if (expires > Date.now()) this.cache.set(id, { client, expires });
            return client;
        } catch (error) {
            if (error instanceof ClientMetadataError) throw error;
            throw new ClientMetadataError('Unable to retrieve valid client metadata');
        }
    }
}
