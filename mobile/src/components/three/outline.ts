/* Turns the B mark's SVG path into a flat list of points that three.js can
   fill or extrude. The mark only uses M, H, L, A (circular arcs) and Z, so
   this handles exactly those. Arcs are converted from SVG endpoint form to
   centre form (SVG spec, appendix F.6.5) and sampled. Pure math, no
   three.js, so it is unit tested. */

export type Pt = [number, number];

function arcPoints(x1: number, y1: number, r: number, large: boolean, sweep: boolean, x2: number, y2: number, steps: number): Pt[] {
  // Rotation is always 0 and rx = ry in the mark, so the transform is a translate.
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  let rr = r;
  const d2 = dx * dx + dy * dy;
  if (d2 > rr * rr) rr = Math.sqrt(d2); // radius too small for the chord: SVG scales it up
  const sign = large === sweep ? -1 : 1;
  const k = sign * Math.sqrt(Math.max(0, (rr * rr - d2) / d2));
  const cxp = k * dy;
  const cyp = -k * dx;
  const cx = cxp + (x1 + x2) / 2;
  const cy = cyp + (y1 + y2) / 2;
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let da = Math.atan2(y2 - cy, x2 - cx) - a1;
  if (sweep && da < 0) da += Math.PI * 2;
  if (!sweep && da > 0) da -= Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const a = a1 + (da * i) / steps;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  pts[pts.length - 1] = [x2, y2];
  return pts;
}

/** Points of a single closed contour (the last point is not repeated). */
export function pathOutline(d: string, arcSteps = 10): Pt[] {
  const tokens = d.match(/[MHLAZmhlaz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let cmd = '';
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M':
      case 'L':
        x = num();
        y = num();
        pts.push([x, y]);
        break;
      case 'H':
        x = num();
        pts.push([x, y]);
        break;
      case 'A': {
        const r = num();
        num(); // ry, equal to rx in the mark
        num(); // x-axis rotation, always 0
        const large = num() === 1;
        const sweep = num() === 1;
        const nx = num();
        const ny = num();
        pts.push(...arcPoints(x, y, r, large, sweep, nx, ny, arcSteps));
        x = nx;
        y = ny;
        break;
      }
      case 'Z':
      case 'z':
        cmd = '';
        break;
      default:
        throw new Error(`Unsupported path command ${cmd || tokens[i]}`);
    }
  }
  const [fx, fy] = pts[0];
  const [lx, ly] = pts[pts.length - 1];
  if (Math.abs(fx - lx) < 1e-6 && Math.abs(fy - ly) < 1e-6) pts.pop();
  return pts;
}

/** The outline centred on the origin, `height` units tall, y pointing up
    (SVG y points down). */
export function centredOutline(d: string, height: number, arcSteps = 10): Pt[] {
  const pts = pathOutline(d, arcSteps);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [px, py] of pts) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  const s = height / (maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return pts.map(([px, py]) => [(px - cx) * s, -(py - cy) * s]);
}
