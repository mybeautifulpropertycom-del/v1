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
  options: { besideHeading?: boolean } = {},
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
  const besideHeading =
    Boolean(options.besideHeading) && anchor.right + width + 54 <= left + vw;
  const side = besideNavigation || besideHeading;
  const x = clamp(
    besideHeading
      ? anchor.right + 40
      : besideNavigation
        ? anchor.right + 14
        : anchor.right - width,
    left + 12,
    left + vw - width - 12,
  );
  const y = clamp(
    besideHeading
      ? anchor.top - 40
      : besideNavigation
        ? anchor.top
        : options.besideHeading && above >= top + 12
          ? above
          : below + height <= top + vh - 12
            ? below
            : above,
    top + 12,
    top + vh - height - 12,
  );
  return {
    visible:
      anchor.width > 0 &&
      anchor.height > 0 &&
      anchor.right > left &&
      anchor.left < left + vw &&
      anchor.bottom > top + 8 &&
      anchor.top < top + vh - 8,
    dotX: clamp(
      options.besideHeading ? anchor.right + 5 : anchor.right - 14,
      left + 4,
      left + vw - 34,
    ),
    dotY: clamp(
      options.besideHeading
        ? anchor.top + (anchor.height - 30) / 2
        : anchor.top - 14,
      top + 4,
      top + vh - 34,
    ),
    x,
    y,
    arrowX: side ? x - 5 : null,
    arrowY: clamp(anchor.top + anchor.height / 2 - 5, y + 14, y + height - 22),
    width,
    maxHeight,
  };
}
