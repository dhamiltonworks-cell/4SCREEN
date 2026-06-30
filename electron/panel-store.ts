import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildHomepageTiles,
  createCustomHomepageTile,
  createEmptyHomepageConfig,
  isUrlOnHomepage,
  isUrlOnHomepageExcept,
  sanitizeHomepageConfig,
  type CustomHomepageTile,
  type HomepageTileView,
  type StoredHomepageConfig,
} from "../shared/homepage";
import {
  addUrlToPanelHistory,
  createEmptyPanelHistory,
  sanitizePanelHistory,
} from "../shared/panel-history";
import {
  findVisitHistoryEntry,
  recordVisitHistory,
  sanitizeVisitHistory,
  type VisitHistoryEntry,
} from "../shared/visit-history";
import { PANEL_COUNT } from "../shared/types";
import { getSiteDomainFromUrl } from "../shared/site-shortcuts";
import { preparePanelUrl } from "../shared/url";

type StoredPanels = {
  history?: string[][];
  homepage?: StoredHomepageConfig;
  urls: string[];
  visitHistory?: VisitHistoryEntry[];
};

const FILE_NAME = "panels.json";

function getStorePath() {
  const directory = app.getPath("userData");
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  return path.join(directory, FILE_NAME);
}

function readStoredPanels(): StoredPanels {
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    return {
      history: createEmptyPanelHistory(),
      homepage: createEmptyHomepageConfig(),
      urls: Array.from({ length: PANEL_COUNT }, () => ""),
      visitHistory: [],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as StoredPanels;
    return {
      history: sanitizePanelHistory(parsed.history),
      homepage: sanitizeHomepageConfig(parsed.homepage),
      urls: Array.isArray(parsed.urls)
        ? Array.from({ length: PANEL_COUNT }, (_, index) =>
            typeof parsed.urls[index] === "string" ? parsed.urls[index] : "",
          )
        : Array.from({ length: PANEL_COUNT }, () => ""),
      visitHistory: sanitizeVisitHistory(parsed.visitHistory),
    };
  } catch {
    return {
      history: createEmptyPanelHistory(),
      homepage: createEmptyHomepageConfig(),
      urls: Array.from({ length: PANEL_COUNT }, () => ""),
      visitHistory: [],
    };
  }
}

function writeStoredPanels(
  urls: string[],
  history: string[][],
  homepage: StoredHomepageConfig,
  visitHistory: VisitHistoryEntry[],
) {
  const payload: StoredPanels = {
    history: sanitizePanelHistory(history),
    homepage: sanitizeHomepageConfig(homepage),
    urls: Array.from({ length: PANEL_COUNT }, (_, index) => urls[index] ?? ""),
    visitHistory: sanitizeVisitHistory(visitHistory),
  };
  writeFileSync(getStorePath(), JSON.stringify(payload, null, 2), "utf8");
}

function readVisitHistoryFromStore(): VisitHistoryEntry[] {
  return readStoredPanels().visitHistory ?? [];
}

export function readStoredUrls(): string[] {
  return readStoredPanels().urls;
}

export function readStoredPanelHistory(): string[][] {
  return readStoredPanels().history ?? createEmptyPanelHistory();
}

export function readStoredHomepageConfig(): StoredHomepageConfig {
  return readStoredPanels().homepage ?? createEmptyHomepageConfig();
}

export function readStoredVisitHistory(): VisitHistoryEntry[] {
  return readVisitHistoryFromStore();
}

export function readVisibleHomepageTiles(): HomepageTileView[] {
  return buildHomepageTiles(readStoredHomepageConfig());
}

export function writeStoredUrls(urls: string[]) {
  const stored = readStoredPanels();
  writeStoredPanels(
    urls,
    stored.history ?? createEmptyPanelHistory(),
    stored.homepage ?? createEmptyHomepageConfig(),
    stored.visitHistory ?? [],
  );
}

export function writeStoredPanelHistory(history: string[][]) {
  const stored = readStoredPanels();
  writeStoredPanels(
    stored.urls,
    history,
    stored.homepage ?? createEmptyHomepageConfig(),
    stored.visitHistory ?? [],
  );
}

export function writeStoredHomepageConfig(homepage: StoredHomepageConfig) {
  const stored = readStoredPanels();
  writeStoredPanels(
    stored.urls,
    stored.history ?? createEmptyPanelHistory(),
    homepage,
    stored.visitHistory ?? [],
  );
}

export function recordStoredPanelHistory(panelIndex: number, url: string) {
  const stored = readStoredPanels();
  const history = stored.history ?? createEmptyPanelHistory();
  const nextHistory = history.map((entries, index) =>
    index === panelIndex ? addUrlToPanelHistory(entries, url) : entries,
  );
  writeStoredPanels(
    stored.urls,
    nextHistory,
    stored.homepage ?? createEmptyHomepageConfig(),
    stored.visitHistory ?? [],
  );
  return nextHistory;
}

export function recordStoredVisitHistory(url: string, title: string): VisitHistoryEntry[] {
  const stored = readStoredPanels();
  const nextVisitHistory = recordVisitHistory(stored.visitHistory ?? [], url, title);
  writeStoredPanels(
    stored.urls,
    stored.history ?? createEmptyPanelHistory(),
    stored.homepage ?? createEmptyHomepageConfig(),
    nextVisitHistory,
  );
  return nextVisitHistory;
}

export function clearStoredPanelHistory(panelIndex: number) {
  const stored = readStoredPanels();
  const history = stored.history ?? createEmptyPanelHistory();
  const nextHistory = history.map((entries, index) => (index === panelIndex ? [] : entries));
  writeStoredPanels(
    stored.urls,
    nextHistory,
    stored.homepage ?? createEmptyHomepageConfig(),
    stored.visitHistory ?? [],
  );
  return nextHistory;
}

export function addStoredHomepageTile(name: string, url: string): HomepageTileView[] {
  const stored = readStoredPanels();
  const homepage = stored.homepage ?? createEmptyHomepageConfig();
  if (isUrlOnHomepage(homepage, url)) {
    return buildHomepageTiles(homepage);
  }

  const tile = createCustomHomepageTile(name, url);
  const nextHomepage: StoredHomepageConfig = {
    ...homepage,
    customTiles: [...homepage.customTiles, tile],
  };
  writeStoredPanels(
    stored.urls,
    stored.history ?? createEmptyPanelHistory(),
    nextHomepage,
    stored.visitHistory ?? [],
  );
  return buildHomepageTiles(nextHomepage);
}

export function addStoredHomepageTileFromVisit(entryId: string): HomepageTileView[] {
  const stored = readStoredPanels();
  const visit = findVisitHistoryEntry(stored.visitHistory ?? [], entryId);
  if (!visit) {
    return buildHomepageTiles(stored.homepage ?? createEmptyHomepageConfig());
  }
  return addStoredHomepageTile(visit.title, visit.url);
}

export function removeStoredHomepageTile(tileId: string): HomepageTileView[] {
  const stored = readStoredPanels();
  const homepage = stored.homepage ?? createEmptyHomepageConfig();
  const nextHomepage: StoredHomepageConfig = tileId.startsWith("custom-")
    ? {
        ...homepage,
        customTiles: homepage.customTiles.filter((tile) => tile.id !== tileId),
        hiddenTileIds: homepage.hiddenTileIds.filter((id) => id !== tileId),
        tileOrder: homepage.tileOrder?.filter((id) => id !== tileId),
      }
    : {
        ...homepage,
        hiddenTileIds: [...new Set([...homepage.hiddenTileIds, tileId])],
        tileOrder: homepage.tileOrder?.filter((id) => id !== tileId),
      };
  writeStoredPanels(
    stored.urls,
    stored.history ?? createEmptyPanelHistory(),
    nextHomepage,
    stored.visitHistory ?? [],
  );
  return buildHomepageTiles(nextHomepage);
}

export function updateStoredHomepageTile(
  tileId: string,
  name: string,
  url: string,
): HomepageTileView[] {
  const stored = readStoredPanels();
  const homepage = stored.homepage ?? createEmptyHomepageConfig();
  const tileIndex = homepage.customTiles.findIndex((tile) => tile.id === tileId);
  if (tileIndex === -1) {
    throw new Error("Only custom Quick Launch tiles can be edited.");
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Enter a site name for this homepage icon.");
  }

  const prepared = preparePanelUrl(url);
  if (!prepared.ok) {
    throw new Error(prepared.error);
  }

  if (isUrlOnHomepageExcept(homepage, prepared.normalizedUrl, tileId)) {
    throw new Error("That website is already on your Quick Launch homepage.");
  }

  const domain = getSiteDomainFromUrl(prepared.normalizedUrl) || prepared.normalizedUrl;
  const nextCustomTiles = homepage.customTiles.map((tile, index) =>
    index === tileIndex
      ? {
          ...tile,
          domain,
          name: trimmedName,
          url: prepared.normalizedUrl,
        }
      : tile,
  );

  const nextHomepage: StoredHomepageConfig = {
    ...homepage,
    customTiles: nextCustomTiles,
  };
  writeStoredPanels(
    stored.urls,
    stored.history ?? createEmptyPanelHistory(),
    nextHomepage,
    stored.visitHistory ?? [],
  );
  return buildHomepageTiles(nextHomepage);
}

export function persistPanelSnapshot(urls: string[], history: string[][]) {
  const stored = readStoredPanels();
  writeStoredPanels(
    urls,
    history,
    stored.homepage ?? createEmptyHomepageConfig(),
    stored.visitHistory ?? [],
  );
}

export type { CustomHomepageTile, HomepageTileView, StoredHomepageConfig, VisitHistoryEntry };
