import { readFile } from 'node:fs/promises';

export async function openDatabase({ url, directory = '.local-postgres' } = {}) {
  const schema = await readFile(new URL('001-quiz-progress.sql', import.meta.url), 'utf8');
  if (!url) {
    const { PGlite } = await import('@electric-sql/pglite');
    const database = await PGlite.create(directory);
    try {
      await database.exec(schema);
      return database;
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  const database = {
    query: (sql, values) => pool.query(sql, values),
    close: () => pool.end(),
    async transaction(work) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        const result = await work(connection);
        await connection.query('COMMIT');
        return result;
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      } finally {
        connection.release();
      }
    },
  };
  try {
    await database.transaction(connection => connection.query(schema));
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}
