/* Swipe between tabs: the rules, kept pure so they are tested without
   React Native.

   A drag on a tab screen moves to the next tab (finger going left) or the
   previous one (finger going right). It is only claimed when the finger
   has moved clearly sideways, it never starts near either edge (Android
   Chrome's own back gesture lives there), and it leaves alone any drag
   that started on something that owns its own sideways drag: a swipe row
   (rightward only; leftward still turns the page), a 3D object, or an area
   marked as exempt (text inputs, horizontal lists). */

/** The tabs in bar order, with the label the peek shows. */
export const PAGER_TABS = [
  { name: 'index', title: 'Today' },
  { name: 'plan', title: 'Plan' },
  { name: 'food', title: 'Food' },
  { name: 'coach', title: 'Coach' },
  { name: 'profile', title: 'Profile' },
] as const;

/** No tab swipe starts this close to either side of the screen. */
export const PAGER_EDGE = 20;
/** Sideways travel before the swipe is claimed. */
export const PAGER_CLAIM_DX = 14;
/** How much more across than down the finger must move. */
export const PAGER_CLAIM_RATIO = 1.6;
/** Share of the width that commits on release. */
export const PAGER_COMMIT = 0.28;
/** A flick this fast (px per ms) commits whatever the distance. */
export const PAGER_FLING = 0.45;

/** What the touch started on, as marked by the views under the finger. */
export type TouchOwner = 'row' | '3d' | 'exempt' | null;

/** Shared for one touch: the pager clears it as a touch starts (it is the
    outermost view, so its capture runs first) and the views under the
    finger mark it in their own capture phase. */
export const touchStart: { owner: TouchOwner } = { owner: null };

/** Mark the current touch as started on something that owns its drags. */
export function markTouch(owner: Exclude<TouchOwner, null>): void {
  // A 3D object or exempt area inside a row wins over the row.
  if (touchStart.owner === null || owner !== 'row') touchStart.owner = owner;
}

/** Where a tab sits in the pager, or -1 when it has no place (Progress). */
export function pagerIndex(name: string): number {
  return PAGER_TABS.findIndex((t) => t.name === name);
}

/** The tab a drag of `dx` heads for, or null past the first or last tab. */
export function neighbourIndex(index: number, dx: number, count: number = PAGER_TABS.length): number | null {
  if (index < 0 || dx === 0 || !Number.isFinite(dx)) return null;
  const next = dx < 0 ? index + 1 : index - 1;
  return next >= 0 && next < count ? next : null;
}

/** Whether the pager should take this drag. */
export function shouldClaimTab(p: { dx: number; dy: number; startX: number; width: number; owner: TouchOwner; enabled?: boolean }): boolean {
  const { dx, dy, startX, width, owner, enabled = true } = p;
  if (!enabled || !(width > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  if (owner === '3d' || owner === 'exempt') return false;
  if (owner === 'row' && dx > 0) return false;
  if (startX < PAGER_EDGE || startX > width - PAGER_EDGE) return false;
  return Math.abs(dx) > PAGER_CLAIM_DX && Math.abs(dx) > PAGER_CLAIM_RATIO * Math.abs(dy);
}

/** How far the screen follows the finger: one to one toward a neighbour,
    with growing resistance past the first or last tab (it never goes far
    and always springs back). */
export function pagerOffset(dx: number, width: number, hasNeighbour: boolean): number {
  if (!Number.isFinite(dx) || !(width > 0)) return 0;
  if (hasNeighbour) return Math.max(-width, Math.min(width, dx));
  const limit = width * 0.25;
  const pull = (1 - 1 / ((Math.abs(dx) * 0.55) / limit + 1)) * limit;
  return Math.sign(dx) * pull;
}

/** On release: go to the neighbour, or spring back. */
export function pagerDecision(p: { dx: number; vx: number; width: number; hasNeighbour: boolean }): 'commit' | 'cancel' {
  const { dx, vx, width, hasNeighbour } = p;
  if (!hasNeighbour || !(width > 0) || dx === 0) return 'cancel';
  if (Math.abs(dx) > PAGER_COMMIT * width) return 'commit';
  // A flick counts only in the direction the finger travelled.
  if (Math.abs(vx) > PAGER_FLING && Math.sign(vx) === Math.sign(dx)) return 'commit';
  return 'cancel';
}
