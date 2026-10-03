#!/usr/bin/env node
// Starts the Angular CLI MCP server (`ng mcp --read-only`, see .mcp.json) with the Node version pinned in pom.xml
// when Maven has installed it into target/frontend-tooling: @angular/cli refuses older Node releases, such as the
// one in Claude Code cloud containers. Falls back to the Node running this script. Stdio passes straight through.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pinned = join(root, "target", "frontend-tooling", "node", process.platform === "win32" ? "node.exe" : "node");
const node = existsSync(pinned) ? pinned : process.execPath;
const ng = join(root, "frontend", "node_modules", "@angular", "cli", "bin", "ng.js");

const child = spawn(node, [ng, "mcp", "--read-only"], { cwd: root, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
