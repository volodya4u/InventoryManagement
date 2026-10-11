// Unit tests for scripts/hooks-pre-commit.mjs. Run: node --test scripts/hooks-pre-commit.test.mjs
// The fake secrets below are assembled from pieces on purpose: the pre-commit hook scans every staged file, this one
// included, and must not refuse a test that only talks about secrets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { envFiles, isScannable, secretHits } from "./hooks-pre-commit.mjs";

const PRIVATE_KEY = ["-----BEGIN RSA ", "PRIVATE KEY-----"].join("");
const SERVICE_TOKEN = ["ghp", "_", "abcdefghijklmnopqrst1234"].join("");
const AWS_KEY_ID = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const DATABASE_URL = ["postgresql://admin:hunter2", "@db.example.com/shop"].join("");
const ADMIN_PASSWORD = ["APP_ADMIN_INITIAL_PASSWORD", "=Sup3rSecret!42"].join("");
const QUOTED_ADMIN_PASSWORD = ["$env:APP_ADMIN_INITIAL_PASSWORD", ' = "Sup3rSecret!42"'].join("");
const EMPTY_ADMIN_PASSWORD = ["APP_ADMIN_INITIAL_PASSWORD", "="].join("");

test("env files are refused, the .example template is not", () => {
  assert.deepEqual(envFiles([".env", ".env.production", "frontend/.env.local", "docs/x.md"]), [
    ".env",
    ".env.production",
    "frontend/.env.local",
  ]);
  assert.deepEqual(envFiles([".env.example", "src/main/resources/application.yml", "docs/environment.md"]), []);
});

test("obvious secrets are found by name, ordinary text is not", () => {
  assert.deepEqual(secretHits(`${PRIVATE_KEY}\nMIIE...`), ["private key"]);
  assert.deepEqual(secretHits(`token = ${SERVICE_TOKEN}`), ["service token"]);
  assert.deepEqual(secretHits(`aws ${AWS_KEY_ID}`), ["AWS access key id"]);
  assert.deepEqual(secretHits(`url: ${DATABASE_URL}`), ["database URL with a password"]);
  assert.deepEqual(secretHits(ADMIN_PASSWORD), ["the admin bootstrap password"]);
  assert.deepEqual(secretHits(`export ${ADMIN_PASSWORD}`), ["the admin bootstrap password"]);

  assert.deepEqual(secretHits("The password is read from APP_ADMIN_INITIAL_PASSWORD."), []);
  assert.deepEqual(secretHits("APP_ADMIN_INITIAL_PASSWORD=${APP_ADMIN_INITIAL_PASSWORD}"), []);
  assert.deepEqual(secretHits("APP_ADMIN_INITIAL_PASSWORD=<your password>"), []);
  assert.deepEqual(secretHits(EMPTY_ADMIN_PASSWORD), []);
  // The shapes this repo already has: a quoted placeholder in the README and a Spring placeholder in the yml.
  assert.deepEqual(secretHits('$env:APP_ADMIN_INITIAL_PASSWORD = "<strong-random-password>"'), []);
  assert.deepEqual(secretHits("admin-password: ${APP_ADMIN_INITIAL_PASSWORD:}"), []);
  assert.deepEqual(secretHits(QUOTED_ADMIN_PASSWORD), ["the admin bootstrap password"]);
  assert.deepEqual(secretHits("postgresql://localhost/shop"), []);
  assert.deepEqual(secretHits("nothing to see here"), []);
});

test("binary files are not scanned", () => {
  assert.equal(isScannable("frontend/src/assets/logo.png"), false);
  assert.equal(isScannable("docs/slides.pdf"), false);
  assert.equal(isScannable("src/main/java/com/flowershop/inventory/Foo.java"), true);
  assert.equal(isScannable("factory-lock.json"), true);
});

test("the agent log is not scanned: it records command text, and every commit stages it", () => {
  assert.equal(isScannable(".agent-log/actions.jsonl"), false);
});
