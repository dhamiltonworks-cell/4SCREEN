export type SiteShortcut = {
  domain: string;
  fallbackBadge?: string;
  fallbackClass?: string;
  id: string;
  name: string;
  url: string;
};

export const SITE_SHORTCUTS: SiteShortcut[] = [
  { domain: "youtube.com", id: "youtube", name: "YouTube", url: "https://www.youtube.com" },
  { domain: "netflix.com", id: "netflix", name: "Netflix", url: "https://www.netflix.com" },
  { domain: "x.com", id: "x", name: "X", url: "https://x.com" },
  { domain: "google.com", id: "google", name: "Google", url: "https://www.google.com" },
  { domain: "espn.com", id: "espn", name: "ESPN", url: "https://www.espn.com" },
  {
    domain: "sports.yahoo.com",
    id: "yahoo-sports",
    name: "Yahoo Sports",
    url: "https://sports.yahoo.com/",
  },
  {
    domain: "sportsbook.draftkings.com",
    id: "draftkings",
    name: "DraftKings Sportsbook",
    url: "https://sportsbook.draftkings.com/",
  },
  {
    domain: "sportsbook.fanduel.com",
    id: "fanduel",
    name: "FanDuel Sportsbook",
    url: "https://sportsbook.fanduel.com/",
  },
  { domain: "twitch.tv", id: "twitch", name: "Twitch", url: "https://www.twitch.tv" },
  { domain: "discord.com", id: "discord", name: "Discord", url: "https://discord.com/app" },
  { domain: "reddit.com", id: "reddit", name: "Reddit", url: "https://www.reddit.com" },
  { domain: "hulu.com", id: "hulu", name: "Hulu", url: "https://www.hulu.com" },
  { domain: "max.com", id: "max", name: "Max", url: "https://www.max.com" },
  { domain: "disneyplus.com", id: "disney-plus", name: "Disney+", url: "https://www.disneyplus.com" },
  { domain: "chatgpt.com", id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com" },
  {
    domain: "xbox.com",
    fallbackBadge: "X",
    fallbackClass: "panel__site-icon-fallback--xbox",
    id: "xbox-cloud",
    name: "Xbox Cloud Gaming",
    url: "https://www.xbox.com/play",
  },
  {
    domain: "playstation.com",
    fallbackBadge: "PS",
    fallbackClass: "panel__site-icon-fallback--playstation",
    id: "playstation",
    name: "PlayStation",
    url: "https://www.playstation.com/en-us/remote-play/",
  },
];

/** Built-in quick-launch tiles shown on every empty panel homepage. */
export const HOMEPAGE_SHORTCUTS: SiteShortcut[] = [
  { domain: "youtube.com", id: "youtube", name: "YouTube", url: "https://www.youtube.com" },
  { domain: "x.com", id: "x", name: "X", url: "https://x.com" },
  { domain: "google.com", id: "google", name: "Google", url: "https://www.google.com" },
  { domain: "chatgpt.com", id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com" },
  { domain: "twitch.tv", id: "twitch", name: "Twitch", url: "https://www.twitch.tv" },
  { domain: "netflix.com", id: "netflix", name: "Netflix", url: "https://www.netflix.com" },
  { domain: "discord.com", id: "discord", name: "Discord", url: "https://discord.com/app" },
  { domain: "reddit.com", id: "reddit", name: "Reddit", url: "https://www.reddit.com" },
  { domain: "espn.com", id: "espn", name: "ESPN", url: "https://www.espn.com" },
  {
    domain: "sports.yahoo.com",
    id: "yahoo-sports",
    name: "Yahoo Sports",
    url: "https://sports.yahoo.com/",
  },
  {
    domain: "sportsbook.draftkings.com",
    id: "draftkings",
    name: "DraftKings",
    url: "https://sportsbook.draftkings.com/",
  },
  {
    domain: "sportsbook.fanduel.com",
    id: "fanduel",
    name: "FanDuel",
    url: "https://sportsbook.fanduel.com/",
  },
  {
    domain: "xbox.com",
    fallbackBadge: "X",
    fallbackClass: "panel__site-icon-fallback--xbox",
    id: "xbox-cloud",
    name: "Xbox Cloud Gaming",
    url: "https://www.xbox.com/play",
  },
  {
    domain: "playstation.com",
    fallbackBadge: "PS",
    fallbackClass: "panel__site-icon-fallback--playstation",
    id: "playstation",
    name: "PlayStation",
    url: "https://www.playstation.com/en-us/remote-play/",
  },
];

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
