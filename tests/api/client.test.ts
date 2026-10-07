import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/api/client.js';
import { createNoopLogger } from '../../src/logging/index.js';

afterEach(() => vi.restoreAllMocks());

describe('API failure diagnostics', () => {
    it.each([
        ['application/json', '{"message":"Internal server error"}'],
        ['text/html', '<html>Server Error</html>'],
    ])('logs upstream HTTP errors before parsing %s', async (contentType, body) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, {
            status: 502,
            headers: { 'content-type': contentType, 'x-request-id': 'request-123' },
        }));
        const logger = createNoopLogger();
        const warn = vi.spyOn(logger, 'warn');
        const client = new ApiClient({
            baseUrl: 'https://example.test/api', accessToken: 'secret-token', timeoutMs: 1000, logger,
        });
        await expect(client.get('/v1/merchants', { search: 'private-search' })).rejects.toMatchObject({ status: 502 });
        expect(warn).toHaveBeenCalledExactlyOnceWith('API request failed', {
            method: 'GET', origin: 'https://example.test', path: '/api/v1/merchants', status: 502,
            contentType, requestId: 'request-123',
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token');
        expect(JSON.stringify(warn.mock.calls)).not.toContain('private-search');
        expect(JSON.stringify(warn.mock.calls)).not.toContain(body);
    });
});
