export type SiteShortcut = {
  domain: string;
  fallbackBadge?: string;
  fallbackClass?: string;
  id: string;
  name: string;
  url: string;
};

export const SITE_SHORTCUTS: SiteShortcut[] = [];

export function getShortcutFaviconUrl(domain: string, size = 32) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function getSiteLabelFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const shortcut = SITE_SHORTCUTS.find(
      (entry) => hostname === entry.domain || hostname.endsWith(`.${entry.domain}`),
    );
    return shortcut?.name ?? hostname;
  } catch {
    return url;
  }
}

export function getSiteDomainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
