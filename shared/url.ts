const DEFAULT_PROTOCOL = "https://";
const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

export type UrlPreparationResult =
  | {
      ok: true;
      normalizedUrl: string;
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

export function preparePanelUrl(value: string): UrlPreparationResult {
  const normalizedUrl = normalizeUrl(value);

  if (!normalizedUrl) {
    return {
      ok: false,
      error: "Enter a website URL before loading this panel.",
      normalizedUrl,
    };
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
      return {
        ok: false,
        error: "FourScreen only supports http:// and https:// links.",
        normalizedUrl,
      };
    }
  } catch {
    return {
      ok: false,
      error: "Enter a complete, valid website URL.",
      normalizedUrl,
    };
  }

  return {
    ok: true,
    normalizedUrl,
  };
}
