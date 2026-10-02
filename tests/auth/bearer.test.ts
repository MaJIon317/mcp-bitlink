import { describe, expect, it } from 'vitest';
import { extractBearerToken } from '../../src/auth/bearer.js';

describe('extractBearerToken', () => {
    it.each(['bearer 123|merchant-token', 'BEARER   merchant-token'])('accepts %s', (authorization) => {
        const request = new Request('http://localhost/mcp', { headers: { authorization } });
        expect(extractBearerToken(request)).toBe(authorization.split(/ +/)[1]);
    });

    it.each(['Basic merchant-token', 'Bearer', 'Bearer token another', 'Bearer ${BITLINK_API_TOKEN}', 'Bearer\tmerchant-token'])('rejects %s', (authorization) => {
        const request = new Request('http://localhost/mcp', { headers: { authorization } });
        expect(extractBearerToken(request)).toBeNull();
    });

    it('extracts bearer token', () => {
        const request = new Request('http://localhost/mcp', {
            headers: {
                authorization: 'Bearer merchant-token',
            },
        });

        expect(extractBearerToken(request)).toBe('merchant-token');
    });

    it('returns null without bearer token', () => {
        const request = new Request('http://localhost/mcp');

        expect(extractBearerToken(request)).toBeNull();
    });
});
