import { PANEL_COUNT } from "./types";

export const PANEL_HISTORY_LIMIT = 15;

export function normalizeHistoryUrl(url: string) {
  return url.trim();
}

export function historyUrlsMatch(left: string, right: string) {
  const a = normalizeHistoryUrl(left);
  const b = normalizeHistoryUrl(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }

  try {
    const leftUrl = new URL(a);
    const rightUrl = new URL(b);
    return leftUrl.href === rightUrl.href;
  } catch {
    return false;
  }
}

export function isHistoryEligibleUrl(url: string) {
  const normalized = normalizeHistoryUrl(url);
  if (!normalized || normalized === "about:blank") {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function addUrlToPanelHistory(history: string[], url: string, limit = PANEL_HISTORY_LIMIT) {
  if (!isHistoryEligibleUrl(url)) {
    return history;
  }

  const normalized = normalizeHistoryUrl(url);
  const withoutDuplicate = history.filter((entry) => !historyUrlsMatch(entry, normalized));
  return [normalized, ...withoutDuplicate].slice(0, limit);
}

export function createEmptyPanelHistory() {
  return Array.from({ length: PANEL_COUNT }, () => [] as string[]);
}

export function sanitizePanelHistory(history: unknown): string[][] {
  if (!Array.isArray(history)) {
    return createEmptyPanelHistory();
  }

  return Array.from({ length: PANEL_COUNT }, (_, index) => {
    const entries = history[index];
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry): entry is string => typeof entry === "string")
      .filter(isHistoryEligibleUrl)
      .slice(0, PANEL_HISTORY_LIMIT);
  });
}
