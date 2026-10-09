# BUILT object images (app)

Transparent WebP stills of the BUILT objects, rendered once from the website's 3D models
(`assets/js/src/site-3d.js`), so the app shows the same objects with the same studio light and
never runs three.js. Each image comes at 1x, 2x and 3x (`name.webp`, `name@2x.webp`,
`name@3x.webp`); Metro picks the density for the screen.

Made by:

```
node scripts/build-site-3d.mjs                 # bundles the scenes (needs esbuild and three, see the script)
node scripts/render-hero-poster.mjs --app      # writes every file below
node scripts/render-hero-poster.mjs --app --only plate,shelf   # just some of them
```

| File | 1x size | Pose |
| --- | --- | --- |
| `dumbbell-float` | 200 x 200 | The hex dumbbell (green collars, the B on each head) in the sign-in pose: three-quarter turn (-0.62 rad), handle leaning 0.2 rad, seen from 0.2 rad up. No shadow, so it can bob. |
| `dumbbell-rest` | 200 x 200 | The same dumbbell lying on a hex face, three-quarter turn, seen from 0.5 rad up (Today, rest day). |
| `medal-face` | 200 x 200 | The trophy medal face-on: a Carbon disc with a soft bevel, blank face, no ring. The disc fills 92% of the frame. Draw the milestone's icon on top. |
| `medal-edge` | 200 x 200 | The same medal turned edge-on, in the same frame, for the start of its flip. |
| `kettlebell` | 200 x 200 | The cast-iron kettlebell, the B on the bell, turned 0.22 rad. |
| `shaker` | 200 x 200 | The shaker: matte black bottle, the B, twist cap with a thin green collar, turned 0.3 rad. |
| `plate` | 200 x 200 | One rubber bumper plate lying flat, the green ring on its hub, seen from 0.8 rad up (the plate stack's angle). |
| `shelf` | 300 x 120 | The short matte Carbon trophy shelf, without its medal. |
| `badge` | 200 x 200 | The logo badge: the green B on a black disc with a soft bevel, no ring. The disc fills 92% of the frame. |

Placement numbers (fractions of the image, measured by the render script):

- `plate`: the top face's centre is at x 0.5, y 0.472; the face is 0.634 of the image tall; one
  plate's thickness is 0.054 of the image height. To stack plates, draw each copy 0.054 x the
  image height above the one under it (scale a smaller plate about the face centre).
- `shelf`: the medal stands centred at x 0.5, y 0.478 of the shelf image; its disc is 0.873 of
  the shelf image's height across. Since `medal-face` fills 92% of its own frame, draw it in a
  square box 0.949 x the shelf image's height, centred on that point.
