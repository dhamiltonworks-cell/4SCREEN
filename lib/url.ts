const DEFAULT_PROTOCOL = "https://";
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

export type EmbedProvider = "website" | "youtube" | "vimeo" | "twitch";

export type UrlPreparationResult =
  | {
      ok: true;
      embedUrl: string;
      normalizedUrl: string;
      provider: EmbedProvider;
    }
  | {
      ok: false;
      error: string;
      normalizedUrl: string;
    };

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `${DEFAULT_PROTOCOL}${trimmed}`;
}

export function preparePanelUrl(value: string, twitchParent = "localhost"): UrlPreparationResult {
  const normalizedUrl = normalizeUrl(value);

  if (!normalizedUrl) {
    return {
      ok: false,
      error: "Enter a website or video URL before loading this panel.",
      normalizedUrl,
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return {
      ok: false,
      error: "Enter a complete, valid website URL.",
      normalizedUrl,
    };
  }

  if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
    return {
      ok: false,
      error: "FourScreen only supports http:// and https:// links.",
      normalizedUrl,
    };
  }

  const youtubeEmbedUrl = toYouTubeEmbedUrl(parsedUrl);
  if (youtubeEmbedUrl) {
    return {
      ok: true,
      embedUrl: youtubeEmbedUrl,
      normalizedUrl,
      provider: "youtube",
    };
  }

  const vimeoEmbedUrl = toVimeoEmbedUrl(parsedUrl);
  if (vimeoEmbedUrl) {
    return {
      ok: true,
      embedUrl: vimeoEmbedUrl,
      normalizedUrl,
      provider: "vimeo",
    };
  }

  const twitchEmbedUrl = toTwitchEmbedUrl(parsedUrl, twitchParent);
  if (twitchEmbedUrl) {
    return {
      ok: true,
      embedUrl: twitchEmbedUrl,
      normalizedUrl,
      provider: "twitch",
    };
  }

  return {
    ok: true,
    embedUrl: normalizedUrl,
    normalizedUrl,
    provider: "website",
  };
}

function toYouTubeEmbedUrl(url: URL): string | null {
  const host = stripWww(url.hostname);
  const pathParts = getPathParts(url);
  let videoId = "";

  if (host === "youtu.be") {
    videoId = pathParts[0] ?? "";
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (pathParts[0] === "watch") {
      videoId = url.searchParams.get("v") ?? "";
    } else if (["embed", "shorts", "live"].includes(pathParts[0] ?? "")) {
      videoId = pathParts[1] ?? "";
    }
  }

  if (!isValidYouTubeId(videoId)) {
    return null;
  }

  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
  const startSeconds = parseYouTubeTimestamp(url.searchParams.get("start") ?? url.searchParams.get("t"));

  if (startSeconds > 0) {
    embedUrl.searchParams.set("start", String(startSeconds));
  }

  return embedUrl.toString();
}

function toVimeoEmbedUrl(url: URL): string | null {
  const host = stripWww(url.hostname);
  const pathParts = getPathParts(url);
  let videoId = "";

  if (host === "player.vimeo.com" && pathParts[0] === "video") {
    videoId = pathParts[1] ?? "";
  } else if (host === "vimeo.com") {
    videoId = pathParts.find((part) => /^\d+$/.test(part)) ?? "";
  }

  if (!/^\d+$/.test(videoId)) {
    return null;
  }

  return `https://player.vimeo.com/video/${videoId}`;
}

function toTwitchEmbedUrl(url: URL, parentHost: string): string | null {
  const host = stripWww(url.hostname);
  const pathParts = getPathParts(url);
  const safeParent = sanitizeTwitchParent(parentHost);

  if (host === "player.twitch.tv") {
    const embedUrl = new URL(url.toString());
    embedUrl.searchParams.set("parent", safeParent);
    return embedUrl.toString();
  }

  if (host === "clips.twitch.tv") {
    const clip = pathParts[0];
    if (!isSafeTwitchValue(clip)) {
      return null;
    }

    const embedUrl = new URL("https://clips.twitch.tv/embed");
    embedUrl.searchParams.set("clip", clip);
    embedUrl.searchParams.set("parent", safeParent);
    return embedUrl.toString();
  }

  if (host !== "twitch.tv") {
    return null;
  }

  if (pathParts[0] === "videos" && /^\d+$/.test(pathParts[1] ?? "")) {
    const embedUrl = new URL("https://player.twitch.tv/");
    embedUrl.searchParams.set("video", pathParts[1]);
    embedUrl.searchParams.set("parent", safeParent);
    return embedUrl.toString();
  }

  if (pathParts[1] === "clip" && isSafeTwitchValue(pathParts[2])) {
    const embedUrl = new URL("https://clips.twitch.tv/embed");
    embedUrl.searchParams.set("clip", pathParts[2]);
    embedUrl.searchParams.set("parent", safeParent);
    return embedUrl.toString();
  }

  if (isSafeTwitchValue(pathParts[0])) {
    const embedUrl = new URL("https://player.twitch.tv/");
    embedUrl.searchParams.set("channel", pathParts[0].toLowerCase());
    embedUrl.searchParams.set("parent", safeParent);
    return embedUrl.toString();
  }

  return null;
}

function stripWww(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function getPathParts(url: URL) {
  return url.pathname.split("/").filter(Boolean);
}

function isValidYouTubeId(value: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(value);
}

function isSafeTwitchValue(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
}

function sanitizeTwitchParent(parentHost: string) {
  const sanitized = parentHost.split(":")[0]?.toLowerCase().replace(/[^a-z0-9.-]/g, "") ?? "";
  return sanitized || "localhost";
}

function parseYouTubeTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (!match) {
    return 0;
  }

  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}
