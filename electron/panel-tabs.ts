import type { WebContentsView } from "electron";

export type PanelTab = {
  cursorHideStyleKey: string;
  disposeListeners?: () => void;
  id: string;
  input: string;
  isPrimary: boolean;
  loadError: string;
  parentTabId: string | null;
  title: string;
  url: string;
  view: WebContentsView;
};

export type PanelRuntime = {
  activeTabId: string;
  controlsVisible: boolean;
  panelIndex: number;
  tabCounter: number;
  tabs: PanelTab[];
};

export function createTabId(panelIndex: number, counter: number) {
  return `panel-${panelIndex + 1}-tab-${counter}`;
}

export function getActiveTab(panel: PanelRuntime): PanelTab | null {
  return panel.tabs.find((tab) => tab.id === panel.activeTabId) ?? panel.tabs[0] ?? null;
}

export function getPrimaryTab(panel: PanelRuntime): PanelTab | null {
  return panel.tabs.find((tab) => tab.isPrimary) ?? panel.tabs[0] ?? null;
}

export function getPopupTabs(panel: PanelRuntime): PanelTab[] {
  return panel.tabs.filter((tab) => !tab.isPrimary);
}

export function panelHasPopups(panel: PanelRuntime) {
  return getPopupTabs(panel).length > 0;
}

export function getTabTitle(tab: PanelTab) {
  if (tab.title) {
    return tab.title;
  }
  if (tab.url && tab.url !== "about:blank") {
    try {
      return new URL(tab.url).hostname;
    } catch {
      return tab.url;
    }
  }
  return "New Tab";
}

export function panelHasContent(panel: PanelRuntime) {
  const tab = getActiveTab(panel);
  return Boolean(tab?.url && tab.url !== "about:blank");
}

export function tabHasContent(tab: PanelTab | null | undefined) {
  return Boolean(tab?.url && tab.url !== "about:blank");
}
