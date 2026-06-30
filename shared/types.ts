export const PANEL_COUNT = 4;

export type InteractionSource = "keyboard" | "mouse" | "remote" | "touch";

export type PanelTabState = {
  id: string;
  title: string;
  url: string;
  isPrimary: boolean;
  canClose: boolean;
};

export type PanelState = {
  input: string;
  url: string;
  title: string;
  isLoading: boolean;
  controlsVisible: boolean;
  loadError: string;
  canGoBack: boolean;
  canGoForward: boolean;
  tabs: PanelTabState[];
  activeTabId: string;
  hasPopups: boolean;
  activeTabIsPopup: boolean;
  recentUrls: string[];
};

export type PanelsSnapshot = PanelState[];

export type HomepageTileState = {
  custom: boolean;
  domain: string;
  fallbackBadge?: string;
  fallbackClass?: string;
  id: string;
  name: string;
  url: string;
};

export type VisitHistoryEntryState = {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
};

export type ShellState = {
  activePanelIndex: number | null;
  audioLockedPanelIndex: number | null;
  audioPanelIndex: number | null;
  focusedPanelIndex: number | null;
  homepageTiles: HomepageTileState[];
  visitHistory: VisitHistoryEntryState[];
  videoFullscreenPanelIndex: number | null;
  panels: PanelsSnapshot;
};

export type PanelLoadRequest = {
  index: number;
  input: string;
};

export type PanelIndexRequest = {
  index: number;
};

export type SiteMenuOpenRequest = {
  index: number;
  open: boolean;
};

export type PanelTabRequest = {
  index: number;
  tabId: string;
};

export type ControlsVisibilityRequest = {
  index: number;
  visible: boolean;
};

export type PinControlsRequest = {
  index: number;
  pinned: boolean;
};

export type SetActivePanelRequest = {
  index: number | null;
  source: InteractionSource;
};

export type HomepageAddRequest = {
  name: string;
  url: string;
};

export type HomepageRemoveRequest = {
  tileId: string;
};

export type HomepageUpdateRequest = {
  name: string;
  tileId: string;
  url: string;
};

export type HomepageAddFromVisitRequest = {
  visitId: string;
};

export type PanelMoveRequest = {
  direction: "down" | "left" | "right" | "up";
  index: number;
};
