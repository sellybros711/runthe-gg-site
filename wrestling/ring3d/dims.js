/* Run The Ropes 3D: the ring's measurements, shared by every module.

   Units are FEET and the origin is the middle of the canvas, on its surface.
   +x is toward the hard camera's right, +y is up, +z is toward the hard
   camera. A real ring is about 20 feet between the ropes and stands about
   four feet off the floor, so the floor is at y = FLOOR. Everything that has
   to agree about where the ropes are (the arena, the rig's climb and dive
   poses, the director's framing) reads this file, so they cannot drift. */

export const HALF = 10;            /* centre to the inside of a rope line */
export const POST = 10.6;          /* centre to a ring post, along x and z */
export const APRON = 11.6;         /* centre to the edge of the apron */
export const FLOOR = -4.0;         /* the arena floor, below the canvas */
export const ROPES = [1.55, 2.95, 4.35]; /* rope heights above the canvas, bottom to top */
export const POST_TOP = 4.9;       /* the post caps, above the canvas */
export const BARRIER = 17.5;       /* centre to the guard rail around the ringside floor */
export const PITCH = 0.42;         /* the hard camera's look down, radians */

/* the four corners, in a fixed order: back left, back right, front right, front left */
export const CORNERS = [[-POST, -POST], [POST, -POST], [POST, POST], [-POST, POST]];
