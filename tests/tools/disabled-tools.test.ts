import { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disabledToolsSchema, toolNames } from '../../src/config/tool-policy.js';

let server: Server | undefined;
afterEach(async () => {
    if (server) {
        const current = server;
        await new Promise<void>((resolve) => {
            current.close(() => resolve());
            current.closeAllConnections();
        });
        server = undefined;
    }
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('disabled tools configuration', () => {
    it('enables everything by default and parses trimmed, deduplicated names', () => {
        expect(disabledToolsSchema.parse(undefined)).toEqual([]);
        expect(disabledToolsSchema.parse('')).toEqual([]);
        expect(disabledToolsSchema.parse(' create_invoice, get_me,create_invoice, '))
            .toEqual(['create_invoice', 'get_me']);
    });

    it('rejects unknown names instead of silently leaving tools enabled', () => {
        expect(disabledToolsSchema.safeParse('create_invoce').success).toBe(false);
    });
});

describe('MCP tool visibility and dispatch', () => {
    it.each(['', 'create_invoice', 'get_me,get_merchant,list_merchants', toolNames.join(',')])(
        'excludes disabled tools from discovery and rejects calls: %s', async (disabled) => {
            vi.stubEnv('CRYPTO_API_BASE_URL', 'https://api.example.test');
            vi.stubEnv('AUTH_MODE', 'bearer');
            vi.stubEnv('LOG_LEVEL', 'error');
            vi.stubEnv('MCP_DISABLED_TOOLS', disabled);
            const { createHttpServer } = await import('../../src/http.js');
            server = createHttpServer();
            await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
            const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
            async function rpc(method: string, params?: unknown) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json, text/event-stream',
                        'MCP-Protocol-Version': '2025-03-26',
                        Authorization: 'Bearer test-token',
                    },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
                });
                expect(response.status).toBe(200);
                const body = await response.text();
                const data = body.split('\n').find((line) => line.startsWith('data:'));
                return JSON.parse(data ? data.slice(5) : body);
            }
            const excluded = disabledToolsSchema.parse(disabled);
            const result = await rpc('tools/list');
            expect(result.result.tools.map((tool: { name: string }) => tool.name).sort())
                .toEqual(toolNames.filter((name) => !excluded.includes(name)).sort());
            for (const name of excluded) {
                expect(JSON.stringify(result)).not.toContain(name);
                const call = await rpc('tools/call', { name, arguments: {} });
                expect(call.error).toBeDefined();
            }
        },
    );
});
