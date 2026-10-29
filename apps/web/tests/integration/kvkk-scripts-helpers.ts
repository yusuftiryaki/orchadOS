import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Runs scripts/kvkk/run.sh and plain SQL against the local stack through
// `docker exec` (the scripts' own default target). Test data only.

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CONTAINER = process.env.KVKK_DB_CONTAINER ?? "supabase_db_orchados";
// Pseudonym HMAC key of the tests (synthetic; production keys never live in the repo).
export const KEY = "kvkk-integration-test-key-0123456789abcdef";

// Rows of a query as arrays of strings (psql unaligned, tab separated).
export function sql(query: string): string[][] {
  const out = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-q",
      "-At",
      "-F",
      "\t",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: query, encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

// The single value of a one-row, one-column query.
export function value(query: string): string {
  const rows = sql(query);
  if (rows.length !== 1) throw new Error(`expected one row, got ${rows.length}: ${query}`);
  return rows[0][0];
}

// Dollar-quoted literal for synthetic test strings.
export const lit = (text: string) => `$kvkk$${text}$kvkk$`;

export interface KvkkRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function kvkk(args: string[], env: Record<string, string> = {}): KvkkRun {
  const result = spawnSync(`${ROOT}scripts/kvkk/run.sh`, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, KVKK_DB_CONTAINER: CONTAINER, KVKK_PSEUDONYM_KEY: KEY, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Row count printed by a command for a table and action.
export function printed(run: KvkkRun, table: string, action: string): number {
  const line = run.stdout
    .split("\n")
    .map((l) => l.split("|").map((c) => c.trim()))
    .find((cells) => cells[0] === table && cells[1] === action);
  if (!line) throw new Error(`no line for ${table} / ${action} in:\n${run.stdout}`);
  return Number(line[2]);
}
