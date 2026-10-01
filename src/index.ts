import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
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

function corsHeaders(request: Request | IncomingMessage): Record<string, string> {
    const originHeader =
        request instanceof Request
            ? request.headers.get('origin')
            : request.headers.origin;

    const allowOrigin =
        env.CORS_ORIGIN === '*'
            ? (originHeader ?? '*')
            : env.CORS_ORIGIN;

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
            'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
        ...(allowOrigin !== '*' ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
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

function toAuthInfo(token: string): AuthInfo {
    return {
        token,
        clientId: 'merchant',
        scopes: ['invoices'],
        // Far-future expiry: Sanctum tokens are verified upstream by Bitlink API.
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    };
}

const mcpHandler = createMcpHandler(
    ({ authInfo }) => {
        const accessToken = authInfo?.token;

        if (!accessToken) {
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
            return withCors(unauthorizedResponse(), request);
        }

        const response = await mcpHandler.fetch(request, {
            ...options,
            authInfo: toAuthInfo(accessToken),
        });

        return withCors(response, request);
    },
});

function writeCors(request: IncomingMessage, response: ServerResponse): void {
    for (const [key, value] of Object.entries(corsHeaders(request))) {
        response.setHeader(key, value);
    }
}

const server = createHttpServer(async (request, response) => {
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

    if (path === '/mcp' || path.startsWith('/mcp/')) {
        await nodeHandler(
            request as Parameters<typeof nodeHandler>[0],
            response as Parameters<typeof nodeHandler>[1],
        );
        return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'Not found' }));
});

server.listen(env.PORT, env.HOST, () => {
    const displayHost = env.HOST === '0.0.0.0' ? '127.0.0.1' : env.HOST;
    rootLogger.info('MCP server listening', {
        host: env.HOST,
        port: env.PORT,
        healthUrl: `http://${displayHost}:${env.PORT}/health`,
        mcpUrl: `http://${displayHost}:${env.PORT}/mcp`,
    });
});
