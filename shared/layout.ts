import { PANEL_COUNT } from "./types";

export const SHELL_PADDING = 10;
export const SHELL_GAP = 10;
export const FOCUS_WIDTH_RATIO = 0.7;
export const LAYOUT_ANIMATION_MS = 320;

export type Bounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type WindowSize = {
  height: number;
  width: number;
};

function getContentArea(size: WindowSize) {
  return {
    contentHeight: size.height - SHELL_PADDING * 2 - SHELL_GAP,
    contentWidth: size.width - SHELL_PADDING * 2 - SHELL_GAP,
  };
}

function getGridCellBounds(index: number, size: WindowSize): Bounds {
  const { contentHeight, contentWidth } = getContentArea(size);
  const cellWidth = Math.floor((contentWidth - SHELL_GAP) / 2);
  const cellHeight = Math.floor((contentHeight - SHELL_GAP) / 2);
  const column = index % 2;
  const row = Math.floor(index / 2);

  return {
    height: row === 1 ? contentHeight - cellHeight - SHELL_GAP : cellHeight,
    width: column === 1 ? contentWidth - cellWidth - SHELL_GAP : cellWidth,
    x: SHELL_PADDING + column * (cellWidth + SHELL_GAP),
    y: SHELL_PADDING + row * (cellHeight + SHELL_GAP),
  };
}

function getFocusCellBounds(index: number, focusedIndex: number, size: WindowSize): Bounds {
  const { contentHeight, contentWidth } = getContentArea(size);
  const focusWidth = Math.floor(contentWidth * FOCUS_WIDTH_RATIO);
  const sideWidth = contentWidth - focusWidth - SHELL_GAP;
  const sideX = SHELL_PADDING + focusWidth + SHELL_GAP;

  if (index === focusedIndex) {
    return {
      height: contentHeight,
      width: focusWidth,
      x: SHELL_PADDING,
      y: SHELL_PADDING,
    };
  }

  const sideIndices = Array.from({ length: PANEL_COUNT }, (_, panelIndex) => panelIndex).filter(
    (panelIndex) => panelIndex !== focusedIndex,
  );
  const slot = sideIndices.indexOf(index);
  const sideCount = sideIndices.length;
  const totalGap = SHELL_GAP * (sideCount - 1);
  const sidePanelHeight = Math.floor((contentHeight - totalGap) / sideCount);

  return {
    height:
      slot === sideCount - 1
        ? contentHeight - slot * (sidePanelHeight + SHELL_GAP)
        : sidePanelHeight,
    width: sideWidth,
    x: sideX,
    y: SHELL_PADDING + slot * (sidePanelHeight + SHELL_GAP),
  };
}

export function getCellBounds(index: number, focusedPanelIndex: number | null, size: WindowSize): Bounds {
  if (focusedPanelIndex === null) {
    return getGridCellBounds(index, size);
  }
  return getFocusCellBounds(index, focusedPanelIndex, size);
}

export function getAllCellBounds(focusedPanelIndex: number | null, size: WindowSize): Bounds[] {
  return Array.from({ length: PANEL_COUNT }, (_, index) => getCellBounds(index, focusedPanelIndex, size));
}

export function toShellPanelBounds(bounds: Bounds): Bounds {
  return {
    height: bounds.height,
    width: bounds.width,
    x: bounds.x - SHELL_PADDING,
    y: bounds.y - SHELL_PADDING,
  };
}

export function easeInOutCubic(progress: number) {
  if (progress < 0.5) {
    return 4 * progress * progress * progress;
  }
  return 1 - (-2 * progress + 2) ** 3 / 2;
}

export function interpolateBounds(from: Bounds, to: Bounds, progress: number): Bounds {
  return {
    height: Math.round(from.height + (to.height - from.height) * progress),
    width: Math.round(from.width + (to.width - from.width) * progress),
    x: Math.round(from.x + (to.x - from.x) * progress),
    y: Math.round(from.y + (to.y - from.y) * progress),
  };
}
