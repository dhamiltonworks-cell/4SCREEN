import { PANEL_COUNT } from "./types";

export type PanelMoveDirection = "down" | "left" | "right" | "up";

export function getPanelSwapTarget(index: number, direction: PanelMoveDirection): number | null {
  if (index < 0 || index >= PANEL_COUNT) {
    return null;
  }

  const row = Math.floor(index / 2);
  const column = index % 2;

  switch (direction) {
    case "up":
      return row === 0 ? null : index - 2;
    case "down":
      return row === 1 ? null : index + 2;
    case "left":
      return column === 0 ? null : index - 1;
    case "right":
      return column === 1 ? null : index + 1;
    default:
      return null;
  }
}
