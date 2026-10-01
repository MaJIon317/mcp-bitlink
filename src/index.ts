import { createServer as createHttpServer } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { env } from './config/env.js';
import { createConsoleLogger } from './logging/index.js';
import { createInvoiceHandler } from './server/create-handler.js';

const rootLogger = createConsoleLogger({
    name: env.MCP_SERVER_NAME,
    level: env.LOG_LEVEL,
});

const mcpHandler = createInvoiceHandler(rootLogger);

const nodeHandler = toNodeHandler(mcpHandler);

const server = createHttpServer(async (request, response) => {
    if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    if (request.url?.startsWith('/mcp')) {
        await nodeHandler({
            ...(request.method === undefined ? {} : { method: request.method }),
            ...(request.url === undefined ? {} : { url: request.url }),
            headers: request.headers,
            [Symbol.asyncIterator]: () => request[Symbol.asyncIterator](),
        }, response);
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
