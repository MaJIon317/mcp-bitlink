import { z } from 'zod';
import {
    amountSchema,
    countryCodeSchema,
    currencyCodeSchema,
    invoiceIdSchema,
    optionalEmailSchema,
    optionalTrimmedString,
} from './common.js';

export const invoiceStatusSchema = z.enum([
    'pending',
    'pending_paid',
    'complete',
    'partially_overdue',
    'expired',
]);

/**
 * Bitlink `which_wallet` values.
 * Agent should ask the end user in plain language (new vs current user),
 * then pass only `new` or `user` here — never expose these tokens to the user.
 */
export const whichWalletSchema = z
    .enum(['new', 'user'])
    .describe(
        'Payment wallet target for Bitlink which_wallet. ' +
            'If the user did not specify, ask in plain language: for a new user/customer, or for the current/existing user? ' +
            'Then set new for a new user/customer, user for the current/existing user. ' +
            'Do not ask the end user to type which_wallet, new, or user.',
    );

export const merchantIdSchema = z.string().trim().min(1).max(128).describe(
    'Merchant chosen by the user for this conversation. Ask once before the first invoice operation; reuse it until the user asks to switch. Never guess or choose the first merchant automatically.',
);

export const createInvoiceInputSchema = z.object({
    merchantId: merchantIdSchema,
    whichWallet: whichWalletSchema,
    amount: amountSchema,
    currency: currencyCodeSchema,
    object: optionalTrimmedString(),
    name: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim() : value),
        z.string().min(1),
    ),
    email: optionalEmailSchema,
    address: optionalTrimmedString(),
    country: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim() : value),
        z.string().min(1),
    ),
});

export const getInvoiceInputSchema = z.object({
    merchantId: merchantIdSchema,
    invoiceId: invoiceIdSchema,
});

export const listInvoicesInputSchema = z.object({
    merchantId: merchantIdSchema,
    page: z.number().int().min(1).optional(),
    perPage: z.number().int().min(1).max(100).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sortBy: z.enum(['created_at', 'amount', 'amount_paid']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    status: invoiceStatusSchema.optional(),
    currency: currencyCodeSchema.optional(),
    country: countryCodeSchema.optional(),
});

export const invoiceSchema = z.object({
    id: z.string(),
    status: invoiceStatusSchema,
    amount: z.string(),
    amountPaid: z.string(),
    currency: z.string().optional(),
    object: z.string().nullable(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    country: z.string().nullable().optional(),
    paymentLink: z.string(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const invoiceListSchema = z.object({
    invoices: z.array(invoiceSchema),
    pagination: z.object({
        currentPage: z.number().int(),
        perPage: z.number().int(),
        lastPage: z.number().int(),
        total: z.number().int(),
        from: z.number().int().nullable(),
        to: z.number().int().nullable(),
    }),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceInputSchema>;
export type GetInvoiceInput = z.infer<typeof getInvoiceInputSchema>;
export type ListInvoicesInput = z.infer<typeof listInvoicesInputSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceList = z.infer<typeof invoiceListSchema>;
