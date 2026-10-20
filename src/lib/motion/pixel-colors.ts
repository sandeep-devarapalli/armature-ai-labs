import type { PixelColors, RGB } from './pixel-renderer';

function parse(value: string): RGB | undefined {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : undefined;
}

/** Reads the --pixel-lo / --pixel-hi / --pixel-accent theme tokens from an element. */
export function readPixelColors(element: Element): Partial<PixelColors> {
  const style = getComputedStyle(element);
  const colors: Partial<PixelColors> = {};
  for (const [key, token] of [['lo', '--pixel-lo'], ['hi', '--pixel-hi'], ['accent', '--pixel-accent']] as const) {
    const value = parse(style.getPropertyValue(token));
    if (value) colors[key] = value;
  }
  return colors;
}

/** Calls back whenever the visitor switches light or dark mode. */
export function onThemeChange(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  return () => observer.disconnect();
}
