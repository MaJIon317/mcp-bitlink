import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OAuthService } from '../../src/auth/oauth.js';
import { OAuthStore } from '../../src/auth/store.js';

const resource = 'https://mcp.example.test/mcp';
const callback = 'https://chatgpt.com/connector/oauth/test';
const verifier = 'x'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');

describe('OAuth HTTP integration', () => {
    let api: Server; let mcp: Server; let url: string; let store: OAuthStore; let folder: string;
    let oauth: OAuthService;
    const apiTokens: string[] = [];
    async function listen(server: Server) {
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }
    beforeAll(async () => {
        api = createServer((request, response) => {
            response.setHeader('Content-Type', 'application/json');
            if (request.url === '/oauth/token') {
                response.end(JSON.stringify({ access_token: 'upstream-private-token', refresh_token: 'upstream-refresh-token', token_type: 'Bearer', expires_in: 900 }));
                return;
            }
            apiTokens.push(request.headers.authorization ?? '');
            response.end(JSON.stringify({ success: true, data: [], meta: {} }));
        });
        const upstream = await listen(api);
        folder = mkdtempSync(join(tmpdir(), 'bitlink-http-oauth-'));
        store = new OAuthStore(join(folder, 'store.sqlite'), Buffer.alloc(32, 9));
        oauth = new OAuthService({ publicUrl: resource, upstreamUrl: upstream, upstreamClientId: 'passport-client', clients: { chatgpt: { redirectUris: [callback] } }, store });
        vi.stubEnv('CRYPTO_API_BASE_URL', upstream);
        vi.stubEnv('LOG_LEVEL', 'error');
        const { createHttpServer } = await import('../../src/http.js');
        mcp = createHttpServer({ oauth });
        url = await listen(mcp);
    });
    afterAll(async () => {
        await Promise.all([api, mcp].filter(Boolean).map(server => new Promise<void>(resolve => {
            server.close(() => resolve()); server.closeAllConnections();
        })));
        store?.close(); if (folder) rmSync(folder, { recursive: true, force: true }); vi.unstubAllEnvs();
    });
    async function rpc(method: string, token?: string, params?: unknown) {
        return fetch(`${url}/mcp`, { method: 'POST', headers: {
            'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    }
    async function result(response: Response) {
        expect(response.status).toBe(200);
        const text = await response.text();
        const data = text.split('\n').find(line => line.startsWith('data:'));
        return JSON.parse(data ? data.slice(5) : text);
    }
    async function login(scope = 'invoices.read') {
        const authorization = await fetch(`${url}/oauth/authorize?${new URLSearchParams({ client_id: 'chatgpt', redirect_uri: callback,
            resource, scope, state: 'test-state', response_type: 'code', code_challenge_method: 'S256', code_challenge: challenge })}`, { redirect: 'manual' });
        const state = new URL(authorization.headers.get('location')!).searchParams.get('state')!;
        const authorized = await fetch(`${url}/oauth/callback?${new URLSearchParams({ state, code: 'bitlink-code' })}`, { redirect: 'manual' });
        const code = new URL(authorized.headers.get('location')!).searchParams.get('code')!;
        const tokens = await fetch(`${url}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: 'chatgpt', grant_type: 'authorization_code', redirect_uri: callback, code, code_verifier: verifier, resource }) });
        expect(tokens.status).toBe(200);
        return tokens.json() as Promise<{ access_token: string; refresh_token: string }>;
    }
    it('serves public OAuth discovery and challenges unauthenticated MCP requests', async () => {
        const discovery = await fetch(`${url}/.well-known/oauth-protected-resource/mcp`);
        expect(discovery.status).toBe(200);
        expect((await discovery.json()).resource).toBe(resource);
        const response = await rpc('tools/list');
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toContain(oauth.metadataUrl);
        expect(apiTokens).toHaveLength(0);
        await response.text();
    });
    it('rejects upstream and personal tokens before MCP execution', async () => {
        for (const token of ['upstream-private-token', '1|personal-key', 'invalid']) {
            const response = await rpc('tools/list', token);
            expect(response.status).toBe(401); await response.text();
        }
        expect(apiTokens).toHaveLength(0);
    });
    it('completes login, returns auth metadata and forwards only the private Bitlink token', async () => {
        const tokens = await login();
        const tools = await result(await rpc('tools/list', tokens.access_token));
        expect(tools.result.tools.find((tool: { name: string }) => tool.name === 'create_invoice')._meta.securitySchemes)
            .toEqual([{ type: 'oauth2', scopes: ['invoices.create'] }]);
        const invoices = await result(await rpc('tools/call', tokens.access_token, { name: 'list_invoices', arguments: { merchantId: 'merchant_1' } }));
        expect(invoices.result.isError).not.toBe(true);
        expect(apiTokens).toEqual(['Bearer upstream-private-token']);
        expect(JSON.stringify(invoices)).not.toContain('upstream-private-token');
    });
    it('enforces write scopes before dispatching the tool', async () => {
        const tokens = await login('invoices.read');
        const before = apiTokens.length;
        const response = await rpc('tools/call', tokens.access_token, { name: 'create_invoice', arguments: { merchantId: 'merchant_1' } });
        expect(response.status).toBe(403);
        expect(response.headers.get('www-authenticate')).toContain('scope="invoices.create"');
        await response.text(); expect(apiTokens.length).toBe(before);
    });
    it('revocation invalidates the access token immediately', async () => {
        const tokens = await login();
        const response = await fetch(`${url}/oauth/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: 'chatgpt', token: tokens.refresh_token }) });
        expect(response.status).toBe(200); await response.text();
        const denied = await rpc('tools/list', tokens.access_token);
        expect(denied.status).toBe(401); await denied.text();
    });
});
