import { McpServer } from '@modelcontextprotocol/server';
import { env } from '../config/env.js';
import { ApiClient } from '../api/client.js';
import { InvoicesApi } from '../api/resources/invoices.js';
import { createConsoleLogger, type Logger } from '../logging/index.js';
import { registerCreateInvoiceTool } from '../tools/create-invoice.js';
import { registerGetInvoiceTool } from '../tools/get-invoice.js';
import { registerListInvoicesTool } from '../tools/list-invoices.js';

export interface CreateServerOptions {
    accessToken: string;
    logger?: Logger;
}

export function createServer(
    accessTokenOrOptions: string | CreateServerOptions,
): McpServer {
    const options =
        typeof accessTokenOrOptions === 'string'
            ? { accessToken: accessTokenOrOptions }
            : accessTokenOrOptions;

    const logger =
        options.logger ??
        createConsoleLogger({
            name: env.MCP_SERVER_NAME,
            level: env.LOG_LEVEL,
        }).child({ component: 'mcp' });

    const apiClient = new ApiClient({
        baseUrl: env.CRYPTO_API_BASE_URL,
        accessToken: options.accessToken,
        timeoutMs: env.CRYPTO_API_TIMEOUT_MS,
        logger: logger.child({ component: 'api-client' }),
    });

    const invoices = new InvoicesApi(apiClient);

    const server = new McpServer(
        {
            name: env.MCP_SERVER_NAME,
            version: env.MCP_SERVER_VERSION,
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    registerListInvoicesTool(server, invoices, logger);
    registerCreateInvoiceTool(server, invoices, logger);
    registerGetInvoiceTool(server, invoices, logger);

    return server;
}
