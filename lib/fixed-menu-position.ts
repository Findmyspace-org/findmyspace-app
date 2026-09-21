/**
 * Viewport-fixed dropdown placement. Used so menus are not clipped by
 * overflow-x-auto / overflow-hidden table wrappers.
 */

export type FixedMenuRect = {
  top: number;
  right: number;
  bottom: number;
};

export type FixedMenuSize = {
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export function computeFixedMenuPosition(input: {
  button: FixedMenuRect;
  menu: FixedMenuSize;
  viewport: ViewportSize;
  gap?: number;
  padding?: number;
}): { top: number; left: number; openUpward: boolean } {
  const gap = input.gap ?? 4;
  const padding = input.padding ?? 8;
  const spaceBelow = input.viewport.height - input.button.bottom - padding;
  const openUpward =
    spaceBelow < input.menu.height &&
    input.button.top > input.menu.height + gap + padding;

  let top = openUpward
    ? input.button.top - input.menu.height - gap
    : input.button.bottom + gap;
  let left = input.button.right - input.menu.width;

  const maxLeft = input.viewport.width - input.menu.width - padding;
  left = Math.min(Math.max(padding, left), Math.max(padding, maxLeft));

  const maxTop = input.viewport.height - input.menu.height - padding;
  top = Math.min(Math.max(padding, top), Math.max(padding, maxTop));

  return { top, left, openUpward };
}

export function estimateMenuHeight(itemCount: number): number {
  return 8 + Math.max(itemCount, 1) * 36;
}
