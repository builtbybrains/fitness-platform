/* The milestone icons as stroke centre lines, so a medal can carry its
   badge's icon in 3D. The shapes are the ones Icon.tsx draws for the
   milestones (dumbbell, flame, bars, scale, medal) on its 24px grid; keep
   the two in step when an icon changes. The path reader handles the
   commands these icons use (M L H V C S A Z, absolute and relative, with
   implicit repeats); rects and circles are written out as closed paths.
   Pure math, no three.js, so it is unit tested. */

import { arcPoints, type Pt } from './outline';

export type MedalIcon = 'dumbbell' | 'flame' | 'bars' | 'scale' | 'medal';

/** One stroke: its centre line, and whether it closes on itself. */
export type Stroke = { pts: Pt[]; closed: boolean };

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

/** An SVG path as strokes, one per subpath, in the path's own units. */
export function pathStrokes(d: string, steps = 8): Stroke[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.\d*|\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? [];
  const strokes: Stroke[] = [];
  let cur: Stroke | null = null;
  let i = 0;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastCtrl: Pt | null = null;
  let cmd = '';
  const num = () => parseFloat(tokens[i++]);
  const isCmd = (t: string | undefined) => !!t && /^[a-zA-Z]$/.test(t);
  const lineTo = (nx: number, ny: number) => {
    x = nx;
    y = ny;
    cur?.pts.push([x, y]);
  };
  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        cur = { pts: [[x, y]], closed: false };
        strokes.push(cur);
        // Pairs after a move are lines.
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      }
      case 'L':
        lineTo(ox + num(), oy + num());
        lastCtrl = null;
        break;
      case 'H':
        lineTo(ox + num(), y);
        lastCtrl = null;
        break;
      case 'V':
        lineTo(x, oy + num());
        lastCtrl = null;
        break;
      case 'C':
      case 'S': {
        const smooth = cmd.toUpperCase() === 'S';
        const c1: Pt = smooth ? (lastCtrl ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y]) : [ox + num(), oy + num()];
        const c2: Pt = [ox + num(), oy + num()];
        const end: Pt = [ox + num(), oy + num()];
        cur?.pts.push(...cubic([x, y], c1, c2, end, steps));
        [x, y] = end;
        lastCtrl = c2;
        break;
      }
      case 'A': {
        const r = num();
        num(); // ry: equal to rx in these icons
        num(); // rotation: always 0
        const large = num() === 1;
        const sweep = num() === 1;
        const nx = ox + num();
        const ny = oy + num();
        cur?.pts.push(...arcPoints(x, y, r, large, sweep, nx, ny, steps));
        x = nx;
        y = ny;
        lastCtrl = null;
        break;
      }
      case 'Z':
        if (cur) cur.closed = true;
        x = sx;
        y = sy;
        lastCtrl = null;
        // A new subpath needs its own M.
        if (i < tokens.length && !isCmd(tokens[i])) throw new Error('Numbers after Z');
        break;
      default:
        throw new Error(`Unsupported path command ${cmd || tokens[i]}`);
    }
  }
  for (const s of strokes) {
    if (!s.closed || s.pts.length < 2) continue;
    const [fx, fy] = s.pts[0];
    const [lx, ly] = s.pts[s.pts.length - 1];
    if (Math.abs(fx - lx) < 1e-6 && Math.abs(fy - ly) < 1e-6) s.pts.pop();
  }
  return strokes;
}

/** A rounded rect as a closed stroke. */
export function rectStroke(x: number, y: number, w: number, h: number, r: number, steps = 4): Stroke {
  const rr = Math.min(r, w / 2, h / 2);
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let k = 0; k <= steps; k++) {
      const a = from + (k / steps) * (Math.PI / 2);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  };
  // SVG y points down: start top-left, clockwise on screen.
  corner(x + rr, y + rr, Math.PI);
  corner(x + w - rr, y + rr, -Math.PI / 2);
  corner(x + w - rr, y + h - rr, 0);
  corner(x + rr, y + h - rr, Math.PI / 2);
  return { pts, closed: true };
}

/** A circle as a closed stroke. */
export function circleStroke(cx: number, cy: number, r: number, steps = 32): Stroke {
  return { pts: Array.from({ length: steps }, (_, k) => [cx + r * Math.cos((k / steps) * Math.PI * 2), cy + r * Math.sin((k / steps) * Math.PI * 2)] as Pt), closed: true };
}

/** Each milestone icon on the 24px grid, as Icon.tsx draws it. */
export function iconStrokes(name: MedalIcon): Stroke[] {
  switch (name) {
    case 'dumbbell':
      return [rectStroke(2.5, 9, 2.5, 6, 1), rectStroke(5, 6.5, 3, 11, 1), ...pathStrokes('M8 12h8'), rectStroke(16, 6.5, 3, 11, 1), rectStroke(19, 9, 2.5, 6, 1)];
    case 'flame':
      return pathStrokes('M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 0 2 1 3 2 3 0-3-1-5.5.5-8Z');
    case 'bars':
      return [rectStroke(3.5, 14, 4, 6.5, 1), rectStroke(10, 9, 4, 11.5, 1), rectStroke(16.5, 3.5, 4, 17, 1)];
    case 'scale':
      return [rectStroke(3.5, 3.5, 17, 17, 4), ...pathStrokes('M8 9a5 5 0 0 1 8 0'), ...pathStrokes('m12 11 1.5-2.5')];
    case 'medal':
      return [...pathStrokes('M8 3.5 11 9.5M16 3.5l-3 6'), circleStroke(12, 15, 5.5), ...pathStrokes('M10.8 13.6 12 12.8v4.4')];
  }
}
