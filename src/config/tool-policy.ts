import { z } from 'zod';

export const toolNames = [
    'get_me', 'list_merchants', 'get_merchant',
    'list_invoices', 'create_invoice', 'get_invoice',
] as const;

export type ToolName = typeof toolNames[number];

export const disabledToolsSchema = z.string().default('').transform((value) =>
    [...new Set(value.split(',').map((name) => name.trim()).filter(Boolean))],
).pipe(z.array(z.enum(toolNames)));

/** OAuth permissions required by each tool; profile and merchant tools need only authentication. */
export const toolScopes = {
    get_me: [],
    list_merchants: [],
    get_merchant: [],
    list_invoices: ['invoices.read'],
    create_invoice: ['invoices.create'],
    get_invoice: ['invoices.read'],
} as const satisfies Record<ToolName, readonly string[]>;

export function enabledOAuthScopes(disabledTools: readonly ToolName[] = []): string[] {
    return [...new Set(toolNames.filter(name => !disabledTools.includes(name)).flatMap(name => [...toolScopes[name]]))];
}

export function requiredToolScopes(name: string): readonly string[] {
    return Object.hasOwn(toolScopes, name) ? toolScopes[name as ToolName] : [];
}
