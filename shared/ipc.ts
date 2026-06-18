import type {
  ControlsVisibilityRequest,
  PanelIndexRequest,
  PanelLoadRequest,
  PanelTabRequest,
  PinControlsRequest,
  SetActivePanelRequest,
  ShellState,
} from "./types";

export type FourScreenApi = {
  clearPanel: (request: PanelIndexRequest) => Promise<ShellState>;
  closeActivePanelTab: (request: PanelIndexRequest) => Promise<ShellState>;
  closePanelPopups: (request: PanelIndexRequest) => Promise<ShellState>;
  closePanelTab: (request: PanelTabRequest) => Promise<ShellState>;
  focusPanel: (request: PanelIndexRequest) => Promise<ShellState>;
  getShellState: () => Promise<ShellState>;
  goBack: (request: PanelIndexRequest) => Promise<ShellState>;
  goForward: (request: PanelIndexRequest) => Promise<ShellState>;
  loadPanel: (request: PanelLoadRequest) => Promise<ShellState>;
  onShellStateUpdated: (callback: (state: ShellState) => void) => () => void;
  openExternal: (request: PanelIndexRequest) => Promise<void>;
  pinPanelControls: (request: PinControlsRequest) => Promise<void>;
  refreshPanel: (request: PanelIndexRequest) => Promise<ShellState>;
  setActivePanel: (request: SetActivePanelRequest) => Promise<void>;
  setChromeHeight: (height: number) => Promise<void>;
  setControlsVisible: (request: ControlsVisibilityRequest) => Promise<void>;
  restorePrimaryTab: (request: PanelIndexRequest) => Promise<ShellState>;
  switchPanelTab: (request: PanelTabRequest) => Promise<ShellState>;
  toggleAudioLock: (request: PanelIndexRequest) => Promise<ShellState>;
  unfocusPanel: () => Promise<ShellState>;
};
