export class ApiError extends Error {
    public constructor(
        message: string,
        public readonly status: number,
        public readonly code?: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export class ApiNetworkError extends Error {
    public constructor(message = 'Unable to connect to API') {
        super(message);
        this.name = 'ApiNetworkError';
    }
}

export class ApiTimeoutError extends Error {
    public constructor(message = 'API request timed out') {
        super(message);
        this.name = 'ApiTimeoutError';
    }
}

export class UnexpectedResponseError extends Error {
    public constructor(
        message = 'API returned an unexpected response',
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = 'UnexpectedResponseError';
    }
}
