import { existsSync } from "node:fs";
import { app, BrowserWindow, ipcMain, screen, WebContentsView } from "electron";
import path from "node:path";
import {
  PANEL_COUNT,
  type ControlsVisibilityRequest,
  type HomepageAddFromVisitRequest,
  type HomepageAddRequest,
  type HomepageRemoveRequest,
  type HomepageUpdateRequest,
  type PanelIndexRequest,
  type PanelLoadRequest,
  type PanelMoveRequest,
  type PanelTabRequest,
  type PinControlsRequest,
  type InteractionSource,
  type SetActivePanelRequest,
  type ShellState,
  type SiteMenuOpenRequest,
} from "../shared/types";
import { preparePanelUrl } from "../shared/url";
import { createEmptyPanelHistory } from "../shared/panel-history";
import type { HomepageTileView } from "../shared/homepage";
import { getPanelSwapTarget } from "../shared/panel-move";
import {
  easeInOutCubic,
  getAllCellBounds,
  getCellBounds,
  interpolateBounds,
  LAYOUT_ANIMATION_MS,
  SHELL_PADDING,
  type Bounds,
} from "../shared/layout";
import {
  addStoredHomepageTile,
  addStoredHomepageTileFromVisit,
  clearStoredPanelHistory,
  persistPanelSnapshot,
  readStoredPanelHistory,
  readStoredUrls,
  readStoredVisitHistory,
  readVisibleHomepageTiles,
  recordStoredPanelHistory,
  recordStoredVisitHistory,
  removeStoredHomepageTile,
  updateStoredHomepageTile,
} from "./panel-store";
import type { VisitHistoryEntry } from "../shared/visit-history";
import {
  createTabId,
  getActiveTab,
  getPopupTabs,
  getPrimaryTab,
  getTabTitle,
  panelHasContent,
  panelHasPopups,
  tabHasContent,
  type PanelRuntime,
  type PanelTab,
} from "./panel-tabs";

const PANEL_CHROME_HEIGHT_DEFAULT = 168;
const CONTROLS_HIDE_DELAY_MS = 3500;
const REVEAL_ZONE_HEIGHT = 12;
const MOUSE_POLL_MS = 50;
const CURSOR_HIDE_DELAY_MS = 5000;
const CURSOR_HIDE_STYLE_ID = "fourscreen-cursor-hide";
const CURSOR_HIDE_CSS = "html, html *, html *:hover { cursor: none !important; }";
const isDev = !app.isPackaged;
const DEBUG_PANEL_FS = isDev;
let lastDebugHoverIndex: number | null = null;
let lastDebugCursorHidden: boolean | null = null;

let panelChromeHeight = PANEL_CHROME_HEIGHT_DEFAULT;
let activePanelIndex: number | null = null;
let focusedPanelIndex: number | null = null;
let audioPanelIndex: number | null = null;
let audioLockedPanelIndex: number | null = null;
let mousePollTimer: ReturnType<typeof setInterval> | null = null;
let previousHoveredIndex: number | null = null;
let layoutAnimationTimer: ReturnType<typeof setInterval> | null = null;
let layoutAnimationGeneration = 0;
let cursorHidden = false;
let panelVideoFullscreen: { panelIndex: number; tabId: string } | null = null;
let userNativeFullscreen = false;
let htmlFullscreenTransitionActive = false;
let lastMouseX = -1;
let lastMouseY = -1;
let lastMouseMoveAt = Date.now();
const controlsPinned: boolean[] = Array.from({ length: PANEL_COUNT }, () => false);
const lastControlsInteractionAt: number[] = Array.from({ length: PANEL_COUNT }, () => 0);
let currentCellBounds: Bounds[] = getAllCellBounds(null, { height: 900, width: 1400 });

function logShell(message: string, extra?: unknown) {
  if (extra !== undefined) {
    console.log(`[FourScreen shell] ${message}`, extra);
    return;
  }
  console.log(`[FourScreen shell] ${message}`);
}

function logPanel(index: number, message: string, extra?: unknown) {
  if (extra !== undefined) {
    console.log(`[FourScreen panel ${index + 1}] ${message}`, extra);
    return;
  }
  console.log(`[FourScreen panel ${index + 1}] ${message}`);
}

function logPanelFsDebug(index: number, message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_PANEL_FS) {
    return;
  }
  logPanel(index, `[fs-debug] ${message}`, extra);
}

function logShellFsDebug(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_PANEL_FS) {
    return;
  }
  logShell(`[fs-debug] ${message}`, extra);
}

function getRendererHtmlPath() {
  return path.join(__dirname, "../renderer/index.html");
}

function getRendererAppPath() {
  return path.join(__dirname, "../renderer/app.js");
}

function getPreloadPath() {
  return path.join(__dirname, "preload.js");
}

function verifyShellAssets() {
  const htmlPath = getRendererHtmlPath();
  const appPath = getRendererAppPath();
  const preloadPath = getPreloadPath();

  logShell("Resolved shell HTML path", htmlPath);
  logShell("shell HTML exists", existsSync(htmlPath));
  logShell("shell app.js exists", existsSync(appPath));

  return {
    appPath,
    htmlPath,
    ok: existsSync(htmlPath) && existsSync(appPath) && existsSync(preloadPath),
  };
}

function attachShellDiagnostics(webContents: Electron.WebContents) {
  webContents.on("did-finish-load", () => {
    logShell("did-finish-load", webContents.getURL());
  });

  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logShell("did-fail-load", { errorCode, errorDescription, validatedURL });
  });

  webContents.on("render-process-gone", (_event, details) => {
    logShell("render-process-gone", details);
  });
}

async function loadShellView(view: WebContentsView) {
  const assets = verifyShellAssets();
  if (!assets.ok) {
    throw new Error(`Shell assets missing at ${assets.htmlPath}`);
  }

  attachShellDiagnostics(view.webContents);
  await view.webContents.loadFile(assets.htmlPath);
  logShell("loadFile succeeded", assets.htmlPath);

  if (isDev) {
    logShell("DevTools available; not auto-opening shell DevTools");
  }
}

type PanelRuntimeRef = PanelRuntime;

let mainWindow: BrowserWindow | null = null;
let shellView: WebContentsView | null = null;
const panels: PanelRuntimeRef[] = [];
let panelHistory: string[][] = createEmptyPanelHistory();
let homepageTiles: HomepageTileView[] = [];
let visitHistory: VisitHistoryEntry[] = [];
let siteMenuOpenPanelIndex: number | null = null;

function recordPanelHistory(panelIndex: number, url: string) {
  panelHistory = recordStoredPanelHistory(panelIndex, url);
}

function recordVisit(url: string, title: string) {
  visitHistory = recordStoredVisitHistory(url, title);
}

function maybeRecordActiveTabHistory(panel: PanelRuntimeRef, tab: PanelTab, url: string) {
  if (tab.id !== panel.activeTabId) {
    return;
  }
  recordPanelHistory(panel.panelIndex, url);
  recordVisit(url, tab.title || getTabTitle(tab));
}

function clearPanelHistory(panelIndex: number) {
  panelHistory = clearStoredPanelHistory(panelIndex);
  broadcastShellState();
  return toShellState();
}

function getNavigationState(webContents: Electron.WebContents | undefined) {
  if (!webContents || webContents.isDestroyed()) {
    return { canGoBack: false, canGoForward: false };
  }

  const history = webContents.navigationHistory;
  return {
    canGoBack: history.canGoBack(),
    canGoForward: history.canGoForward(),
  };
}

function toPanelState(panel: PanelRuntimeRef) {
  const activeTab = getActiveTab(panel);
  const webContents = activeTab?.view.webContents;
  const navigation = getNavigationState(webContents);

  return {
    activeTabId: panel.activeTabId,
    activeTabIsPopup: Boolean(activeTab && !activeTab.isPrimary),
    canGoBack: navigation.canGoBack,
    canGoForward: navigation.canGoForward,
    controlsVisible: panel.controlsVisible,
    hasPopups: panelHasPopups(panel),
    input: activeTab?.input ?? "",
    isLoading: webContents?.isLoading() ?? false,
    loadError: activeTab?.loadError ?? "",
    tabs: panel.tabs.map((tab) => ({
      canClose: panel.tabs.length > 1 && !tab.isPrimary,
      id: tab.id,
      isPrimary: tab.isPrimary,
      title: getTabTitle(tab),
      url: tab.url,
    })),
    recentUrls: panelHistory[panel.panelIndex] ?? [],
    title: activeTab?.title ?? "",
    url: activeTab?.url ?? "",
  };
}

function toShellState(): ShellState {
  return {
    activePanelIndex,
    audioLockedPanelIndex,
    audioPanelIndex,
    focusedPanelIndex,
    homepageTiles: homepageTiles.map((tile) => ({
      custom: tile.custom,
      domain: tile.domain,
      fallbackBadge: tile.fallbackBadge,
      fallbackClass: tile.fallbackClass,
      id: tile.id,
      name: tile.name,
      url: tile.url,
    })),
    visitHistory: visitHistory.map((entry) => ({
      id: entry.id,
      title: entry.title,
      url: entry.url,
      visitedAt: entry.visitedAt,
    })),
    panels: panels.map((panel) => toPanelState(panel)),
    videoFullscreenPanelIndex: panelVideoFullscreen?.panelIndex ?? null,
  };
}

function broadcastShellState() {
  if (!shellView || shellView.webContents.isDestroyed()) {
    return;
  }
  shellView.webContents.send("shell:state-updated", toShellState());
}

function persistPanelState() {
  persistPanelSnapshot(
    panels.map((panel) => getActiveTab(panel)?.url ?? ""),
    panelHistory,
  );
}

function broadcastPanels() {
  broadcastShellState();
  persistPanelState();
}

function getContentSize() {
  if (!mainWindow) {
    return { height: 800, width: 1280 };
  }

  const [width, height] = mainWindow.getContentSize();
  return { height, width };
}

function getShellBounds() {
  const { height, width } = getContentSize();
  return { height, width, x: 0, y: 0 };
}

function getTargetCellBounds() {
  return getAllCellBounds(focusedPanelIndex, getContentSize());
}

function getBrowserBoundsForCell(index: number, cell: Bounds) {
  const panel = panels[index];
  if (!panel || !panelHasContent(panel)) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }

  const chromeOffset = panel.controlsVisible ? panelChromeHeight : 0;
  const bodyHeight = Math.max(120, cell.height - chromeOffset);
  return {
    height: bodyHeight,
    width: cell.width,
    x: cell.x,
    y: cell.y + chromeOffset,
  };
}

function getTabBoundsForPanel(index: number, cell: Bounds) {
  if (panelVideoFullscreen?.panelIndex === index) {
    const panel = panels[index];
    if (panel?.controlsVisible) {
      return getBrowserBoundsForCell(index, cell);
    }
    return { ...cell };
  }
  return getBrowserBoundsForCell(index, cell);
}

function preventNativeFullscreen() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  }

  if (mainWindow.isSimpleFullScreen()) {
    mainWindow.setSimpleFullScreen(false);
  }
}

function preventWindowResizeFromHtmlFullscreen(source: string) {
  logShellFsDebug("prevent-window-resize-from-html-fullscreen", {
    isFullScreen: mainWindow?.isFullScreen() ?? null,
    isMaximized: mainWindow?.isMaximized?.() ?? null,
    isSimpleFullScreen: mainWindow?.isSimpleFullScreen?.() ?? null,
    panelVideoFullscreen,
    source,
    userNativeFullscreen,
  });
  preventNativeFullscreen();
}

function getPanelVideoFullscreenDebugState(panelIndex: number) {
  const panel = panels[panelIndex];
  const cell = currentCellBounds[panelIndex] ?? getCellBounds(panelIndex, focusedPanelIndex, getContentSize());
  const tabBounds = getTabBoundsForPanel(panelIndex, cell);
  return {
    activePanelIndex,
    cell,
    controlsPinned: controlsPinned[panelIndex],
    controlsVisible: panel?.controlsVisible ?? null,
    cursorHidden,
    focusedPanelIndex,
    hoveredIndex: previousHoveredIndex,
    panelVideoFullscreen,
    tabBounds,
    userNativeFullscreen,
  };
}

function enterPanelVideoFullscreen(panelIndex: number, tab: PanelTab) {
  stopLayoutAnimation();
  const panel = panels[panelIndex];
  logPanelFsDebug(panelIndex, "enter-request", {
    controlsPinned: controlsPinned[panelIndex],
    controlsVisible: panel?.controlsVisible ?? null,
    source: "panel-fullscreen-request",
    tabId: tab.id,
    userNativeFullscreen,
  });
  panelVideoFullscreen = { panelIndex, tabId: tab.id };
  layoutPanels(false);
  logPanel(panelIndex, "panel-video-fullscreen-enter", { tabId: tab.id });
  logPanelFsDebug(panelIndex, "enter-applied", getPanelVideoFullscreenDebugState(panelIndex));
  broadcastShellState();
}

function exitPanelVideoFullscreen(panelIndex?: number) {
  if (!panelVideoFullscreen) {
    return;
  }

  if (panelIndex !== undefined && panelVideoFullscreen.panelIndex !== panelIndex) {
    return;
  }

  const { panelIndex: exitingPanelIndex, tabId } = panelVideoFullscreen;
  logPanelFsDebug(exitingPanelIndex, "exit-request", {
    controlsVisible: panels[exitingPanelIndex]?.controlsVisible ?? null,
    tabId,
  });
  logPanel(exitingPanelIndex, "panel-video-fullscreen-exit", { tabId });
  panelVideoFullscreen = null;
  layoutPanels(false);
  logPanelFsDebug(exitingPanelIndex, "exit-applied", getPanelVideoFullscreenDebugState(exitingPanelIndex));
  broadcastShellState();
}

function clearPanelVideoFullscreenForTab(panelIndex: number, tabId: string) {
  if (panelVideoFullscreen?.panelIndex === panelIndex && panelVideoFullscreen.tabId === tabId) {
    panelVideoFullscreen = null;
  }
}

const HIDDEN_TAB_BOUNDS: Bounds = { height: 0, width: 0, x: 0, y: 0 };

function boundsEqual(left: Bounds, right: Bounds) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function isTabAttached(tab: PanelTab) {
  if (!mainWindow || tab.view.webContents.isDestroyed()) {
    return false;
  }

  return mainWindow.contentView.children.includes(tab.view);
}

const attachedTabBounds = new WeakMap<PanelTab, Bounds>();

function getFocusedPanelTab(): PanelTab | null {
  for (const panel of panels) {
    for (const tab of panel.tabs) {
      if (!tab.view.webContents.isDestroyed() && tab.view.webContents.isFocused()) {
        return tab;
      }
    }
  }
  return null;
}

function restoreFocusedPanelTab(tab: PanelTab | null) {
  if (!tab || tab.view.webContents.isDestroyed()) {
    return;
  }

  tab.view.webContents.focus();
}

function bringTabToFront(tab: PanelTab) {
  if (!mainWindow || tab.view.webContents.isDestroyed()) {
    return;
  }

  mainWindow.contentView.removeChildView(tab.view);
  mainWindow.contentView.addChildView(tab.view);
}

function detachTabView(tab: PanelTab) {
  if (tab.view.webContents.isDestroyed()) {
    return;
  }

  tab.view.setVisible(false);
  tab.view.setBounds(HIDDEN_TAB_BOUNDS);

  if (mainWindow) {
    mainWindow.contentView.removeChildView(tab.view);
  }
}

function attachTabView(tab: PanelTab, bounds: Bounds) {
  if (!mainWindow || tab.view.webContents.isDestroyed()) {
    return;
  }

  tab.view.setBounds(bounds);
  tab.view.setVisible(true);
  mainWindow.contentView.addChildView(tab.view);
  bringTabToFront(tab);
}

function hideTabView(tab: PanelTab) {
  detachTabView(tab);
}

function logTabViewVisibility(panelIndex: number, panel: PanelRuntimeRef) {
  const activeTab = getActiveTab(panel);
  logPanel(panelIndex, "view-visibility", {
    activeViewId: activeTab?.id ?? null,
    hiddenViewIds: panel.tabs.filter((tab) => tab.id !== panel.activeTabId).map((tab) => tab.id),
  });
}

function syncPanelTabViews(panelIndex: number, bounds: Bounds) {
  const panel = panels[panelIndex];
  if (!panel) {
    return;
  }

  const activeTab = getActiveTab(panel);
  const showActive = Boolean(
    activeTab && tabHasContent(activeTab) && siteMenuOpenPanelIndex !== panelIndex,
  );

  for (const tab of panel.tabs) {
    const shouldShow = showActive && tab.id === panel.activeTabId;
    if (!shouldShow) {
      if (isTabAttached(tab)) {
        detachTabView(tab);
      }
      attachedTabBounds.delete(tab);
      continue;
    }

    const previousBounds = attachedTabBounds.get(tab);
    if (isTabAttached(tab)) {
      if (!previousBounds || !boundsEqual(previousBounds, bounds)) {
        tab.view.setBounds(bounds);
        attachedTabBounds.set(tab, { ...bounds });
      }
      tab.view.setVisible(true);
      continue;
    }

    attachTabView(tab, bounds);
    attachedTabBounds.set(tab, { ...bounds });
  }

  logTabViewVisibility(panelIndex, panel);
}

function focusActiveTab(panelIndex: number) {
  const panel = panels[panelIndex];
  const activeTab = panel ? getActiveTab(panel) : null;
  if (activeTab && !activeTab.view.webContents.isDestroyed()) {
    activeTab.view.webContents.focus();
  }
}

function destroyTabView(tab: PanelTab) {
  if (tab.view.webContents.isDestroyed()) {
    return;
  }

  tab.disposeListeners?.();
  tab.disposeListeners = undefined;
  detachTabView(tab);
  tab.view.webContents.close();
}

function applyBrowserBounds(index: number, cell: Bounds) {
  const panel = panels[index];
  if (!panel) {
    return;
  }

  const bounds = getTabBoundsForPanel(index, cell);
  if (DEBUG_PANEL_FS && (index === 0 || panelVideoFullscreen?.panelIndex === index)) {
    logPanelFsDebug(index, "bounds-update", {
      cell,
      bounds,
      controlsVisible: panel.controlsVisible,
      panelVideoFullscreen,
    });
  }
  syncPanelTabViews(index, bounds);
}

function stopLayoutAnimation() {
  layoutAnimationGeneration += 1;
  if (layoutAnimationTimer) {
    clearInterval(layoutAnimationTimer);
    layoutAnimationTimer = null;
  }
}

function layoutPanels(animate = false) {
  if (panelVideoFullscreen) {
    animate = false;
  }

  const focusedTab = getFocusedPanelTab();
  const targetCellBounds = getTargetCellBounds();

  if (!animate) {
    stopLayoutAnimation();
    currentCellBounds = targetCellBounds;
    panels.forEach((_, index) => {
      applyBrowserBounds(index, currentCellBounds[index]);
    });
    if (shellView) {
      shellView.setBounds(getShellBounds());
    }
    restoreFocusedPanelTab(focusedTab);
    return;
  }

  const fromCellBounds = currentCellBounds.map((bounds) => ({ ...bounds }));
  const generation = layoutAnimationGeneration + 1;
  layoutAnimationGeneration = generation;
  stopLayoutAnimation();

  const startedAt = Date.now();
  layoutAnimationTimer = setInterval(() => {
    if (generation !== layoutAnimationGeneration) {
      return;
    }

    const progress = easeInOutCubic(Math.min(1, (Date.now() - startedAt) / LAYOUT_ANIMATION_MS));
    currentCellBounds = targetCellBounds.map((target, index) =>
      interpolateBounds(fromCellBounds[index] ?? target, target, progress),
    );

    panels.forEach((_, index) => {
      applyBrowserBounds(index, currentCellBounds[index]);
    });

    if (progress >= 1) {
      stopLayoutAnimation();
      currentCellBounds = targetCellBounds;
      panels.forEach((_, index) => {
        applyBrowserBounds(index, currentCellBounds[index]);
      });
      restoreFocusedPanelTab(focusedTab);
    }
  }, 16);

  if (shellView) {
    shellView.setBounds(getShellBounds());
  }
}

function createTabWebContents(panelIndex: number) {
  return new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      disableHtmlFullscreenWindowResize: true,
      nodeIntegration: false,
      partition: `persist:fourscreen-panel-${panelIndex + 1}`,
      sandbox: false,
      webSecurity: true,
    },
  });
}

function attachTabListeners(panel: PanelRuntimeRef, tab: PanelTab) {
  const panelIndex = panel.panelIndex;
  const { webContents } = tab.view;
  const trackedEvents = [
    "did-start-navigation",
    "did-start-loading",
    "did-finish-load",
    "did-stop-loading",
    "did-fail-load",
    "page-title-updated",
    "did-navigate",
    "did-navigate-in-page",
    "enter-html-full-screen",
    "leave-html-full-screen",
    "render-process-gone",
  ] as const;

  tab.disposeListeners = () => {
    if (webContents.isDestroyed()) {
      return;
    }
    for (const eventName of trackedEvents) {
      webContents.removeAllListeners(eventName);
    }
  };

  webContents.setWindowOpenHandler((details) => {
    logPanel(panelIndex, "window-open", {
      disposition: details.disposition,
      url: details.url,
    });

    const targetUrl = details.url?.trim();
    if (targetUrl && targetUrl !== "about:blank") {
      void openUrlInNewTab(panelIndex, targetUrl, tab.id);
      return { action: "deny" };
    }

    void openUrlInNewTab(panelIndex, "about:blank", tab.id);
    return { action: "deny" };
  });

  const syncTabState = () => {
    broadcastShellState();
  };

  webContents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    logPanel(panelIndex, "did-start-navigation", { isInPlace, tabId: tab.id, url });
    tab.loadError = "";
    syncTabState();
  });

  webContents.on("did-start-loading", () => {
    logPanel(panelIndex, "did-start-loading", { tabId: tab.id, url: webContents.getURL() });
    syncTabState();
  });

  webContents.on("did-finish-load", () => {
    const currentUrl = webContents.getURL();
    logPanel(panelIndex, "did-finish-load", { tabId: tab.id, url: currentUrl });
    if (currentUrl && currentUrl !== "about:blank") {
      tab.url = currentUrl;
      tab.input = currentUrl;
      tab.title = webContents.getTitle() || getTabTitle(tab);
      maybeRecordActiveTabHistory(panel, tab, currentUrl);
    }
    syncTabState();
  });

  webContents.on("did-stop-loading", () => {
    logPanel(panelIndex, "did-stop-loading", { tabId: tab.id, url: webContents.getURL() });
    void setPanelCursorHidden(tab, cursorHidden);
    syncTabState();
  });

  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) {
      return;
    }

    logPanel(panelIndex, "did-fail-load", { errorCode, errorDescription, tabId: tab.id, validatedURL });
    tab.loadError = `${errorDescription} (${errorCode})`;
    syncTabState();
  });

  webContents.on("page-title-updated", (_event, title) => {
    tab.title = title;
    syncTabState();
  });

  webContents.on("did-navigate", (_event, url) => {
    if (url === "about:blank") {
      return;
    }
    tab.url = url;
    tab.input = url;
    maybeRecordActiveTabHistory(panel, tab, url);
    syncTabState();
  });

  webContents.on("did-navigate-in-page", (_event, url) => {
    tab.url = url;
    tab.input = url;
    maybeRecordActiveTabHistory(panel, tab, url);
    syncTabState();
  });

  webContents.on("enter-html-full-screen", () => {
    htmlFullscreenTransitionActive = true;
    logPanelFsDebug(panelIndex, "html-fullscreen-enter-event", {
      tabId: tab.id,
      userNativeFullscreen,
    });
    if (!userNativeFullscreen) {
      preventWindowResizeFromHtmlFullscreen("webcontents-enter-html-full-screen");
    }
    enterPanelVideoFullscreen(panelIndex, tab);
    queueMicrotask(() => {
      htmlFullscreenTransitionActive = false;
    });
  });

  webContents.on("leave-html-full-screen", () => {
    logPanelFsDebug(panelIndex, "html-fullscreen-leave-event", {
      activeFullscreenTabId: panelVideoFullscreen?.tabId ?? null,
      panelVideoFullscreenIndex: panelVideoFullscreen?.panelIndex ?? null,
      tabId: tab.id,
    });
    if (panelVideoFullscreen?.tabId === tab.id) {
      exitPanelVideoFullscreen(panelIndex);
    }
  });

  webContents.on("render-process-gone", (_event, details) => {
    logPanel(panelIndex, "render-process-gone", { details, tabId: tab.id });
  });
}

function addTab(panel: PanelRuntimeRef, initialUrl?: string, parentTabId: string | null = null) {
  panel.tabCounter += 1;
  const isPrimary = panel.tabs.length === 0;
  let title = "";
  if (initialUrl && initialUrl !== "about:blank") {
    try {
      title = new URL(initialUrl).hostname;
    } catch {
      title = initialUrl;
    }
  }

  const tab: PanelTab = {
    id: createTabId(panel.panelIndex, panel.tabCounter),
    input: initialUrl ?? "",
    isPrimary,
    loadError: "",
    parentTabId: isPrimary ? null : parentTabId,
    title,
    url: initialUrl ?? "",
    view: createTabWebContents(panel.panelIndex),
  };

  attachTabListeners(panel, tab);
  panel.tabs.push(tab);

  if (mainWindow) {
    mainWindow.contentView.addChildView(tab.view);
  }

  hideTabView(tab);

  if (initialUrl) {
    void tab.view.webContents.loadURL(initialUrl).catch((error) => {
      const message = error instanceof Error ? error.message : "Failed to load URL.";
      tab.loadError = message;
      broadcastShellState();
    });
  }

  return tab;
}

async function openUrlInNewTab(panelIndex: number, url: string, parentTabId: string | null = null) {
  const panel = panels[panelIndex];
  if (!panel) {
    return;
  }

  let targetUrl = url;
  if (url !== "about:blank") {
    const prepared = preparePanelUrl(url);
    if (prepared.ok) {
      targetUrl = prepared.normalizedUrl;
    }
  }

  const parentTab = parentTabId ? panel.tabs.find((tab) => tab.id === parentTabId) : getActiveTab(panel);
  const tab = addTab(panel, targetUrl === "about:blank" ? undefined : targetUrl, parentTab?.id ?? null);
  if (targetUrl === "about:blank") {
    void tab.view.webContents.loadURL("about:blank");
    tab.url = "about:blank";
  }

  logPanel(panelIndex, "Popup Created", {
    parentTabId: tab.parentTabId,
    tabId: tab.id,
    url: targetUrl,
  });
  logPanel(panelIndex, "Popup Activated", { tabId: tab.id });

  panel.activeTabId = tab.id;
  panel.controlsVisible = true;
  touchPanelControls(panelIndex);
  layoutPanels(false);
  focusActiveTab(panelIndex);
  broadcastShellState();
}

function resolveTabAfterClose(panel: PanelRuntimeRef, closingTab: PanelTab) {
  if (closingTab.parentTabId) {
    const parentTab = panel.tabs.find((tab) => tab.id === closingTab.parentTabId);
    if (parentTab) {
      return parentTab.id;
    }
  }

  const tabIndex = panel.tabs.findIndex((tab) => tab.id === closingTab.id);
  const fallback = panel.tabs[tabIndex - 1] ?? panel.tabs[tabIndex + 1] ?? panel.tabs.find((tab) => tab.isPrimary);
  return fallback?.id ?? panel.tabs[0]?.id ?? panel.activeTabId;
}

function closeTab(panelIndex: number, tabId: string) {
  const panel = panels[panelIndex];
  if (!panel) {
    return toShellState();
  }

  const closingTab = panel.tabs.find((tab) => tab.id === tabId);
  if (!closingTab || panel.tabs.length <= 1 || closingTab.isPrimary) {
    return toShellState();
  }

  logPanel(panelIndex, "Popup Closed", {
    parentTabId: closingTab.parentTabId,
    reason: "single",
    tabId,
  });

  const shouldSwitch = panel.activeTabId === tabId;
  const nextActiveId = shouldSwitch ? resolveTabAfterClose(panel, closingTab) : panel.activeTabId;

  const tabIndex = panel.tabs.findIndex((tab) => tab.id === tabId);
  const [removedTab] = panel.tabs.splice(tabIndex, 1);
  clearPanelVideoFullscreenForTab(panelIndex, removedTab.id);
  destroyTabView(removedTab);

  panel.activeTabId = nextActiveId;
  panel.controlsVisible = true;
  touchPanelControls(panelIndex);
  layoutPanels(false);
  focusActiveTab(panelIndex);

  const nextTab = getActiveTab(panel);
  if (nextTab?.isPrimary) {
    logPanel(panelIndex, "Primary Tab Restored", { tabId: nextTab.id });
  }

  broadcastShellState();
  return toShellState();
}

function closeActiveTab(panelIndex: number) {
  const panel = panels[panelIndex];
  const activeTab = panel ? getActiveTab(panel) : null;
  if (!activeTab || activeTab.isPrimary) {
    return toShellState();
  }

  return closeTab(panelIndex, activeTab.id);
}

function closePopupChain(panelIndex: number) {
  const panel = panels[panelIndex];
  if (!panel) {
    return toShellState();
  }

  const primaryTab = getPrimaryTab(panel);
  const popupTabs = getPopupTabs(panel);
  if (!primaryTab || popupTabs.length === 0) {
    return toShellState();
  }

  logPanel(panelIndex, "Popup Chain Closed", {
    closedTabIds: popupTabs.map((tab) => tab.id),
    primaryTabId: primaryTab.id,
  });

  popupTabs.forEach((tab) => {
    logPanel(panelIndex, "Popup Closed", {
      parentTabId: tab.parentTabId,
      reason: "chain",
      tabId: tab.id,
    });
    clearPanelVideoFullscreenForTab(panelIndex, tab.id);
    const tabIndex = panel.tabs.findIndex((candidate) => candidate.id === tab.id);
    if (tabIndex >= 0) {
      panel.tabs.splice(tabIndex, 1);
    }
    destroyTabView(tab);
  });

  panel.activeTabId = primaryTab.id;
  panel.controlsVisible = true;
  touchPanelControls(panelIndex);
  layoutPanels(false);
  focusActiveTab(panelIndex);
  logPanel(panelIndex, "Primary Tab Restored", { tabId: primaryTab.id });
  broadcastShellState();
  return toShellState();
}

function restorePrimaryTab(panelIndex: number) {
  const panel = panels[panelIndex];
  const primaryTab = panel ? getPrimaryTab(panel) : null;
  if (!panel || !primaryTab) {
    return toShellState();
  }

  const wasPopup = panel.activeTabId !== primaryTab.id;
  panel.activeTabId = primaryTab.id;
  panel.controlsVisible = true;
  touchPanelControls(panelIndex);
  layoutPanels(false);
  focusActiveTab(panelIndex);

  if (wasPopup) {
    logPanel(panelIndex, "Primary Tab Restored", { tabId: primaryTab.id });
  }

  broadcastShellState();
  return toShellState();
}

function switchTab(panelIndex: number, tabId: string) {
  const panel = panels[panelIndex];
  if (!panel?.tabs.some((tab) => tab.id === tabId)) {
    return toShellState();
  }

  const previousTabId = panel.activeTabId;
  const nextTab = panel.tabs.find((tab) => tab.id === tabId);
  if (
    panelVideoFullscreen?.panelIndex === panelIndex &&
    panelVideoFullscreen.tabId !== tabId
  ) {
    const fullscreenTab = panel.tabs.find((tab) => tab.id === panelVideoFullscreen?.tabId);
    if (fullscreenTab && !fullscreenTab.view.webContents.isDestroyed()) {
      void fullscreenTab.view.webContents
        .executeJavaScript(
          "(() => { const d = document; if (d.fullscreenElement) { return d.exitFullscreen(); } if (d.webkitFullscreenElement) { return d.webkitExitFullscreen(); } })()",
        )
        .catch(() => {});
    }
    panelVideoFullscreen = null;
  }

  logPanel(panelIndex, "switching-tab", {
    nextTabId: tabId,
    panelId: panelIndex + 1,
    previousTabId,
  });

  panel.activeTabId = tabId;
  panel.controlsVisible = true;
  touchPanelControls(panelIndex);
  layoutPanels(false);
  focusActiveTab(panelIndex);

  if (nextTab?.isPrimary && previousTabId !== tabId) {
    logPanel(panelIndex, "Primary Tab Restored", { tabId });
  } else if (nextTab && !nextTab.isPrimary && previousTabId !== tabId) {
    logPanel(panelIndex, "Popup Activated", { tabId });
  }

  broadcastShellState();
  return toShellState();
}

function destroyPanelTabs(panel: PanelRuntimeRef) {
  panel.tabs.forEach((tab) => {
    destroyTabView(tab);
  });
  panel.tabs = [];
  panel.activeTabId = "";
  panel.tabCounter = 0;
}

function getPanelIndexAtPoint(x: number, y: number) {
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    const cell = currentCellBounds[index] ?? getCellBounds(index, focusedPanelIndex, getContentSize());
    if (x >= cell.x && x < cell.x + cell.width && y >= cell.y && y < cell.y + cell.height) {
      return index;
    }
  }
  return null;
}

function touchPanelControls(index: number) {
  lastControlsInteractionAt[index] = Date.now();
}

function revealPanelControls(index: number) {
  const panel = panels[index];
  if (!panel) {
    return;
  }

  touchPanelControls(index);

  if (!panelHasContent(panel)) {
    if (!panel.controlsVisible) {
      panel.controlsVisible = true;
      broadcastShellState();
    }
    return;
  }

  if (!panel.controlsVisible) {
    panel.controlsVisible = true;
    layoutPanels(false);
    broadcastShellState();
  }
}

function hidePanelControls(index: number) {
  const panel = panels[index];
  if (!panelHasContent(panel) || controlsPinned[index] || !panel.controlsVisible) {
    return;
  }

  panel.controlsVisible = false;
  layoutPanels(false);
  broadcastShellState();
}

function setSiteMenuOpen(panelIndex: number, open: boolean) {
  if (panelIndex < 0 || panelIndex >= PANEL_COUNT) {
    return;
  }

  siteMenuOpenPanelIndex = open ? panelIndex : null;
  layoutPanels(false);
}

function setActivePanel(index: number | null, source: InteractionSource) {
  void source;
  const indexChanged = activePanelIndex !== index;
  if (!indexChanged) {
    return;
  }

  activePanelIndex = index;

  if (audioLockedPanelIndex === null && focusedPanelIndex === null && index !== null) {
    applyAudioFocus(index);
  }

  broadcastShellState();
}

function getEffectiveAudioPanelIndex(hoverIndex: number | null) {
  if (audioLockedPanelIndex !== null) {
    return audioLockedPanelIndex;
  }
  if (focusedPanelIndex !== null) {
    return focusedPanelIndex;
  }
  return hoverIndex;
}

function applyAudioFocus(hoverIndex: number | null) {
  const effectiveIndex = getEffectiveAudioPanelIndex(hoverIndex);
  audioPanelIndex = effectiveIndex;
  panels.forEach((panel, panelIndex) => {
    const shouldMute = effectiveIndex !== null && panelIndex !== effectiveIndex;
    panel.tabs.forEach((tab) => {
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.setAudioMuted(shouldMute);
      }
    });
  });
}

function toggleAudioLock(panelIndex: number) {
  if (panelIndex < 0 || panelIndex >= PANEL_COUNT) {
    return toShellState();
  }

  const panel = panels[panelIndex];
  if (!panelHasContent(panel)) {
    return toShellState();
  }

  if (audioLockedPanelIndex === panelIndex) {
    audioLockedPanelIndex = null;
    applyAudioFocus(activePanelIndex);
  } else {
    audioLockedPanelIndex = panelIndex;
    applyAudioFocus(activePanelIndex);
  }

  broadcastShellState();
  return toShellState();
}

function setShellCursorHidden(hidden: boolean) {
  if (!shellView || shellView.webContents.isDestroyed()) {
    return;
  }

  void shellView.webContents.executeJavaScript(
    hidden
      ? "document.body.classList.add('cursor-hidden')"
      : "document.body.classList.remove('cursor-hidden')",
  );
}

async function setPanelCursorHidden(tab: PanelTab, hidden: boolean) {
  if (tab.view.webContents.isDestroyed()) {
    return;
  }

  const script = hidden
    ? `(function(){var id=${JSON.stringify(CURSOR_HIDE_STYLE_ID)};if(document.getElementById(id))return;var s=document.createElement("style");s.id=id;s.textContent=${JSON.stringify(CURSOR_HIDE_CSS)};document.documentElement.appendChild(s);})()`
    : `(function(){document.getElementById(${JSON.stringify(CURSOR_HIDE_STYLE_ID)})?.remove();})()`;

  try {
    await tab.view.webContents.executeJavaScript(script, true);
  } catch {
    // Ignore pages that block script execution; shell cursor still syncs.
  }
}

async function syncAllPanelCursorsHidden(hidden: boolean) {
  await Promise.all(
    panels.flatMap((panel) => panel.tabs.map((tab) => setPanelCursorHidden(tab, hidden))),
  );
}

async function ensureCursorVisible() {
  setShellCursorHidden(false);
  await syncAllPanelCursorsHidden(false);
  cursorHidden = false;
}

async function setCursorHidden(hidden: boolean) {
  if (cursorHidden === hidden && hidden) {
    return;
  }

  if (!hidden) {
    await ensureCursorVisible();
    return;
  }

  cursorHidden = true;
  if (DEBUG_PANEL_FS && lastDebugCursorHidden !== hidden) {
    lastDebugCursorHidden = hidden;
    logShellFsDebug("cursor-visibility", {
      cursorHidden: hidden,
      hoveredIndex: previousHoveredIndex,
      panelVideoFullscreen,
    });
  }
  setShellCursorHidden(true);
  await syncAllPanelCursorsHidden(true);
}

function noteMouseMovement(x: number, y: number) {
  const moved = x !== lastMouseX || y !== lastMouseY;
  if (!moved) {
    return;
  }

  lastMouseX = x;
  lastMouseY = y;
  lastMouseMoveAt = Date.now();
  if (cursorHidden) {
    void ensureCursorVisible();
  }
}

function pollDesktopInteraction() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const point = screen.getCursorScreenPoint();
  const contentBounds = mainWindow.getContentBounds();
  const x = point.x - contentBounds.x;
  const y = point.y - contentBounds.y;

  noteMouseMovement(x, y);

  if (!mainWindow.isFocused()) {
    if (cursorHidden) {
      void setCursorHidden(false);
    }
    return;
  }

  const hoveredIndex = getPanelIndexAtPoint(x, y);

  if (DEBUG_PANEL_FS && hoveredIndex !== lastDebugHoverIndex) {
    lastDebugHoverIndex = hoveredIndex;
    logShellFsDebug("hover-state", {
      hoveredIndex,
      panelVideoFullscreen,
      pointer: { x, y },
      screen1ControlsVisible: panels[0]?.controlsVisible ?? null,
      screen1NearTop:
        hoveredIndex === 0
          ? y - (currentCellBounds[0]?.y ?? SHELL_PADDING) <= REVEAL_ZONE_HEIGHT
          : null,
    });
  }

  if (hoveredIndex !== previousHoveredIndex) {
    previousHoveredIndex = hoveredIndex;
  }

  if (hoveredIndex !== null) {
    const panel = panels[hoveredIndex];
    if (panel && panelHasContent(panel)) {
      const cell = currentCellBounds[hoveredIndex] ?? getCellBounds(hoveredIndex, focusedPanelIndex, getContentSize());
      const relativeY = y - cell.y;
      const nearTop = relativeY >= 0 && relativeY <= REVEAL_ZONE_HEIGHT;
      const inChrome = panel.controlsVisible && relativeY <= panelChromeHeight;
      if (nearTop) {
        revealPanelControls(hoveredIndex);
      } else if (inChrome) {
        touchPanelControls(hoveredIndex);
      }
    }
  }

  setActivePanel(hoveredIndex, "mouse");

  const now = Date.now();
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    const panel = panels[index];
    if (!panelHasContent(panel) || !panel.controlsVisible || controlsPinned[index]) {
      continue;
    }
    if (now - lastControlsInteractionAt[index] >= CONTROLS_HIDE_DELAY_MS) {
      hidePanelControls(index);
    }
  }

  if (!cursorHidden && now - lastMouseMoveAt >= CURSOR_HIDE_DELAY_MS) {
    void setCursorHidden(true);
  }
}

function startDesktopInteractionTracking() {
  if (mousePollTimer) {
    return;
  }
  mousePollTimer = setInterval(pollDesktopInteraction, MOUSE_POLL_MS);
}

function stopDesktopInteractionTracking() {
  if (!mousePollTimer) {
    return;
  }
  clearInterval(mousePollTimer);
  mousePollTimer = null;
  stopLayoutAnimation();
  void setCursorHidden(false);
}

function focusPanel(index: number) {
  if (index < 0 || index >= PANEL_COUNT) {
    return toShellState();
  }

  focusedPanelIndex = index;
  applyAudioFocus(activePanelIndex);
  revealPanelControls(index);
  layoutPanels(true);
  broadcastShellState();
  return toShellState();
}

function unfocusPanel() {
  if (focusedPanelIndex === null) {
    return toShellState();
  }

  focusedPanelIndex = null;
  applyAudioFocus(activePanelIndex);
  layoutPanels(true);
  broadcastShellState();
  return toShellState();
}

function remapIndex(index: number | null, left: number, right: number): number | null {
  if (index === null) {
    return null;
  }
  if (index === left) {
    return right;
  }
  if (index === right) {
    return left;
  }
  return index;
}

function swapArrayValues<T>(array: T[], left: number, right: number) {
  [array[left], array[right]] = [array[right], array[left]];
}

function swapPanels(left: number, right: number) {
  if (left === right || left < 0 || right < 0 || left >= PANEL_COUNT || right >= PANEL_COUNT) {
    return toShellState();
  }

  swapArrayValues(panels, left, right);
  panels[left].panelIndex = left;
  panels[right].panelIndex = right;

  swapArrayValues(panelHistory, left, right);
  swapArrayValues(controlsPinned, left, right);
  swapArrayValues(lastControlsInteractionAt, left, right);

  audioLockedPanelIndex = remapIndex(audioLockedPanelIndex, left, right);
  activePanelIndex = remapIndex(activePanelIndex, left, right);
  focusedPanelIndex = remapIndex(focusedPanelIndex, left, right);
  siteMenuOpenPanelIndex = remapIndex(siteMenuOpenPanelIndex, left, right);

  if (panelVideoFullscreen) {
    const nextPanelIndex = remapIndex(panelVideoFullscreen.panelIndex, left, right);
    if (nextPanelIndex !== null) {
      panelVideoFullscreen = {
        ...panelVideoFullscreen,
        panelIndex: nextPanelIndex,
      };
    }
  }

  applyAudioFocus(activePanelIndex);
  layoutPanels(false);
  broadcastShellState();
  persistPanelState();
  return toShellState();
}

function movePanel(index: number, direction: PanelMoveRequest["direction"]) {
  const target = getPanelSwapTarget(index, direction);
  if (target === null) {
    return toShellState();
  }
  return swapPanels(index, target);
}

function addHomepageTile(name: string, url: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Enter a site name for this homepage icon.");
  }

  const prepared = preparePanelUrl(url);
  if (!prepared.ok) {
    throw new Error(prepared.error);
  }

  homepageTiles = addStoredHomepageTile(trimmedName, prepared.normalizedUrl);
  broadcastShellState();
  return toShellState();
}

function removeHomepageTile(tileId: string) {
  if (!tileId) {
    return toShellState();
  }

  homepageTiles = removeStoredHomepageTile(tileId);
  broadcastShellState();
  return toShellState();
}

function updateHomepageTile(tileId: string, name: string, url: string) {
  if (!tileId) {
    return toShellState();
  }

  homepageTiles = updateStoredHomepageTile(tileId, name, url);
  broadcastShellState();
  return toShellState();
}

function addHomepageTileFromVisit(visitId: string) {
  if (!visitId) {
    return toShellState();
  }

  homepageTiles = addStoredHomepageTileFromVisit(visitId);
  visitHistory = readStoredVisitHistory();
  broadcastShellState();
  return toShellState();
}

function createPanelView(index: number) {
  const panel: PanelRuntimeRef = {
    activeTabId: "",
    controlsVisible: true,
    panelIndex: index,
    tabCounter: 0,
    tabs: [],
  };

  const tab = addTab(panel);
  panel.activeTabId = tab.id;
  panels[index] = panel;
  return panel;
}

async function loadPanelUrl(index: number, rawInput: string) {
  const panel = panels[index];
  if (!panel) {
    return toShellState();
  }

  const prepared = preparePanelUrl(rawInput);
  if (!prepared.ok) {
    const activeTab = getActiveTab(panel);
    if (activeTab) {
      activeTab.input = prepared.normalizedUrl || rawInput.trim();
    }
    broadcastShellState();
    throw new Error(prepared.error);
  }

  const activeTab = getActiveTab(panel);
  if (!activeTab) {
    return toShellState();
  }

  activeTab.input = prepared.normalizedUrl;
  activeTab.url = prepared.normalizedUrl;
  activeTab.title = new URL(prepared.normalizedUrl).hostname;
  activeTab.loadError = "";
  panel.controlsVisible = true;
  touchPanelControls(index);

  layoutPanels(false);
  // Broadcast URL + layout before loadURL completes so the shell can hide Quick Launch
  // without changing focus handling or WebContentsView interaction.
  broadcastShellState();
  logPanel(index, "loadURL", prepared.normalizedUrl);

  try {
    await activeTab.view.webContents.loadURL(prepared.normalizedUrl);
    recordPanelHistory(index, prepared.normalizedUrl);
    recordVisit(prepared.normalizedUrl, activeTab.title || prepared.normalizedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load URL.";
    activeTab.loadError = message;
    logPanel(index, "loadURL failed", message);
    throw error;
  }

  broadcastShellState();
  persistPanelState();
  return toShellState();
}

function clearPanel(index: number) {
  const panel = panels[index];
  if (!panel) {
    return toShellState();
  }

  if (audioLockedPanelIndex === index) {
    audioLockedPanelIndex = null;
  }

  panel.controlsVisible = true;
  controlsPinned[index] = false;
  touchPanelControls(index);
  destroyPanelTabs(panel);
  const tab = addTab(panel);
  panel.activeTabId = tab.id;

  layoutPanels(false);
  broadcastShellState();
  persistPanelState();
  return toShellState();
}

function goBack(index: number) {
  const panel = panels[index];
  const activeTab = panel ? getActiveTab(panel) : null;
  if (!activeTab || !getNavigationState(activeTab.view.webContents).canGoBack) {
    return toShellState();
  }
  activeTab.view.webContents.goBack();
  return toShellState();
}

function goForward(index: number) {
  const panel = panels[index];
  const activeTab = panel ? getActiveTab(panel) : null;
  if (!activeTab || !getNavigationState(activeTab.view.webContents).canGoForward) {
    return toShellState();
  }
  activeTab.view.webContents.goForward();
  return toShellState();
}

function createMainWindow() {
  homepageTiles = readVisibleHomepageTiles();
  visitHistory = readStoredVisitHistory();
  panelHistory = readStoredPanelHistory();

  mainWindow = new BrowserWindow({
    backgroundColor: "#020617",
    fullscreenable: true,
    height: 900,
    minHeight: 640,
    minWidth: 960,
    show: true,
    title: "FourScreen",
    width: 1400,
  });

  mainWindow.on("resize", () => layoutPanels(false));
  mainWindow.on("maximize", () => {
    logShellFsDebug("maximize", {
      isFullScreen: mainWindow?.isFullScreen() ?? null,
      panelVideoFullscreen,
      userNativeFullscreen,
    });
    layoutPanels(false);
  });
  mainWindow.on("unmaximize", () => {
    logShellFsDebug("unmaximize", {
      isFullScreen: mainWindow?.isFullScreen() ?? null,
      panelVideoFullscreen,
      userNativeFullscreen,
    });
    layoutPanels(false);
  });
  mainWindow.on("enter-full-screen", () => {
    logShellFsDebug("enter-full-screen", {
      htmlFullscreenTransitionActive,
      panelVideoFullscreen,
      userNativeFullscreen,
    });
    if (!htmlFullscreenTransitionActive) {
      userNativeFullscreen = true;
    }
    logShell("enter-full-screen");
    layoutPanels(false);
  });
  mainWindow.on("leave-full-screen", () => {
    userNativeFullscreen = false;
    logShellFsDebug("leave-full-screen", { panelVideoFullscreen });
    logShell("leave-full-screen");
    layoutPanels(false);
  });

  for (let index = 0; index < PANEL_COUNT; index += 1) {
    createPanelView(index);
  }

  shellView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
    },
  });
  mainWindow.contentView.addChildView(shellView);
  void loadShellView(shellView).catch((error) => {
    logShell("Failed to load shell overlay", error);
  });

  for (let index = 0; index < PANEL_COUNT; index += 1) {
    panels[index].tabs.forEach((tab) => {
      mainWindow?.contentView.addChildView(tab.view);
    });
  }

  layoutPanels(false);
  mainWindow.once("show", () => layoutPanels(false));
  mainWindow.on("closed", () => {
    stopDesktopInteractionTracking();
    mainWindow = null;
    shellView = null;
  });
  startDesktopInteractionTracking();
  mainWindow.show();
  mainWindow.focus();
}

function registerIpcHandlers() {
  ipcMain.handle("shell:get-state", () => toShellState());

  ipcMain.handle("panel:load", async (_event, request: PanelLoadRequest) => {
    return loadPanelUrl(request.index, request.input);
  });

  ipcMain.handle("panel:clear", (_event, request: PanelIndexRequest) => {
    return clearPanel(request.index);
  });

  ipcMain.handle("panel:clear-history", (_event, request: PanelIndexRequest) => {
    return clearPanelHistory(request.index);
  });

  ipcMain.handle("panel:refresh", async (_event, request: PanelIndexRequest) => {
    const panel = panels[request.index];
    const activeTab = panel ? getActiveTab(panel) : null;
    if (!tabHasContent(activeTab) || !activeTab) {
      return toShellState();
    }
    activeTab.loadError = "";
    touchPanelControls(request.index);
    revealPanelControls(request.index);
    activeTab.view.webContents.reload();
    return toShellState();
  });

  ipcMain.handle("panel:go-back", (_event, request: PanelIndexRequest) => {
    return goBack(request.index);
  });

  ipcMain.handle("panel:go-forward", (_event, request: PanelIndexRequest) => {
    return goForward(request.index);
  });

  ipcMain.handle("panel:switch-tab", (_event, request: PanelTabRequest) => {
    return switchTab(request.index, request.tabId);
  });

  ipcMain.handle("panel:close-tab", (_event, request: PanelTabRequest) => {
    return closeTab(request.index, request.tabId);
  });

  ipcMain.handle("panel:close-active-tab", (_event, request: PanelIndexRequest) => {
    return closeActiveTab(request.index);
  });

  ipcMain.handle("panel:close-popups", (_event, request: PanelIndexRequest) => {
    return closePopupChain(request.index);
  });

  ipcMain.handle("panel:restore-primary", (_event, request: PanelIndexRequest) => {
    return restorePrimaryTab(request.index);
  });

  ipcMain.handle("panel:toggle-audio-lock", (_event, request: PanelIndexRequest) => {
    return toggleAudioLock(request.index);
  });

  ipcMain.handle("panel:focus", (_event, request: PanelIndexRequest) => {
    return focusPanel(request.index);
  });

  ipcMain.handle("panel:unfocus", () => {
    return unfocusPanel();
  });

  ipcMain.handle("panel:move", (_event, request: PanelMoveRequest) => {
    return movePanel(request.index, request.direction);
  });

  ipcMain.handle("homepage:add", (_event, request: HomepageAddRequest) => {
    return addHomepageTile(request.name, request.url);
  });

  ipcMain.handle("homepage:add-from-visit", (_event, request: HomepageAddFromVisitRequest) => {
    return addHomepageTileFromVisit(request.visitId);
  });

  ipcMain.handle("homepage:remove", (_event, request: HomepageRemoveRequest) => {
    return removeHomepageTile(request.tileId);
  });

  ipcMain.handle("homepage:update", (_event, request: HomepageUpdateRequest) => {
    return updateHomepageTile(request.tileId, request.name, request.url);
  });

  ipcMain.handle("panel:controls-visible", (_event, request: ControlsVisibilityRequest) => {
    const panel = panels[request.index];
    if (!panel) {
      return;
    }
    if (request.visible) {
      revealPanelControls(request.index);
      return;
    }
    controlsPinned[request.index] = false;
    hidePanelControls(request.index);
  });

  ipcMain.handle("panel:site-menu-open", (_event, request: SiteMenuOpenRequest) => {
    setSiteMenuOpen(request.index, request.open);
  });

  ipcMain.handle("panel:pin-controls", (_event, request: PinControlsRequest) => {
    controlsPinned[request.index] = request.pinned;
    if (request.pinned) {
      revealPanelControls(request.index);
      return;
    }
    touchPanelControls(request.index);
  });

  ipcMain.handle("shell:set-active-panel", (_event, request: SetActivePanelRequest) => {
    setActivePanel(request.index, request.source);
  });

  ipcMain.handle("shell:chrome-height", (_event, height: number) => {
    if (!Number.isFinite(height) || height < 80 || height > 320) {
      return;
    }
    const nextHeight = Math.round(height);
    if (nextHeight === panelChromeHeight) {
      return;
    }
    panelChromeHeight = nextHeight;
    layoutPanels(false);
  });
}

async function restorePanels() {
  panelHistory = readStoredPanelHistory();
  homepageTiles = readVisibleHomepageTiles();
  visitHistory = readStoredVisitHistory();
  const storedUrls = readStoredUrls();
  await Promise.all(
    storedUrls.map(async (url, index) => {
      if (!url) {
        return;
      }
      try {
        await loadPanelUrl(index, url);
      } catch {
        const activeTab = getActiveTab(panels[index]);
        if (activeTab) {
          activeTab.input = url;
        }
        broadcastPanels();
      }
    }),
  );
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  createMainWindow();
  await restorePanels();
  panels.forEach((panel) => {
    panel.tabs.forEach((tab) => {
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.setAudioMuted(true);
      }
    });
  });
  broadcastPanels();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      return;
    }
    mainWindow?.show();
    mainWindow?.focus();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
