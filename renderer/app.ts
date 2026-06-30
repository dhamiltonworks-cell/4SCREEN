import type { FourScreenApi } from "../shared/ipc";
import { getAllCellBounds, toShellPanelBounds } from "../shared/layout";
import { getPanelSwapTarget } from "../shared/panel-move";
import {
  getShortcutFaviconUrl,
  getSiteDomainFromUrl,
  getSiteLabelFromUrl,
  SITE_SHORTCUTS,
  type SiteShortcut,
} from "../shared/site-shortcuts";
import { PANEL_COUNT, type HomepageTileState, type ShellState, type VisitHistoryEntryState } from "../shared/types";

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
  focusButton: HTMLButtonElement;
  form: HTMLFormElement;
  forwardButton: HTMLButtonElement;
  homepage: HTMLElement;
  homepageGrid: HTMLElement;
  homepageHistoryChevron: HTMLElement;
  homepageHistoryList: HTMLElement;
  homepageHistoryPanel: HTMLElement;
  homepageHistoryToggle: HTMLButtonElement;
  historyButton: HTMLButtonElement;
  homeButton: HTMLButtonElement;
  index: number;
  input: HTMLInputElement;
  loadButton: HTMLButtonElement;
  loadingState: HTMLElement;
  loadingText: HTMLElement;
  moveDownButton: HTMLButtonElement;
  moveLeftButton: HTMLButtonElement;
  moveRightButton: HTMLButtonElement;
  moveUpButton: HTMLButtonElement;
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
let renderedHomepageTilesKey = "";
let renderedVisitHistoryKey = "";
const homepageRenderedForPanel = new Set<number>();
const panelHadUrl: boolean[] = Array.from({ length: PANEL_COUNT }, () => false);
const panelOptimisticLoad: Array<{ label: string } | null> = Array.from(
  { length: PANEL_COUNT },
  () => null,
);
const homepageLoadInFlight = new Set<number>();
let homepageHistoryExpanded = false;

function getHomepageTilesKey(tiles: HomepageTileState[]) {
  return tiles.map((tile) => `${tile.id}|${tile.name}|${tile.url}`).join(";;");
}

function getVisitHistoryKey(entries: VisitHistoryEntryState[]) {
  return entries.map((entry) => `${entry.id}|${entry.title}|${entry.url}|${entry.visitedAt}`).join(";;");
}

function clearPanelOptimisticLoad(index: number) {
  panelOptimisticLoad[index] = null;
  homepageLoadInFlight.delete(index);
}

function reconcilePanelOptimisticLoad(
  index: number,
  panel: ShellState["panels"][number] | undefined,
) {
  const pending = panelOptimisticLoad[index];
  if (!pending || !panel) {
    return;
  }

  if (panel.url && !panel.isLoading) {
    clearPanelOptimisticLoad(index);
    return;
  }

  if (panel.loadError) {
    clearPanelOptimisticLoad(index);
  }
}

function updatePanelEmptyPresentation(
  ui: PanelUi,
  panel: ShellState["panels"][number] | undefined,
) {
  const pending = panelOptimisticLoad[ui.index];
  const hasUrl = Boolean(panel?.url);
  const isLoading = Boolean(
    pending || (hasUrl && panel?.isLoading && !panel.loadError),
  );
  const showHomepage = !hasUrl && !isLoading;
  const showLoading = isLoading;

  ui.homepage.hidden = !showHomepage;
  ui.loadingState.hidden = !showLoading;
  ui.homepageGrid.style.pointerEvents = showHomepage ? "" : "none";

  if (showLoading) {
    const label = pending?.label ?? (panel?.url ? getSiteLabelFromUrl(panel.url) : "site");
    ui.loadingText.textContent = `Loading ${label}...`;
  }

  ui.emptyState.hidden = !showHomepage && !showLoading;
  ui.root.classList.toggle("panel--loaded", hasUrl);
  ui.root.classList.toggle("panel--loading", showLoading);
}

function launchPanelFromQuickLaunch(ui: PanelUi, url: string, label: string) {
  if (homepageLoadInFlight.has(ui.index)) {
    return;
  }

  homepageLoadInFlight.add(ui.index);
  panelOptimisticLoad[ui.index] = { label };
  // Visual-only: hide Quick Launch immediately; does not change focus or navigation.
  updatePanelEmptyPresentation(ui, latestShellState?.panels[ui.index]);
  void loadPanel(ui.index, url);
}

function formatVisitTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function syncHomepageViews(state: ShellState) {
  const nextKey = getHomepageTilesKey(state.homepageTiles);
  const visitKey = getVisitHistoryKey(state.visitHistory);
  const tilesChanged = nextKey !== renderedHomepageTilesKey;
  const visitChanged = visitKey !== renderedVisitHistoryKey;
  if (tilesChanged) {
    renderedHomepageTilesKey = nextKey;
    homepageRenderedForPanel.clear();
  }
  if (visitChanged) {
    renderedVisitHistoryKey = visitKey;
    homepageRenderedForPanel.clear();
  }

  state.panels.forEach((panel, index) => {
    if (panel.url || panelOptimisticLoad[index]) {
      homepageRenderedForPanel.delete(index);
      return;
    }

    if (!tilesChanged && !visitChanged && homepageRenderedForPanel.has(index)) {
      return;
    }

    const ui = panelUi[index];
    if (ui) {
      renderHomepageGrid(ui.homepageGrid, state.homepageTiles);
      renderHomepageHistory(ui, state.visitHistory);
      homepageRenderedForPanel.add(index);
    }
  });
}

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

function createSiteIcon(
  name: string,
  domain: string,
  shortcut?: SiteShortcut,
  large = false,
  compact = false,
) {
  const icon = document.createElement("span");
  icon.className = compact
    ? "panel__site-icon panel__site-icon--compact"
    : large
      ? "panel__site-icon panel__site-icon--large"
      : "panel__site-icon";

  const image = document.createElement("img");
  image.className = compact
    ? "panel__site-icon-image panel__site-icon-image--compact"
    : large
      ? "panel__site-icon-image panel__site-icon-image--large"
      : "panel__site-icon-image";
  image.alt = "";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.src = getShortcutFaviconUrl(domain, compact ? 32 : large ? 64 : 32);
  image.addEventListener("error", () => {
    image.remove();
    if (shortcut?.fallbackBadge) {
      appendSiteIconFallback(
        icon,
        shortcut.fallbackBadge,
        compact
          ? `${shortcut.fallbackClass ?? ""} panel__site-icon-fallback--compact`.trim()
          : large
            ? `${shortcut.fallbackClass ?? ""} panel__site-icon-fallback--large`.trim()
            : shortcut.fallbackClass,
      );
      return;
    }
    appendSiteIconFallback(
      icon,
      name.slice(0, 1).toUpperCase(),
      compact ? "panel__site-icon-fallback--compact" : large ? "panel__site-icon-fallback--large" : undefined,
    );
  });

  icon.append(image);
  return icon;
}

function renderHomepageGrid(grid: HTMLElement, tiles: HomepageTileState[]) {
  grid.innerHTML = "";

  const savedSites = tiles.filter((tile) => tile.custom);
  grid.classList.toggle("panel__homepage-grid--empty", savedSites.length === 0);
  grid.classList.toggle("panel__homepage-grid--has-tiles", savedSites.length > 0);

  savedSites.forEach((tile) => {
    const wrap = document.createElement("div");
    wrap.className = "panel__homepage-tile-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel__homepage-tile";
    button.dataset.homepageUrl = tile.url;
    button.dataset.homepageTileId = tile.id;
    button.dataset.homepageCustom = tile.custom ? "true" : "false";
    button.title = tile.name;
    button.setAttribute("aria-label", tile.name);
    button.append(
      createSiteIcon(tile.name, tile.domain, tile, false, true),
    );

    const label = document.createElement("span");
    label.className = "panel__homepage-label";
    label.textContent = tile.name;
    button.append(label);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "panel__homepage-tile-delete";
    deleteButton.dataset.homepageDelete = "true";
    deleteButton.title = `Remove ${tile.name}`;
    deleteButton.setAttribute("aria-label", `Remove ${tile.name}`);
    deleteButton.innerHTML = '<span class="panel__homepage-tile-delete-icon" aria-hidden="true">🗑</span>';
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void deleteHomepageTile({ id: tile.id, label: tile.name });
    });

    wrap.append(button, deleteButton);
    grid.append(wrap);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "panel__homepage-tile panel__homepage-tile--add";
  addButton.dataset.homepageAdd = "true";
  addButton.title = "Add custom site";
  addButton.setAttribute("aria-label", "Add custom site");

  const addIcon = document.createElement("span");
  addIcon.className = "panel__homepage-add-icon";
  addIcon.textContent = "+";
  addButton.append(addIcon);

  const addLabel = document.createElement("span");
  addLabel.className = "panel__homepage-label";
  addLabel.textContent = "Add";
  addButton.append(addLabel);
  addButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openAddHomepageModal();
  });
  grid.append(addButton);
}

function updateHomepageHistoryVisibility(ui: PanelUi) {
  ui.homepageHistoryPanel.hidden = !homepageHistoryExpanded;
  ui.homepageHistoryChevron.textContent = homepageHistoryExpanded ? "▲" : "▼";
  ui.homepageHistoryToggle.setAttribute(
    "aria-expanded",
    homepageHistoryExpanded ? "true" : "false",
  );
}

function renderHomepageHistory(ui: PanelUi, entries: VisitHistoryEntryState[]) {
  const list = ui.homepageHistoryList;
  list.innerHTML = "";
  updateHomepageHistoryVisibility(ui);

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "panel__homepage-history-empty";
    empty.textContent = "Visited sites will appear here.";
    list.append(empty);
    return;
  }

  entries.forEach((entry) => {
    const domain = getSiteDomainFromUrl(entry.url) || entry.title;
    const row = document.createElement("div");
    row.className = "panel__homepage-history-item";
    row.dataset.visitId = entry.id;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "panel__homepage-history-open";
    openButton.dataset.visitUrl = entry.url;
    openButton.title = entry.url;

    const head = document.createElement("div");
    head.className = "panel__homepage-history-head";
    head.append(createSiteIcon(entry.title, domain));

    const copy = document.createElement("div");
    copy.className = "panel__homepage-history-copy";

    const title = document.createElement("span");
    title.className = "panel__homepage-history-title";
    title.textContent = entry.title;

    const meta = document.createElement("span");
    meta.className = "panel__homepage-history-meta";
    meta.textContent = `${formatVisitTime(entry.visitedAt)} · ${entry.url}`;

    copy.append(title, meta);
    head.append(copy);
    openButton.append(head);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "panel__homepage-history-add";
    addButton.dataset.visitAddId = entry.id;
    addButton.title = "Add to Homepage";
    addButton.setAttribute("aria-label", `Add ${entry.title} to Homepage`);
    addButton.textContent = "+";

    row.append(openButton, addButton);
    list.append(row);
  });
}

let homepageContextMenu: HTMLElement | null = null;
let homepageContextMenuEditItem: HTMLButtonElement | null = null;
let homepageContextTile: {
  custom: boolean;
  id: string;
  label: string;
  panelIndex: number;
  url: string;
} | null = null;
let historyContextVisitId: string | null = null;

function hideHomepageContextMenus() {
  hideHomepageTileContextMenu();
  hideHistoryContextMenu();
}

function hideHomepageTileContextMenu() {
  if (!homepageContextMenu) {
    return;
  }
  homepageContextMenu.hidden = true;
  homepageContextTile = null;
}

function hideHistoryContextMenu() {
  if (!historyContextMenu) {
    return;
  }
  historyContextMenu.hidden = true;
  historyContextVisitId = null;
}

let historyContextMenu: HTMLElement | null = null;

function ensureHomepageContextMenu() {
  if (homepageContextMenu) {
    return homepageContextMenu;
  }

  const menu = document.createElement("div");
  menu.className = "panel__homepage-context-menu";
  menu.hidden = true;
  menu.innerHTML = `
    <button type="button" class="panel__homepage-context-menu-item panel__homepage-context-menu-item--default" data-action="open-tile">Open</button>
    <button type="button" class="panel__homepage-context-menu-item panel__homepage-context-menu-item--default" data-action="edit-tile" data-role="edit-item">Edit</button>
    <button type="button" class="panel__homepage-context-menu-item panel__homepage-context-menu-item--danger" data-action="delete-tile">Delete</button>
    <button type="button" class="panel__homepage-context-menu-item panel__homepage-context-menu-item--muted" data-action="cancel-tile">Cancel</button>
  `;
  document.body.append(menu);
  homepageContextMenuEditItem = menu.querySelector<HTMLButtonElement>('[data-role="edit-item"]');

  menu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const context = homepageContextTile;
    if (!context) {
      hideHomepageTileContextMenu();
      return;
    }

    if (target.closest('[data-action="cancel-tile"]')) {
      hideHomepageTileContextMenu();
      return;
    }

    if (target.closest('[data-action="open-tile"]')) {
      const ui = panelUi[context.panelIndex];
      if (ui) {
        launchPanelFromQuickLaunch(ui, context.url, context.label);
      }
    } else if (target.closest('[data-action="edit-tile"]') && context.custom) {
      const tile = latestShellState?.homepageTiles.find((entry) => entry.id === context.id);
      if (tile) {
        openEditHomepageModal(tile);
      }
    } else if (target.closest('[data-action="delete-tile"]')) {
      void deleteHomepageTile({ id: context.id, label: context.label });
    }

    hideHomepageTileContextMenu();
  });

  homepageContextMenu = menu;
  return menu;
}

function ensureHistoryContextMenu() {
  if (historyContextMenu) {
    return historyContextMenu;
  }

  const menu = document.createElement("div");
  menu.className = "panel__homepage-context-menu";
  menu.hidden = true;
  menu.innerHTML =
    '<button type="button" class="panel__homepage-context-menu-item panel__homepage-context-menu-item--add" data-action="add-from-history">Add to Homepage</button>';
  document.body.append(menu);

  menu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest('[data-action="add-from-history"]') && historyContextVisitId) {
      void addHomepageFromVisit(historyContextVisitId);
    }
    hideHistoryContextMenu();
  });

  historyContextMenu = menu;
  return menu;
}

function setupHomepageContextDismiss() {
  document.addEventListener("click", (event) => {
    if (
      homepageContextMenu &&
      event.target instanceof Node &&
      !homepageContextMenu.contains(event.target)
    ) {
      hideHomepageTileContextMenu();
    }
    if (
      historyContextMenu &&
      event.target instanceof Node &&
      !historyContextMenu.contains(event.target)
    ) {
      hideHistoryContextMenu();
    }
  });
  document.addEventListener("contextmenu", (event) => {
    if (
      homepageContextMenu &&
      event.target instanceof Node &&
      !homepageContextMenu.contains(event.target)
    ) {
      hideHomepageTileContextMenu();
    }
    if (
      historyContextMenu &&
      event.target instanceof Node &&
      !historyContextMenu.contains(event.target)
    ) {
      hideHistoryContextMenu();
    }
  });
}

function showHomepageContextMenu(
  ui: PanelUi,
  tile: { custom: boolean; id: string; label: string; url: string },
  x: number,
  y: number,
) {
  hideHomepageContextMenus();
  const menu = ensureHomepageContextMenu();
  homepageContextTile = {
    custom: tile.custom,
    id: tile.id,
    label: tile.label,
    panelIndex: ui.index,
    url: tile.url,
  };
  if (homepageContextMenuEditItem) {
    homepageContextMenuEditItem.hidden = !tile.custom;
  }
  menu.hidden = false;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function showHistoryContextMenu(visitId: string, x: number, y: number) {
  hideHomepageContextMenus();
  const menu = ensureHistoryContextMenu();
  historyContextVisitId = visitId;
  menu.hidden = false;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

let addHomepageModal: HTMLElement | null = null;
let addHomepageModalTitle: HTMLElement | null = null;
let addHomepageNameInput: HTMLInputElement | null = null;
let addHomepageUrlInput: HTMLInputElement | null = null;
let addHomepageModalError: HTMLElement | null = null;
let editingHomepageTileId: string | null = null;

function ensureAddHomepageModal() {
  if (addHomepageModal) {
    return addHomepageModal;
  }

  const modal = document.createElement("div");
  modal.className = "homepage-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <button type="button" class="homepage-modal__backdrop" data-action="cancel" aria-label="Close"></button>
    <div class="homepage-modal__card" role="dialog" aria-modal="true" aria-labelledby="homepage-modal-title">
      <h2 class="homepage-modal__title" id="homepage-modal-title">Add to Quick Launch</h2>
      <label class="homepage-modal__field">
        <span class="homepage-modal__label">Website Name</span>
        <input class="homepage-modal__input" data-role="name" type="text" placeholder="ESPN" />
      </label>
      <label class="homepage-modal__field">
        <span class="homepage-modal__label">Website URL</span>
        <input class="homepage-modal__input" data-role="url" type="url" placeholder="https://espn.com" />
      </label>
      <p class="homepage-modal__error" data-role="error" hidden></p>
      <div class="homepage-modal__actions">
        <button type="button" class="homepage-modal__button" data-action="cancel">Cancel</button>
        <button type="button" class="homepage-modal__button homepage-modal__button--primary" data-action="save">Save</button>
      </div>
    </div>
  `;
  document.body.append(modal);

  addHomepageNameInput = modal.querySelector<HTMLInputElement>('[data-role="name"]');
  addHomepageUrlInput = modal.querySelector<HTMLInputElement>('[data-role="url"]');
  addHomepageModalError = modal.querySelector<HTMLElement>('[data-role="error"]');
  addHomepageModalTitle = modal.querySelector<HTMLElement>("#homepage-modal-title");

  modal.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('[data-action="cancel"]')) {
      closeAddHomepageModal();
      return;
    }
    if (target.closest('[data-action="save"]')) {
      void submitAddHomepageModal();
    }
  });

  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAddHomepageModal();
    }
    if (event.key === "Enter" && addHomepageModal && !addHomepageModal.hidden) {
      event.preventDefault();
      void submitAddHomepageModal();
    }
  });

  addHomepageModal = modal;
  return modal;
}

function showHomepageModalError(message: string) {
  if (!addHomepageModalError) {
    return;
  }
  addHomepageModalError.hidden = false;
  addHomepageModalError.textContent = message;
}

function clearHomepageModalError() {
  if (!addHomepageModalError) {
    return;
  }
  addHomepageModalError.hidden = true;
  addHomepageModalError.textContent = "";
}

function openAddHomepageModal(prefill?: { name?: string; url?: string }) {
  editingHomepageTileId = null;
  if (addHomepageModalTitle) {
    addHomepageModalTitle.textContent = "Add to Quick Launch";
  }
  const modal = ensureAddHomepageModal();
  clearHomepageModalError();
  if (addHomepageNameInput) {
    addHomepageNameInput.value = prefill?.name ?? "";
  }
  if (addHomepageUrlInput) {
    addHomepageUrlInput.value = prefill?.url ?? "https://";
  }
  modal.hidden = false;
  window.setTimeout(() => {
    if (prefill?.name && addHomepageUrlInput) {
      addHomepageUrlInput.focus();
      addHomepageUrlInput.select();
      return;
    }
    addHomepageNameInput?.focus();
  }, 0);
}

function openEditHomepageModal(tile: HomepageTileState) {
  editingHomepageTileId = tile.id;
  if (addHomepageModalTitle) {
    addHomepageModalTitle.textContent = "Edit Quick Launch Tile";
  }
  const modal = ensureAddHomepageModal();
  clearHomepageModalError();
  if (addHomepageNameInput) {
    addHomepageNameInput.value = tile.name;
  }
  if (addHomepageUrlInput) {
    addHomepageUrlInput.value = tile.url;
  }
  modal.hidden = false;
  window.setTimeout(() => {
    addHomepageNameInput?.focus();
    addHomepageNameInput?.select();
  }, 0);
}

function closeAddHomepageModal() {
  if (!addHomepageModal) {
    return;
  }
  addHomepageModal.hidden = true;
  editingHomepageTileId = null;
  clearHomepageModalError();
}

async function deleteHomepageTile(tile: { id: string; label: string }) {
  const confirmed = window.confirm(`Remove "${tile.label}" from Quick Launch?`);
  if (!confirmed) {
    return;
  }

  try {
    const nextState = await window.fourScreen.removeHomepageTile({ tileId: tile.id });
    renderShellState(nextState);
  } catch (error) {
    openAddHomepageModal();
    showHomepageModalError(
      error instanceof Error ? error.message : "Unable to remove homepage icon.",
    );
  }
}

async function submitAddHomepageModal() {
  const name = addHomepageNameInput?.value.trim() ?? "";
  const url = addHomepageUrlInput?.value.trim() ?? "";
  if (!name) {
    showHomepageModalError("Enter a website name.");
    addHomepageNameInput?.focus();
    return;
  }
  if (!url) {
    showHomepageModalError("Enter a website URL.");
    addHomepageUrlInput?.focus();
    return;
  }

  try {
    const nextState = editingHomepageTileId
      ? await window.fourScreen.updateHomepageTile({
          name,
          tileId: editingHomepageTileId,
          url,
        })
      : await window.fourScreen.addHomepageTile({ name, url });
    closeAddHomepageModal();
    renderShellState(nextState);
  } catch (error) {
    showHomepageModalError(error instanceof Error ? error.message : "Unable to save homepage icon.");
  }
}

async function addHomepageFromVisit(visitId: string) {
  try {
    const nextState = await window.fourScreen.addHomepageTileFromVisit({ visitId });
    renderShellState(nextState);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to add this site to the homepage.";
    openAddHomepageModal();
    showHomepageModalError(message);
  }
}

function bindHomepage(ui: PanelUi) {
  ui.homepageHistoryToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    homepageHistoryExpanded = !homepageHistoryExpanded;
    panelUi.forEach((panelUiEntry) => {
      updateHomepageHistoryVisibility(panelUiEntry);
    });
  });

  ui.homepageGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("[data-homepage-delete]")) {
      return;
    }

    const tile = target.closest<HTMLButtonElement>("[data-homepage-url]");
    if (tile?.dataset.homepageUrl) {
      event.preventDefault();
      event.stopPropagation();
      const label =
        tile.querySelector<HTMLElement>(".panel__homepage-label")?.textContent?.trim() ||
        getSiteLabelFromUrl(tile.dataset.homepageUrl);
      launchPanelFromQuickLaunch(ui, tile.dataset.homepageUrl, label);
    }
  });

  ui.homepageGrid.addEventListener("contextmenu", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const tile = target.closest<HTMLButtonElement>("[data-homepage-url]");
    if (!tile?.dataset.homepageTileId || !tile.dataset.homepageUrl) {
      return;
    }

    event.preventDefault();
    const label =
      tile.querySelector<HTMLElement>(".panel__homepage-label")?.textContent?.trim() ||
      getSiteLabelFromUrl(tile.dataset.homepageUrl);
    showHomepageContextMenu(
      ui,
      {
        custom: tile.dataset.homepageCustom === "true",
        id: tile.dataset.homepageTileId,
        label,
        url: tile.dataset.homepageUrl,
      },
      event.clientX,
      event.clientY,
    );
  });

  ui.homepageHistoryList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const addButton = target.closest<HTMLButtonElement>("[data-visit-add-id]");
    if (addButton?.dataset.visitAddId) {
      event.preventDefault();
      event.stopPropagation();
      void addHomepageFromVisit(addButton.dataset.visitAddId);
      return;
    }

    const openButton = target.closest<HTMLButtonElement>(".panel__homepage-history-open");
    if (openButton?.dataset.visitUrl) {
      event.preventDefault();
      event.stopPropagation();
      const label =
        openButton.querySelector<HTMLElement>(".panel__homepage-history-title")?.textContent?.trim() ||
        getSiteLabelFromUrl(openButton.dataset.visitUrl);
      launchPanelFromQuickLaunch(ui, openButton.dataset.visitUrl, label);
    }
  });

  ui.homepageHistoryList.addEventListener("contextmenu", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const item = target.closest<HTMLElement>(".panel__homepage-history-item");
    if (item?.dataset.visitId) {
      event.preventDefault();
      showHistoryContextMenu(item.dataset.visitId, event.clientX, event.clientY);
    }
  });
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
    clearPanelOptimisticLoad(index);
    updatePanelEmptyPresentation(ui, latestShellState?.panels[index]);
    ui.error.hidden = false;
    ui.error.textContent = error instanceof Error ? error.message : "Unable to load this URL.";
  } finally {
    if (!panelOptimisticLoad[index]) {
      homepageLoadInFlight.delete(index);
    }
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
            <button type="button" class="panel__badge panel__badge--audio" data-role="audio-badge">Audio Lock</button>
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
              <button class="button button--icon button--home" data-action="home" type="button" aria-label="Home" title="Home">⌂</button>
              <button class="button button--icon button--history" data-action="history" type="button" aria-label="History and shortcuts" title="History & shortcuts">⏱</button>
              <button class="button button--icon button--load" data-action="load" type="submit" aria-label="Load" title="Load">⏎</button>
              <button class="button button--icon button--focus" data-action="focus" type="button" aria-label="Focus panel" title="Focus">◎</button>
              <div class="panel__move-pad" aria-label="Move panel">
                <span class="panel__move-pad-spacer" aria-hidden="true"></span>
                <button class="panel__move-btn" data-action="move-up" type="button" aria-label="Move panel up" title="Move up">↑</button>
                <span class="panel__move-pad-spacer" aria-hidden="true"></span>
                <button class="panel__move-btn" data-action="move-left" type="button" aria-label="Move panel left" title="Move left">←</button>
                <span class="panel__move-pad-dot" aria-hidden="true"></span>
                <button class="panel__move-btn" data-action="move-right" type="button" aria-label="Move panel right" title="Move right">→</button>
                <span class="panel__move-pad-spacer" aria-hidden="true"></span>
                <button class="panel__move-btn" data-action="move-down" type="button" aria-label="Move panel down" title="Move down">↓</button>
                <span class="panel__move-pad-spacer" aria-hidden="true"></span>
              </div>
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
          <div class="panel__homepage" data-role="homepage">
            <p class="panel__homepage-title">Quick Launch</p>
            <div class="panel__homepage-grid" data-role="homepage-grid"></div>
            <div class="panel__homepage-history">
              <button
                type="button"
                class="panel__homepage-history-toggle"
                data-role="history-toggle"
                aria-expanded="false"
              >
                History <span class="panel__homepage-history-chevron" data-role="history-chevron">▼</span>
              </button>
              <div class="panel__homepage-history-panel" data-role="homepage-history-panel" hidden>
                <div class="panel__homepage-history-list" data-role="homepage-history-list"></div>
              </div>
            </div>
          </div>
          <div class="panel__loading" data-role="loading" hidden>
            <p class="panel__loading-text" data-role="loading-text">Loading...</p>
          </div>
        </div>
      </div>
    `;

    const chrome = root.querySelector<HTMLElement>('[data-role="chrome"]');
    const form = root.querySelector<HTMLFormElement>('[data-role="form"]');
    const input = root.querySelector<HTMLInputElement>(".panel__input");
    const error = root.querySelector<HTMLElement>('[data-role="error"]');
    const urlLine = root.querySelector<HTMLElement>('[data-role="url"]');
    const emptyState = root.querySelector<HTMLElement>('[data-role="empty"]');
    const homepage = root.querySelector<HTMLElement>('[data-role="homepage"]');
    const homepageGrid = root.querySelector<HTMLElement>('[data-role="homepage-grid"]');
    const loadingState = root.querySelector<HTMLElement>('[data-role="loading"]');
    const loadingText = root.querySelector<HTMLElement>('[data-role="loading-text"]');
    const homepageHistoryList = root.querySelector<HTMLElement>('[data-role="homepage-history-list"]');
    const homepageHistoryToggle = root.querySelector<HTMLButtonElement>('[data-role="history-toggle"]');
    const homepageHistoryPanel = root.querySelector<HTMLElement>('[data-role="homepage-history-panel"]');
    const homepageHistoryChevron = root.querySelector<HTMLElement>('[data-role="history-chevron"]');
    const homeButton = root.querySelector<HTMLButtonElement>('[data-action="home"]');
    const focusButton = root.querySelector<HTMLButtonElement>('[data-action="focus"]');
    const backButton = root.querySelector<HTMLButtonElement>('[data-action="back"]');
    const forwardButton = root.querySelector<HTMLButtonElement>('[data-action="forward"]');
    const refreshButton = root.querySelector<HTMLButtonElement>('[data-action="refresh"]');
    const historyButton = root.querySelector<HTMLButtonElement>('[data-action="history"]');
    const loadButton = root.querySelector<HTMLButtonElement>('[data-action="load"]');
    const moveUpButton = root.querySelector<HTMLButtonElement>('[data-action="move-up"]');
    const moveDownButton = root.querySelector<HTMLButtonElement>('[data-action="move-down"]');
    const moveLeftButton = root.querySelector<HTMLButtonElement>('[data-action="move-left"]');
    const moveRightButton = root.querySelector<HTMLButtonElement>('[data-action="move-right"]');
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
      !homepage ||
      !homepageGrid ||
      !loadingState ||
      !loadingText ||
      !homepageHistoryList ||
      !homepageHistoryToggle ||
      !homepageHistoryPanel ||
      !homepageHistoryChevron ||
      !homeButton ||
      !focusButton ||
      !backButton ||
      !forwardButton ||
      !refreshButton ||
      !historyButton ||
      !loadButton ||
      !moveUpButton ||
      !moveDownButton ||
      !moveLeftButton ||
      !moveRightButton ||
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

    homeButton.addEventListener("click", () => {
      void clearPanel(index);
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

    focusButton.addEventListener("click", () => {
      void toggleFocus(index);
    });

    moveUpButton.addEventListener("click", () => {
      void movePanel(index, "up");
    });
    moveDownButton.addEventListener("click", () => {
      void movePanel(index, "down");
    });
    moveLeftButton.addEventListener("click", () => {
      void movePanel(index, "left");
    });
    moveRightButton.addEventListener("click", () => {
      void movePanel(index, "right");
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
      focusButton,
      form,
      forwardButton,
      homepage,
      homepageGrid,
      homepageHistoryChevron,
      homepageHistoryList,
      homepageHistoryPanel,
      homepageHistoryToggle,
      homeButton,
      historyButton,
      index,
      input,
      loadButton,
      loadingState,
      loadingText,
      moveDownButton,
      moveLeftButton,
      moveRightButton,
      moveUpButton,
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
    bindHomepage(panelUi[index]);

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

  let chromeLayoutChanged = false;

  nextState.panels.forEach((panel, index) => {
    const ui = panelUi[index];
    if (!ui) {
      return;
    }

    const hasUrl = Boolean(panel.url);
    if (panelHadUrl[index] !== hasUrl) {
      panelHadUrl[index] = hasUrl;
      chromeLayoutChanged = true;
    }
    const isActive = nextState.activePanelIndex === index;
    const isFocused = nextState.focusedPanelIndex === index;
    const hasAudio = nextState.audioPanelIndex === index;
    const isAudioLocked = nextState.audioLockedPanelIndex === index;
    const controlsHidden = hasUrl && !panel.controlsVisible;

    if (controlsHidden && openSiteMenuIndex === index) {
      closeSiteMenus();
    }

    if (document.activeElement !== ui.input) {
      ui.input.value = panel.input;
    }
    ui.urlLine.textContent = panel.url || "No website loaded";
    reconcilePanelOptimisticLoad(index, panel);
    updatePanelEmptyPresentation(ui, panel);

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
    ui.audioBadge.hidden = false;
    ui.audioBadge.disabled = !hasUrl;
    ui.audioBadge.textContent = isAudioLocked ? "Audio Locked" : "Audio Lock";
    ui.audioBadge.classList.toggle("panel__badge--audio-locked", isAudioLocked);
    ui.audioBadge.title = isAudioLocked
      ? "Audio locked to this screen — click to unlock"
      : "Lock audio to this screen";
    ui.audioBadge.setAttribute(
      "aria-label",
      isAudioLocked ? "Audio Locked — click to unlock" : "Audio Lock",
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
    ui.moveUpButton.disabled = getPanelSwapTarget(index, "up") === null;
    ui.moveDownButton.disabled = getPanelSwapTarget(index, "down") === null;
    ui.moveLeftButton.disabled = getPanelSwapTarget(index, "left") === null;
    ui.moveRightButton.disabled = getPanelSwapTarget(index, "right") === null;

    if (openSiteMenuIndex === index) {
      ui.siteMenu.hidden = false;
      ui.historyButton.classList.add("button--history-active");
    } else {
      ui.siteMenu.hidden = true;
      ui.historyButton.classList.remove("button--history-active");
    }
  });

  syncHomepageViews(nextState);
  if (chromeLayoutChanged) {
    requestAnimationFrame(() => reportChromeHeight?.());
  }
}

async function movePanel(index: number, direction: "down" | "left" | "right" | "up") {
  const nextState = await window.fourScreen.movePanel({ direction, index });
  renderShellState(nextState);
}

async function clearPanel(index: number) {
  clearPanelOptimisticLoad(index);
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

let reportChromeHeight: (() => void) | null = null;
let lastReportedChromeHeight = 0;

function observeChromeHeight() {
  const report = () => {
    const heights = panelUi
      .map((ui) => {
        const height = Math.ceil(ui.chrome.getBoundingClientRect().height);
        if (height > 0) {
          ui.root.style.setProperty("--panel-chrome-height", `${height}px`);
        }
        return height;
      })
      .filter((height) => height > 0);
    if (heights.length === 0) {
      return;
    }
    const maxHeight = Math.max(...heights);
    document.documentElement.style.setProperty("--panel-chrome-height", `${maxHeight}px`);
    if (maxHeight === lastReportedChromeHeight) {
      return;
    }
    lastReportedChromeHeight = maxHeight;
    void window.fourScreen.setChromeHeight(maxHeight);
  };

  reportChromeHeight = report;

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
  setupHomepageContextDismiss();
  ensureAddHomepageModal();
  applyPanelLayout(null);
  observeChromeHeight();
  const nextState = await window.fourScreen.getShellState();
  renderShellState(nextState);
  window.fourScreen.onShellStateUpdated(renderShellState);
}

void bootstrap();
