import { historyUrlsMatch } from "./panel-history";
import { getSiteDomainFromUrl, type SiteShortcut } from "./site-shortcuts";

export type CustomHomepageTile = {
  domain: string;
  id: string;
  name: string;
  url: string;
};

export type StoredHomepageConfig = {
  customTiles: CustomHomepageTile[];
  hiddenTileIds: string[];
  /** Reserved for future drag-and-drop tile ordering. */
  tileOrder?: string[];
};

export type HomepageTileView = SiteShortcut & {
  custom: boolean;
};

export function createEmptyHomepageConfig(): StoredHomepageConfig {
  return {
    customTiles: [],
    hiddenTileIds: [],
  };
}

export function sanitizeHomepageConfig(value: unknown): StoredHomepageConfig {
  if (!value || typeof value !== "object") {
    return createEmptyHomepageConfig();
  }

  const record = value as Partial<StoredHomepageConfig>;
  const customTiles = Array.isArray(record.customTiles)
    ? record.customTiles
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const tile = entry as Partial<CustomHomepageTile>;
          if (
            typeof tile.id !== "string" ||
            typeof tile.name !== "string" ||
            typeof tile.url !== "string"
          ) {
            return null;
          }
          const domain =
            typeof tile.domain === "string" && tile.domain
              ? tile.domain
              : getSiteDomainFromUrl(tile.url);
          return {
            domain,
            id: tile.id,
            name: tile.name.trim(),
            url: tile.url.trim(),
          } satisfies CustomHomepageTile;
        })
        .filter((entry): entry is CustomHomepageTile => Boolean(entry?.id && entry.name && entry.url))
    : [];

  const hiddenTileIds = Array.isArray(record.hiddenTileIds)
    ? record.hiddenTileIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const tileOrder = Array.isArray(record.tileOrder)
    ? record.tileOrder.filter((entry): entry is string => typeof entry === "string")
    : undefined;

  return {
    customTiles,
    hiddenTileIds: [...new Set(hiddenTileIds)],
    tileOrder,
  };
}

export function isUrlOnHomepage(config: StoredHomepageConfig, url: string): boolean {
  return buildHomepageTiles(config).some((tile) => historyUrlsMatch(tile.url, url));
}

export function isUrlOnHomepageExcept(
  config: StoredHomepageConfig,
  url: string,
  exceptTileId: string,
): boolean {
  return buildHomepageTiles(config).some(
    (tile) => tile.id !== exceptTileId && historyUrlsMatch(tile.url, url),
  );
}

export function orderHomepageTiles(tiles: HomepageTileView[], tileOrder?: string[]): HomepageTileView[] {
  if (!tileOrder || tileOrder.length === 0) {
    return tiles;
  }

  const tileMap = new Map(tiles.map((tile) => [tile.id, tile]));
  const ordered: HomepageTileView[] = [];
  for (const tileId of tileOrder) {
    const tile = tileMap.get(tileId);
    if (tile) {
      ordered.push(tile);
      tileMap.delete(tileId);
    }
  }
  for (const tile of tiles) {
    if (tileMap.has(tile.id)) {
      ordered.push(tile);
    }
  }
  return ordered;
}

export function buildHomepageTiles(config: StoredHomepageConfig): HomepageTileView[] {
  const hidden = new Set(config.hiddenTileIds);
  const customs = config.customTiles
    .filter((tile) => !hidden.has(tile.id))
    .map(
      (tile): HomepageTileView => ({
        custom: true,
        domain: tile.domain,
        id: tile.id,
        name: tile.name,
        url: tile.url,
      }),
    );

  return orderHomepageTiles(customs, config.tileOrder);
}

export function createCustomHomepageTile(name: string, url: string): CustomHomepageTile {
  const domain = getSiteDomainFromUrl(url);
  return {
    domain: domain || url,
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: name.trim(),
    url,
  };
}
