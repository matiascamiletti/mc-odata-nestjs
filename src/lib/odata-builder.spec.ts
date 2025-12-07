import { ODataBuilder } from './odata-builder';
import { Repository, SelectQueryBuilder } from 'typeorm';

describe('ODataBuilder', () => {
    let repo: Repository<any>;
    let queryBuilder: SelectQueryBuilder<any>;

    beforeEach(() => {
        queryBuilder = {
            take: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        } as any;

        repo = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        } as any;
    });

    it('should create an instance', () => {
        const builder = ODataBuilder.for(repo, {});
        expect(builder).toBeDefined();
    });

    it('should apply pagination', async () => {
        await ODataBuilder.for(repo, { $top: '10', $skip: '5' }).execute();
        expect(queryBuilder.take).toHaveBeenCalledWith(10);
        expect(queryBuilder.skip).toHaveBeenCalledWith(5);
    });

    it('should apply sorting', async () => {
        await ODataBuilder.for(repo, { $orderby: 'name ASC' }).execute();
        expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('entity.name', 'ASC');
    });

    it('should apply sorting with allowed sorts', async () => {
        await ODataBuilder.for(repo, { $orderby: 'name ASC, age DESC' })
            .allowedSorts(['name'])
            .execute();
        expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('entity.name', 'ASC');
        expect(queryBuilder.addOrderBy).toHaveBeenCalledTimes(1);
    });

    it('should apply strict filtering (eq)', async () => {
        await ODataBuilder.for(repo, { $filter: "name eq 'John'" }).execute();
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            "entity.name = :val0",
            { val0: "John" }
        );
    });

    it('should apply contains filter', async () => {
        await ODataBuilder.for(repo, { $filter: "contains(name,'John')" }).execute();
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            "entity.name LIKE :val0",
            { val0: "%John%" }
        );
    });

    it('should apply expansions', async () => {
        await ODataBuilder.for(repo, { $expand: 'profile' }).execute();
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('entity.profile', 'profile');
    });

    it('should apply expansions with allowed list', async () => {
        await ODataBuilder.for(repo, { $expand: 'profile, posts' })
            .allowedExpands(['profile'])
            .execute();
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('entity.profile', 'profile');
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledTimes(1);
    });
    it('should return correct response structure', async () => {
        (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([
            [{ id: 1, name: 'Test' }],
            15 // total
        ]);

        const result = await ODataBuilder.for(repo, { $top: '10', $skip: '0' }).execute();

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
        (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([
            [{ id: 11, name: 'Test 2' }],
            15 // total
        ]);

        const result = await ODataBuilder.for(repo, { $top: '10', $skip: '10' }).execute();

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
});
