import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PANEL_COUNT } from "../shared/types";

type StoredPanels = {
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

export function readStoredUrls(): string[] {
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    return Array.from({ length: PANEL_COUNT }, () => "");
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as StoredPanels;
    if (!Array.isArray(parsed.urls)) {
      return Array.from({ length: PANEL_COUNT }, () => "");
    }

    return Array.from({ length: PANEL_COUNT }, (_, index) =>
      typeof parsed.urls[index] === "string" ? parsed.urls[index] : "",
    );
  } catch {
    return Array.from({ length: PANEL_COUNT }, () => "");
  }
}

export function writeStoredUrls(urls: string[]) {
  const payload: StoredPanels = {
    urls: Array.from({ length: PANEL_COUNT }, (_, index) => urls[index] ?? ""),
  };
  writeFileSync(getStorePath(), JSON.stringify(payload, null, 2), "utf8");
}
