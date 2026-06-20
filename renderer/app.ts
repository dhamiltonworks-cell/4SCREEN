import type { FourScreenApi } from "../shared/ipc";
import { getAllCellBounds, toShellPanelBounds } from "../shared/layout";
import {
  getShortcutFaviconUrl,
  getSiteDomainFromUrl,
  getSiteLabelFromUrl,
  SITE_SHORTCUTS,
  type SiteShortcut,
} from "../shared/site-shortcuts";
import { PANEL_COUNT, type ShellState } from "../shared/types";

declare global {
  interface Window {
    fourScreen: FourScreenApi;
  }
}

const EMPTY_MESSAGE = "Paste URL to begin";

type PanelUi = {
  audioBadge: HTMLButtonElement;
  backButton: HTMLButtonElement;
  chrome: HTMLElement;
  clearButton: HTMLButtonElement;
  emptyState: HTMLElement;
  error: HTMLElement;
  externalButton: HTMLButtonElement;
  focusButton: HTMLButtonElement;
  form: HTMLFormElement;
  forwardButton: HTMLButtonElement;
  historyButton: HTMLButtonElement;
  index: number;
  input: HTMLInputElement;
  loadButton: HTMLButtonElement;
  refreshButton: HTMLButtonElement;
  root: HTMLElement;
  siteMenu: HTMLElement;
  statusBadge: HTMLElement;
  tabRow: HTMLElement;
  tabEscape: HTMLElement;
  closeTabButton: HTMLButtonElement;
  closePopupsButton: HTMLButtonElement;
  tabs: HTMLElement;
  urlLine: HTMLElement;
};

const panelUi: PanelUi[] = [];
let currentFocusedPanelIndex: number | null = null;
let openSiteMenuIndex: number | null = null;
let latestShellState: ShellState | null = null;

function getPanelLabel(index: number) {
  return `Screen ${index + 1}`;
}

function closeSiteMenus() {
  if (openSiteMenuIndex === null) {
    return;
  }

  const closedIndex = openSiteMenuIndex;
  const ui = panelUi[closedIndex];
  if (ui) {
    ui.siteMenu.hidden = true;
    ui.historyButton.classList.remove("button--history-active");
  }
  openSiteMenuIndex = null;
  void window.fourScreen.setSiteMenuOpen({ index: closedIndex, open: false });
}

function appendSiteIconFallback(icon: HTMLElement, badge: string, className?: string) {
  const fallback = document.createElement("span");
  fallback.className = className
    ? `panel__site-icon-fallback ${className}`
    : "panel__site-icon-fallback";
  fallback.textContent = badge;
  icon.append(fallback);
}

function createSiteIcon(name: string, domain: string, shortcut?: SiteShortcut) {
  const icon = document.createElement("span");
  icon.className = "panel__site-icon";

  const image = document.createElement("img");
  image.className = "panel__site-icon-image";
  image.alt = "";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.src = getShortcutFaviconUrl(domain);
  image.addEventListener("error", () => {
    image.remove();
    if (shortcut?.fallbackBadge) {
      appendSiteIconFallback(icon, shortcut.fallbackBadge, shortcut.fallbackClass);
      return;
    }
    appendSiteIconFallback(icon, name.slice(0, 1).toUpperCase());
  });

  icon.append(image);
  return icon;
}

function renderSiteMenu(ui: PanelUi, panel: ShellState["panels"][number]) {
  const shortcutGrid = ui.siteMenu.querySelector<HTMLElement>('[data-role="shortcut-grid"]');
  const historyList = ui.siteMenu.querySelector<HTMLElement>('[data-role="history-list"]');
  const clearHistoryButton = ui.siteMenu.querySelector<HTMLButtonElement>('[data-role="clear-history"]');
  if (!shortcutGrid || !historyList || !clearHistoryButton) {
    return;
  }

  shortcutGrid.innerHTML = "";
  SITE_SHORTCUTS.forEach((shortcut) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel__site-menu-item panel__site-menu-item--shortcut";
    button.dataset.shortcutUrl = shortcut.url;
    button.title = shortcut.url;
    button.append(createSiteIcon(shortcut.name, shortcut.domain, shortcut));

    const label = document.createElement("span");
    label.className = "panel__site-menu-label";
    label.textContent = shortcut.name;
    button.append(label);
    shortcutGrid.append(button);
  });

  historyList.innerHTML = "";
  if (panel.recentUrls.length === 0) {
    const empty = document.createElement("p");
    empty.className = "panel__history-empty";
    empty.textContent = "No recent sites yet.";
    historyList.append(empty);
    clearHistoryButton.hidden = true;
    return;
  }

  clearHistoryButton.hidden = false;
  panel.recentUrls.forEach((url) => {
    const domain = getSiteDomainFromUrl(url);
    const labelText = getSiteLabelFromUrl(url);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel__site-menu-item panel__site-menu-item--history";
    button.dataset.historyUrl = url;
    button.title = url;

    const head = document.createElement("div");
    head.className = "panel__site-menu-history-head";
    head.append(createSiteIcon(labelText, domain || labelText));

    const label = document.createElement("span");
    label.className = "panel__site-menu-label";
    label.textContent = labelText;
    head.append(label);
    button.append(head);

    const urlLine = document.createElement("span");
    urlLine.className = "panel__site-menu-url";
    urlLine.textContent = url;
    button.append(urlLine);
    historyList.append(button);
  });
}

function bindSiteMenu(ui: PanelUi) {
  ui.siteMenu.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const shortcutButton = target.closest<HTMLButtonElement>("[data-shortcut-url]");
    if (shortcutButton?.dataset.shortcutUrl) {
      void loadPanel(ui.index, shortcutButton.dataset.shortcutUrl);
      return;
    }

    const historyButton = target.closest<HTMLButtonElement>("[data-history-url]");
    if (historyButton?.dataset.historyUrl) {
      void loadPanel(ui.index, historyButton.dataset.historyUrl);
    }
  });

  ui.siteMenu.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
}

function toggleSiteMenu(index: number) {
  const ui = panelUi[index];
  if (!ui) {
    return;
  }

  if (openSiteMenuIndex === index) {
    closeSiteMenus();
    return;
  }

  closeSiteMenus();
  openSiteMenuIndex = index;
  ui.siteMenu.hidden = false;
  ui.historyButton.classList.add("button--history-active");
  if (latestShellState?.panels[index]) {
    renderSiteMenu(ui, latestShellState.panels[index]);
  }
  void window.fourScreen.setSiteMenuOpen({ index, open: true });
  void window.fourScreen.pinPanelControls({ index, pinned: true });
  void window.fourScreen.setControlsVisible({ index, visible: true });
}

function setupSiteMenuDismiss() {
  document.addEventListener("click", (event) => {
    if (openSiteMenuIndex === null) {
      return;
    }

    const ui = panelUi[openSiteMenuIndex];
    if (ui && event.target instanceof Node && ui.siteMenu.contains(event.target)) {
      return;
    }

    const index = openSiteMenuIndex;
    closeSiteMenus();
    void window.fourScreen.pinPanelControls({ index, pinned: false });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (openSiteMenuIndex === null) {
        return;
      }
      const index = openSiteMenuIndex;
      closeSiteMenus();
      void window.fourScreen.pinPanelControls({ index, pinned: false });
    }
  });
}

async function loadPanel(index: number, url?: string) {
  const ui = panelUi[index];
  if (!ui) {
    return;
  }

  const hadOpenMenu = openSiteMenuIndex === index;
  if (url !== undefined) {
    ui.input.value = url;
  }

  closeSiteMenus();
  if (hadOpenMenu) {
    void window.fourScreen.pinPanelControls({ index, pinned: false });
  }

  try {
    ui.error.hidden = true;
    const nextState = await window.fourScreen.loadPanel({ index, input: ui.input.value });
    renderShellState(nextState);
  } catch (error) {
    ui.error.hidden = false;
    ui.error.textContent = error instanceof Error ? error.message : "Unable to load this URL.";
  }
}

async function clearPanelHistory(index: number) {
  const nextState = await window.fourScreen.clearPanelHistory({ index });
  closeSiteMenus();
  renderShellState(nextState);
}

function mountPanels() {
  const grid = document.querySelector<HTMLElement>("#panel-grid");
  if (!grid) {
    return;
  }

  grid.innerHTML = "";

  for (let index = 0; index < PANEL_COUNT; index += 1) {
    const root = document.createElement("section");
    root.className = "panel";
    root.dataset.index = String(index);

    root.innerHTML = `
      <header class="panel__chrome" data-role="chrome">
        <div class="panel__header">
          <div class="panel__meta">
            <p class="panel__label">${getPanelLabel(index)}</p>
            <p class="panel__url" data-role="url"></p>
          </div>
          <div class="panel__badges">
            <button type="button" class="panel__badge panel__badge--audio" data-role="audio-badge" hidden>🔊 AUDIO</button>
            <span class="panel__badge" data-role="badge">Ready</span>
          </div>
        </div>
        <div class="panel__tab-row" data-role="tab-row" hidden>
          <div class="panel__tab-escape" data-role="tab-escape" hidden>
            <button class="button button--escape" data-action="close-tab" type="button" hidden>Close Tab</button>
            <button class="button button--escape button--escape-chain" data-action="close-popups" type="button" hidden>Close Popups</button>
          </div>
          <nav class="panel__tabs" data-role="tabs" aria-label="${getPanelLabel(index)} tabs"></nav>
        </div>
        <form class="panel__form" data-role="form">
          <input
            class="panel__input"
            type="text"
            placeholder="${EMPTY_MESSAGE}"
            aria-label="${getPanelLabel(index)} URL"
          />
          <div class="panel__actions-wrap" data-role="actions-wrap">
            <div class="panel__actions">
              <button class="button button--icon" data-action="back" type="button" aria-label="Back" title="Back">←</button>
              <button class="button button--icon" data-action="forward" type="button" aria-label="Forward" title="Forward">→</button>
              <button class="button button--icon" data-action="refresh" type="button" aria-label="Refresh" title="Refresh">↻</button>
              <button class="button button--icon button--history" data-action="history" type="button" aria-label="History and shortcuts" title="History & shortcuts">⏱</button>
              <button class="button button--icon button--load" data-action="load" type="submit" aria-label="Load" title="Load">⏎</button>
              <button class="button button--icon" data-action="external" type="button" aria-label="Open in browser" title="Open Tab">□</button>
              <button class="button button--icon button--focus" data-action="focus" type="button" aria-label="Focus panel" title="Focus">◎</button>
              <button class="button button--icon button--danger" data-action="clear" type="button" aria-label="Clear panel" title="Clear">✕</button>
            </div>
            <div class="panel__site-menu" data-role="site-menu" hidden>
              <div class="panel__site-menu-section">
                <p class="panel__site-menu-heading">Quick launch</p>
                <div class="panel__shortcut-grid" data-role="shortcut-grid"></div>
              </div>
              <div class="panel__site-menu-section">
                <div class="panel__site-menu-heading-row">
                  <p class="panel__site-menu-heading">Recent</p>
                  <button class="panel__site-menu-clear" data-role="clear-history" type="button">Clear</button>
                </div>
                <div class="panel__history-list" data-role="history-list"></div>
              </div>
            </div>
          </div>
        </form>
        <p class="panel__error" data-role="error" hidden></p>
      </header>
      <div class="panel__body">
        <div class="panel__empty" data-role="empty">
          <div class="panel__empty-icon">+</div>
          <p class="panel__empty-title">Add Website</p>
          <p class="panel__empty-copy">${EMPTY_MESSAGE}</p>
        </div>
      </div>
    `;

    const chrome = root.querySelector<HTMLElement>('[data-role="chrome"]');
    const form = root.querySelector<HTMLFormElement>('[data-role="form"]');
    const input = root.querySelector<HTMLInputElement>(".panel__input");
    const error = root.querySelector<HTMLElement>('[data-role="error"]');
    const urlLine = root.querySelector<HTMLElement>('[data-role="url"]');
    const emptyState = root.querySelector<HTMLElement>('[data-role="empty"]');
    const focusButton = root.querySelector<HTMLButtonElement>('[data-action="focus"]');
    const backButton = root.querySelector<HTMLButtonElement>('[data-action="back"]');
    const forwardButton = root.querySelector<HTMLButtonElement>('[data-action="forward"]');
    const refreshButton = root.querySelector<HTMLButtonElement>('[data-action="refresh"]');
    const historyButton = root.querySelector<HTMLButtonElement>('[data-action="history"]');
    const loadButton = root.querySelector<HTMLButtonElement>('[data-action="load"]');
    const externalButton = root.querySelector<HTMLButtonElement>('[data-action="external"]');
    const clearButton = root.querySelector<HTMLButtonElement>('[data-action="clear"]');
    const tabs = root.querySelector<HTMLElement>('[data-role="tabs"]');
    const tabRow = root.querySelector<HTMLElement>('[data-role="tab-row"]');
    const tabEscape = root.querySelector<HTMLElement>('[data-role="tab-escape"]');
    const closeTabButton = root.querySelector<HTMLButtonElement>('[data-action="close-tab"]');
    const closePopupsButton = root.querySelector<HTMLButtonElement>('[data-action="close-popups"]');
    const audioBadge = root.querySelector<HTMLButtonElement>('[data-role="audio-badge"]');
    const siteMenu = root.querySelector<HTMLElement>('[data-role="site-menu"]');
    const statusBadge = root.querySelector<HTMLElement>('[data-role="badge"]');

    if (
      !chrome ||
      !form ||
      !input ||
      !error ||
      !urlLine ||
      !emptyState ||
      !focusButton ||
      !backButton ||
      !forwardButton ||
      !refreshButton ||
      !historyButton ||
      !loadButton ||
      !externalButton ||
      !clearButton ||
      !tabs ||
      !tabRow ||
      !tabEscape ||
      !closeTabButton ||
      !closePopupsButton ||
      !audioBadge ||
      !siteMenu ||
      !statusBadge
    ) {
      continue;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void loadPanel(index);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void loadPanel(index);
      }
    });

    input.addEventListener("focus", () => {
      void window.fourScreen.pinPanelControls({ index, pinned: true });
      void window.fourScreen.setControlsVisible({ index, visible: true });
    });

    input.addEventListener("blur", () => {
      void window.fourScreen.pinPanelControls({ index, pinned: false });
    });

    chrome.addEventListener("mouseenter", () => {
      void window.fourScreen.setControlsVisible({ index, visible: true });
    });

    backButton.addEventListener("click", () => {
      void window.fourScreen.goBack({ index });
    });

    forwardButton.addEventListener("click", () => {
      void window.fourScreen.goForward({ index });
    });

    refreshButton.addEventListener("click", () => {
      void window.fourScreen.refreshPanel({ index });
    });

    historyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSiteMenu(index);
    });

    const clearHistoryButton = siteMenu.querySelector<HTMLButtonElement>('[data-role="clear-history"]');
    clearHistoryButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      void clearPanelHistory(index);
    });

    externalButton.addEventListener("click", () => {
      void window.fourScreen.openExternal({ index });
    });

    focusButton.addEventListener("click", () => {
      void toggleFocus(index);
    });

    clearButton.addEventListener("click", () => {
      void clearPanel(index);
    });

    closeTabButton.addEventListener("click", () => {
      void window.fourScreen.closeActivePanelTab({ index });
    });

    closePopupsButton.addEventListener("click", () => {
      void window.fourScreen.closePanelPopups({ index });
    });

    audioBadge.addEventListener("click", (event) => {
      event.stopPropagation();
      void window.fourScreen.toggleAudioLock({ index });
    });

    panelUi[index] = {
      audioBadge,
      backButton,
      chrome,
      clearButton,
      emptyState,
      error,
      externalButton,
      focusButton,
      form,
      forwardButton,
      historyButton,
      index,
      input,
      loadButton,
      refreshButton,
      root,
      siteMenu,
      statusBadge,
      tabRow,
      tabEscape,
      closeTabButton,
      closePopupsButton,
      tabs,
      urlLine,
    };

    bindSiteMenu(panelUi[index]);

    grid.appendChild(root);
  }
}

function renderPanelTabs(ui: PanelUi, panel: ShellState["panels"][number]) {
  const showTabs = panel.tabs.length > 1;
  ui.tabRow.hidden = !showTabs;
  ui.tabEscape.hidden = !panel.hasPopups;
  ui.closeTabButton.hidden = !panel.activeTabIsPopup;
  ui.closePopupsButton.hidden = !panel.hasPopups;
  ui.tabs.innerHTML = "";

  if (!showTabs) {
    return;
  }

  const orderedTabs = [...panel.tabs].sort((left, right) => {
    if (left.isPrimary) {
      return -1;
    }
    if (right.isPrimary) {
      return 1;
    }
    return 0;
  });

  orderedTabs.forEach((tab) => {
    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.className = "panel__tab";
    tabButton.classList.toggle("panel__tab--active", tab.id === panel.activeTabId);
    tabButton.classList.toggle("panel__tab--primary", tab.isPrimary);
    tabButton.title = tab.isPrimary ? `Main — ${tab.title}` : tab.title;

    const label = document.createElement("span");
    label.className = "panel__tab-label";
    label.textContent = tab.isPrimary ? `Main · ${tab.title}` : tab.title;
    tabButton.append(label);

    if (tab.canClose) {
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "panel__tab-close";
      closeButton.setAttribute("aria-label", `Close ${tab.title}`);
      closeButton.title = "Close Tab";
      closeButton.textContent = "×";
      closeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void window.fourScreen.closePanelTab({ index: ui.index, tabId: tab.id });
      });
      tabButton.append(closeButton);
    }

    tabButton.addEventListener("click", () => {
      if (tab.isPrimary) {
        void window.fourScreen.restorePrimaryTab({ index: ui.index });
        return;
      }
      if (tab.id === panel.activeTabId) {
        return;
      }
      void window.fourScreen.switchPanelTab({ index: ui.index, tabId: tab.id });
    });

    ui.tabs.append(tabButton);
  });
}

function applyPanelLayout(focusedPanelIndex: number | null) {
  const grid = document.querySelector<HTMLElement>("#panel-grid");
  if (!grid) {
    return;
  }

  grid.classList.toggle("grid--focus", focusedPanelIndex !== null);
  const rects = getAllCellBounds(focusedPanelIndex, {
    height: window.innerHeight,
    width: window.innerWidth,
  });

  rects.forEach((rect, index) => {
    const ui = panelUi[index];
    if (!ui) {
      return;
    }

    const shellRect = toShellPanelBounds(rect);
    ui.root.style.left = `${shellRect.x}px`;
    ui.root.style.top = `${shellRect.y}px`;
    ui.root.style.width = `${shellRect.width}px`;
    ui.root.style.height = `${shellRect.height}px`;
  });
}

function renderShellState(nextState: ShellState) {
  latestShellState = nextState;
  const focusChanged = currentFocusedPanelIndex !== nextState.focusedPanelIndex;
  currentFocusedPanelIndex = nextState.focusedPanelIndex;

  if (focusChanged) {
    applyPanelLayout(nextState.focusedPanelIndex);
  }

  nextState.panels.forEach((panel, index) => {
    const ui = panelUi[index];
    if (!ui) {
      return;
    }

    const hasUrl = Boolean(panel.url);
    const isActive = nextState.activePanelIndex === index;
    const isFocused = nextState.focusedPanelIndex === index;
    const hasAudio = nextState.audioPanelIndex === index;
    const isAudioLocked = nextState.audioLockedPanelIndex === index;
    const canTransferAudio =
      nextState.audioLockedPanelIndex !== null &&
      nextState.audioLockedPanelIndex !== index &&
      nextState.activePanelIndex === index;
    const controlsHidden = hasUrl && !panel.controlsVisible;

    if (controlsHidden && openSiteMenuIndex === index) {
      closeSiteMenus();
    }

    if (document.activeElement !== ui.input) {
      ui.input.value = panel.input;
    }
    ui.urlLine.textContent = panel.url || "No website loaded";
    ui.emptyState.hidden = hasUrl;

    ui.root.classList.toggle("panel--loaded", hasUrl);
    ui.root.classList.toggle("panel--active", isActive && !isFocused);
    ui.root.classList.toggle("panel--focused", isFocused);
    ui.root.classList.toggle("panel--controls-hidden", controlsHidden);
    ui.root.classList.toggle("panel--side", nextState.focusedPanelIndex !== null && !isFocused);
    ui.root.classList.toggle("panel--audio", hasAudio && !isAudioLocked);
    ui.root.classList.toggle("panel--audio-locked", isAudioLocked);
    ui.root.classList.toggle(
      "panel--video-fullscreen",
      nextState.videoFullscreenPanelIndex === index,
    );
    ui.root.dataset.active = isActive ? "true" : "false";
    ui.root.dataset.focused = isFocused ? "true" : "false";

    ui.focusButton.title = isFocused ? "Unfocus" : "Focus";
    ui.focusButton.setAttribute("aria-label", isFocused ? "Unfocus panel" : "Focus panel");
    ui.focusButton.classList.toggle("button--focus-active", isFocused);
    ui.audioBadge.hidden = !(hasAudio || canTransferAudio);
    ui.audioBadge.classList.toggle("panel__badge--audio-locked", isAudioLocked);
    ui.audioBadge.title = isAudioLocked
      ? "Audio locked to this panel — click to unlock"
      : canTransferAudio
        ? "Click to lock audio to this panel"
        : "Click to lock audio to this panel";
    ui.audioBadge.setAttribute(
      "aria-label",
      isAudioLocked ? "Unlock audio on this panel" : "Lock audio to this panel",
    );

    renderPanelTabs(ui, panel);

    if (isFocused) {
      ui.statusBadge.textContent = "Focus";
      ui.statusBadge.className = "panel__badge panel__badge--focus";
    } else if (isActive && hasUrl && !panel.isLoading && !panel.loadError) {
      ui.statusBadge.textContent = "Active";
      ui.statusBadge.className = "panel__badge panel__badge--active";
    } else if (panel.isLoading) {
      ui.statusBadge.textContent = "Loading";
      ui.statusBadge.className = "panel__badge panel__badge--loading";
    } else if (panel.loadError) {
      ui.statusBadge.textContent = "Error";
      ui.statusBadge.className = "panel__badge panel__badge--error";
    } else if (hasUrl) {
      ui.statusBadge.textContent = "Live";
      ui.statusBadge.className = "panel__badge panel__badge--live";
    } else {
      ui.statusBadge.textContent = "Ready";
      ui.statusBadge.className = "panel__badge";
    }

    if (panel.loadError && hasUrl) {
      ui.error.hidden = false;
      ui.error.textContent = panel.loadError;
    } else if (!panel.loadError) {
      ui.error.hidden = true;
      ui.error.textContent = "";
    }

    ui.backButton.toggleAttribute("disabled", !panel.canGoBack);
    ui.forwardButton.toggleAttribute("disabled", !panel.canGoForward);
    ui.refreshButton.toggleAttribute("disabled", !hasUrl);
    ui.externalButton.toggleAttribute("disabled", !hasUrl);

    if (openSiteMenuIndex === index) {
      ui.siteMenu.hidden = false;
      ui.historyButton.classList.add("button--history-active");
    } else {
      ui.siteMenu.hidden = true;
      ui.historyButton.classList.remove("button--history-active");
    }
  });
}

async function clearPanel(index: number) {
  const nextState = await window.fourScreen.clearPanel({ index });
  renderShellState(nextState);
}

async function toggleFocus(index: number) {
  const nextState =
    currentFocusedPanelIndex === index
      ? await window.fourScreen.unfocusPanel()
      : await window.fourScreen.focusPanel({ index });
  renderShellState(nextState);
}

function observeChromeHeight() {
  const report = () => {
    const heights = panelUi
      .map((ui) => Math.ceil(ui.chrome.getBoundingClientRect().height))
      .filter((height) => height > 0);
    if (heights.length === 0) {
      return;
    }
    void window.fourScreen.setChromeHeight(Math.max(...heights));
  };

  report();
  const observer = new ResizeObserver(report);
  panelUi.forEach((ui) => {
    observer.observe(ui.chrome);
    observer.observe(ui.tabRow);
  });
  window.addEventListener("resize", () => {
    applyPanelLayout(currentFocusedPanelIndex);
    report();
  });
}

async function bootstrap() {
  mountPanels();
  setupSiteMenuDismiss();
  applyPanelLayout(null);
  observeChromeHeight();
  const nextState = await window.fourScreen.getShellState();
  renderShellState(nextState);
  window.fourScreen.onShellStateUpdated(renderShellState);
}

void bootstrap();
