/* Replay any Arcade Lab run from its input log. The server's only source of
 * truth, and the same loop the browser runs a frame at a time.
 *
 * A sim module provides:
 *   create(seed, cfg)        a fresh state with .frame, .over, .score, .events
 *   applyInput(s, inp)       true if the input is legal at this moment
 *   step(s)                  one fixed step of 1/60 s
 *   detail(s)                the per-game breakdown the server stores
 *   MAX_FRAMES, MAX_INPUTS   bounds on a log
 *   waiting(s)               (optional) true while the run cannot go on
 *                            without another input, so a short log ends
 *
 * An input is { f, ... }: applied at the start of frame f, before that
 * frame's step. Several inputs may share a frame; they apply in log order.
 */
export function replay(sim, seed, inputs, cfg) {
  if (!Array.isArray(inputs) || inputs.length > sim.MAX_INPUTS) return { error: 'bad_inputs' };
  let last = 0;
  for (const inp of inputs) {
    if (!inp || typeof inp !== 'object' || !Number.isInteger(inp.f) || inp.f < last || inp.f > sim.MAX_FRAMES) return { error: 'bad_inputs' };
    last = inp.f;
  }
  const s = sim.create(seed, cfg);
  let i = 0;
  while (!s.over) {
    if (s.frame > sim.MAX_FRAMES) return { error: 'too_long' };
    while (i < inputs.length && inputs[i].f === s.frame) {
      if (!sim.applyInput(s, inputs[i])) return { error: 'illegal_input', at: i };
      i++;
    }
    if (i < inputs.length && inputs[i].f < s.frame) return { error: 'illegal_input', at: i };
    if (i >= inputs.length && sim.waiting && sim.waiting(s)) return { error: 'incomplete' };
    sim.step(s);
  }
  if (i !== inputs.length) return { error: 'illegal_input', at: i };
  return { score: s.score, detail: sim.detail(s), frames: s.frame };
}

/* Fast forward a fresh sim to a frame, for resuming a run left mid-way. */
export function runTo(sim, seed, cfg, inputs, frame) {
  const s = sim.create(seed, cfg);
  let i = 0;
  while (!s.over && s.frame < frame) {
    while (i < inputs.length && inputs[i].f === s.frame) { sim.applyInput(s, inputs[i]); i++; }
    sim.step(s);
  }
  return s;
}
