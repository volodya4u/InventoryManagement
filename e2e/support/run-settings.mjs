import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The variable the application reads its first administrator's password from (LocalAdminInitializer). Named once, here,
// so that no line of the repository assigns a value to it: the pre-commit hook refuses a literal value, because a literal
// would be a committed password. The value here is the run's, made below.
const bootstrapPasswordVariable = 'APP_ADMIN_INITIAL_PASSWORD';

// What one run of the browser tests needs to know: where the application listens, which throwaway database it uses,
// and the administrator password made for this run. The browser tests start the real executable JAR on their own port
// with its own SQLite file, so they never touch the developer's data or the dev servers.
//
// Playwright evaluates its configuration again in every worker. The values are made once, in the process that starts the
// run, and written back into `env` (by default process.env); the workers inherit it and read the same values.
// `mkdtemp` is a parameter for the unit test (scripts/e2e-setup.test.mjs).
export function runSettings(env = process.env, { mkdtemp = () => mkdtempSync(join(tmpdir(), 'inventory-e2e-')) } = {}) {
  const port = (env.E2E_PORT ??= '18081');
  const databaseDir = (env.E2E_DATABASE_DIR ??= mkdtemp());
  // Made here, handed to the application and to the tests through the environment. It is in no file of the repository
  // and on no command line. A Playwright trace of a failed sign-in does hold it, and it opens only this run's database.
  const adminPassword = (env.E2E_ADMIN_PASSWORD ??= randomUUID());
  const jar = (env.E2E_JAR ??= 'target/inventory-0.1.0-SNAPSHOT.jar');
  const databaseUrl = `jdbc:sqlite:${join(databaseDir, 'e2e.db').replaceAll('\\', '/')}`;
  return {
    port,
    // 127.0.0.1, not localhost: the server listens on the IPv4 loopback address only (NFR-23), and localhost can
    // resolve to ::1 first.
    baseURL: `http://127.0.0.1:${port}`,
    databaseUrl,
    adminPassword,
    jar,
    // The paths are quoted: a temporary directory or a JAR path can contain a space.
    command: `java -jar "${jar}" --server.port=${port} --spring.datasource.url="${databaseUrl}"`,
  };
}

// The environment of the application's process: the caller's, plus the run's administrator password.
export function serverEnvironment(settings, base = process.env) {
  return { ...base, [bootstrapPasswordVariable]: settings.adminPassword };
}
