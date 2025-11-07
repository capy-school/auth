import type { Adapter } from 'better-auth';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';

export function kyselyAdapter(db: Kysely<Database>): Adapter {
  return {
    id: 'kysely',
    async create({ model, data }) {
      const result = await (db as any)
        .insertInto(model)
        .values(data)
        .returningAll()
        .executeTakeFirst();
      return result;
    },
    async findOne({ model, where }) {
      let query = (db as any).selectFrom(model).selectAll();
      
      for (const [key, value] of Object.entries(where)) {
        query = query.where(key, '=', value);
      }
      
      return await query.executeTakeFirst();
    },
    async findMany({ model, where, limit, offset, sortBy }) {
      let query = (db as any).selectFrom(model).selectAll();
      
      if (where) {
        for (const [key, value] of Object.entries(where)) {
          query = query.where(key, '=', value);
        }
      }
      
      if (sortBy) {
        query = query.orderBy(sortBy.field, sortBy.direction);
      }
      
      if (limit) {
        query = query.limit(limit);
      }
      
      if (offset) {
        query = query.offset(offset);
      }
      
      return await query.execute();
    },
    async update({ model, where, update }) {
      const result = await (db as any)
        .updateTable(model)
        .set(update)
        .where((eb: any) => {
          let condition = eb;
          for (const [key, value] of Object.entries(where)) {
            condition = condition.where(key, '=', value);
          }
          return condition;
        })
        .returningAll()
        .executeTakeFirst();
      return result;
    },
    async updateMany({ model, where, update }) {
      const results = await (db as any)
        .updateTable(model)
        .set(update)
        .where((eb: any) => {
          let condition = eb;
          for (const [key, value] of Object.entries(where)) {
            condition = condition.where(key, '=', value);
          }
          return condition;
        })
        .returningAll()
        .execute();
      return results;
    },
    async delete({ model, where }) {
      await (db as any)
        .deleteFrom(model)
        .where((eb: any) => {
          let condition = eb;
          for (const [key, value] of Object.entries(where)) {
            condition = condition.where(key, '=', value);
          }
          return condition;
        })
        .execute();
    },
    async deleteMany({ model, where }) {
      const result = await (db as any)
        .deleteFrom(model)
        .where((eb: any) => {
          let condition = eb;
          for (const [key, value] of Object.entries(where)) {
            condition = condition.where(key, '=', value);
          }
          return condition;
        })
        .execute();
      return result.length || result.numDeletedRows || 0;
    },
    async count({ model, where }) {
      let query = (db as any).selectFrom(model).select((eb: any) => eb.fn.count('id').as('count'));
      
      if (where) {
        for (const [key, value] of Object.entries(where)) {
          query = query.where(key, '=', value);
        }
      }
      
      const result = await query.executeTakeFirst();
      return Number(result?.count || 0);
    },
    async transaction(callback) {
      return await db.transaction().execute(async (trx) => {
        return await callback(kyselyAdapter(trx as any));
      });
    },
  };
}
