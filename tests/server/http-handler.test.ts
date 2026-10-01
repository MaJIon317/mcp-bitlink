import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNoopLogger } from '../../src/logging/index.js';

process.env.CRYPTO_API_BASE_URL = 'https://api.example.test/api';
const { createInvoiceMcpHandler } = await import('../../src/server/http-handler.js');

async function rpc(method: string, params: unknown = {}, token?: string) {
    const handler = createInvoiceMcpHandler(createNoopLogger());
    const response = await handler.fetch(new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
            ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }));
    const text = await response.text();
    const payload = response.headers.get('content-type')?.includes('text/event-stream')
        ? JSON.parse(text.split('\n').find(line => line.startsWith('data:'))!.slice(5))
        : JSON.parse(text);
    return { response, payload };
}

afterEach(() => vi.unstubAllGlobals());
describe('MCP HTTP discovery and invoice authentication', () => {
    it('initializes without a merchant token', async () => {
        const { response, payload } = await rpc('initialize', {
            protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' },
        });
        expect(response.status).toBe(200);
        expect(payload.result.capabilities.tools).toBeDefined();
    });
    it('lists an optional-input read-only list_invoices tool without a token', async () => {
        const { response, payload } = await rpc('tools/list');
        expect(response.status).toBe(200);
        const tool = payload.result.tools.find((tool: { name: string }) => tool.name === 'list_invoices');
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.required ?? []).toEqual([]);
        expect(tool.annotations.readOnlyHint).toBe(true);
    });
    it('rejects unauthenticated invoice calls without contacting the API', async () => {
        const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
        const { payload } = await rpc('tools/call', { name: 'list_invoices', arguments: {} });
        expect(payload.result.isError).toBe(true);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('forwards the request token and returns the upstream invoice list', async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ data: [], meta: {} }));
        vi.stubGlobal('fetch', fetch);
        const { payload } = await rpc('tools/call', { name: 'list_invoices', arguments: {} }, 'test-merchant');
        expect(payload.result.isError).not.toBe(true);
        expect(payload.result.structuredContent.invoices).toEqual([]);
        expect(fetch.mock.calls[0]![1].headers.Authorization).toBe('Bearer test-merchant');
    });
});
