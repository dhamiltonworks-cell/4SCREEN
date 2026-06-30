import type {
  ControlsVisibilityRequest,
  HomepageAddFromVisitRequest,
  HomepageAddRequest,
  HomepageRemoveRequest,
  HomepageUpdateRequest,
  PanelIndexRequest,
  PanelLoadRequest,
  PanelMoveRequest,
  PanelTabRequest,
  PinControlsRequest,
  SetActivePanelRequest,
  ShellState,
  SiteMenuOpenRequest,
} from "./types";

export type FourScreenApi = {
  addHomepageTile: (request: HomepageAddRequest) => Promise<ShellState>;
  addHomepageTileFromVisit: (request: HomepageAddFromVisitRequest) => Promise<ShellState>;
  clearPanel: (request: PanelIndexRequest) => Promise<ShellState>;
  closeActivePanelTab: (request: PanelIndexRequest) => Promise<ShellState>;
  closePanelPopups: (request: PanelIndexRequest) => Promise<ShellState>;
  closePanelTab: (request: PanelTabRequest) => Promise<ShellState>;
  focusPanel: (request: PanelIndexRequest) => Promise<ShellState>;
  getShellState: () => Promise<ShellState>;
  goBack: (request: PanelIndexRequest) => Promise<ShellState>;
  goForward: (request: PanelIndexRequest) => Promise<ShellState>;
  loadPanel: (request: PanelLoadRequest) => Promise<ShellState>;
  movePanel: (request: PanelMoveRequest) => Promise<ShellState>;
  onShellStateUpdated: (callback: (state: ShellState) => void) => () => void;
  pinPanelControls: (request: PinControlsRequest) => Promise<void>;
  refreshPanel: (request: PanelIndexRequest) => Promise<ShellState>;
  clearPanelHistory: (request: PanelIndexRequest) => Promise<ShellState>;
  removeHomepageTile: (request: HomepageRemoveRequest) => Promise<ShellState>;
  updateHomepageTile: (request: HomepageUpdateRequest) => Promise<ShellState>;
  setActivePanel: (request: SetActivePanelRequest) => Promise<void>;
  setChromeHeight: (height: number) => Promise<void>;
  setControlsVisible: (request: ControlsVisibilityRequest) => Promise<void>;
  setSiteMenuOpen: (request: SiteMenuOpenRequest) => Promise<void>;
  restorePrimaryTab: (request: PanelIndexRequest) => Promise<ShellState>;
  switchPanelTab: (request: PanelTabRequest) => Promise<ShellState>;
  toggleAudioLock: (request: PanelIndexRequest) => Promise<ShellState>;
  unfocusPanel: () => Promise<ShellState>;
};
