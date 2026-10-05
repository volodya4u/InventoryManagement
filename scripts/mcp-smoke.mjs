#!/usr/bin/env node
// Dynamic context smoke test. Starts the angular-cli MCP server the way Claude Code does (.mcp.json runs
// scripts/ng-mcp.mjs) and asks what an agent asks at request time: initialize, tools/list, then list_projects. It
// fails when the server does not answer within the timeout or list_projects does not find the frontend workspace, so a
// broken documentation server fails the build instead of silently leaving agents with stale model memory.
// It prints the answer as Markdown; CI appends it to the job summary as an example of dynamic context.
// Usage: node scripts/mcp-smoke.mjs   (repo root; needs frontend/node_modules, e.g. after mvn verify)
import { spawn } from "node:child_process";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 120_000;

// The frontend project in a list_projects answer: structured content, or the JSON inside its text content.
export function frontendProject(result) {
  let workspaces = result?.structuredContent?.workspaces;
  if (!workspaces) {
    for (const part of result?.content ?? []) {
      const json = /\{[\s\S]*\}/.exec(part?.text ?? "")?.[0];
      try {
        workspaces = JSON.parse(json).workspaces;
        if (workspaces) break;
      } catch {
        /* not JSON */
      }
    }
  }
  for (const workspace of workspaces ?? []) {
    const project = (workspace.projects ?? []).find((p) => p.name === "frontend");
    if (project) {
      return { workspace: workspace.path, name: project.name, type: project.type, builder: project.builder, angular: workspace.frameworkVersion };
    }
  }
  return null;
}

export function report({ server, seconds, tools, project, root }) {
  const workspace = relative(root.replace(/\\/g, "/"), project.workspace.replace(/\\/g, "/")).replace(/\\/g, "/");
  return [
    "## Dynamic context: angular-cli MCP",
    "",
    `\`node scripts/ng-mcp.mjs\`, the server \`.mcp.json\` starts for agents, answered in ${seconds} s (${server}).`,
    "",
    `Tools: ${tools.join(", ")}.`,
    "",
    "What an agent gets from `list_projects` at request time:",
    "",
    "| Workspace | Project | Builder | Angular |",
    "| --- | --- | --- | --- |",
    `| ${workspace} | ${project.name} (${project.type}) | ${project.builder} | ${project.angular} |`,
    "",
    `MCP smoke: ${server} answered list_projects in ${seconds} s (${project.name}, Angular ${project.angular})`,
  ].join("\n");
}

function smoke(root) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(root, "scripts", "ng-mcp.mjs")], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NG_CLI_ANALYTICS: "false" },
    });
    let buffer = "";
    let stderr = "";
    let server = "";
    let tools = [];
    const send = (message) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
    const finish = (error, value) => {
      clearTimeout(timer);
      child.kill();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`no answer within ${TIMEOUT_MS / 1000} s. stderr:\n${stderr.slice(-2000)}`)), TIMEOUT_MS);
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("exit", (code) => finish(new Error(`the server exited (code ${code}) before answering. stderr:\n${stderr.slice(-2000)}`)));
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue; // a log line, not JSON-RPC
        }
        if (message.error) return finish(new Error(`request ${message.id} failed: ${JSON.stringify(message.error)}`));
        if (message.id === 1) {
          server = `${message.result?.serverInfo?.name ?? "server"} ${message.result?.serverInfo?.version ?? ""}`.trim();
          send({ method: "notifications/initialized" });
          send({ id: 2, method: "tools/list" });
        } else if (message.id === 2) {
          tools = (message.result?.tools ?? []).map((t) => t.name);
          send({ id: 3, method: "tools/call", params: { name: "list_projects", arguments: {} } });
        } else if (message.id === 3) {
          const project = frontendProject(message.result);
          if (!project) return finish(new Error(`list_projects found no frontend project: ${JSON.stringify(message.result).slice(0, 500)}`));
          finish(null, { server, tools, project, seconds: Number(((Date.now() - started) / 1000).toFixed(1)) });
        }
      }
    });
    send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-smoke", version: "1" } } });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  smoke(root).then(
    (answer) => {
      console.log(report({ ...answer, root }));
      process.exit(0);
    },
    (error) => {
      console.error(`MCP smoke failed: the angular-cli MCP server (scripts/ng-mcp.mjs) ${error.message}`);
      process.exit(1);
    },
  );
}
