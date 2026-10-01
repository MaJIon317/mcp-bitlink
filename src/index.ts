import { createServer as createHttpServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { env } from './config/env.js';
import { extractBearerToken } from './auth/bearer.js';
import { createConsoleLogger } from './logging/index.js';
import { createServer } from './server/create-server.js';

const rootLogger = createConsoleLogger({
    name: env.MCP_SERVER_NAME,
    level: env.LOG_LEVEL,
});

const mcpHandler = createMcpHandler(({ requestInfo }) => {
    const accessToken = extractBearerToken(requestInfo);

    if (!accessToken) {
        throw new Error('Authorization Bearer token is required');
    }

    return createServer({
        accessToken,
        logger: rootLogger.child({ component: 'mcp' }),
    });
});

const nodeHandler = toNodeHandler(mcpHandler);

const server = createHttpServer(async (request, response) => {
    if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    if (request.url?.startsWith('/mcp')) {
        await nodeHandler(request, response);
        return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'Not found' }));
});

server.listen(env.PORT, '127.0.0.1', () => {
    rootLogger.info('MCP server listening', {
        url: `http://127.0.0.1:${env.PORT}/mcp`,
    });
});
