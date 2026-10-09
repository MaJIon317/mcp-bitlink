import { z } from 'zod';

export const toolNames = [
    'get_me', 'list_merchants', 'get_merchant',
    'list_invoices', 'create_invoice', 'get_invoice',
] as const;

export type ToolName = typeof toolNames[number];

export const disabledToolsSchema = z.string().default('').transform((value) =>
    [...new Set(value.split(',').map((name) => name.trim()).filter(Boolean))],
).pipe(z.array(z.enum(toolNames)));
