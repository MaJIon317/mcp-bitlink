import { z } from 'zod';
import type { ApiClient } from '../client.js';
import type { ApiResponse, NestedPaginatedData } from '../types.js';
import { UnexpectedResponseError } from '../errors.js';

export const merchantSchema = z.object({
    id: z.string(), name: z.string(), address: z.string(), city: z.string(),
    post_code: z.string(), country: z.string().nullable(),
    verification_status: z.string(), role: z.string().nullable(),
    is_owner: z.string().nullable(),
});
export const userSchema = z.object({ id: z.string(), email: z.string(), name: z.string() });
type Merchant = z.infer<typeof merchantSchema>;

export class MerchantsApi {
    constructor(private readonly client: ApiClient) {}

    async list(page?: number) {
        const response = await this.client.get<ApiResponse<Merchant[] | NestedPaginatedData<Merchant>>>(
            '/v1/merchants', { page },
        );
        if (Array.isArray(response.data)) {
            return { merchants: z.array(merchantSchema).parse(response.data), pagination: response.meta.pagination ?? null };
        }
        if (response.data && Array.isArray(response.data.data) && response.data.meta) {
            return { merchants: z.array(merchantSchema).parse(response.data.data), pagination: response.data.meta };
        }
        throw new UnexpectedResponseError('Merchant list response has unexpected shape');
    }

    async get(merchantId: string) {
        const response = await this.client.get<ApiResponse<Merchant>>(`/v1/merchants/${encodeURIComponent(merchantId)}`);
        return merchantSchema.parse(response.data);
    }

    async me() {
        const response = await this.client.get<ApiResponse<z.infer<typeof userSchema>>>('/v1/me');
        return userSchema.parse(response.data);
    }
}
