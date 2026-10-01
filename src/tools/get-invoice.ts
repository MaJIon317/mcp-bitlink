import { McpServer } from '@modelcontextprotocol/server';
import { getInvoiceInputSchema } from '../schemas/invoice.js';
import type { InvoicesApi } from '../api/resources/invoices.js';
import type { Logger } from '../logging/index.js';
import { errorResult, successResult } from './result.js';

export function registerGetInvoiceTool(
    server: McpServer,
    invoices: InvoicesApi,
    logger: Logger,
): void {
    const toolLogger = logger.child({ tool: 'get_invoice' });

    server.registerTool(
        'get_invoice',
        {
            description:
                'Get an invoice owned by the authenticated merchant, including its current payment status.',
            inputSchema: getInvoiceInputSchema,
        },
        async ({ invoiceId }) => {
            try {
                toolLogger.debug('Fetching invoice', { invoiceId });
                return successResult(await invoices.get(invoiceId));
            } catch (error) {
                return errorResult(toolLogger, error, { invoiceId });
            }
        },
    );
}
