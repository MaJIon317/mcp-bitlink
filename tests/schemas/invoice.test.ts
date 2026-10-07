import { describe, expect, it } from 'vitest';
import { createInvoiceInputSchema } from '../../src/schemas/invoice.js';

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
            country: ' usa ',
        });

        expect(parsed).toEqual({
            merchantId: 'merchant_1',
            whichWallet: 'new',
            amount: 100,
            currency: 'USD',
            name: 'John Doe',
            country: 'usa',
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
            country: 'DEU',
        });

        expect(parsed.whichWallet).toBe('user');
        expect(parsed.email).toBe('jane@example.com');
    });
});
