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
const { spawn } = require("child_process");
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

function startUiServer() {
  const root = uiStaticRoot();
  if (!fs.existsSync(root)) {
    throw new Error(`UI static files not found at ${root}. Run the desktop build script first.`);
  }

  return new Promise((resolve, reject) => {
    uiServer = http.createServer((req, res) => {
      try {
        const filePath = resolveUiFile(req.url || "/");
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

  apiProcess = spawn(exePath, [], {
    env,
    cwd: path.dirname(exePath),
    windowsHide: true,
    stdio: isDev() ? "inherit" : "ignore",
  });

  apiProcess.on("exit", (code, signal) => {
    apiProcess = null;
    if (!shuttingDown && mainWindow) {
      dialog.showErrorBox(
        "LedgerFlow API stopped",
        `The local API exited (code ${code ?? "?"} signal ${signal ?? "none"}). ` +
          "Close the app and try again. If this keeps happening, contact the developer."
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
    backgroundColor: "#181b22",
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

  // Keep renderer window-control icons in sync when user double-clicks title drag region
  const notifyMaxState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:maximized-changed", mainWindow.isMaximized());
    }
  };
  mainWindow.on("maximize", notifyMaxState);
  mainWindow.on("unmaximize", notifyMaxState);

  return mainWindow.loadURL(UI_URL);
}

async function boot() {
  try {
    startApi();
    await startUiServer();

    const ok = await waitForApi();
    if (!ok) {
      dialog.showErrorBox(
        "LedgerFlow failed to start",
        "The local API did not become healthy on http://127.0.0.1:8000.\n\n" +
          "Close any other LedgerFlow / API windows using port 8000 and try again."
      );
      await shutdown();
      app.quit();
      return;
    }

    await createWindow();
  } catch (err) {
    dialog.showErrorBox("LedgerFlow failed to start", String(err?.message || err));
    await shutdown();
    app.quit();
  }
}

function killApi() {
  if (!apiProcess) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(apiProcess.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      apiProcess.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }
  apiProcess = null;
}

function stopUiServer() {
  return new Promise((resolve) => {
    if (!uiServer) {
      resolve();
      return;
    }
    uiServer.close(() => {
      uiServer = null;
      resolve();
    });
  });
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  killApi();
  await stopUiServer();
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
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });
  ipcMain.handle("desktop:windowIsMaximized", () => {
    return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
  });

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

app.on("window-all-closed", async () => {
  await shutdown();
  app.quit();
});

app.on("before-quit", (e) => {
  if (!shuttingDown) {
    e.preventDefault();
    shutdown().finally(() => app.exit(0));
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
