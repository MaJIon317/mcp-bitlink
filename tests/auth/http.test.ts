import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('HTTP Bearer authentication', () => {
    let api: Server;
    let mcp: Server;
    let url: string;
    const tokens: string[] = [];

    async function listen(server: Server): Promise<string> {
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }

    beforeAll(async () => {
        vi.stubEnv('MCP_DISABLED_TOOLS', '');
        api = createServer((request, response) => {
            tokens.push(request.headers.authorization ?? '');
            response.setHeader('Content-Type', 'application/json');
            if (request.headers.authorization === 'Bearer expired-token') {
                response.writeHead(401);
                response.end(JSON.stringify({ message: 'Unauthenticated' }));
                return;
            }
            response.end(JSON.stringify({ success: true, data: [], meta: {} }));
        });
        vi.stubEnv('CRYPTO_API_BASE_URL', await listen(api));
        vi.stubEnv('LOG_LEVEL', 'error');
        vi.stubEnv('AUTH_MODE', 'bearer');
        const { createHttpServer } = await import('../../src/http.js');
        mcp = createHttpServer();
        url = `${await listen(mcp)}/mcp`;
    });

    afterAll(async () => {
        await Promise.all([api, mcp].filter(Boolean).map((server) =>
            new Promise<void>((resolve, reject) => {
                server.close((error) => error ? reject(error) : resolve());
                server.closeAllConnections();
            }),
        ));
        vi.unstubAllEnvs();
    });

    async function rpc(method: string, token?: string, params?: unknown) {
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                'MCP-Protocol-Version': '2025-03-26',
                ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
        });
    }

    async function payload(response: Response) {
        expect(response.status).toBe(200);
        const text = await response.text();
        const data = text.split('\n').find((line) => line.startsWith('data:'));
        return JSON.parse(data ? data.slice(5) : text);
    }

    it.each([undefined, '${BITLINK_API_TOKEN}', 'token another'])('rejects missing or malformed token %s before MCP dispatch', async (token) => {
        const response = await rpc('tools/list', token);
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toMatch(/^Bearer /);
        await response.text();
        expect(tokens).toHaveLength(0);
    });

    it('allows browser preflight without credentials', async () => {
        const response = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://client.example' } });
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    });

    it('initializes and lists all tools with a Bearer token', async () => {
        const initialized = await payload(await rpc('initialize', '123|merchant-token', {
            protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' },
        }));
        expect(initialized.result.serverInfo.name).toBeTruthy();
        const result = await payload(await rpc('tools/list', '123|merchant-token'));
        expect(result.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(['create_invoice', 'get_invoice', 'get_me', 'get_merchant', 'list_invoices', 'list_merchants']);
    });

    it('forwards each concurrent request token without sharing merchant credentials', async () => {
        const results = await Promise.all(['123|merchant-a', '456|merchant-b'].map(async (token) =>
            payload(await rpc('tools/call', token, { name: 'list_invoices', arguments: { merchantId: 'merchant_1' } })),
        ));
        for (const result of results) expect(result.result.isError).not.toBe(true);
        expect(tokens.slice().sort()).toEqual(['Bearer 123|merchant-a', 'Bearer 456|merchant-b']);
    });

    it('requires an explicit merchant choice before dispatching invoice requests', async () => {
        const before = tokens.length;
        const result = await payload(await rpc('tools/call', 'user-token', { name: 'list_invoices', arguments: {} }));
        expect(result.result.isError).toBe(true);
        expect(tokens.length).toBe(before);
    });

    it('reports an upstream invalid token as a tool authentication error', async () => {
        const result = await payload(await rpc('tools/call', 'expired-token', { name: 'list_invoices', arguments: { merchantId: 'merchant_1' } }));
        expect(result.result.isError).toBe(true);
        expect(result.result.content[0].text).toContain('Authentication failed');
    });
});
