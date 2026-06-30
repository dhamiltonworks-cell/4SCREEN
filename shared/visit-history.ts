import { getSiteLabelFromUrl } from "./site-shortcuts";
import { historyUrlsMatch, isHistoryEligibleUrl, normalizeHistoryUrl } from "./panel-history";

export const VISIT_HISTORY_LIMIT = 50;

export type VisitHistoryEntry = {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
};

export function createVisitHistoryEntry(url: string, title: string, visitedAt = Date.now()): VisitHistoryEntry {
  const normalized = normalizeHistoryUrl(url);
  return {
    id: `visit-${visitedAt}-${Math.random().toString(36).slice(2, 9)}`,
    title: title.trim() || getSiteLabelFromUrl(normalized),
    url: normalized,
    visitedAt,
  };
}

export function sanitizeVisitHistory(value: unknown): VisitHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Partial<VisitHistoryEntry>;
      if (typeof record.url !== "string" || !isHistoryEligibleUrl(record.url)) {
        return null;
      }
      const visitedAt =
        typeof record.visitedAt === "number" && Number.isFinite(record.visitedAt)
          ? record.visitedAt
          : Date.now();
      const normalized = normalizeHistoryUrl(record.url);
      return {
        id:
          typeof record.id === "string" && record.id
            ? record.id
            : createVisitHistoryEntry(normalized, record.title ?? "", visitedAt).id,
        title:
          typeof record.title === "string" && record.title.trim()
            ? record.title.trim()
            : getSiteLabelFromUrl(normalized),
        url: normalized,
        visitedAt,
      } satisfies VisitHistoryEntry;
    })
    .filter((entry): entry is VisitHistoryEntry => Boolean(entry))
    .sort((left, right) => right.visitedAt - left.visitedAt)
    .slice(0, VISIT_HISTORY_LIMIT);
}

export function recordVisitHistory(
  history: VisitHistoryEntry[],
  url: string,
  title: string,
  limit = VISIT_HISTORY_LIMIT,
): VisitHistoryEntry[] {
  if (!isHistoryEligibleUrl(url)) {
    return history;
  }

  const normalized = normalizeHistoryUrl(url);
  const withoutDuplicate = history.filter((entry) => !historyUrlsMatch(entry.url, normalized));
  const nextEntry = createVisitHistoryEntry(normalized, title);
  return [nextEntry, ...withoutDuplicate].slice(0, limit);
}

export function findVisitHistoryEntry(
  history: VisitHistoryEntry[],
  entryId: string,
): VisitHistoryEntry | null {
  return history.find((entry) => entry.id === entryId) ?? null;
}
