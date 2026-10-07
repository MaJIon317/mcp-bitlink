import { OAuthService, readLimitedBody } from './auth/oauth.js';
import { OAuthStore } from './auth/store.js';
import { createServer as createNodeHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
    createMcpHandler,
    bearerAuthChallengeResponse,
    OAuthError,
    OAuthErrorCode,
    type AuthInfo,
} from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { env } from './config/env.js';
import { extractBearerToken } from './auth/bearer.js';
import { createConsoleLogger } from './logging/index.js';
import { createServer } from './server/create-server.js';

const rootLogger = createConsoleLogger({
    name: env.MCP_SERVER_NAME,
    level: env.LOG_LEVEL,
});

function corsHeaders(_request: Request | IncomingMessage): Record<string, string> {
    const allowOrigin = env.CORS_ORIGIN;

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
            'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
        'Access-Control-Max-Age': '86400',
    };
}

function withCors(response: Response, request: Request): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
        headers.set(key, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function unauthorizedResponse(): Response {
    return bearerAuthChallengeResponse(
        new OAuthError(
            OAuthErrorCode.InvalidToken,
            'Authorization Bearer token is required',
        ),
    );
}

function toLegacyAuthInfo(token: string): AuthInfo {
    return {
        token,
        clientId: 'legacy-personal-key',
        scopes: [],
        // Compatibility mode only: validity and permissions are checked by Bitlink API.
    };
}

function createHandlers(oauth: OAuthService | null) {
    const mcpHandler = createMcpHandler(
        ({ authInfo }) => {
            const accessToken = oauth ? authInfo?.extra?.upstreamToken : authInfo?.token;

            if (typeof accessToken !== 'string' || !accessToken) {
                throw new Error('Authorization Bearer token is required');
            }

            return createServer({
                accessToken,
                logger: rootLogger.child({ component: 'mcp' }),
            });
        },
        {
            onerror: (error) => {
                rootLogger.error('MCP handler error', {
                    message: error.message,
                    stack: error.stack,
                });
            },
        },
    );

    const nodeHandler = toNodeHandler({
        fetch: async (request, options) => {
            if (request.method === 'OPTIONS') {
                return withCors(new Response(null, { status: 204 }), request);
            }

            const accessToken = extractBearerToken(request);

            if (!accessToken) {
                rootLogger.info('MCP authorization required', { method: request.method, status: 401 });
                return withCors(oauth ? oauth.unauthorized() : unauthorizedResponse(), request);
            }

            const authenticated = oauth ? await oauth.authenticate(accessToken) : null;
            if (oauth && !authenticated) {
                rootLogger.info('MCP token rejected', { method: request.method, status: 401 });
                return withCors(oauth.unauthorized(), request);
            }
            const authInfo = authenticated?.authInfo ?? toLegacyAuthInfo(accessToken);
            let rpcMethod: string | undefined;
            if (oauth && request.method === 'POST') {
                // Enforce scopes at the transport layer before any tool executes.
                let raw: string;
                try { raw = await readLimitedBody(request.clone(), 4 * 1024 * 1024); }
                catch { void request.body?.cancel(); return withCors(new Response(null, { status: 413 }), request); }
                const body = (() => { try { return JSON.parse(raw); } catch { return null; } })() as { method?: string; params?: { name?: string } } | null;
                if (['initialize', 'tools/list', 'tools/call', 'notifications/initialized', 'ping'].includes(body?.method ?? '')) rpcMethod = body?.method;
                const name = body?.method === 'tools/call' ? body.params?.name : undefined;
                const required = name === 'create_invoice' ? 'invoices.create'
                    : name && ['list_invoices', 'get_invoice'].includes(name) ? 'invoices.read' : null;
                if (required && !authInfo.scopes.includes(required)) {
                    return withCors(oauth.unauthorized(403, 'insufficient_scope', required), request);
                }
            }
            const response = await mcpHandler.fetch(request, {
                ...options,
                authInfo,
            });

            rootLogger.info('MCP response', { method: request.method, rpcMethod, status: response.status });
            return withCors(response, request);
        },
    });
    return { nodeHandler, oauthHandler: oauth ? toNodeHandler({ fetch: async request => {
        const response = (await oauth.handle(request)) ?? new Response(null, { status: 404 });
        const path = new URL(request.url).pathname;
        const location = response.headers.get('location');
        const destination = location ? new URL(location) : null;
        rootLogger.info('OAuth response', {
            path, method: request.method, status: response.status,
            ...(destination ? { redirectOrigin: destination.origin, oauthError: destination.searchParams.get('error') ?? undefined } : {}),
        });
        return withCors(response, request);
    } }) : null, close: mcpHandler.close };
}

function writeCors(request: IncomingMessage, response: ServerResponse): void {
    for (const [key, value] of Object.entries(corsHeaders(request))) {
        response.setHeader(key, value);
    }
}

function configuredOAuth(): { oauth: OAuthService; store: OAuthStore } | null {
    if (env.AUTH_MODE === 'bearer') return null;
    const { BITLINK_MCP_URL, BITLINK_OAUTH_BASE_URL, BITLINK_OAUTH_CLIENT_ID, OAUTH_CLIENTS_JSON, OAUTH_ENCRYPTION_KEY } = env;
    if (!BITLINK_MCP_URL || !BITLINK_OAUTH_BASE_URL || !BITLINK_OAUTH_CLIENT_ID || !OAUTH_ENCRYPTION_KEY) {
        throw new Error('OAuth requires BITLINK_MCP_URL, BITLINK_OAUTH_BASE_URL, BITLINK_OAUTH_CLIENT_ID and OAUTH_ENCRYPTION_KEY. See docs/openai-plugin-connect.md.');
    }
    const clients: unknown = JSON.parse(OAUTH_CLIENTS_JSON?.trim() || '{}');
    if (!clients || typeof clients !== 'object' || Array.isArray(clients) ||
        Object.values(clients).some(client => !client || typeof client !== 'object' || !Array.isArray(client.redirectUris) || client.redirectUris.some((uri: unknown) => typeof uri !== 'string'))) {
        throw new Error('OAUTH_CLIENTS_JSON must map client IDs to { redirectUris: [exact HTTPS callback URLs] }');
    }
    const store = new OAuthStore(env.OAUTH_STORE_PATH, Buffer.from(OAUTH_ENCRYPTION_KEY, 'base64'));
    const oauth = new OAuthService({ publicUrl: BITLINK_MCP_URL, upstreamUrl: BITLINK_OAUTH_BASE_URL,
        upstreamClientId: BITLINK_OAUTH_CLIENT_ID, clients: clients as Record<string, { redirectUris: string[] }>, store,
        ...(env.BITLINK_OAUTH_CLIENT_SECRET ? { upstreamClientSecret: env.BITLINK_OAUTH_CLIENT_SECRET } : {}),
        timeoutMs: env.CRYPTO_API_TIMEOUT_MS,
        clientMetadataOrigins: env.OAUTH_CLIENT_METADATA_ORIGINS.split(',').map(value => value.trim()).filter(Boolean),
    });
    return { oauth, store };
}

export function createHttpServer(options?: { oauth: OAuthService }) {
    const configured = options ? null : configuredOAuth();
    const oauth = options?.oauth ?? configured?.oauth ?? null;
    const { nodeHandler, oauthHandler, close } = createHandlers(oauth);
    const rateLimits = new Map<string, { count: number; expires: number }>();
    const server = createNodeHttpServer(async (request, response) => {
        try {
            writeCors(request, response);

            if (request.method === 'OPTIONS') {
                response.writeHead(204);
                response.end();
                return;
            }

            const path = request.url?.split('?')[0] ?? '';

            if (path === '/health') {
                response.writeHead(200, { 'content-type': 'application/json' });
                response.end(JSON.stringify({ status: 'ok' }));
                return;
            }

            if (oauthHandler && (path.startsWith('/.well-known/') || path.startsWith('/oauth/'))) {
                const ip = request.socket.remoteAddress ?? 'unknown';
                const timestamp = Date.now();
                for (const [key, limit] of rateLimits) if (limit.expires <= timestamp) rateLimits.delete(key);
                const limit = rateLimits.get(ip) ?? { count: 0, expires: timestamp + 60_000 };
                if (limit.count >= 60 || (!rateLimits.has(ip) && rateLimits.size >= 10_000)) {
                    response.writeHead(429, { 'Retry-After': '60' }); response.end(); return;
                }
                limit.count++; rateLimits.set(ip, limit);
                await oauthHandler(request as Parameters<typeof oauthHandler>[0], response as Parameters<typeof oauthHandler>[1]);
                return;
            }

            if (path === '/mcp' || path.startsWith('/mcp/')) {
                await nodeHandler(
                    request as Parameters<typeof nodeHandler>[0],
                    response as Parameters<typeof nodeHandler>[1],
                );
                return;
            }

            response.writeHead(404, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ message: 'Not found' }));
        } catch {
            rootLogger.error('HTTP request failed');
            if (!response.headersSent) response.writeHead(503, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
        }
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.on('close', () => { void close(); configured?.store.close(); });
    return server;
}
