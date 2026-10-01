import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/api/client.js';
import { InvoicesApi } from '../../src/api/resources/invoices.js';
import { UnexpectedResponseError } from '../../src/api/errors.js';

afterEach(() => {
    vi.restoreAllMocks();
});

function invoicePayload(overrides: Record<string, unknown> = {}) {
    return {
        id: 'inv_1',
        status: 'pending',
        amount: '100',
        amount_paid: '0',
        currency: 'EUR',
        object: 'Order #1',
        name: 'John Doe',
        email: 'john@example.com',
        address: 'Berlin',
        country: 'DEU',
        payment_link: 'https://pay.example.test/i/inv_1',
        created_at: '2026-09-30T10:00:00Z',
        updated_at: '2026-09-30T10:00:00Z',
        ...overrides,
    };
}

function successEnvelope<T>(
    data: T,
    meta: Record<string, unknown> = {},
) {
    return {
        success: true,
        data,
        meta: {
            request_id: '018f5d0f-6a4a-77df-9c54-30d6cc56e2ad',
            timestamp: '2026-09-30T10:00:00Z',
            version: '1.0',
            processing_ms: 12,
            ...meta,
        },
    };
}

describe('InvoicesApi', () => {
    it('lists invoices with standard envelope pagination', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify(
                    successEnvelope([invoicePayload()], {
                        pagination: {
                            current_page: 1,
                            per_page: 15,
                            last_page: 1,
                            total: 1,
                        },
                    }),
                ),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        const client = new ApiClient({
            baseUrl: 'https://api.example.test/api',
            accessToken: 'merchant-token',
            timeoutMs: 1000,
        });

        const invoices = new InvoicesApi(client);

        const result = await invoices.list({
            page: 1,
            perPage: 15,
            status: 'pending',
            currency: 'EUR',
            country: 'DEU',
            sortBy: 'created_at',
            sortDirection: 'desc',
        });

        expect(result.invoices).toHaveLength(1);
        expect(result.invoices[0]?.id).toBe('inv_1');
        expect(result.invoices[0]?.paymentLink).toBe(
            'https://pay.example.test/i/inv_1',
        );
        expect(result.pagination).toEqual({
            currentPage: 1,
            perPage: 15,
            lastPage: 1,
            total: 1,
            from: null,
            to: null,
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.example.test/api/v1/invoices?page=1&per_page=15&sort_by=created_at&sort_direction=desc&status=pending&currency=EUR&country=DEU',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    Authorization: 'Bearer merchant-token',
                }),
            }),
        );
    });

    it('lists invoices with nested Laravel pagination payload', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify(
                    successEnvelope({
                        data: [invoicePayload()],
                        links: {
                            first: 'https://api.example.test/api/v1/invoices?page=1',
                            last: 'https://api.example.test/api/v1/invoices?page=1',
                            prev: null,
                            next: null,
                        },
                        meta: {
                            current_page: 2,
                            from: 16,
                            last_page: 3,
                            links: [],
                            path: 'https://api.example.test/api/v1/invoices',
                            per_page: 15,
                            to: 30,
                            total: 40,
                        },
                    }),
                ),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        const invoices = new InvoicesApi(
            new ApiClient({
                baseUrl: 'https://api.example.test/api',
                accessToken: 'merchant-token',
                timeoutMs: 1000,
            }),
        );

        const result = await invoices.list();

        expect(result.invoices).toHaveLength(1);
        expect(result.pagination).toEqual({
            currentPage: 2,
            perPage: 15,
            lastPage: 3,
            total: 40,
            from: 16,
            to: 30,
        });
    });

    it('throws a clear error for unexpected list payload shape', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify(successEnvelope({ unexpected: true })),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        const invoices = new InvoicesApi(
            new ApiClient({
                baseUrl: 'https://api.example.test/api',
                accessToken: 'merchant-token',
                timeoutMs: 1000,
            }),
        );

        await expect(invoices.list()).rejects.toBeInstanceOf(
            UnexpectedResponseError,
        );
    });

    it('maps whichWallet=user to which_wallet=user', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(successEnvelope(invoicePayload())), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        );

        const invoices = new InvoicesApi(
            new ApiClient({
                baseUrl: 'https://api.example.test/api',
                accessToken: 'merchant-token',
                timeoutMs: 1000,
            }),
        );

        await invoices.create({
            whichWallet: 'user',
            amount: 50,
            currency: 'USD',
            name: 'Jane Doe',
            country: 'USA',
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.example.test/api/v1/invoices',
            expect.objectContaining({
                body: JSON.stringify({
                    which_wallet: 'user',
                    amount: 50,
                    currency: 'USD',
                    name: 'Jane Doe',
                    country: 'USA',
                }),
            }),
        );
    });

    it('creates invoice using the current merchant token', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify(successEnvelope(invoicePayload())), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        );

        const client = new ApiClient({
            baseUrl: 'https://api.example.test/api',
            accessToken: 'merchant-token',
            timeoutMs: 1000,
        });

        const invoices = new InvoicesApi(client);

        const invoice = await invoices.create({
            whichWallet: 'new',
            amount: 100,
            currency: 'EUR',
            name: 'John Doe',
            email: 'john@example.com',
            country: 'DEU',
            object: 'Order #1',
        });

        expect(invoice.id).toBe('inv_1');
        expect(invoice.amountPaid).toBe('0');
        expect(invoice.paymentLink).toBe('https://pay.example.test/i/inv_1');

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.example.test/api/v1/invoices',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer merchant-token',
                }),
                body: JSON.stringify({
                    which_wallet: 'new',
                    amount: 100,
                    currency: 'EUR',
                    name: 'John Doe',
                    country: 'DEU',
                    object: 'Order #1',
                    email: 'john@example.com',
                }),
            }),
        );
    });

    it('gets invoice by id', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify(successEnvelope(invoicePayload({ status: 'complete' }))),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
        );

        const client = new ApiClient({
            baseUrl: 'https://api.example.test/api',
            accessToken: 'merchant-token',
            timeoutMs: 1000,
        });

        const invoices = new InvoicesApi(client);
        const invoice = await invoices.get('inv_1');

        expect(invoice.status).toBe('complete');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.example.test/api/v1/invoices/inv_1',
            expect.objectContaining({
                method: 'GET',
            }),
        );
    });
});
