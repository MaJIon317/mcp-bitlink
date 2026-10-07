import { readLimitedBody, BodyTooLargeError } from './body.js';
export { readLimitedBody } from './body.js';
import { ClientMetadataResolver, ClientMetadataError } from './client-metadata.js';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { OAuthStore, tokenHash } from './store.js';

export const oauthScopes = ['invoices.read', 'invoices.create'];
const random = () => randomBytes(32).toString('base64url');
const challenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const now = () => Date.now();
const minutes = (n: number) => n * 60_000;

export interface OAuthConfig {
    publicUrl: string;
    upstreamUrl: string;
    upstreamClientId: string;
    upstreamClientSecret?: string;
    clients: Record<string, { redirectUris: string[] }>;
    store: OAuthStore;
    timeoutMs?: number;
    clientMetadataOrigins?: string[];
}
type Pending = { resource: string; clientId: string; redirectUri: string; state: string; pkce: string; scopes: string[]; verifier: string };
type UpstreamTokens = { access_token: string; refresh_token: string; expires_in: number; token_type: string; scope?: string };
type Connection = { resource: string; clientId: string; scopes: string[]; tokens: UpstreamTokens; upstreamExpires: number; expires: number };
type Grant = { resource: string; connection: string; clientId: string; scopes: string[]; expires: number };
type Code = Pending & { connection: string };


class OAuthFailure extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
}
function json(value: unknown, status = 200) {
    return new Response(JSON.stringify(value), { status, headers: {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer',
    } });
}
function redirect(url: URL) { return new Response(null, { status: 302, headers: { Location: url.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
function secureUrl(value: string, allowQuery = false) {
    const url = new URL(value);
    if (url.username || url.password || url.hash || (!allowQuery && url.search) || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
        throw new Error('OAuth URLs require HTTPS (HTTP is allowed only on loopback) and no credentials, query or fragment');
    }
    return url;
}

/** OAuth authorization server for MCP, federated to the existing Bitlink Passport server. */
export class OAuthService {
    readonly issuer: string;
    readonly resource: string;
    readonly metadataUrl: string;
    private readonly upstream: string;
    private readonly clientMetadata: ClientMetadataResolver;
    private readonly refreshing = new Map<string, Promise<Connection>>();
    constructor(private readonly config: OAuthConfig) {
        this.clientMetadata = new ClientMetadataResolver(config.clientMetadataOrigins, config.timeoutMs);
        const publicUrl = secureUrl(config.publicUrl);
        if (publicUrl.pathname !== '/mcp') throw new Error('BITLINK_MCP_URL must use the /mcp path');
        this.issuer = publicUrl.origin;
        this.resource = publicUrl.href;
        this.metadataUrl = `${this.issuer}/.well-known/oauth-protected-resource/mcp`;
        const upstream = secureUrl(config.upstreamUrl);
        if (upstream.pathname !== '/') throw new Error('BITLINK_OAUTH_BASE_URL must be an origin');
        this.upstream = upstream.origin;
        for (const client of Object.values(config.clients)) {
            if (!client.redirectUris.length) throw new Error('OAuth clients require exact redirect URIs');
            for (const uri of client.redirectUris) secureUrl(uri, true);
        }
    }
    challenge(error = 'invalid_token', scope = 'invoices.read') {
        return `Bearer resource_metadata="${this.metadataUrl}", scope="${scope}", error="${error}", error_description="Authorization required"`;
    }
    unauthorized(status = 401, error = 'invalid_token', scope = 'invoices.read') {
        const response = json({ error, error_description: 'Authorization required' }, status);
        response.headers.set('WWW-Authenticate', this.challenge(error, scope));
        return response;
    }
    private single(params: URLSearchParams, key: string) {
        if (params.getAll(key).length > 1) throw new OAuthFailure('invalid_request', `Duplicate ${key}`);
        return params.get(key) ?? '';
    }
    private async validateClient(params: URLSearchParams) {
        const id = this.single(params, 'client_id');
        const client = this.config.clients[id];
        if (Object.hasOwn(this.config.clients, id) && client) return { id, client };
        try { return { id, client: await this.clientMetadata.resolve(id) }; }
        catch (error) {
            if (error instanceof ClientMetadataError) throw new OAuthFailure('invalid_client', 'Unknown client or invalid client metadata');
            throw error;
        }
    }
    private validateResource(params: URLSearchParams) {
        if (this.single(params, 'resource') !== this.resource) throw new OAuthFailure('invalid_target', 'Incorrect MCP resource');
    }
    private async upstreamTokens(params: Record<string, string>): Promise<UpstreamTokens> {
        const response = await fetch(`${this.upstream}/oauth/token`, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams({ ...params, client_id: this.config.upstreamClientId,
                ...(this.config.upstreamClientSecret ? { client_secret: this.config.upstreamClientSecret } : {}),
            }),
        });
        if (!response.ok) {
            // Include only known protocol errors; upstream response bodies may contain secrets.
            const body = await response.json().catch(() => null) as { error?: unknown } | null;
            const knownErrors = ['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope', 'server_error', 'temporarily_unavailable'];
            const upstreamError = typeof body?.error === 'string' && knownErrors.includes(body.error) ? body.error : 'unknown_error';
            throw new OAuthFailure(response.status >= 500 ? 'server_error' : 'invalid_grant',
                `Bitlink /oauth/token returned HTTP ${response.status} (${upstreamError})`, response.status >= 500 ? 502 : 400);
        }
        const tokens = await response.json() as UpstreamTokens;
        if (typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token || (tokens.scope !== undefined && typeof tokens.scope !== 'string') || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || typeof tokens.token_type !== 'string' || tokens.token_type.toLowerCase() !== 'bearer') {
            throw new OAuthFailure('server_error', 'Invalid authorization server response', 502);
        }
        return tokens;
    }
    async handle(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        const path = url.pathname;
        const paths = ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/oauth/authorize', '/oauth/callback', '/oauth/token', '/oauth/revoke'];
        if (!paths.includes(path)) return null;
        const expected = ['/oauth/token', '/oauth/revoke'].includes(path) ? 'POST' : 'GET';
        if (request.method !== expected) return json({ error: 'invalid_request' }, 405);
        try {
            if (path.startsWith('/.well-known/oauth-protected-resource')) {
                return json({ resource: this.resource, authorization_servers: [this.issuer], scopes_supported: oauthScopes,
                    bearer_methods_supported: ['header'], resource_name: 'Bitlink MCP' });
            }
            if (path === '/.well-known/oauth-authorization-server') {
                return json({ issuer: this.issuer, authorization_endpoint: `${this.issuer}/oauth/authorize`, token_endpoint: `${this.issuer}/oauth/token`,
                    revocation_endpoint: `${this.issuer}/oauth/revoke`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
                    token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: oauthScopes,
                    client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true });
            }
            if (path === '/oauth/authorize') return await this.authorize(url.searchParams);
            if (path === '/oauth/callback') return await this.callback(url.searchParams);
            if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new OAuthFailure('invalid_request', 'Expected form encoding');
            const body = await readLimitedBody(request, 16_384);
            const params = new URLSearchParams(body);
            const { id } = await this.validateClient(params);
            if (path === '/oauth/revoke') {
                const token = this.single(params, 'token');
                const grant = this.config.store.get<Grant>(`refresh:${tokenHash(token)}`) ?? this.config.store.get<Grant>(`access:${tokenHash(token)}`) ?? this.config.store.get<Grant>(`used:${tokenHash(token)}`);
                if (grant?.clientId === id) this.config.store.delete(`connection:${grant.connection}`);
                return json({});
            }
            this.validateResource(params);
            return await this.token(params, id);
        } catch (error) {
            if (error instanceof BodyTooLargeError) return json({ error: 'invalid_request', error_description: 'Request too large' }, 413);
            if (error instanceof OAuthFailure) return json({ error: error.code, error_description: error.message }, error.status);
            return json({ error: 'server_error', error_description: 'Authorization service unavailable' }, 503);
        }
    }
    private async authorize(params: URLSearchParams) {
        const { id, client } = await this.validateClient(params);
        const redirectUri = this.single(params, 'redirect_uri');
        if (!client.redirectUris.includes(redirectUri)) throw new OAuthFailure('invalid_request', 'Unregistered redirect URI');
        try {
            this.validateResource(params);
            const state = this.single(params, 'state');
            const pkce = this.single(params, 'code_challenge');
            if (this.single(params, 'response_type') !== 'code' || this.single(params, 'code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(pkce) || !state || state.length > 2048) {
                throw new OAuthFailure('invalid_request', 'Authorization code, state and S256 PKCE are required');
            }
            const scopes = (this.single(params, 'scope') || 'invoices.read').split(' ').filter(Boolean);
            if (!scopes.length || scopes.some(scope => !oauthScopes.includes(scope))) throw new OAuthFailure('invalid_scope', 'Unsupported scope');
            const verifier = random();
            const upstreamState = random();
            this.config.store.put(`pending:${tokenHash(upstreamState)}`, { resource: this.resource, clientId: id, redirectUri, state, pkce, scopes, verifier } satisfies Pending, now() + minutes(10));
            const target = new URL(`${this.upstream}/oauth/authorize`);
            target.search = new URLSearchParams({ response_type: 'code', client_id: this.config.upstreamClientId,
                redirect_uri: `${this.issuer}/oauth/callback`, scope: scopes.join(' '), state: upstreamState,
                code_challenge_method: 'S256', code_challenge: challenge(verifier),
            }).toString();
            return redirect(target);
        } catch (error) {
            if (!(error instanceof OAuthFailure)) throw error;
            const target = new URL(redirectUri);
            target.searchParams.set('error', error.code);
            target.searchParams.set('error_description', error.message);
            const state = params.getAll('state').length === 1 ? params.get('state') : null;
            if (state) target.searchParams.set('state', state);
            target.searchParams.set('iss', this.issuer);
            return redirect(target);
        }
    }
    private async callback(params: URLSearchParams) {
        const state = this.single(params, 'state');
        const pending = this.config.store.take<Pending>(`pending:${tokenHash(state)}`);
        if (!pending || pending.resource !== this.resource) throw new OAuthFailure('invalid_request', 'Unknown or expired authorization state');
        const target = new URL(pending.redirectUri);
        target.searchParams.set('state', pending.state);
        target.searchParams.set('iss', this.issuer);
        const issuer = this.single(params, 'iss');
        if (issuer && issuer !== this.upstream) throw new OAuthFailure('invalid_request', 'Unexpected upstream issuer');
        if (this.single(params, 'error')) {
            target.searchParams.set('error', 'access_denied');
            return redirect(target);
        }
        const code = this.single(params, 'code');
        if (!code) throw new OAuthFailure('invalid_request', 'Missing authorization code');
        const tokens = await this.upstreamTokens({ grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: `${this.issuer}/oauth/callback` });
        if (tokens.scope && pending.scopes.some(scope => !tokens.scope!.split(' ').includes(scope))) throw new OAuthFailure('invalid_scope', 'Required permissions were not granted');
        const connection = random();
        const expires = now() + 30 * 24 * 60 * 60_000;
        this.config.store.put(`connection:${connection}`, { resource: this.resource, clientId: pending.clientId, scopes: pending.scopes, tokens, upstreamExpires: now() + tokens.expires_in * 1000, expires } satisfies Connection, expires);
        const localCode = random();
        this.config.store.put(`code:${tokenHash(localCode)}`, { ...pending, connection } satisfies Code, now() + minutes(5));
        target.searchParams.set('code', localCode);
        return redirect(target);
    }
    private issue(connectionId: string, connection: Connection) {
        const access = random(); const refresh = random();
        const expires = Math.min(now() + minutes(15), connection.expires);
        const grant: Grant = { resource: this.resource, connection: connectionId, clientId: connection.clientId, scopes: connection.scopes, expires };
        this.config.store.put(`access:${tokenHash(access)}`, grant, expires);
        this.config.store.put(`refresh:${tokenHash(refresh)}`, grant, connection.expires);
        return json({ access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: Math.floor((expires - now()) / 1000), scope: connection.scopes.join(' ') });
    }
    private async token(params: URLSearchParams, clientId: string) {
        const type = this.single(params, 'grant_type');
        if (type === 'authorization_code') {
            const code = this.config.store.get<Code>(`code:${tokenHash(this.single(params, 'code'))}`);
            const verifier = this.single(params, 'code_verifier');
            if (!code || code.resource !== this.resource || code.clientId !== clientId || code.redirectUri !== this.single(params, 'redirect_uri') || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !equal(challenge(verifier), code.pkce)) {
                throw new OAuthFailure('invalid_grant', 'Invalid authorization code or PKCE');
            }
            const taken = this.config.store.take<Code>(`code:${tokenHash(this.single(params, 'code'))}`);
            const connection = taken && this.config.store.get<Connection>(`connection:${taken.connection}`);
            if (!connection) throw new OAuthFailure('invalid_grant', 'Expired connection');
            return this.issue(code.connection, connection);
        }
        if (type === 'refresh_token') {
            const key = tokenHash(this.single(params, 'refresh_token'));
            const grant = this.config.store.get<Grant>(`refresh:${key}`);
            if (!grant || grant.resource !== this.resource || grant.clientId !== clientId) {
                const used = this.config.store.get<Grant>(`used:${key}`);
                if (used?.clientId === clientId) this.config.store.delete(`connection:${used.connection}`);
                throw new OAuthFailure('invalid_grant', 'Invalid refresh token');
            }
            const connection = this.config.store.get<Connection>(`connection:${grant.connection}`);
            if (!connection) throw new OAuthFailure('invalid_grant', 'Expired connection');
            const requested = this.single(params, 'scope');
            if (requested && requested.split(' ').some(scope => !grant.scopes.includes(scope))) throw new OAuthFailure('invalid_scope', 'Refresh cannot increase permissions');
            if (!this.config.store.take<Grant>(`refresh:${key}`)) throw new OAuthFailure('invalid_grant', 'Refresh token already consumed');
            this.config.store.put(`used:${key}`, grant, connection.expires);
            const updated = await this.ensureUpstream(grant.connection, connection);
            return this.issue(grant.connection, { ...updated, scopes: requested ? requested.split(' ').filter(Boolean) : grant.scopes });
        }
        throw new OAuthFailure('unsupported_grant_type', 'Use authorization_code or refresh_token');
    }
    private async ensureUpstream(id: string, connection: Connection): Promise<Connection> {
        if (connection.upstreamExpires > now() + 30_000) return connection;
        const running = this.refreshing.get(id);
        if (running) return running;
        const refresh = (async () => {
            try {
                const tokens = await this.upstreamTokens({ grant_type: 'refresh_token', refresh_token: connection.tokens.refresh_token });
                if (tokens.scope && connection.scopes.some(scope => !tokens.scope!.split(' ').includes(scope))) throw new OAuthFailure('invalid_scope', 'Upstream permissions changed');
                const updated = { ...connection, tokens, upstreamExpires: now() + tokens.expires_in * 1000 };
                if (!this.config.store.get<Connection>(`connection:${id}`)) throw new OAuthFailure('invalid_grant', 'Connection was revoked');
                this.config.store.put(`connection:${id}`, updated, connection.expires);
                return updated;
            } catch (error) {
                // Never retry a possibly consumed upstream refresh token.
                this.config.store.delete(`connection:${id}`);
                throw error;
            }
        })();
        this.refreshing.set(id, refresh);
        try { return await refresh; } finally { this.refreshing.delete(id); }
    }
    async authenticate(token: string): Promise<{ authInfo: AuthInfo; upstreamToken: string } | null> {
        const grant = this.config.store.get<Grant>(`access:${tokenHash(token)}`);
        const connection = grant && this.config.store.get<Connection>(`connection:${grant.connection}`);
        if (!grant || grant.resource !== this.resource || !connection || connection.resource !== this.resource || connection.clientId !== grant.clientId) return null;
        try {
            const current = await this.ensureUpstream(grant.connection, connection);
            return { authInfo: { token, clientId: grant.clientId, scopes: grant.scopes, expiresAt: Math.floor(grant.expires / 1000),
                extra: { upstreamToken: current.tokens.access_token } }, upstreamToken: current.tokens.access_token };
        } catch { return null; }
    }
}
