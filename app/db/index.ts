import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// The connection is opened lazily, on first use. Opening it at module scope
// made this module side-effectful, which meant Rollup could not drop it from
// the client bundle when a route imported a service purely for its loader —
// dragging better-sqlite3 into the browser. Keep this file side-effect free.
let connection: Database.Database | undefined;

/** SQLite file path. `DATABASE_PATH` lets end-to-end tests use an isolated file. */
export function getDatabasePath() {
  return process.env.DATABASE_PATH || "data.db";
}

export function getSqlite() {
  if (!connection) {
    connection = new Database(getDatabasePath());
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
  }
  return connection;
}

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDb() {
  if (!instance) {
    instance = drizzle(getSqlite(), { schema });
  }
  return instance;
}

export const db = /* @__PURE__ */ new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    const target = getDb();
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
