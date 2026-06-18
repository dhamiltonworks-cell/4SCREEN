import { contextBridge, ipcRenderer } from "electron";
import type { FourScreenApi } from "../shared/ipc";
import type { ShellState } from "../shared/types";

const api: FourScreenApi = {
  clearPanel: (request) => ipcRenderer.invoke("panel:clear", request),
  closeActivePanelTab: (request) => ipcRenderer.invoke("panel:close-active-tab", request),
  closePanelPopups: (request) => ipcRenderer.invoke("panel:close-popups", request),
  closePanelTab: (request) => ipcRenderer.invoke("panel:close-tab", request),
  focusPanel: (request) => ipcRenderer.invoke("panel:focus", request),
  getShellState: () => ipcRenderer.invoke("shell:get-state"),
  goBack: (request) => ipcRenderer.invoke("panel:go-back", request),
  goForward: (request) => ipcRenderer.invoke("panel:go-forward", request),
  loadPanel: (request) => ipcRenderer.invoke("panel:load", request),
  onShellStateUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: ShellState) => {
      callback(state);
    };
    ipcRenderer.on("shell:state-updated", listener);
    return () => ipcRenderer.removeListener("shell:state-updated", listener);
  },
  openExternal: (request) => ipcRenderer.invoke("panel:open-external", request),
  pinPanelControls: (request) => ipcRenderer.invoke("panel:pin-controls", request),
  refreshPanel: (request) => ipcRenderer.invoke("panel:refresh", request),
  setActivePanel: (request) => ipcRenderer.invoke("shell:set-active-panel", request),
  setChromeHeight: (height) => ipcRenderer.invoke("shell:chrome-height", height),
  setControlsVisible: (request) => ipcRenderer.invoke("panel:controls-visible", request),
  restorePrimaryTab: (request) => ipcRenderer.invoke("panel:restore-primary", request),
  switchPanelTab: (request) => ipcRenderer.invoke("panel:switch-tab", request),
  toggleAudioLock: (request) => ipcRenderer.invoke("panel:toggle-audio-lock", request),
  unfocusPanel: () => ipcRenderer.invoke("panel:unfocus"),
};

contextBridge.exposeInMainWorld("fourScreen", api);
