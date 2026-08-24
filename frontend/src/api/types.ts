export interface ApiErrorResponse {
    detail?: string;
    [key: string]: any;
}

export interface ApiValidationError {
    [field: string]: string[];
}
