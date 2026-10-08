/* Can this device show a 3D scene? Light on purpose (no three.js), so a
   screen can choose its 2D view on the first render instead of mounting a
   GL view that then falls back. Reduce Motion counts as "no": every 3D
   view in the app has a 2D form that shows instead. */

import { Platform } from 'react-native';

import { useReduceMotion } from '../motion';

let checked: boolean | null = null;

/** Web only: can this browser make a WebGL2 context? three.js needs it. Native: yes. */
export function webglAvailable(): boolean {
  if (Platform.OS !== 'web') return true;
  if (checked !== null) return checked;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    checked = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    checked = false;
  }
  return checked;
}

/** Show the 3D form: GL is there and Reduce Motion is off. */
export function useCan3D(): boolean {
  const reduce = useReduceMotion();
  return !reduce && webglAvailable();
}
