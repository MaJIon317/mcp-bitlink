import { describe, expect, it } from 'vitest';
import { extractBearerToken } from '../../src/auth/bearer.js';

describe('extractBearerToken', () => {
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
