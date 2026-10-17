// Shared band layout for the pixel look: eight bands across the frame whose block
// sizes grow toward one edge. Each band edge is snapped to a common multiple of the
// two neighbouring block sizes so no partial cells (thin slivers) appear at seams.
// Whole-number multiples of one base block keep every seam aligned.
export const PIXEL_SCALES = [1, 1, 1, 1, 2, 2, 3, 4];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);

export function pixelBands(width, base, scales = PIXEL_SCALES) {
  const unit = Math.max(1, Math.round(base));
  const blocks = scales.map((scale) => Math.max(1, Math.round(unit * scale)));
  const edges = [];
  for (let i = 1; i < blocks.length; i++) {
    const step = lcm(blocks[i - 1], blocks[i]);
    const target = (width * i) / blocks.length;
    const previous = edges.length ? edges[edges.length - 1] : 0;
    edges.push(Math.max(previous, Math.round(target / step) * step));
  }
  return { blocks, edges };
}

export function blockAt(x, layout) {
  let index = 0;
  while (index < layout.edges.length && x >= layout.edges[index]) index++;
  return layout.blocks[index];
}
