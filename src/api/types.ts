export interface ApiMetaPagination {
    current_page: number;
    per_page: number;
    last_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
}

export interface ApiMeta {
    request_id: string;
    timestamp: string;
    version: string;
    processing_ms: number;
    pagination?: ApiMetaPagination;
}

export interface ApiResponse<T> {
    success: true;
    data: T;
    meta: ApiMeta;
}

export interface ApiErrorBody {
    success: false;
    message: string;
    error: {
        code: string;
    };
    errors?: Record<string, string[]>;
    meta?: ApiMeta;
}

export interface PaginationLinks {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
}

export interface ResourcePaginationMeta {
    current_page: number;
    from: number | null;
    last_page: number;
    links?: Array<{
        url: string | null;
        label: string;
        active: boolean;
    }>;
    path?: string | null;
    per_page: number;
    to: number | null;
    total: number;
}

/** Laravel-style paginated resource nested under `data`. */
export interface NestedPaginatedData<T> {
    data: T[];
    links?: PaginationLinks;
    meta: ResourcePaginationMeta;
}
