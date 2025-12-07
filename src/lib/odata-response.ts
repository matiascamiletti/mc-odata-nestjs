export interface ODataResponse<T> {
    data: T[];
    total: number;
    skip: number;
    limit: number;
}
