import { Model, ModelStatic, FindAndCountOptions, WhereOptions, Op, OrderItem, Includeable } from 'sequelize';
import { ODataResponse } from './odata-response';

export class ODataBuilderSequelize<T extends Model = any> {
    private model: ModelStatic<T> | any;
    private request: any;
    private baseOptions: FindAndCountOptions;
    private options: FindAndCountOptions;
    private customWhereConditions: WhereOptions[] = [];
    private allowedFiltersList: string[] = [];
    private allowedSortsList: string[] = [];
    private allowedExpandsList: string[] = [];

    constructor(model: ModelStatic<T> | any, request: any, initialOptions: FindAndCountOptions = {}) {
        this.model = model;
        this.request = request || {};
        this.baseOptions = { ...initialOptions };
        this.options = { ...initialOptions };
    }

    public static for<T extends Model = any>(
        model: ModelStatic<T> | any,
        request: any,
        initialOptions?: FindAndCountOptions
    ): ODataBuilderSequelize<T> {
        return new ODataBuilderSequelize<T>(model, request, initialOptions);
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

    public addWhere(condition: WhereOptions | any): this {
        if (condition) {
            this.customWhereConditions.push(condition);
        }
        return this;
    }

    public getModel(): ModelStatic<T> | any {
        return this.model;
    }

    public getOptions(): FindAndCountOptions {
        this.buildOptions();
        return this.options;
    }

    public getFindOptions(): FindAndCountOptions {
        return this.getOptions();
    }

    public getQueryBuilder(): FindAndCountOptions {
        return this.getOptions();
    }

    public async execute(): Promise<ODataResponse<T>> {
        this.buildOptions();

        const result = await this.model.findAndCountAll(this.options);
        const data: T[] = (result && result.rows) ? result.rows : [];
        const rawCount = result ? result.count : 0;
        const total = typeof rawCount === 'number'
            ? rawCount
            : (Array.isArray(rawCount) ? rawCount.length : Number(rawCount) || 0);

        const skip = this.request.$skip ? parseInt(this.request.$skip, 10) : 0;
        const limit = this.request.$top ? parseInt(this.request.$top, 10) : 0;

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

    private buildOptions(): void {
        this.options = { ...this.baseOptions };
        this.applyPagination();
        this.applySorts();
        this.applyExpands();
        this.applyFilters();
    }

    private applyPagination(): void {
        if (this.request.$top) {
            this.options.limit = parseInt(this.request.$top, 10);
        }

        if (this.request.$skip) {
            this.options.offset = parseInt(this.request.$skip, 10);
        }
    }

    private applySorts(): void {
        if (!this.request.$orderby) return;

        const existingOrder: OrderItem[] = Array.isArray(this.baseOptions.order)
            ? [...(this.baseOptions.order as OrderItem[])]
            : [];

        const order: OrderItem[] = [...existingOrder];
        const sorts = this.request.$orderby.split(',');

        sorts.forEach((sort: string) => {
            const parts = sort.trim().split(/\s+/);
            const field = parts[0];
            const dir = (parts[1] || 'ASC').toUpperCase() as 'ASC' | 'DESC';

            if (this.allowedSortsList.length > 0 && !this.allowedSortsList.includes(field)) {
                return;
            }

            order.push([field, dir]);
        });

        if (order.length > 0) {
            this.options.order = order;
        }
    }

    private applyExpands(): void {
        if (!this.request.$expand) return;

        const existingIncludes: Includeable[] = Array.isArray(this.baseOptions.include)
            ? [...this.baseOptions.include]
            : (this.baseOptions.include ? [this.baseOptions.include] : []);

        const includes: Includeable[] = [...existingIncludes];
        const expands = this.request.$expand.split(',');

        expands.forEach((expand: string) => {
            const relation = expand.trim();

            if (this.allowedExpandsList.length > 0 && !this.allowedExpandsList.includes(relation)) {
                return;
            }

            includes.push({ association: relation });
        });

        if (includes.length > 0) {
            this.options.include = includes;
        }
    }

    private applyFilters(): void {
        const parsedFilters: WhereOptions[] = [];

        if (this.request.$filter) {
            const filterParts = this.request.$filter.split(' and ');
            filterParts.forEach((part: string) => {
                const condition = this.parseFilterPart(part.trim());
                if (condition) {
                    parsedFilters.push(condition);
                }
            });
        }

        const allConditions: WhereOptions[] = [];

        if (this.baseOptions.where) {
            allConditions.push(this.baseOptions.where);
        }

        if (this.customWhereConditions.length > 0) {
            allConditions.push(...this.customWhereConditions);
        }

        if (parsedFilters.length > 0) {
            allConditions.push(...parsedFilters);
        }

        if (allConditions.length === 1) {
            this.options.where = allConditions[0];
        } else if (allConditions.length > 1) {
            this.options.where = {
                [Op.and]: allConditions
            };
        }
    }

    private parseFilterPart(filter: string): WhereOptions | null {
        const strategies: Array<{
            pattern: RegExp;
            handle: (field: string, value?: string) => WhereOptions;
        }> = [
            { pattern: /(.+?)\s+eq\s+('null'|null)/i, handle: (field: string) => ({ [field]: { [Op.is]: null } }) },
            { pattern: /(.+?)\s+ne\s+('null'|null)/i, handle: (field: string) => ({ [field]: { [Op.not]: null } }) },
            { pattern: /(.+?)\s+eq\s+(.+)/, handle: (field: string, value?: string) => ({ [field]: { [Op.eq]: this.parseValue(value!) } }) },
            { pattern: /(.+?)\s+ne\s+(.+)/, handle: (field: string, value?: string) => ({ [field]: { [Op.ne]: this.parseValue(value!) } }) },
            { pattern: /(.+?)\s+gt\s+(.+)/, handle: (field: string, value?: string) => ({ [field]: { [Op.gt]: this.parseValue(value!) } }) },
            { pattern: /(.+?)\s+ge\s+(.+)/, handle: (field: string, value?: string) => ({ [field]: { [Op.gte]: this.parseValue(value!) } }) },
            { pattern: /(.+?)\s+lt\s+(.+)/, handle: (field: string, value?: string) => ({ [field]: { [Op.lt]: this.parseValue(value!) } }) },
            { pattern: /(.+?)\s+le\s+(.+)/, handle: (field: string, value?: string) => ({ [field]: { [Op.lte]: this.parseValue(value!) } }) },
            { pattern: /contains\((.+?),\s*(.+?)\)/, handle: (field: string, value?: string) => ({ [field]: { [Op.like]: `%${this.parseValue(value!)}%` } }) },
            { pattern: /startswith\((.+?),\s*(.+?)\)/, handle: (field: string, value?: string) => ({ [field]: { [Op.like]: `${this.parseValue(value!)}%` } }) },
            { pattern: /endswith\((.+?),\s*(.+?)\)/, handle: (field: string, value?: string) => ({ [field]: { [Op.like]: `%${this.parseValue(value!)}` } }) },
        ];

        for (const strategy of strategies) {
            const match = filter.match(strategy.pattern);
            if (match) {
                const field = match[1].trim();
                const value = match[2]?.trim();

                if (this.allowedFiltersList.length > 0 && !this.allowedFiltersList.includes(field)) {
                    return null;
                }

                return strategy.handle(field, value);
            }
        }

        return null;
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
}

export const OdataBuilderSequelize = ODataBuilderSequelize;
export type OdataBuilderSequelize<T extends Model = any> = ODataBuilderSequelize<T>;
