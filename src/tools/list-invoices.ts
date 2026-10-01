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
                'List invoices owned by the authenticated merchant. Supports filtering, sorting and pagination.',
            inputSchema: listInvoicesInputSchema,
            annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
