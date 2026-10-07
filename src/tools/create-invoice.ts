import { McpServer } from '@modelcontextprotocol/server';
import { createInvoiceInputSchema } from '../schemas/invoice.js';
import type { InvoicesApi } from '../api/resources/invoices.js';
import type { Logger } from '../logging/index.js';
import { errorResult, successResult } from './result.js';

export function registerCreateInvoiceTool(
    server: McpServer,
    invoices: InvoicesApi,
    logger: Logger,
): void {
    const toolLogger = logger.child({ tool: 'create_invoice' });

    server.registerTool(
        'create_invoice',
        {
            description:
                'Use the merchant selected in this conversation. If none is selected, list merchants and ask the user once; reuse the choice until the user explicitly switches. ' +
                'Create a payment invoice for the merchant selected by the user. ' +
                'If the user did not say who the wallet is for, ask whether it is for a new user/customer or the current/existing user, ' +
                'then set whichWallet to "new" or "user" accordingly. Returns the invoice and payment link.',
            _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['invoices.create'] }] },
            inputSchema: createInvoiceInputSchema,
        },
        async (input) => {
            try {
                toolLogger.debug('Creating invoice', {
                    currency: input.currency,
                    whichWallet: input.whichWallet,
                });

                return successResult(await invoices.create(input));
            } catch (error) {
                return errorResult(toolLogger, error);
            }
        },
    );
}
