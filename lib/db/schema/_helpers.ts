import { sql } from 'drizzle-orm'

/**
 * Returns raw SQL that creates (or replaces) the shared `set_updated_at` PL/pgSQL function
 * and attaches a BEFORE UPDATE trigger to the given table.
 *
 * Usage: paste the result of this function at the end of any migration that introduces a
 * table with an `updated_at` column.
 *
 * The function itself is idempotent (CREATE OR REPLACE) so it is safe to call for multiple
 * tables in the same migration or across migrations.
 */
export const setUpdatedAtTriggerSql = (tableName: string) => sql.raw(`
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_${tableName}_updated_at
  BEFORE UPDATE ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`)
