import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNoopLogger } from '../../src/logging/index.js';

process.env.CRYPTO_API_BASE_URL = 'https://api.example.test/api';
const { createInvoiceHandler } = await import('../../src/server/create-handler.js');

afterEach(() => vi.restoreAllMocks());

async function rpc(method: string, params: Record<string, unknown>, token?: string) {
    const handler = createInvoiceHandler(createNoopLogger());
    const response = await handler.fetch(new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }));
    const text = await response.text();
    const data = response.headers.get('content-type')?.includes('text/event-stream')
        ? text.split('\n').find(line => line.startsWith('data:'))!.slice(5)
        : text;
    await handler.close();
    return { status: response.status, body: JSON.parse(data) };
}

describe('MCP HTTP discovery and authentication', () => {
    it.each(['2025-03-26', '2025-11-25'])('initializes without a token (%s)', async protocolVersion => {
        const response = await rpc('initialize', {
            protocolVersion, capabilities: {}, clientInfo: { name: 'test', version: '1' },
        });
        expect(response.status).toBe(200);
        expect(response.body.result.serverInfo.name).toBe('bitlink-invoices');
    });

    it('lists all tools without a token or an upstream request', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch');
        const response = await rpc('tools/list', {});
        expect(response.status).toBe(200);
        expect(response.body.result.tools.map((tool: { name: string }) => tool.name).sort())
            .toEqual(['create_invoice', 'get_invoice', 'list_invoices']);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects invoice calls without a token before contacting the API', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch');
        const response = await rpc('tools/call', { name: 'list_invoices', arguments: {} });
        expect(response.body.result.isError).toBe(true);
        expect(response.body.result.content[0].text).toContain('merchant API token');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('forwards the request token and preserves upstream authentication errors', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ message: 'Unauthenticated' }), { status: 401 },
        ));
        const response = await rpc('tools/call', { name: 'list_invoices', arguments: {} }, 'test-merchant-token');
        expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer test-merchant-token' }),
        }));
        expect(response.body.result.isError).toBe(true);
    });
});
