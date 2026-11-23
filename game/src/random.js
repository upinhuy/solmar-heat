// A small seeded random number generator (mulberry32): the same seed gives the same city,
// the same traffic and the same screenshot scenes, which is what makes ?shot= repeatable.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

/** A whole number from min to max, both ends included. */
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** A shuffled copy of the list (Fisher-Yates with the seeded generator). */
export function shuffled(random, list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear blend from a to b by t in [0, 1]; the renderer eases the sky with it. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle `from` to angle `to`, in radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * A deterministic hash of two integers, returned in [0, 1). The renderer uses it to give
 * every building a fixed window pattern — which windows are lit, where the roof clutter
 * sits — without spending game state on decoration: the same building hashes the same in
 * every frame and every run.
 */
export function hash01(a, b) {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
