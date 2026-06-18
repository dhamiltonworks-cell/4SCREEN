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
};

export type PanelsSnapshot = PanelState[];

export type ShellState = {
  activePanelIndex: number | null;
  audioLockedPanelIndex: number | null;
  audioPanelIndex: number | null;
  focusedPanelIndex: number | null;
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
