// The city of Solmar: an 8x8 grid of streets, blocks full of buildings, park plazas with
// fountains, street props, and a marina along the south shore — a boardwalk, a pier and
// moored boats on the water. Plus the helpers the rest of the game uses to ask the city
// questions (is this a road? does this circle hit a building? where is the nearest street?).
// Nothing here draws or listens to input.
import { COLORS, FIRST_ROAD, ROAD_GAP, ROAD_WIDTH, WORLD } from './config.js';
import { clamp, intRange, pick, range } from './random.js';

export const ROADS = [];
for (let i = 0; i < 8; i += 1) ROADS.push(FIRST_ROAD + i * ROAD_GAP);

// The south shore: below the last street the sidewalk gives way to a wooden boardwalk and
// then open water. The marina meet point sits on the last street, facing the pier.
export const BOARDWALK_Y = 2282;
export const WATER_Y = 2320;
export const MARINA = { x: 1950, y: 2250 };
export const PIER = { x: 1915, w: 42, from: 2296, to: 2392 };
export const SHOWROOM_SPOT = { x: 1650, y: 2296, angle: 0 }; // where the finale's car waits

export function isOnRoad(x, y) {
  const half = ROAD_WIDTH / 2;
  for (const r of ROADS) {
    if (Math.abs(x - r) <= half || Math.abs(y - r) <= half) return true;
  }
  return false;
}

/** The street centreline nearest to a coordinate. */
export function nearestRoadLine(v) {
  let best = ROADS[0];
  for (const r of ROADS) if (Math.abs(v - r) < Math.abs(v - best)) best = r;
  return best;
}

/**
 * The next point to aim at when driving from `from` to `to` through the street grid.
 * A point "belongs" to the street it sits closest to: a vertical street when its x is the
 * nearer centreline, a horizontal one otherwise. When both points belong to the same
 * street, the destination itself is the goal; otherwise the goal is the corner that keeps
 * the driver on his own street first and turns onto the destination's street — so cars
 * travel the grid instead of beelining through the blocks.
 */
export function gridTarget(from, to) {
  const fx = nearestRoadLine(from.x);
  const fy = nearestRoadLine(from.y);
  const tx = nearestRoadLine(to.x);
  const ty = nearestRoadLine(to.y);
  const fromVertical = Math.abs(from.x - fx) <= Math.abs(from.y - fy);
  const toVertical = Math.abs(to.x - tx) <= Math.abs(to.y - ty);
  if (fromVertical && toVertical && fx === tx) return { x: to.x, y: to.y };
  if (!fromVertical && !toVertical && fy === ty) return { x: to.x, y: to.y };
  let corner;
  if (fromVertical && !toVertical) corner = { x: fx, y: ty };
  else if (!fromVertical && toVertical) corner = { x: tx, y: fy };
  else if (fromVertical && toVertical) corner = { x: tx, y: fy };
  else corner = { x: fx, y: ty };
  // Already standing on the corner: the turn is made, so head for the destination itself.
  if (Math.hypot(from.x - corner.x, from.y - corner.y) < 24) return { x: to.x, y: to.y };
  return corner;
}
export function nearestRoadPoint(x, y) {
  let bestX = ROADS[0];
  let bestY = ROADS[0];
  for (const r of ROADS) {
    if (Math.abs(x - r) < Math.abs(x - bestX)) bestX = r;
    if (Math.abs(y - r) < Math.abs(y - bestY)) bestY = r;
  }
  // Snap to whichever street is closer: the vertical one or the horizontal one.
  return Math.abs(x - bestX) < Math.abs(y - bestY) ? { x: bestX, y } : { x, y: bestY };
}

export function randomRoadPoint(random) {
  const vertical = random() < 0.5;
  const road = pick(random, ROADS);
  const along = range(random, 60, WORLD - 60);
  return vertical ? { x: road, y: along } : { x: along, y: road };
}

/** True when the circle at (x, y) with radius r touches any building. */
export function hitsBuilding(buildings, x, y, r) {
  for (const b of buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of any building it overlaps; returns the building hit, if any. */
export function resolveBuildings(buildings, body, r) {
  const b = hitsBuilding(buildings, body.x, body.y, r);
  if (!b) return null;
  const left = body.x - (b.x - r);
  const right = b.x + b.w + r - body.x;
  const top = body.y - (b.y - r);
  const bottom = b.y + b.h + r - body.y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) body.x = b.x - r;
  else if (min === right) body.x = b.x + b.w + r;
  else if (min === top) body.y = b.y - r;
  else body.y = b.y + b.h + r;
  return b;
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const props = []; // benches, dumpsters and crates: pure street dressing
  const fountains = []; // one at the heart of every park plaza
  const boats = [];
  const half = ROAD_WIDTH / 2;
  // One building per block, inset from the streets, with a roof colour and a height for shading.
  for (let ix = 0; ix < 7; ix += 1) {
    for (let iy = 0; iy < 7; iy += 1) {
      const bx = ROADS[ix] + half + 18;
      const by = ROADS[iy] + half + 18;
      const bw = ROAD_GAP - ROAD_WIDTH - 36;
      const bh = ROAD_GAP - ROAD_WIDTH - 36;
      // Some blocks are park plazas instead of buildings: trees, a fountain, benches.
      if (random() < 0.16) {
        for (let t = 0; t < 8; t += 1) {
          trees.push({ x: bx + random() * bw, y: by + random() * bh, r: 9 + random() * 7 });
        }
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        fountains.push({ x: cx, y: cy, r: 26 });
        for (const [ox, oy] of [[-52, 0], [52, 0], [0, -52], [0, 52]]) {
          props.push({ x: cx + ox - 13, y: cy + oy - 5, w: 26, h: 10, kind: 'bench', angle: ox !== 0 ? Math.PI / 2 : 0 });
        }
        continue;
      }
      const color = pick(random, COLORS.building);
      const roof = pick(random, COLORS.roof);
      const inset = 14 + random() * 40;
      buildings.push({
        x: bx + inset * 0.5,
        y: by + inset * 0.5,
        w: bw - inset,
        h: bh - inset,
        color,
        roof,
        height: 14 + random() * 26,
      });
      // A third of the blocks squeeze in a smaller annex, so no two blocks read the same.
      if (random() < 0.34) {
        const aw = 56 + random() * 40;
        const ah = 56 + random() * 40;
        buildings.push({
          x: bx + 6 + random() * (bw - aw - 12),
          y: by + 6 + random() * (bh - ah - 12),
          w: aw,
          h: ah,
          color: pick(random, COLORS.building),
          roof: pick(random, COLORS.roof),
          height: 8 + random() * 14,
        });
      }
      for (let t = 0; t < 3; t += 1) {
        trees.push({ x: bx + random() * bw, y: by + random() * bh, r: 8 + random() * 6 });
      }
      // A dumpster in the alley mouth of some blocks.
      if (random() < 0.4) {
        props.push({ x: bx + random() * (bw - 30), y: by + bh - 16, w: 30, h: 15, kind: 'dumpster', angle: 0 });
      }
    }
  }
  for (const r of ROADS) {
    for (let d = 120; d < WORLD; d += 300) {
      lamps.push({ x: r + half + 6, y: d });
      lamps.push({ x: d, y: r + half + 6 });
    }
  }
  // The marina: palms along the boardwalk, crates stacked by the pier, boats on the water.
  for (let x = 200; x < WORLD - 120; x += 150) {
    trees.push({ x: x + range(random, -16, 16), y: 2300 + range(random, -6, 8), r: 10 + random() * 3, palm: true });
  }
  for (let i = 0; i < 7; i += 1) {
    props.push({ x: 1830 + random() * 260, y: 2288 + random() * 22, w: 20, h: 20, kind: 'crate', angle: random() * 0.6 - 0.3 });
  }
  const boatColors = ['#d8d8d8', '#b8443a', '#3a6db8', '#e8b23a', '#4d8a4d'];
  for (let i = 0; i < 6; i += 1) {
    boats.push({
      x: 260 + i * 390 + range(random, -60, 60),
      y: 2352 + range(random, -8, 22),
      angle: range(random, -0.16, 0.16),
      color: pick(random, boatColors),
    });
  }
  return { buildings, trees, lamps, props, fountains, boats };
}

/** A parking spot beside a street: used for parked cars and mission cars. The spot sits close
 * to the kerb (40 from the centreline) so the parked car never overlaps the block's building:
 * the nearest a building edge comes is 57 from the centreline, and the car is 17 in radius. */
export function parkingSpot(random) {
  const vertical = random() < 0.5;
  const road = pick(random, ROADS);
  const along = range(random, 200, WORLD - 200);
  const side = ROAD_WIDTH / 2 + 8;
  if (vertical) return { x: road + side, y: along, angle: Math.PI / 2 };
  return { x: along, y: road + side, angle: 0 };
}

export function clampToWorld(body, margin) {
  body.x = clamp(body.x, margin, WORLD - margin);
  body.y = clamp(body.y, margin, WORLD - margin);
}
