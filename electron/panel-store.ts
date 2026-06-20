import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  addUrlToPanelHistory,
  createEmptyPanelHistory,
  sanitizePanelHistory,
} from "../shared/panel-history";
import { PANEL_COUNT } from "../shared/types";

type StoredPanels = {
  history?: string[][];
  urls: string[];
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
      urls: Array.from({ length: PANEL_COUNT }, () => ""),
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as StoredPanels;
    return {
      history: sanitizePanelHistory(parsed.history),
      urls: Array.isArray(parsed.urls)
        ? Array.from({ length: PANEL_COUNT }, (_, index) =>
            typeof parsed.urls[index] === "string" ? parsed.urls[index] : "",
          )
        : Array.from({ length: PANEL_COUNT }, () => ""),
    };
  } catch {
    return {
      history: createEmptyPanelHistory(),
      urls: Array.from({ length: PANEL_COUNT }, () => ""),
    };
  }
}

export function readStoredUrls(): string[] {
  return readStoredPanels().urls;
}

export function readStoredPanelHistory(): string[][] {
  return readStoredPanels().history ?? createEmptyPanelHistory();
}

function writeStoredPanels(urls: string[], history: string[][]) {
  const payload: StoredPanels = {
    history: sanitizePanelHistory(history),
    urls: Array.from({ length: PANEL_COUNT }, (_, index) => urls[index] ?? ""),
  };
  writeFileSync(getStorePath(), JSON.stringify(payload, null, 2), "utf8");
}

export function writeStoredUrls(urls: string[]) {
  writeStoredPanels(urls, readStoredPanelHistory());
}

export function writeStoredPanelHistory(history: string[][]) {
  writeStoredPanels(readStoredUrls(), history);
}

export function recordStoredPanelHistory(panelIndex: number, url: string) {
  const history = readStoredPanelHistory();
  const nextHistory = history.map((entries, index) =>
    index === panelIndex ? addUrlToPanelHistory(entries, url) : entries,
  );
  writeStoredPanelHistory(nextHistory);
  return nextHistory;
}

export function clearStoredPanelHistory(panelIndex: number) {
  const history = readStoredPanelHistory();
  const nextHistory = history.map((entries, index) => (index === panelIndex ? [] : entries));
  writeStoredPanelHistory(nextHistory);
  return nextHistory;
}
