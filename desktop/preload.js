/**
 * Desktop bridge for the renderer (contextIsolation on).
 * UI talks to the local API over HTTP; updates use IPC for download + external links.
 * Window controls power the custom frameless title bar.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ledgerflowDesktop", {
  isDesktop: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke("desktop:getVersion"),
  openExternal: (url) => ipcRenderer.invoke("desktop:openExternal", url),
  downloadUpdate: (url, suggestedName) =>
    ipcRenderer.invoke("updates:download", url, suggestedName),
  windowMinimize: () => ipcRenderer.invoke("desktop:windowMinimize"),
  windowMaximizeToggle: () => ipcRenderer.invoke("desktop:windowMaximizeToggle"),
  windowClose: () => ipcRenderer.invoke("desktop:windowClose"),
  windowIsMaximized: () => ipcRenderer.invoke("desktop:windowIsMaximized"),
  setCloseAllowed: (allowed) => ipcRenderer.invoke("desktop:setCloseAllowed", !!allowed),
  isCloseAllowed: () => ipcRenderer.invoke("desktop:isCloseAllowed"),
  onMaximizedChanged: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, value) => callback(!!value);
    ipcRenderer.on("desktop:maximized-changed", handler);
    return () => ipcRenderer.removeListener("desktop:maximized-changed", handler);
  },
});
