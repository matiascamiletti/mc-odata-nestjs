import { Repository, SelectQueryBuilder, Brackets } from 'typeorm';
import { ODataResponse } from './odata-response';

export class ODataBuilder<T> {
    private repo: Repository<T>;
    private queryBuilder: SelectQueryBuilder<T>;
    private request: any;
    private allowedFiltersList: string[] = [];
    private allowedSortsList: string[] = [];
    private allowedExpandsList: string[] = [];

    constructor(repo: Repository<T>, request: any) {
        this.repo = repo;
        this.request = request;
        this.queryBuilder = this.repo.createQueryBuilder('entity');
    }

    public static for<T>(repo: Repository<T>, request: any): ODataBuilder<T> {
        return new ODataBuilder(repo, request);
    }

    public allowedFilters(filters: string[]): this {
        this.allowedFiltersList = filters;
        return this;
    }

    public allowedSorts(sorts: string[]): this {
        this.allowedSortsList = sorts;
        return this;
    }

    public allowedExpands(expands: string[]): this {
        this.allowedExpandsList = expands;
        return this;
    }

    public async execute(): Promise<ODataResponse<T>> {
        this.applyFilters();
        this.applySorts();
        this.applyExpands();
        this.applyPagination();

        const [data, total] = await this.queryBuilder.getManyAndCount();

        const skip = this.request.$skip ? parseInt(this.request.$skip) : 0;
        const limit = this.request.$top ? parseInt(this.request.$top) : 0;

        const per_page = limit > 0 ? limit : total;
        const current_page = limit > 0 ? Math.floor(skip / limit) + 1 : 1;
        const last_page = limit > 0 ? Math.ceil(total / limit) : 1;
        const from = total === 0 ? 0 : skip + 1;
        const to = total === 0 ? 0 : skip + data.length;

        return {
            data,
            current_page,
            from,
            last_page,
            per_page,
            to,
            total
        };
    }

    private applyPagination() {
        if (this.request.$top) {
            this.queryBuilder.take(parseInt(this.request.$top));
        }

        if (this.request.$skip) {
            this.queryBuilder.skip(parseInt(this.request.$skip));
        }
    }

    private applySorts() {
        if (!this.request.$orderby) return;

        const sorts = this.request.$orderby.split(',');
        sorts.forEach((sort: string) => {
            const [field, dir] = sort.trim().split(' ');
            if (this.allowedSortsList.length > 0 && !this.allowedSortsList.includes(field)) {
                return;
            }
            this.queryBuilder.addOrderBy(`entity.${field}`, dir.toUpperCase() as 'ASC' | 'DESC');
        });
    }

    private applyExpands() {
        if (!this.request.$expand) return;

        const expands = this.request.$expand.split(',');
        expands.forEach((expand: string) => {
            const relation = expand.trim();
            if (this.allowedExpandsList.length > 0 && !this.allowedExpandsList.includes(relation)) {
                return;
            }
            this.queryBuilder.leftJoinAndSelect(`entity.${relation}`, relation);
        });
    }

    private applyFilters() {
        if (!this.request.$filter) return;

        // Basic parsing for standard OData operators
        // Note: This is a simplified parser. A full OData parser would be much more complex.
        // We support: eq, ne, gt, ge, lt, le, contains, startswith, endswith

        // Split by 'and' to support multiple filters
        // TODO: Support 'or' and precedence with parentheses in the future
        const filterParts = this.request.$filter.split(' and ');

        filterParts.forEach((part: string, index: number) => {
            this.parseAndApplyFilter(part.trim(), index);
        });
    }

    private parseAndApplyFilter(filter: string, index: number) {
        // Regex patterns for different operators
        const strategies = [
            { pattern: /(.+?) eq 'null'/i, handle: (field: string) => this.addWhere(`${field} IS NULL`, {}) },
            { pattern: /(.+?) ne 'null'/i, handle: (field: string) => this.addWhere(`${field} IS NOT NULL`, {}) },
            { pattern: /(.+?) eq (.+)/, handle: (field: string, value: string) => this.addWhere(`${field} = :val${index}`, { [`val${index}`]: this.parseValue(value) }) },
            { pattern: /(.+?) ne (.+)/, handle: (field: string, value: string) => this.addWhere(`${field} != :val${index}`, { [`val${index}`]: this.parseValue(value) }) },
            { pattern: /(.+?) gt (.+)/, handle: (field: string, value: string) => this.addWhere(`${field} > :val${index}`, { [`val${index}`]: this.parseValue(value) }) },
            { pattern: /(.+?) ge (.+)/, handle: (field: string, value: string) => this.addWhere(`${field} >= :val${index}`, { [`val${index}`]: this.parseValue(value) }) },
            { pattern: /(.+?) lt (.+)/, handle: (field: string, value: string) => this.addWhere(`${field} < :val${index}`, { [`val${index}`]: this.parseValue(value) }) },
            { pattern: /(.+?) le (.+)/, handle: (field: string, value: string) => this.addWhere(`${field} <= :val${index}`, { [`val${index}`]: this.parseValue(value) }) },
            { pattern: /contains\((.+?),(.+?)\)/, handle: (field: string, value: string) => this.addWhere(`${field} LIKE :val${index}`, { [`val${index}`]: `%${this.parseValue(value)}%` }) },
            { pattern: /startswith\((.+?),(.+?)\)/, handle: (field: string, value: string) => this.addWhere(`${field} LIKE :val${index}`, { [`val${index}`]: `${this.parseValue(value)}%` }) },
            { pattern: /endswith\((.+?),(.+?)\)/, handle: (field: string, value: string) => this.addWhere(`${field} LIKE :val${index}`, { [`val${index}`]: `%${this.parseValue(value)}` }) },
        ];

        for (const strategy of strategies) {
            const match = filter.match(strategy.pattern);
            if (match) {
                const field = match[1].trim();
                const value = match[2]?.trim();

                if (this.allowedFiltersList.length > 0 && !this.allowedFiltersList.includes(field)) {
                    // Filter not allowed
                    return;
                }

                // For contains/startswith/endswith, the field might be inside the function call logic in regex, 
                // but our simple regex captures it correctly as group 1.
                // However, we need to be careful with field names.
                // Assuming simple field names for now.

                // If the strategy adds 'entity.' prefix itself, we shouldn't add it.
                // But for eq, ne etc we need to add it unless it's an alias or relation which is harder to detect.
                // Safer to prepend 'entity.' if not present for simple fields. 
                // But let's stick to the implementation in 'handle'.

                // Wait, the strategy handle calls addWhere. 
                // For 'eq' etc, I used `${field} = ...`. I should prepend `entity.` to field if it doesn't have a dot.

                strategy.handle(field, value);
                return;
            }
        }
    }

    public addWhere(condition: string, parameters: any) {
        // Fix field name in condition to refer to 'entity' alias if strictly a local field
        // This is a bit hacky with string replacement, but sufficient for simple cases.
        if (!condition.startsWith('entity.') && !condition.includes('.')) {
            condition = `entity.${condition}`;
        }

        this.queryBuilder.andWhere(condition, parameters);
    }

    private parseValue(value: string): any {
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1);
        }
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value === 'null') return null;
        if (!isNaN(Number(value))) return Number(value);
        return value;
    }

    public getQueryBuilder(): SelectQueryBuilder<T> {
        return this.queryBuilder;
    }
}
