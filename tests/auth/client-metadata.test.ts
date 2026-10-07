import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientMetadataResolver } from '../../src/auth/client-metadata.js';
const id = 'https://chatgpt.com/oauth/client.json';
const metadata = { client_id: id, client_name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
    token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
afterEach(() => vi.restoreAllMocks());
const response = (data: unknown, headers = {}) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...headers } });
describe('Client metadata', () => {
    it('accepts the real ChatGPT method negotiation and caches bounded public metadata', async () => {
        const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(metadata));
        const resolver = new ClientMetadataResolver();
        expect(await resolver.resolve(id)).toEqual({ redirectUris: metadata.redirect_uris });
        await resolver.resolve(id);
        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith(id, expect.objectContaining({ redirect: 'error', credentials: 'omit' }));
    });
    it.each(['http://chatgpt.com/oauth/client.json', 'https://127.0.0.1/client.json', 'https://evil.test/client.json', 'https://chatgpt.com@evil.test/client.json', 'https://chatgpt.com/', 'https://chatgpt.com/oauth/client.json#x'])('rejects unsafe URL %s before fetching', async url => {
        const mock = vi.spyOn(globalThis, 'fetch');
        await expect(new ClientMetadataResolver().resolve(url)).rejects.toThrow();
        expect(mock).not.toHaveBeenCalled();
    });
    it.each([
        { client_id: 'https://evil.test/client.json' }, { client_name: '' }, { redirect_uris: ['https://chatgpt.com/*'] },
        { redirect_uris: ['http://chatgpt.com/callback'] }, { redirect_uris: [] },
        { token_endpoint_auth_methods_supported: ['private_key_jwt'] }, { response_types: ['token'] },
    ])('rejects invalid document %j', async override => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ...metadata, ...override }));
        await expect(new ClientMetadataResolver().resolve(id)).rejects.toThrow();
    });
    it('rejects oversized or non-JSON documents', async () => {
        const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(70_000), { headers: { 'Content-Type': 'application/json' } }));
        await expect(new ClientMetadataResolver().resolve(id)).rejects.toThrow();
        mock.mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'text/html' } }));
        await expect(new ClientMetadataResolver().resolve(id)).rejects.toThrow();
    });
    it('honors no-store and never uses stale cached metadata after a fetch failure', async () => {
        const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(metadata, { 'Cache-Control': 'no-store' }));
        const resolver = new ClientMetadataResolver();
        await resolver.resolve(id);
        mock.mockRejectedValue(new Error('timeout'));
        await expect(resolver.resolve(id)).rejects.toThrow();
        expect(mock).toHaveBeenCalledTimes(2);
    });
});
