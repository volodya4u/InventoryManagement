import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { browsers, projectServers, runSettings, serverEnvironment } from "../e2e/support/run-settings.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const fixed = { mkdtemp: () => "/tmp/inventory-e2e-abc123" };

test("the browser tests reach the application on the IPv4 loopback address", () => {
  const { port, baseURL, command } = runSettings({}, fixed);

  assert.equal(baseURL, `http://127.0.0.1:${port}`);
  assert.match(command, new RegExp(`--server\\.port=${port}( |$)`));
});

test("the application runs on a throwaway database outside the repository", () => {
  const { databaseUrl, command } = runSettings({}, fixed);

  assert.equal(databaseUrl, "jdbc:sqlite:/tmp/inventory-e2e-abc123/e2e.db");
  assert.ok(command.includes(`--spring.datasource.url="${databaseUrl}"`));
});

test("the administrator password is made for each run and kept off the command line", () => {
  const first = {};
  const second = {};
  const a = runSettings(first, fixed);
  const b = runSettings(second, fixed);

  assert.match(a.adminPassword, /^[0-9a-f-]{36}$/);
  assert.notEqual(a.adminPassword, b.adminPassword);
  assert.equal(first.E2E_ADMIN_PASSWORD, a.adminPassword);
  assert.ok(!a.command.includes(a.adminPassword));
  assert.equal(serverEnvironment(a, { PATH: "/bin" })["APP_ADMIN_INITIAL_PASSWORD"], a.adminPassword);
  assert.equal(serverEnvironment(a, { PATH: "/bin" }).PATH, "/bin");
});

test("every process of a run gets the same settings", () => {
  const env = {};
  const first = runSettings(env, fixed);
  const again = runSettings(env, { mkdtemp: () => "/tmp/another-directory" });

  assert.equal(first.databaseUrl, "jdbc:sqlite:/tmp/inventory-e2e-abc123/e2e.db");
  assert.deepEqual(again, first);
});

test("the settings can be overridden from the environment", () => {
  const { port, jar, adminPassword } = runSettings({ E2E_PORT: "19999", E2E_JAR: "build/app.jar", E2E_ADMIN_PASSWORD: "given" }, fixed);

  assert.equal(port, "19999");
  assert.equal(jar, "build/app.jar");
  assert.equal(adminPassword, "given");
});

test("the Playwright configuration runs the specs in Chromium, Firefox and WebKit", () => {
  const config = read("playwright.config.ts");

  assert.deepEqual(browsers, ["chromium", "firefox", "webkit"]);
  for (const [name, device] of [["chromium", "Desktop Chrome"], ["firefox", "Desktop Firefox"], ["webkit", "Desktop Safari"]]) {
    assert.match(config, new RegExp(`${name}: devices\\['${device}'\\]`));
  }
  assert.match(config, /runSettings\(/);
  assert.match(config, /projectServers\(/);
});

test("the browser tests job in CI starts after the build and runs the JAR that build made", () => {
  const ci = read(".github/workflows/ci.yml");

  assert.match(ci, /^ {2}e2e:\r?\n {4}needs: build-and-test$/m);
  assert.match(ci, /actions\/upload-artifact@\S+\r?\n {8}with:\r?\n {10}name: application-jar/);
  assert.match(ci, /actions\/download-artifact@\S+\r?\n {8}with:\r?\n {10}name: application-jar/);
  assert.match(ci, /run: pnpm run test:e2e/);
});

test("Dependabot auto-merge waits for the browser tests", () => {
  const ci = read(".github/workflows/ci.yml");

  assert.match(ci, /dependabot-auto-merge:\r?\n {4}needs: \[build-and-test, e2e\]/);
});

test("each browser project gets its own server port and database", () => {
  const env = {};
  const settings = runSettings(env, fixed);
  const servers = projectServers(settings, env);

  assert.deepEqual(servers.map((s) => s.name), ["chromium", "firefox", "webkit"]);
  assert.deepEqual(servers.map((s) => Number(s.port)), [18081, 18082, 18083]);
  assert.equal(new Set(servers.map((s) => s.databaseUrl)).size, 3);
  assert.equal(servers[0].databaseUrl, settings.databaseUrl);
  assert.equal(servers[1].databaseUrl, "jdbc:sqlite:/tmp/inventory-e2e-abc123/firefox.db");
  assert.equal(servers[2].baseURL, "http://127.0.0.1:18083");
  assert.ok(servers[2].command.includes('--server.port=18083 --spring.datasource.url="jdbc:sqlite:/tmp/inventory-e2e-abc123/webkit.db"'));
});

test("E2E_BROWSERS limits the projects and refuses a name it does not know", () => {
  const env = { E2E_BROWSERS: "webkit, chromium" };
  const settings = runSettings(env, fixed);

  assert.deepEqual(projectServers(settings, env).map((s) => s.name), ["chromium", "webkit"]);
  assert.deepEqual(projectServers(settings, env).map((s) => Number(s.port)), [18081, 18083]);
  assert.throws(() => projectServers(settings, { E2E_BROWSERS: "opera" }), /opera/);
});
