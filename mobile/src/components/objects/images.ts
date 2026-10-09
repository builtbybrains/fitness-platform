/* The BUILT objects as still images: transparent WebPs rendered once from
   the brand's 3D models (scripts/render-hero-poster.mjs --app), at 1x, 2x
   and 3x. Metro picks the density for the screen from the @2x and @3x
   files beside each one. Every view that used to draw an object live now
   shows one of these and moves it with transforms. */

import type { ImageSourcePropType } from 'react-native';

import type { ImageBounds } from '../../lib/objects/layout';
import type { ObjectKind } from '../../lib/objects/sceneTypes';

export const OBJECT_IMAGES = {
  /** The dumbbell standing in a three-quarter view, as it floats. */
  dumbbellFloat: require('../../../assets/images/objects/dumbbell-float.webp'),
  /** The dumbbell lying on a face (Today, rest day). */
  dumbbellRest: require('../../../assets/images/objects/dumbbell-rest.webp'),
  /** The medal (a blank Carbon disc, the badge's icon is drawn on it)
      face-on, and edge-on for the start of its flip. */
  medalFace: require('../../../assets/images/objects/medal-face.webp'),
  medalEdge: require('../../../assets/images/objects/medal-edge.webp'),
  kettlebell: require('../../../assets/images/objects/kettlebell.webp'),
  shaker: require('../../../assets/images/objects/shaker.webp'),
  /** One bumper plate, for the workout's plate stack. */
  plate: require('../../../assets/images/objects/plate.webp'),
  /** The short Carbon shelf the trophy medal stands on. */
  shelf: require('../../../assets/images/objects/shelf.webp'),
  /** The green B on a black disc, no ring. */
  badge: require('../../../assets/images/objects/badge.webp'),
} satisfies Record<string, ImageSourcePropType>;

export type ObjectImageName = keyof typeof OBJECT_IMAGES;

/** The image for each questionnaire object. The medal there was the B
    medal, so it is the brand badge: the green B on black, no ring. */
export const KIND_IMAGE: Record<ObjectKind, Exclude<ObjectImageName, 'shelf'>> = {
  dumbbell: 'dumbbellFloat',
  kettlebell: 'kettlebell',
  shaker: 'shaker',
  medal: 'badge',
};

/** Where each square object sits in its image (opaque bounds, measured
    from the @2x files). The shelf is not square and has its own numbers
    in TrophyShelf. */
export const OBJECT_BOUNDS: Record<Exclude<ObjectImageName, 'shelf'>, ImageBounds> = {
  dumbbellFloat: { left: 0.107, top: 0.278, right: 0.953, bottom: 0.67 },
  dumbbellRest: { left: 0.085, top: 0.245, right: 0.963, bottom: 0.81 },
  medalFace: { left: 0.04, top: 0.04, right: 0.96, bottom: 0.96 },
  medalEdge: { left: 0.44, top: 0.04, right: 0.56, bottom: 0.96 },
  kettlebell: { left: 0.195, top: 0.07, right: 0.805, bottom: 0.92 },
  shaker: { left: 0.315, top: 0.08, right: 0.685, bottom: 0.875 },
  plate: { left: 0.058, top: 0.205, right: 0.943, bottom: 0.88 },
  badge: { left: 0.04, top: 0.04, right: 0.96, bottom: 0.96 },
};
