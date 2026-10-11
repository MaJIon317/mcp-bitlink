import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import type { OAuthService } from '../../src/auth/oauth.js';

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

it.each([
    ['bearer', 'domain-verification_token'],
    ['oauth', 'domain-verification_token'],
    ['bearer', ''],
    ['oauth', ''],
])('serves the public challenge with auth mode %s and token %s', async (mode, token) => {
    vi.stubEnv('AUTH_MODE', mode);
    vi.stubEnv('CRYPTO_API_BASE_URL', 'https://api.example.test');
    vi.stubEnv('LOG_LEVEL', 'error');
    vi.stubEnv('OPENAI_APPS_CHALLENGE_TOKEN', token);
    const { createHttpServer } = await import('../../src/http.js');
    const oauthHandler = vi.fn();
    const oauth = { handle: oauthHandler } as unknown as OAuthService;
    server = mode === 'oauth' ? createHttpServer({ oauth }) : createHttpServer();
    await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/.well-known/openai-apps-challenge`;
    const response = await fetch(url, { redirect: 'manual' });
    expect(response.status).toBe(token ? 200 : 404);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('www-authenticate')).toBe(false);
    expect(await response.text()).toBe(token || 'Not found');
    if (token) {
        const head = await fetch(url, { method: 'HEAD' });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe('');
        const post = await fetch(url, { method: 'POST' });
        expect(post.status).toBe(405);
        expect(post.headers.get('allow')).toBe('GET, HEAD');
    }
    expect(oauthHandler).not.toHaveBeenCalled();
});
