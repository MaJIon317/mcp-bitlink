import { env } from './config/env.js';
import { createConsoleLogger } from './logging/index.js';
import { createHttpServer } from './http.js';

const rootLogger = createConsoleLogger({ name: env.MCP_SERVER_NAME, level: env.LOG_LEVEL });
const server = createHttpServer();

server.listen(env.PORT, env.HOST, () => {
    const displayHost = env.HOST === '0.0.0.0' ? '127.0.0.1' : env.HOST;
    rootLogger.info('MCP server listening', {
        host: env.HOST,
        port: env.PORT,
        healthUrl: `http://${displayHost}:${env.PORT}/health`,
        mcpUrl: `http://${displayHost}:${env.PORT}/mcp`,
    });
});
