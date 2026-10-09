import { MerchantsApi } from '../api/resources/merchants.js';
import { merchantInstructions, registerListMerchantsTool, registerGetMerchantTool, registerGetMeTool } from '../tools/merchants.js';
import { McpServer } from '@modelcontextprotocol/server';
import type { ToolName } from '../config/tool-policy.js';
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
            ...(env.MCP_DISABLED_TOOLS.includes('list_merchants') ? {} : { instructions: merchantInstructions }),
            capabilities: {
                tools: {},
            },
        },
    );

    const merchants = new MerchantsApi(apiClient);
    const registrations: Record<ToolName, () => void> = {
        get_me: () => registerGetMeTool(server, merchants, logger),
        list_merchants: () => registerListMerchantsTool(server, merchants, logger),
        get_merchant: () => registerGetMerchantTool(server, merchants, logger),
        list_invoices: () => registerListInvoicesTool(server, invoices, logger),
        create_invoice: () => registerCreateInvoiceTool(server, invoices, logger),
        get_invoice: () => registerGetInvoiceTool(server, invoices, logger),
    };
    for (const name of Object.keys(registrations) as ToolName[]) {
        if (!env.MCP_DISABLED_TOOLS.includes(name)) registrations[name]();
    }

    return server;
}
