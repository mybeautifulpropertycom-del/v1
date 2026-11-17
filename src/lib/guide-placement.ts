// Viewport-relative coordinates shared by desktop and mobile (including keyboards).
export function guidePlacement(
  anchor: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  },
  panelHeight: number,
  viewport: { left: number; top: number; width: number; height: number },
) {
  const { left, top, width: vw, height: vh } = viewport;
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));
  const width = Math.min(300, vw - 24);
  const maxHeight = Math.max(80, vh - 24);
  const height = Math.min(panelHeight, maxHeight);
  const below = anchor.bottom + 10;
  const above = anchor.top - height - 10;
  const besideNavigation =
    vw > 760 &&
    anchor.left < left + 260 &&
    anchor.width < 240 &&
    anchor.right + width + 26 < left + vw;
  return {
    visible:
      anchor.width > 0 &&
      anchor.height > 0 &&
      anchor.right > left &&
      anchor.left < left + vw &&
      anchor.bottom > top + 8 &&
      anchor.top < top + vh - 8,
    dotX: clamp(anchor.right - 14, left + 4, left + vw - 34),
    dotY: clamp(anchor.top - 14, top + 4, top + vh - 34),
    x: clamp(
      besideNavigation ? anchor.right + 14 : anchor.right - width,
      left + 12,
      left + vw - width - 12,
    ),
    y: clamp(
      besideNavigation
        ? anchor.top
        : below + height <= top + vh - 12
          ? below
          : above,
      top + 12,
      top + vh - height - 12,
    ),
    width,
    maxHeight,
  };
}
