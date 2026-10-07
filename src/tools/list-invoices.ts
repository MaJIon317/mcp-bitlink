import { McpServer } from '@modelcontextprotocol/server';
import { listInvoicesInputSchema } from '../schemas/invoice.js';
import type { InvoicesApi } from '../api/resources/invoices.js';
import type { Logger } from '../logging/index.js';
import { errorResult, successResult } from './result.js';

export function registerListInvoicesTool(
    server: McpServer,
    invoices: InvoicesApi,
    logger: Logger,
): void {
    const toolLogger = logger.child({ tool: 'list_invoices' });

    server.registerTool(
        'list_invoices',
        {
            description:
                'Use the merchant selected in this conversation. If none is selected, list merchants and ask the user once; reuse the choice until the user explicitly switches. ' +
                'List invoices owned by the merchant selected by the user. Supports filtering, sorting and pagination.',
            _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['invoices.read'] }] },
            inputSchema: listInvoicesInputSchema,
        },
        async (input) => {
            try {
                toolLogger.debug('Listing invoices', {
                    page: input.page,
                    perPage: input.perPage,
                    status: input.status,
                    currency: input.currency,
                    country: input.country,
                });

                return successResult(await invoices.list(input));
            } catch (error) {
                return errorResult(toolLogger, error, {
                    page: input.page,
                    perPage: input.perPage,
                });
            }
        },
    );
}
