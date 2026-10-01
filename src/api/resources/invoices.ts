import type { ApiClient } from '../client.js';
import { UnexpectedResponseError } from '../errors.js';
import type {
    ApiResponse,
    NestedPaginatedData,
} from '../types.js';

import {
    invoiceListSchema,
    invoiceSchema,
    type CreateInvoiceInput,
    type Invoice,
    type InvoiceList,
    type ListInvoicesInput,
} from '../../schemas/invoice.js';

type ApiInvoice = {
    id: string;
    status: string;
    amount: string;
    amount_paid: string;
    currency?: string;
    object: string | null;
    name: string | null;
    email: string | null;
    address: string | null;
    country?: string | null;
    payment_link: string;
    created_at: string | null;
    updated_at: string | null;
};

type InvoiceListResponse = ApiResponse<
    ApiInvoice[] | NestedPaginatedData<ApiInvoice>
>;

function mapInvoice(invoice: ApiInvoice): Invoice {
    return invoiceSchema.parse({
        id: invoice.id,
        status: invoice.status,
        amount: invoice.amount,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        object: invoice.object,
        name: invoice.name,
        email: invoice.email,
        address: invoice.address,
        country: invoice.country,
        paymentLink: invoice.payment_link,
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
    });
}

function isNestedPaginatedData(
    value: unknown,
): value is NestedPaginatedData<ApiInvoice> {
    return (
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as NestedPaginatedData<ApiInvoice>).data) &&
        typeof (value as NestedPaginatedData<ApiInvoice>).meta === 'object' &&
        (value as NestedPaginatedData<ApiInvoice>).meta !== null
    );
}

function normalizeListResponse(response: InvoiceListResponse): {
    items: ApiInvoice[];
    pagination: InvoiceList['pagination'];
} {
    if (Array.isArray(response.data)) {
        const pagination = response.meta.pagination;

        return {
            items: response.data,
            pagination: {
                currentPage: pagination?.current_page ?? 1,
                perPage: pagination?.per_page ?? response.data.length,
                lastPage: pagination?.last_page ?? 1,
                total: pagination?.total ?? response.data.length,
                from: pagination?.from ?? null,
                to: pagination?.to ?? null,
            },
        };
    }

    if (isNestedPaginatedData(response.data)) {
        const { data: items, meta } = response.data;

        return {
            items,
            pagination: {
                currentPage: meta.current_page,
                perPage: meta.per_page,
                lastPage: meta.last_page,
                total: meta.total,
                from: meta.from,
                to: meta.to,
            },
        };
    }

    throw new UnexpectedResponseError(
        'Invoice list response has unexpected shape',
        {
            hasData: response.data !== undefined,
            dataType: Array.isArray(response.data)
                ? 'array'
                : typeof response.data,
        },
    );
}

export class InvoicesApi {
    public constructor(
        private readonly client: ApiClient,
    ) {}

    public async list(
        input: ListInvoicesInput = {},
    ): Promise<InvoiceList> {
        const response = await this.client.get<InvoiceListResponse>(
            '/v1/invoices',
            {
                page: input.page,
                per_page: input.perPage,
                from: input.from,
                to: input.to,
                sort_by: input.sortBy,
                sort_direction: input.sortDirection,
                status: input.status,
                currency: input.currency,
                country: input.country,
            },
        );

        const { items, pagination } = normalizeListResponse(response);

        return invoiceListSchema.parse({
            invoices: items.map(mapInvoice),
            pagination,
        });
    }

    public async create(
        input: CreateInvoiceInput,
    ): Promise<Invoice> {
        const response = await this.client.post<ApiResponse<ApiInvoice>>(
            '/v1/invoices',
            {
                which_wallet: input.whichWallet,
                amount: input.amount,
                currency: input.currency,
                name: input.name,
                country: input.country,
                ...(input.object !== undefined ? { object: input.object } : {}),
                ...(input.email !== undefined ? { email: input.email } : {}),
                ...(input.address !== undefined ? { address: input.address } : {}),
            },
        );

        return mapInvoice(response.data);
    }

    public async get(
        invoiceId: string,
    ): Promise<Invoice> {
        const response = await this.client.get<ApiResponse<ApiInvoice>>(
            `/v1/invoices/${encodeURIComponent(invoiceId)}`,
        );

        return mapInvoice(response.data);
    }
}
