// Unit tests for the pure parts of scripts/mcp-smoke.mjs (the server itself runs in CI and in dod.mjs).
// Run: node --test scripts/mcp-smoke.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { frontendProject, report } from "./mcp-smoke.mjs";

// What `list_projects` answered locally on 2026-10-05 (angular-cli-server 22.2.1), with the path shortened.
const answer = {
  content: [{ type: "text", text: "Found 1 workspace(s)." }],
  structuredContent: {
    workspaces: [
      {
        path: "C:\\work\\OnlineStore\\frontend\\angular.json",
        frameworkVersion: "22",
        projects: [{ name: "frontend", type: "application", builder: "@angular/build:application", root: "", sourceRoot: "src" }],
      },
    ],
  },
};

test("finds the frontend project and its Angular version in the list_projects answer", () => {
  assert.deepEqual(frontendProject(answer), {
    workspace: "C:\\work\\OnlineStore\\frontend\\angular.json",
    name: "frontend",
    type: "application",
    builder: "@angular/build:application",
    angular: "22",
  });
});

test("reads the answer from the text content when there is no structured content", () => {
  const textOnly = { content: [{ type: "text", text: `Found 1 workspace(s).\n${JSON.stringify(answer.structuredContent)}` }] };
  assert.equal(frontendProject(textOnly)?.angular, "22");
});

test("no frontend project in the answer is a failure, not an empty report", () => {
  assert.equal(frontendProject({ structuredContent: { workspaces: [] } }), null);
  assert.equal(frontendProject({ content: [{ type: "text", text: "Found 0 workspace(s)." }] }), null);
});

test("the report shows the answer with a repo-relative path and ends in the line dod.mjs reads", () => {
  const text = report({
    server: "angular-cli-server 22.2.1",
    seconds: 4.5,
    tools: ["list_projects", "search_documentation"],
    project: frontendProject(answer),
    root: "C:\\work\\OnlineStore",
  });
  assert.match(text, /\| frontend\/angular\.json \| frontend \(application\) \| @angular\/build:application \| 22 \|/);
  assert.doesNotMatch(text, /C:\\work/);
  assert.match(text, /^MCP smoke: angular-cli-server 22\.2\.1 answered list_projects in 4\.5 s \(frontend, Angular 22\)$/m);
});
