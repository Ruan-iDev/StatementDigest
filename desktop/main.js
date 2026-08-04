/**
 * LedgerFlow desktop shell.
 *
 * Starts the bundled FastAPI sidecar, serves the static Next export on
 * 127.0.0.1:3000, opens a BrowserWindow, and tears everything down on quit.
 */

const { app, BrowserWindow, dialog, shell, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn, execSync } = require("child_process");
const { URL } = require("url");

const API_HOST = "127.0.0.1";
const API_PORT = 8000;
const UI_HOST = "127.0.0.1";
const UI_PORT = 3000;
const HEALTH_URL = `http://${API_HOST}:${API_PORT}/api/health`;
const UI_URL = `http://${UI_HOST}:${UI_PORT}/`;

let mainWindow = null;
let apiProcess = null;
let uiServer = null;
let shuttingDown = false;
let quitStarted = false;
/** When false, close is blocked until the user logs out (data lock for registered sessions). */
let closeAllowed = true;

function isDev() {
  return !app.isPackaged;
}

function resourcesRoot() {
  if (isDev()) {
    return path.join(__dirname, "resources");
  }
  return process.resourcesPath;
}

function apiExecutablePath() {
  const base = path.join(resourcesRoot(), "api");
  if (process.platform === "win32") {
    const oneDir = path.join(base, "ledgerflow-api", "ledgerflow-api.exe");
    if (fs.existsSync(oneDir)) return oneDir;
    const flat = path.join(base, "ledgerflow-api.exe");
    if (fs.existsSync(flat)) return flat;
  } else {
    const oneDir = path.join(base, "ledgerflow-api", "ledgerflow-api");
    if (fs.existsSync(oneDir)) return oneDir;
  }
  return null;
}

function uiStaticRoot() {
  return path.join(resourcesRoot(), "ui");
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json",
    ".txt": "text/plain; charset=utf-8",
  };
  return map[ext] || "application/octet-stream";
}

function resolveUiFile(urlPath) {
  const root = uiStaticRoot();
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (!rel || rel === "/") rel = "/index.html";
  // Strip leading slash
  rel = rel.replace(/^\/+/, "");

  const candidates = [
    path.join(root, rel),
    path.join(root, rel, "index.html"),
  ];

  // Next trailingSlash export: /pending/ → pending/index.html
  if (!path.extname(rel)) {
    candidates.push(path.join(root, rel + ".html"));
  }

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (!normalized.startsWith(path.normalize(root))) continue;
    if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
      return normalized;
    }
  }

  // SPA-style fallback for client routes
  const fallback = path.join(root, "index.html");
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

/**
 * Proxy /api/* from the UI origin (127.0.0.1:3000) to the FastAPI sidecar (:8000).
 * Same-origin fetch from the renderer avoids cross-port "Failed to fetch" flakiness.
 */
function proxyApiRequest(req, res) {
  const headers = { ...req.headers, host: `${API_HOST}:${API_PORT}` };

  const proxyReq = http.request(
    {
      hostname: API_HOST,
      port: API_PORT,
      path: req.url || "/api/",
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    }
    res.end(
      JSON.stringify({
        detail: `Local API unavailable (${err.message}). Is ledgerflow-api running?`,
      })
    );
  });

  req.pipe(proxyReq);
}

function startUiServer() {
  const root = uiStaticRoot();
  if (!fs.existsSync(root)) {
    throw new Error(`UI static files not found at ${root}. Run the desktop build script first.`);
  }

  return new Promise((resolve, reject) => {
    uiServer = http.createServer((req, res) => {
      try {
        const urlPath = req.url || "/";
        if (urlPath === "/api" || urlPath.startsWith("/api/")) {
          proxyApiRequest(req, res);
          return;
        }

        const filePath = resolveUiFile(urlPath);
        if (!filePath) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentType(filePath) });
        res.end(data);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(String(err));
      }
    });

    uiServer.once("error", reject);
    uiServer.listen(UI_PORT, UI_HOST, () => resolve());
  });
}

function apiLogPath() {
  try {
    return path.join(app.getPath("userData"), "ledgerflow-api.log");
  } catch {
    return path.join(__dirname, "ledgerflow-api.log");
  }
}

/** Synchronous full process-tree kill (Windows needs /T so sidecar children die). */
function killProcessTreeSync(pid) {
  if (!pid || pid === process.pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${pid} /T /F`, {
        windowsHide: true,
        stdio: "ignore",
        timeout: 10000,
      });
    } else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
    /* already gone */
  }
}

/** Kill any leftover ledgerflow-api.exe (orphans after crash / incomplete close). */
function killApiByImageNameSync() {
  if (process.platform !== "win32") return;
  try {
    execSync("taskkill /IM ledgerflow-api.exe /T /F", {
      windowsHide: true,
      stdio: "ignore",
      timeout: 10000,
    });
  } catch {
    /* none running */
  }
}

function pidsListeningOnPortSync(port) {
  if (process.platform !== "win32") return [];
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      { encoding: "utf8", windowsHide: true, timeout: 8000 }
    );
    return String(out || "")
      .split(/\r?\n/)
      .map((l) => parseInt(l.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

/**
 * Kill whatever is holding the API port (orphaned ledgerflow-api from a previous
 * incomplete exit). Synchronous kill + wait until health fails.
 */
async function freeApiPort() {
  for (const pid of pidsListeningOnPortSync(API_PORT)) {
    killProcessTreeSync(pid);
  }
  // Named sidecar in case it is not bound yet / mid-exit
  killApiByImageNameSync();

  // Wait until nothing answers health (up to ~5s)
  for (let i = 0; i < 20; i++) {
    if (!(await fetchHealth(400))) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

function startApi() {
  const exePath = apiExecutablePath();
  if (!exePath) {
    throw new Error(
      `API executable not found under ${path.join(resourcesRoot(), "api")}. ` +
        "Run scripts/build-desktop.ps1 first."
    );
  }

  const env = {
    ...process.env,
    LEDGERFLOW_HOST: API_HOST,
    LEDGERFLOW_PORT: String(API_PORT),
    LEDGERFLOW_APP_VERSION: app.getVersion(),
    // Desktop always uses the user's Documents data folder unless overridden
  };

  const logFile = apiLogPath();
  let logStream = null;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    logStream = fs.createWriteStream(logFile, { flags: "a" });
    logStream.write(
      `\n---- API start ${new Date().toISOString()} exe=${exePath} ----\n`
    );
  } catch {
    logStream = null;
  }

  apiProcess = spawn(exePath, [], {
    env,
    cwd: path.dirname(exePath),
    windowsHide: true,
    stdio: isDev() ? "inherit" : logStream ? ["ignore", "pipe", "pipe"] : "ignore",
  });

  if (logStream && apiProcess.stdout) {
    apiProcess.stdout.on("data", (chunk) => {
      try {
        logStream.write(chunk);
      } catch {
        /* ignore */
      }
    });
  }
  if (logStream && apiProcess.stderr) {
    apiProcess.stderr.on("data", (chunk) => {
      try {
        logStream.write(chunk);
      } catch {
        /* ignore */
      }
    });
  }

  apiProcess.on("error", (err) => {
    try {
      if (logStream) logStream.write(`spawn error: ${err}\n`);
    } catch {
      /* ignore */
    }
  });

  apiProcess.on("exit", (code, signal) => {
    apiProcess = null;
    try {
      if (logStream) {
        logStream.write(
          `---- API exit code=${code ?? "?"} signal=${signal ?? "none"} ----\n`
        );
        logStream.end();
      }
    } catch {
      /* ignore */
    }
    if (!shuttingDown && mainWindow) {
      dialog.showErrorBox(
        "LedgerFlow API stopped",
        `The local API exited (code ${code ?? "?"} signal ${signal ?? "none"}). ` +
          "Close the app fully (check Task Manager for leftover LedgerFlow processes) and try again.\n\n" +
          `Log: ${logFile}`
      );
    }
  });
}

function fetchHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForApi(attempts = 60, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    if (await fetchHealth()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function splashHtmlPath() {
  return path.join(__dirname, "splash.html");
}

function createWindow() {
  // Frameless chrome: no File/Edit menu bar, no OS title bar / caption buttons.
  // The React UI supplies its own drag region + min/max/close controls.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "LedgerFlow",
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Data lock: registered sessions must log out before the window may close
  mainWindow.on("close", (e) => {
    if (shuttingDown || closeAllowed) return;
    e.preventDefault();
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Log out to close",
      message: "Please log out before closing LedgerFlow.",
      detail:
        "Your session stays locked so local data is not left open by accident. " +
        "Use Log out in the sidebar, then close the app.",
      buttons: ["OK"],
      defaultId: 0,
      noLink: true,
    });
  });

  // Keep renderer window-control icons in sync when user double-clicks title drag region
  const notifyMaxState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:maximized-changed", mainWindow.isMaximized());
    }
  };
  mainWindow.on("maximize", notifyMaxState);
  mainWindow.on("unmaximize", notifyMaxState);

  // Black splash immediately (logo + quotes) while API boots
  return mainWindow.loadFile(splashHtmlPath());
}

async function showMainUi() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadURL(UI_URL);
}

/** Native splash minimum so a quote of the day is readable even if the API boots fast. */
const SPLASH_MIN_MS = 6000;

async function boot() {
  const bootStartedAt = Date.now();
  try {
    // Show splash as early as possible so the wait never feels empty
    await createWindow();

    // 1) Clear orphans and wait until port 8000 is truly free
    await freeApiPort();
    // 2) Start API + UI (UI proxies /api → :8000 for same-origin requests)
    startApi();
    await startUiServer();

    const ok = await waitForApi(90, 500);
    if (!ok || (apiProcess && apiProcess.exitCode != null)) {
      dialog.showErrorBox(
        "LedgerFlow failed to start",
        "The local API did not become healthy on http://127.0.0.1:8000.\n\n" +
          "1) Close every LedgerFlow window\n" +
          "2) In Task Manager, end leftover LedgerFlow / ledgerflow-api processes\n" +
          "3) Open the app again\n\n" +
          `API log: ${apiLogPath()}`
      );
      await quitApp();
      return;
    }

    // Confirm health is stable and our child is still alive
    await new Promise((r) => setTimeout(r, 500));
    if (!(await fetchHealth()) || (apiProcess && apiProcess.exitCode != null)) {
      dialog.showErrorBox(
        "LedgerFlow failed to start",
        "The local API started then stopped. Check that Documents\\LedgerFlow\\Data is writable.\n\n" +
          `API log: ${apiLogPath()}`
      );
      await quitApp();
      return;
    }

    // Hold black splash long enough for logo + at least one quote
    const elapsed = Date.now() - bootStartedAt;
    const hold = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (hold > 0) {
      await new Promise((r) => setTimeout(r, hold));
    }

    await showMainUi();
  } catch (err) {
    dialog.showErrorBox("LedgerFlow failed to start", String(err?.message || err));
    await quitApp();
  }
}

/**
 * Fully stop the API sidecar and any orphans.
 * Must be awaited on quit — fire-and-forget spawn was leaving ledgerflow-api alive.
 */
async function killApi() {
  const pid = apiProcess && apiProcess.pid;
  apiProcess = null;

  if (pid) {
    killProcessTreeSync(pid);
  }
  // Always sweep by image name + port so a missed child cannot block next launch
  killApiByImageNameSync();
  for (const p of pidsListeningOnPortSync(API_PORT)) {
    killProcessTreeSync(p);
  }

  // Confirm health is gone (port free for next cold start)
  for (let i = 0; i < 16; i++) {
    if (!(await fetchHealth(300))) break;
    await new Promise((r) => setTimeout(r, 150));
  }
}

function stopUiServer() {
  return new Promise((resolve) => {
    if (!uiServer) {
      resolve();
      return;
    }
    try {
      uiServer.close(() => {
        uiServer = null;
        resolve();
      });
      // Don't hang quit if sockets linger
      setTimeout(() => {
        uiServer = null;
        resolve();
      }, 1500);
    } catch {
      uiServer = null;
      resolve();
    }
  });
}

/**
 * Tear down API + local UI server. Safe to call multiple times.
 * This is the path that must run on every close — new users must never
 * inherit a zombie ledgerflow-api on port 8000.
 */
async function shutdown() {
  if (shuttingDown) {
    // Another shutdown in flight — wait briefly for it
    await new Promise((r) => setTimeout(r, 400));
    return;
  }
  shuttingDown = true;
  try {
    await killApi();
  } catch {
    /* ignore */
  }
  try {
    await stopUiServer();
  } catch {
    /* ignore */
  }
}

/** Single exit path: cleanup then hard-exit so Windows cannot leave the shell half-open. */
async function quitApp() {
  if (quitStarted) return;
  quitStarted = true;
  closeAllowed = true; // allow window destruction during teardown
  try {
    await shutdown();
  } catch {
    /* ignore */
  }
  // Final safety sweep (sync) in case async path missed anything
  try {
    killApiByImageNameSync();
  } catch {
    /* ignore */
  }
  app.exit(0);
}

function registerIpc() {
  ipcMain.handle("desktop:getVersion", () => app.getVersion());

  ipcMain.handle("desktop:openExternal", async (_evt, url) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      throw new Error("Only http(s) URLs can be opened.");
    }
    await shell.openExternal(url);
  });

  // Custom title-bar window controls (frameless shell)
  ipcMain.handle("desktop:windowMinimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });
  ipcMain.handle("desktop:windowMaximizeToggle", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("desktop:windowClose", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, blocked: false, message: "No window." };
    }
    if (!closeAllowed) {
      // Trigger the same close-handler dialog
      mainWindow.close();
      return {
        ok: false,
        blocked: true,
        message: "Log out before closing to keep your data locked.",
      };
    }
    mainWindow.close();
    return { ok: true };
  });
  ipcMain.handle("desktop:windowIsMaximized", () => {
    return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
  });
  ipcMain.handle("desktop:setCloseAllowed", (_evt, allowed) => {
    closeAllowed = !!allowed;
  });
  ipcMain.handle("desktop:isCloseAllowed", () => closeAllowed);

  /**
   * Download a portable update into the user's Downloads folder.
   * Portable builds are not auto-replaced; the user runs the new .exe.
   */
  ipcMain.handle("updates:download", async (_evt, url, suggestedName) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return { ok: false, message: "Invalid download URL." };
    }

    const downloadsDir = app.getPath("downloads");
    const safeName = String(suggestedName || "LedgerFlow-update.exe").replace(
      /[<>:"/\\|?*\x00-\x1f]/g,
      "_"
    );
    let dest = path.join(downloadsDir, safeName);
    if (fs.existsSync(dest)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = path.extname(safeName) || ".exe";
      const base = path.basename(safeName, ext);
      dest = path.join(downloadsDir, `${base}-${stamp}${ext}`);
    }

    try {
      await downloadFile(url, dest);
      shell.showItemInFolder(dest);
      return {
        ok: true,
        path: dest,
        message: `Saved to ${dest}. Close LedgerFlow and run the new file.`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

function downloadFile(fileUrl, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Too many redirects while downloading update."));
      return;
    }

    let parsed;
    try {
      parsed = new URL(fileUrl);
    } catch {
      reject(new Error("Invalid update download URL."));
      return;
    }

    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(
      fileUrl,
      {
        headers: { "User-Agent": `LedgerFlow/${app.getVersion()}` },
        timeout: 120000,
      },
      (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, fileUrl).toString();
          downloadFile(next, destPath, redirectCount + 1).then(resolve, reject);
          return;
        }
        if (code !== 200) {
          res.resume();
          reject(new Error(`Download failed (HTTP ${code}).`));
          return;
        }

        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve());
        });
        file.on("error", (err) => {
          try {
            fs.unlinkSync(destPath);
          } catch {
            /* ignore */
          }
          reject(err);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Download timed out. Check your connection and try again."));
    });
    req.on("error", (err) => {
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      } catch {
        /* ignore */
      }
      reject(err);
    });
  });
}

registerIpc();

app.whenReady().then(() => {
  // Remove default File / Edit / View / Window / Help application menu
  Menu.setApplicationMenu(null);
  return boot();
});

// Window closed (X / Close button after logout) → full teardown
app.on("window-all-closed", () => {
  void quitApp();
});

// Alt+F4 / OS quit / app.quit() → same teardown (preventDefault until clean)
app.on("before-quit", (e) => {
  if (!quitStarted) {
    e.preventDefault();
    void quitApp();
  }
});

// Last-ditch if the process is about to die without our async path finishing
process.on("exit", () => {
  try {
    if (apiProcess && apiProcess.pid) {
      killProcessTreeSync(apiProcess.pid);
    }
    killApiByImageNameSync();
  } catch {
    /* ignore */
  }
});

// Single instance — one data folder, one API port
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
