/* Units shared by the lab's modules. The world is metres, y up, the plate at the origin.
   Statcast's catcher view (feet; x to the catcher's right, y toward the mound, z up) maps through
   P(), so the pitcher's view mirror comes from the camera, never from the data. */
import * as THREE from 'three';

export const FT = 0.3048;
export const P = (x, y, z) => new THREE.Vector3(-x * FT, z * FT, y * FT);
export const smooth = (x) => x * x * (3 - 2 * x);
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
