import { ODataBuilderSequelize, OdataBuilderSequelize } from './odata-builder-sequelize';
import { Op } from 'sequelize';

describe('ODataBuilderSequelize', () => {
    let mockModel: any;

    beforeEach(() => {
        mockModel = {
            findAndCountAll: jest.fn().mockResolvedValue({
                rows: [],
                count: 0
            })
        };
    });

    it('should create an instance via constructor and static for', () => {
        const builder = ODataBuilderSequelize.for(mockModel, {});
        expect(builder).toBeDefined();
        expect(builder.getModel()).toBe(mockModel);

        const builderAlias = OdataBuilderSequelize.for(mockModel, {});
        expect(builderAlias).toBeDefined();
    });

    it('should apply pagination', async () => {
        await ODataBuilderSequelize.for(mockModel, { $top: '10', $skip: '5' }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 10,
                offset: 5
            })
        );
    });

    it('should apply sorting', async () => {
        await ODataBuilderSequelize.for(mockModel, { $orderby: 'name ASC' }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                order: [['name', 'ASC']]
            })
        );
    });

    it('should apply sorting with multiple fields and allowed sorts', async () => {
        await ODataBuilderSequelize.for(mockModel, { $orderby: 'name ASC, age DESC, secret ASC' })
            .allowedSorts(['name', 'age'])
            .execute();

        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                order: [
                    ['name', 'ASC'],
                    ['age', 'DESC']
                ]
            })
        );
    });

    it('should apply strict filtering (eq)', async () => {
        await ODataBuilderSequelize.for(mockModel, { $filter: "name eq 'John'" }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    name: { [Op.eq]: 'John' }
                }
            })
        );
    });

    it('should apply not equal filtering (ne)', async () => {
        await ODataBuilderSequelize.for(mockModel, { $filter: "status ne 'INACTIVE'" }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { [Op.ne]: 'INACTIVE' }
                }
            })
        );
    });

    it('should apply comparison filters (gt, ge, lt, le)', async () => {
        await ODataBuilderSequelize.for(mockModel, { $filter: 'age gt 18' }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { age: { [Op.gt]: 18 } }
            })
        );

        await ODataBuilderSequelize.for(mockModel, { $filter: 'age ge 21' }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { age: { [Op.gte]: 21 } }
            })
        );

        await ODataBuilderSequelize.for(mockModel, { $filter: 'score lt 50' }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { score: { [Op.lt]: 50 } }
            })
        );

        await ODataBuilderSequelize.for(mockModel, { $filter: 'score le 100' }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { score: { [Op.lte]: 100 } }
            })
        );
    });

    it('should apply string search filters (contains, startswith, endswith)', async () => {
        await ODataBuilderSequelize.for(mockModel, { $filter: "contains(name,'John')" }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { name: { [Op.like]: '%John%' } }
            })
        );

        await ODataBuilderSequelize.for(mockModel, { $filter: "startswith(email, 'admin')" }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { email: { [Op.like]: 'admin%' } }
            })
        );

        await ODataBuilderSequelize.for(mockModel, { $filter: "endswith(domain, '.com')" }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { domain: { [Op.like]: '%.com' } }
            })
        );
    });

    it('should apply null checks', async () => {
        await ODataBuilderSequelize.for(mockModel, { $filter: "deletedAt eq 'null'" }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { deletedAt: { [Op.is]: null } }
            })
        );

        await ODataBuilderSequelize.for(mockModel, { $filter: "deletedAt ne 'null'" }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { deletedAt: { [Op.not]: null } }
            })
        );
    });

    it('should combine multiple filters with and', async () => {
        await ODataBuilderSequelize.for(mockModel, { $filter: "name eq 'John' and age gt 18" }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    [Op.and]: [
                        { name: { [Op.eq]: 'John' } },
                        { age: { [Op.gt]: 18 } }
                    ]
                }
            })
        );
    });

    it('should filter out fields not in allowedFilters', async () => {
        await ODataBuilderSequelize.for(mockModel, { $filter: "name eq 'John' and secret eq 'hidden'" })
            .allowedFilters(['name'])
            .execute();

        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { name: { [Op.eq]: 'John' } }
            })
        );
    });

    it('should apply expansions', async () => {
        await ODataBuilderSequelize.for(mockModel, { $expand: 'profile' }).execute();
        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                include: [{ association: 'profile' }]
            })
        );
    });

    it('should apply expansions with allowed list', async () => {
        await ODataBuilderSequelize.for(mockModel, { $expand: 'profile, posts, secretRelation' })
            .allowedExpands(['profile', 'posts'])
            .execute();

        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                include: [
                    { association: 'profile' },
                    { association: 'posts' }
                ]
            })
        );
    });

    it('should support addWhere for custom conditions', async () => {
        const builder = ODataBuilderSequelize.for(mockModel, { $filter: "name eq 'John'" });
        builder.addWhere({ tenantId: 10 });
        await builder.execute();

        expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    [Op.and]: [
                        { tenantId: 10 },
                        { name: { [Op.eq]: 'John' } }
                    ]
                }
            })
        );
    });

    it('should return correct response structure for first page', async () => {
        mockModel.findAndCountAll.mockResolvedValue({
            rows: [{ id: 1, name: 'Test' }],
            count: 15
        });

        const result = await ODataBuilderSequelize.for(mockModel, { $top: '10', $skip: '0' }).execute();

        expect(result).toEqual({
            data: [{ id: 1, name: 'Test' }],
            total: 15,
            per_page: 10,
            current_page: 1,
            last_page: 2,
            from: 1,
            to: 1
        });
    });

    it('should return correct response structure for second page', async () => {
        mockModel.findAndCountAll.mockResolvedValue({
            rows: [{ id: 11, name: 'Test 2' }],
            count: 15
        });

        const result = await ODataBuilderSequelize.for(mockModel, { $top: '10', $skip: '10' }).execute();

        expect(result).toEqual({
            data: [{ id: 11, name: 'Test 2' }],
            total: 15,
            per_page: 10,
            current_page: 2,
            last_page: 2,
            from: 11,
            to: 11
        });
    });

    it('should handle zero results with from: 0 and to: 0', async () => {
        mockModel.findAndCountAll.mockResolvedValue({
            rows: [],
            count: 0
        });

        const result = await ODataBuilderSequelize.for(mockModel, { $top: '10', $skip: '0' }).execute();

        expect(result).toEqual({
            data: [],
            total: 0,
            per_page: 10,
            current_page: 1,
            last_page: 0,
            from: 0,
            to: 0
        });
    });

    it('should expose getOptions and getFindOptions', () => {
        const builder = ODataBuilderSequelize.for(
            mockModel,
            { $top: '5', $orderby: 'createdAt DESC' },
            { attributes: ['id', 'name'] }
        );

        const options = builder.getOptions();
        expect(options).toEqual({
            attributes: ['id', 'name'],
            limit: 5,
            order: [['createdAt', 'DESC']]
        });
    });
});
