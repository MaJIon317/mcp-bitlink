import { describe, expect, it } from 'vitest';
import { createInvoiceInputSchema, listInvoicesInputSchema } from '../../src/schemas/invoice.js';

describe('createInvoiceInputSchema', () => {
    it('normalizes currency/country and accepts empty optional email', () => {
        const parsed = createInvoiceInputSchema.parse({
            merchantId: 'merchant_1',
            whichWallet: 'new',
            amount: 100,
            currency: ' usd ',
            name: ' John Doe ',
            email: '',
            address: '',
            country: ' us ',
        });

        expect(parsed).toEqual({
            merchantId: 'merchant_1',
            whichWallet: 'new',
            amount: 100,
            currency: 'USD',
            name: 'John Doe',
            country: 'US',
        });
    });

    it('accepts a real email and whichWallet=user', () => {
        const parsed = createInvoiceInputSchema.parse({
            merchantId: 'merchant_1',
            whichWallet: 'user',
            amount: 50,
            currency: 'EUR',
            name: 'Jane',
            email: 'jane@example.com',
            country: 'DE',
        });

        expect(parsed.whichWallet).toBe('user');
        expect(parsed.email).toBe('jane@example.com');
    });
});

it('accepts existing-wallet invoices without collecting unused customer details', () => {
    expect(createInvoiceInputSchema.parse({ merchantId: 'm1', whichWallet: 'user', amount: 5, currency: 'USD' }))
        .toEqual({ merchantId: 'm1', whichWallet: 'user', amount: 5, currency: 'USD' });
});
it('requires customer name and alpha-2 country for a new wallet', () => {
    const input = { merchantId: 'm1', whichWallet: 'new', amount: 5, currency: 'USD' };
    expect(createInvoiceInputSchema.safeParse(input).success).toBe(false);
    expect(createInvoiceInputSchema.safeParse({ ...input, name: 'Customer', country: 'USA' }).success).toBe(false);
    expect(createInvoiceInputSchema.safeParse({ ...input, name: 'Customer', country: 'us' }).success).toBe(true);
});
it('accepts the current backend cancelled status and alpha-2 country filters', () => {
    expect(listInvoicesInputSchema.parse({ merchantId: 'm1', status: 'cancelled', country: ' de ' }))
        .toMatchObject({ status: 'cancelled', country: 'DE' });
});
