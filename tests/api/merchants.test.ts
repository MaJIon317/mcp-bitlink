import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/api/client.js';
import { MerchantsApi } from '../../src/api/resources/merchants.js';

const merchant = { id: 'm/1', name: 'Shop', address: '', city: '', post_code: '', country: null,
    verification_status: 'verified', role: null, is_owner: true };
afterEach(() => vi.restoreAllMocks());

function setup(data: unknown, meta = {}) {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, data, meta })),
    );
    const api = new MerchantsApi(new ApiClient({ baseUrl: 'https://example.test/api/v1/', accessToken: 'user-token', timeoutMs: 1000 }));
    return { api, fetchMock };
}

describe('MerchantsApi', () => {
    it('lists accessible merchants, preserving pagination and the documented versioned base URL', async () => {
        const pagination = { current_page: 2, per_page: 20, last_page: 3, total: 50 };
        const { api, fetchMock } = setup([merchant], { pagination });
        expect(await api.list(2)).toEqual({ merchants: [merchant], pagination });
        expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/v1/merchants?page=2', expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer user-token' }),
        }));
    });
    it('encodes merchant IDs as a single path segment', async () => {
        const { api, fetchMock } = setup(merchant);
        expect(await api.get('m/1')).toEqual(merchant);
        expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/v1/merchants/m%2F1', expect.anything());
    });
    it('retrieves the authenticated user', async () => {
        const user = { id: 'u1', name: 'User', email: 'user@example.test' };
        const { api, fetchMock } = setup(user);
        expect(await api.me()).toEqual(user);
        expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/v1/me', expect.anything());
    });
});
