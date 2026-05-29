"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const { analyzeToFile, outputPath } = require("../analyzer");

const WEB_DIRECTORY = path.join(__dirname, "..", "web");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function serveStaticFile(response, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  });
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function tasksFile(rootDirectory) {
  return path.join(rootDirectory, ".visualise", "pending-actions.json");
}

function readTasks(rootDirectory) {
  const file = tasksFile(rootDirectory);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeTasks(rootDirectory, tasks) {
  const file = tasksFile(rootDirectory);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(tasks, null, 2));
}

function enqueueTask(rootDirectory, payload) {
  const tasks = readTasks(rootDirectory);
  const now = new Date().toISOString();
  const task = {
    id: `t${Date.now()}${Math.floor(Math.random() * 1000)}`,
    type: payload.type || "move-behavior",
    status: "pending",
    from: payload.from || null,
    to: payload.to || null,
    spec: payload.spec || null,
    diff: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  writeTasks(rootDirectory, tasks);
  return task;
}

function updateTask(rootDirectory, { id, status, message, diff, role, commitMessage, impact }) {
  const tasks = readTasks(rootDirectory);
  const task = tasks.find((item) => item.id === id);
  if (!task) return null;
  if (status) task.status = status;
  if (diff !== undefined) task.diff = diff;
  if (commitMessage !== undefined) task.commitMessage = commitMessage;
  if (impact !== undefined) task.impact = impact;
  if (message) {
    task.messages.push({ role: role || "user", text: message, at: new Date().toISOString() });
  }
  task.updatedAt = new Date().toISOString();
  writeTasks(rootDirectory, tasks);
  return task;
}

// Translate a container path back to the user's host path so the browser
// (which runs on the host) can open files in the host's VS Code.
function hostPathFor(absolutePath) {
  const containerWorkspace = process.env.CONTAINER_WORKSPACE || "/workspace";
  const hostWorkspace = process.env.HOST_WORKSPACE_ROOT;
  if (hostWorkspace && absolutePath.startsWith(containerWorkspace)) {
    return hostWorkspace.replace(/\/+$/, "") + absolutePath.slice(containerWorkspace.length);
  }
  return absolutePath;
}

function startServer({ rootDirectory, port }) {
  let currentRoot = rootDirectory; // mutable so the UI can "Open Folder"

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (url.pathname === "/graph.json") {
      return serveStaticFile(response, outputPath(currentRoot));
    }

    if (url.pathname === "/api/meta") {
      return sendJson(response, 200, { root: currentRoot, hostRoot: hostPathFor(currentRoot) });
    }

    if (url.pathname === "/api/reanalyze" && request.method === "POST") {
      try {
        const { graph } = await analyzeToFile(currentRoot);
        return sendJson(response, 200, {
          ok: true,
          root: currentRoot,
          hostRoot: hostPathFor(currentRoot),
          stats: graph.stats,
        });
      } catch (error) {
        return sendJson(response, 500, { ok: false, error: String(error) });
      }
    }

    // Point the visualiser at a different repository and analyze it.
    if (url.pathname === "/api/open" && request.method === "POST") {
      const body = await readBody(request);
      let requestedRoot;
      try {
        requestedRoot = JSON.parse(body).path;
      } catch {
        return sendJson(response, 400, { ok: false, error: "invalid json" });
      }
      const resolved = path.resolve(requestedRoot.replace(/^~(?=$|\/)/, process.env.HOME || ""));
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return sendJson(response, 400, { ok: false, error: "not a directory" });
      }
      try {
        currentRoot = resolved;
        const { graph } = await analyzeToFile(currentRoot);
        return sendJson(response, 200, {
          ok: true,
          root: currentRoot,
          hostRoot: hostPathFor(currentRoot),
          stats: graph.stats,
        });
      } catch (error) {
        return sendJson(response, 500, { ok: false, error: String(error) });
      }
    }

    // Phase 2: task queue. The UI enqueues drag-drop intents; Claude reads
    // .visualise/pending-actions.json, proposes a diff, and (on approval) applies it.
    if (url.pathname === "/api/tasks" && request.method === "GET") {
      return sendJson(response, 200, { ok: true, tasks: readTasks(currentRoot) });
    }

    if (url.pathname === "/api/tasks" && request.method === "POST") {
      const body = await readBody(request);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(response, 400, { ok: false, error: "invalid json" });
      }
      return sendJson(response, 200, { ok: true, task: enqueueTask(currentRoot, payload) });
    }

    if (url.pathname === "/api/tasks/update" && request.method === "POST") {
      const body = await readBody(request);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return sendJson(response, 400, { ok: false, error: "invalid json" });
      }
      const task = updateTask(currentRoot, payload);
      if (!task) return sendJson(response, 404, { ok: false, error: "task not found" });
      return sendJson(response, 200, { ok: true, task });
    }

    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = path
      .normalize(requestedPath)
      .replace(/^(\.\.[/\\])+/, "");
    return serveStaticFile(response, path.join(WEB_DIRECTORY, safePath));
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { startServer };
