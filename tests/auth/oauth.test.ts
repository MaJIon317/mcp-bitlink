import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { OAuthService } from '../../src/auth/oauth.js';
import { OAuthStore } from '../../src/auth/store.js';

const resource = 'https://mcp.example.test/mcp';
const callback = 'https://chatgpt.com/connector/oauth/test';
const verifier = 'a'.repeat(43);
const pkce = createHash('sha256').update(verifier).digest('base64url');
const upstreamAccess = 'bitlink-secret-access';
let folder: string;
let store: OAuthStore;
let oauth: OAuthService;
let upstream: MockInstance<typeof fetch>;

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'bitlink-oauth-'));
    store = new OAuthStore(join(folder, 'oauth.sqlite'), Buffer.alloc(32, 7));
    oauth = service();
    upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
        token_type: 'Bearer', access_token: upstreamAccess, refresh_token: 'bitlink-secret-refresh', expires_in: 900,
    })));
});
afterEach(() => { store.close(); rmSync(folder, { recursive: true, force: true }); vi.restoreAllMocks(); vi.useRealTimers(); });
function service() {
    return new OAuthService({ publicUrl: resource, upstreamUrl: 'https://bitlink.example.test', upstreamClientId: 'passport-client',
        clients: { chatgpt: { redirectUris: [callback] }, other: { redirectUris: ['https://other.example.test/callback'] } }, store });
}
async function handle(path: string, params?: Record<string, string>, method = 'POST') {
    return (await oauth.handle(new Request(`https://mcp.example.test${path}`, params ? {
        method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params),
    } : {})))!;
}
async function authorize(overrides: Record<string, string> = {}) {
    return handle('/oauth/authorize?' + new URLSearchParams({ client_id: 'chatgpt', redirect_uri: callback,
        resource, response_type: 'code', state: 'client-state', code_challenge_method: 'S256', code_challenge: pkce,
        scope: 'invoices.read invoices.create', ...overrides }));
}
async function code(scope = 'invoices.read invoices.create') {
    const authorization = await authorize({ scope });
    expect(authorization.status).toBe(302);
    const upstreamUrl = new URL(authorization.headers.get('location')!);
    expect(upstreamUrl.origin).toBe('https://bitlink.example.test');
    expect(upstreamUrl.searchParams.get('code_challenge')).not.toBe(pkce);
    expect(upstreamUrl.searchParams.get('redirect_uri')).toBe('https://mcp.example.test/oauth/callback');
    const state = upstreamUrl.searchParams.get('state')!;
    const response = await handle(`/oauth/callback?${new URLSearchParams({ state, code: 'passport-code' })}`);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('state')).toBe('client-state');
    expect(location.searchParams.get('iss')).toBe('https://mcp.example.test');
    return { code: location.searchParams.get('code')!, upstreamState: state };
}
async function exchange(authCode: string, overrides: Record<string, string> = {}) {
    return handle('/oauth/token', { grant_type: 'authorization_code', client_id: 'chatgpt', redirect_uri: callback,
        code: authCode, code_verifier: verifier, resource, ...overrides });
}
async function login(scope?: string) {
    const { code: authCode } = await code(scope);
    const response = await exchange(authCode);
    expect(response.status).toBe(200);
    return response.json() as Promise<{ access_token: string; refresh_token: string; scope: string }>;
}

describe('MCP OAuth federation', () => {
    it('publishes resource and authorization-server discovery', async () => {
        const protectedResource = await (await handle('/.well-known/oauth-protected-resource/mcp')).json();
        expect(protectedResource.resource).toBe(resource);
        expect(protectedResource.authorization_servers).toEqual(['https://mcp.example.test']);
        const metadata = await (await handle('/.well-known/oauth-authorization-server')).json();
        expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
        expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none']);
        expect(metadata.registration_endpoint).toBeUndefined();
        expect(oauth.unauthorized().headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    });
    it.each([
        { resource: 'https://wrong.test/mcp' }, { redirect_uri: 'https://evil.test/callback' },
        { code_challenge_method: 'plain' }, { state: '' }, { scope: '*' }, { client_id: 'unknown' },
        { client_id: '__proto__' }, { response_type: 'token' },
    ])('rejects invalid authorization request %j without redirecting', async overrides => {
        const response = await authorize(overrides);
        if (overrides.redirect_uri || overrides.client_id) {
            expect(response.status).toBe(400);
            expect(response.headers.get('location')).toBeNull();
        } else {
            expect(response.status).toBe(302);
            const location = new URL(response.headers.get('location')!);
            expect(location.origin).toBe('https://chatgpt.com');
            expect(location.searchParams.get('error')).toBeTruthy();
        }
        expect(upstream).not.toHaveBeenCalled();
    });
    it('exchanges codes using separate upstream PKCE and issues MCP-only opaque tokens', async () => {
        const tokens = await login();
        expect(tokens.access_token).not.toBe(upstreamAccess);
        expect((await oauth.authenticate(tokens.access_token))?.upstreamToken).toBe(upstreamAccess);
        expect(await oauth.authenticate(upstreamAccess)).toBeNull();
        expect(await oauth.authenticate('1|personal-key')).toBeNull();
        const body = upstream.mock.calls[0]![1]!.body as URLSearchParams;
        expect(body.get('client_id')).toBe('passport-client');
        expect(body.get('code_verifier')).not.toBe(verifier);
        expect(body.get('resource')).toBeNull();
        expect(readFileSync(join(folder, 'oauth.sqlite')).includes(Buffer.from(upstreamAccess))).toBe(false);
    });
    it('rejects existing grants after changing the MCP resource URL', async () => {
        const tokens = await login();
        const other = new OAuthService({ publicUrl: 'https://other-mcp.example.test/mcp', upstreamUrl: 'https://bitlink.example.test',
            upstreamClientId: 'passport-client', clients: { chatgpt: { redirectUris: [callback] } }, store });
        expect(await other.authenticate(tokens.access_token)).toBeNull();
    });
    it('rejects bad PKCE, audience, client and redirect binding; code is single-use', async () => {
        const { code: authCode } = await code();
        for (const overrides of [{ code_verifier: 'b'.repeat(43) }, { resource: 'https://wrong.test' }, { client_id: 'other' }, { redirect_uri: 'https://evil.test' }]) {
            expect((await exchange(authCode, overrides)).status).toBe(400);
        }
        expect((await exchange(authCode)).status).toBe(200);
        expect((await exchange(authCode)).status).toBe(400);
    });
    it('rejects callback replay and unknown or mismatched upstream state', async () => {
        const { upstreamState } = await code();
        expect((await handle(`/oauth/callback?state=${upstreamState}&code=replay`)).status).toBe(400);
        expect((await handle('/oauth/callback?state=unknown&code=foo')).status).toBe(400);
        const authorization = await authorize();
        const state = new URL(authorization.headers.get('location')!).searchParams.get('state')!;
        expect((await handle(`/oauth/callback?state=${state}&code=x&iss=https://evil.test`)).status).toBe(400);
    });
    it('propagates denied consent to the registered callback with client state and issuer', async () => {
        const authorization = await authorize();
        const state = new URL(authorization.headers.get('location')!).searchParams.get('state')!;
        const response = await handle(`/oauth/callback?state=${state}&error=access_denied`);
        const target = new URL(response.headers.get('location')!);
        expect(target.origin).toBe('https://chatgpt.com');
        expect(target.searchParams.get('error')).toBe('access_denied');
        expect(target.searchParams.get('state')).toBe('client-state');
        expect(upstream).not.toHaveBeenCalled();
    });
    it('rotates refresh tokens and revokes the connection on replay', async () => {
        const tokens = await login();
        const response = await handle('/oauth/token', { grant_type: 'refresh_token', client_id: 'chatgpt', refresh_token: tokens.refresh_token, resource });
        expect(response.status).toBe(200);
        const rotated = await response.json();
        expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
        expect(await oauth.authenticate(rotated.access_token)).not.toBeNull();
        expect((await handle('/oauth/token', { grant_type: 'refresh_token', client_id: 'chatgpt', refresh_token: tokens.refresh_token, resource })).status).toBe(400);
        expect(await oauth.authenticate(rotated.access_token)).toBeNull();
        expect(await oauth.authenticate(tokens.access_token)).toBeNull();
    });
    it('cannot increase refresh scopes and supports reducing scopes', async () => {
        const tokens = await login('invoices.read');
        expect((await handle('/oauth/token', { grant_type: 'refresh_token', client_id: 'chatgpt', refresh_token: tokens.refresh_token, resource, scope: 'invoices.create' })).status).toBe(400);
        const full = await login();
        const reduced = await (await handle('/oauth/token', { grant_type: 'refresh_token', client_id: 'chatgpt', refresh_token: full.refresh_token, resource, scope: 'invoices.read' })).json();
        expect((await oauth.authenticate(reduced.access_token))?.authInfo.scopes).toEqual(['invoices.read']);
    });
    it('expires local tokens and refreshes upstream only once for concurrent requests', async () => {
        vi.useFakeTimers();
        const tokens = await login();
        vi.setSystemTime(Date.now() + 880_000);
        const authenticated = await Promise.all([oauth.authenticate(tokens.access_token), oauth.authenticate(tokens.access_token)]);
        expect(authenticated.every(Boolean)).toBe(true);
        expect(upstream).toHaveBeenCalledTimes(2); // Initial code exchange plus one serialized refresh.
        vi.setSystemTime(Date.now() + 30_000);
        expect(await oauth.authenticate(tokens.access_token)).toBeNull();
    });
    it('invalidates the connection after an upstream refresh failure without retrying', async () => {
        vi.useFakeTimers();
        const tokens = await login();
        vi.setSystemTime(Date.now() + 880_000);
        upstream.mockRejectedValueOnce(new Error('network interrupted'));
        expect(await oauth.authenticate(tokens.access_token)).toBeNull();
        expect(await oauth.authenticate(tokens.access_token)).toBeNull();
        expect(upstream).toHaveBeenCalledTimes(2);
    });
    it('keeps credentials isolated between two user connections', async () => {
        upstream.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'user-a-access', refresh_token: 'user-a-refresh', token_type: 'Bearer', expires_in: 900 })));
        const a = await login();
        upstream.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'user-b-access', refresh_token: 'user-b-refresh', token_type: 'Bearer', expires_in: 900 })));
        const b = await login();
        const users = await Promise.all([oauth.authenticate(a.access_token), oauth.authenticate(b.access_token)]);
        expect(users.map(user => user?.upstreamToken)).toEqual(['user-a-access', 'user-b-access']);
        expect(a.access_token).not.toBe(b.access_token);
    });
    it('revokes only the owning client connection and persists across restarts', async () => {
        const tokens = await login();
        store.close();
        store = new OAuthStore(join(folder, 'oauth.sqlite'), Buffer.alloc(32, 7));
        oauth = service();
        expect(await oauth.authenticate(tokens.access_token)).not.toBeNull();
        await handle('/oauth/revoke', { client_id: 'other', token: tokens.refresh_token });
        expect(await oauth.authenticate(tokens.access_token)).not.toBeNull();
        await handle('/oauth/revoke', { client_id: 'chatgpt', token: tokens.refresh_token });
        expect(await oauth.authenticate(tokens.access_token)).toBeNull();
    });
    it('rejects duplicate parameters, expired codes and oversized form bodies', async () => {
        expect((await handle('/oauth/authorize?client_id=chatgpt&client_id=other')).status).toBe(400);
        vi.useFakeTimers();
        const { code: authCode } = await code();
        vi.setSystemTime(Date.now() + 301_000);
        expect((await exchange(authCode)).status).toBe(400);
        expect((await handle('/oauth/token', { client_id: 'x'.repeat(17_000) })).status).toBe(413);
    });
});
