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
                'Use the merchant selected in this conversation. If none is selected, list merchants and ask the user once; reuse the choice until the user explicitly switches. ' +
                'Get an invoice owned by the merchant selected by the user, including its current payment status.',
            _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['invoices.read'] }] },
            inputSchema: getInvoiceInputSchema,
        },
        async ({ merchantId, invoiceId }) => {
            try {
                toolLogger.debug('Fetching invoice', { invoiceId });
                return successResult(await invoices.get(merchantId, invoiceId));
            } catch (error) {
                return errorResult(toolLogger, error, { invoiceId });
            }
        },
    );
}
