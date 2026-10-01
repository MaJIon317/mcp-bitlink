import { createServer as createHttpServer } from 'node:http';
import { createInvoiceMcpHandler } from './server/http-handler.js';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { env } from './config/env.js';
import { createConsoleLogger } from './logging/index.js';

const rootLogger = createConsoleLogger({
    name: env.MCP_SERVER_NAME,
    level: env.LOG_LEVEL,
});

const nodeHandler = toNodeHandler(createInvoiceMcpHandler(rootLogger));

const server = createHttpServer(async (request, response) => {
    if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    if (new URL(request.url ?? '/', 'http://localhost').pathname === '/mcp') {
        await nodeHandler(request as Parameters<typeof nodeHandler>[0], response);
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
