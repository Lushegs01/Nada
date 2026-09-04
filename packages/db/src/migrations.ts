import { CONTEST_SCHEMA_SQL } from "./contest-schema";
import { POSTGRES_SCHEMA_SQL } from "./postgres-schema";

/**
 * One ordered, named unit of schema change.
 *
 * The relay used to apply one large idempotent script on every boot. That is
 * safe but not inspectable: nothing recorded which changes a database had
 * seen, so "has this deployment got the contest tables?" could only be
 * answered by querying the catalog. Migrations are recorded in
 * `schema_migrations` and applied at most once, each inside its own
 * transaction, so a failure leaves the database at a known version instead of
 * halfway through a script.
 *
 * Statements stay idempotent (`create table if not exists`, `add column if not
 * exists`) so that a database which already ran the old boot script — every
 * existing deployment — accepts the baseline migration without complaint.
 */
export interface Migration {
  /** Stable, ordered identifier. Never renamed once shipped. */
  id: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { id: "0001_baseline", sql: POSTGRES_SCHEMA_SQL },
  { id: "0002_contest_domain", sql: CONTEST_SCHEMA_SQL }
];

export const SCHEMA_MIGRATIONS_TABLE_SQL = `
create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null
);
`;
