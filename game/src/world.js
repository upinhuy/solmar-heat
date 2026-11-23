// The city of Solmar: an 8x8 grid of streets, blocks full of buildings, park plazas with
// fountains, street props, and a marina along the south shore — a boardwalk, a pier and
// moored boats on the water. The south-east blocks are the industrial port: concrete yards
// stacked with shipping containers under gantry cranes. A distant skyline of towers rings
// the north and east edges, beyond the streets. Plus the helpers the rest of the game uses
// to ask the city questions (is this a road? does this circle hit a building? where is the
// nearest street?). Nothing here draws or listens to input.
import { AWNING_COLORS, COLORS, FIRST_ROAD, NEON_COLORS, ROAD_GAP, ROAD_WIDTH, SIGN_NAMES, WORLD } from './config.js';
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
export const PORT_SPOT = { x: 1990, y: 1950, angle: Math.PI / 2 }; // the port job's truck, kerbside in the dock district

// Gantry cranes are painted per crane, not all one grey: harbour colours, rust and steel.
const CRANE_COLORS = ['#39424e', '#8a5a2c', '#54626e', '#74403a'];
// Short slogans for the billboard props: brief enough to read at a glance from above.
const BILLBOARD_ADS = ['SOLMAR', 'VORTEX GT', 'TACOS RIO', 'DISCO FARO', 'BAR AZUL', 'CAFE SOL', 'MUELLE 12'];

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
  const props = []; // benches, dumpsters, crates, hydrants, newsboxes, planters: street dressing
  const fountains = []; // one at the heart of every park plaza
  const boats = [];
  const buoys = []; // channel markers bobbing on the marina water
  const yards = []; // industrial port: concrete slabs under the container stacks
  const cranes = []; // industrial port: gantry cranes straddling the yards
  const skyline = []; // distant towers along the north and east edges, outside the streets
  const half = ROAD_WIDTH / 2;
  // One building per block, inset from the streets, with a roof colour and a height for shading.
  for (let ix = 0; ix < 7; ix += 1) {
    for (let iy = 0; iy < 7; iy += 1) {
      const bx = ROADS[ix] + half + 18;
      const by = ROADS[iy] + half + 18;
      const bw = ROAD_GAP - ROAD_WIDTH - 36;
      const bh = ROAD_GAP - ROAD_WIDTH - 36;
      // The south-east blocks are the industrial port: a concrete yard, stacks of
      // shipping containers (solid — they live in the buildings list and collide like
      // buildings do), a gantry crane over most yards, dock clutter at the edges.
      if (ix >= 5 && iy >= 5) {
        yards.push({ x: bx, y: by, w: bw, h: bh });
        const stacks = intRange(random, 4, 6);
        for (let s = 0; s < stacks; s += 1) {
          const horizontal = random() < 0.5;
          const cw = horizontal ? 62 : 26;
          const ch = horizontal ? 26 : 62;
          const color = pick(random, COLORS.container);
          buildings.push({
            x: bx + 14 + random() * (bw - cw - 28),
            y: by + 14 + random() * (bh - ch - 28),
            w: cw,
            h: ch,
            color,
            roof: color,
            height: 9 + random() * 5,
            sign: null,
            awning: null,
            gear: 0,
            tank: false,
            kind: 'container',
            stack: random() < 0.4 ? 2 : 1, // some stacks stand two boxes high
          });
        }
        if (random() < 0.85) {
          cranes.push({ x: bx + bw / 2, y: by + bh / 2, span: Math.min(bw - 26, 196), angle: random() < 0.5 ? 0 : Math.PI / 2, color: pick(random, CRANE_COLORS) });
        }
        for (let t = 0; t < 2; t += 1) {
          props.push({ x: bx + random() * (bw - 24), y: by + bh - 20, w: 22, h: 14, kind: 'crate', angle: random() * 0.6 - 0.3 });
        }
        continue;
      }
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
        // Dressing the renderer reads: a neon signboard on some commercial blocks, a
        // striped awning on others, roof clutter (vents, AC boxes, a water tank).
        sign: random() < 0.3 ? { text: pick(random, SIGN_NAMES), color: pick(random, NEON_COLORS) } : null,
        awning: random() < 0.26 ? pick(random, AWNING_COLORS) : null,
        gear: intRange(random, 0, 3),
        tank: bw - inset > 120 && bh - inset > 120 && random() < 0.5,
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
          sign: null,
          awning: random() < 0.14 ? pick(random, AWNING_COLORS) : null,
          gear: intRange(random, 0, 1),
          tank: false,
        });
      }
      // Small street furniture at a block corner: a hydrant, a newsbox or a planter.
      if (random() < 0.55) {
        const kind = pick(random, ['hydrant', 'newsbox', 'planter']);
        const size = kind === 'planter' ? { w: 22, h: 12 } : { w: 9, h: 9 };
        props.push({ x: bx + 4, y: by + bh - size.h - 4, w: size.w, h: size.h, kind, angle: 0 });
      }
      // A litter bin at the opposite corner of half the blocks: the city's small print.
      if (random() < 0.5) {
        props.push({ x: bx + bw - 15, y: by + 5, w: 10, h: 10, kind: 'bin', angle: 0 });
      }
      for (let t = 0; t < 3; t += 1) {
        trees.push({ x: bx + random() * bw, y: by + random() * bh, r: 8 + random() * 6 });
      }
      // A dumpster in the alley mouth of some blocks.
      if (random() < 0.4) {
        props.push({ x: bx + random() * (bw - 30), y: by + bh - 16, w: 30, h: 15, kind: 'dumpster', angle: 0 });
      }
      // A billboard at the street corner of some blocks, its slogan lit like the neon
      // signs: downtown advertises, and the ads give the screenshots their colour pops.
      if (random() < 0.22) {
        props.push({ x: bx + bw - 46, y: by + bh - 14, w: 38, h: 11, kind: 'billboard', angle: random() * 0.24 - 0.12, color: pick(random, NEON_COLORS), text: pick(random, BILLBOARD_ADS) });
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
  // Bins along the boardwalk, between the palms: even the promenade has its small print.
  for (let i = 0; i < 3; i += 1) {
    props.push({ x: 420 + i * 700 + range(random, -30, 30), y: 2290, w: 10, h: 10, kind: 'bin', angle: 0 });
  }
  const boatColors = ['#d8d8d8', '#b8443a', '#3a6db8', '#e8b23a', '#4d8a4d'];
  for (let i = 0; i < 6; i += 1) {
    boats.push({
      x: 260 + i * 390 + range(random, -60, 60),
      y: 2352 + range(random, -8, 22),
      angle: range(random, -0.16, 0.16),
      color: pick(random, boatColors),
      sail: i % 3 === 0, // every third boat is a sailboat with a tall white triangle
      phase: random() * Math.PI * 2, // where its bobbing starts
    });
  }
  for (let i = 0; i < 5; i += 1) {
    buoys.push({ x: 340 + i * 430 + range(random, -50, 50), y: 2376 + range(random, -10, 14), phase: random() * Math.PI * 2 });
  }
  // The distant skyline: towers shoulder to shoulder along the north edge and down the
  // east edge, beyond the street grid — the bigger city that Solmar is a port of. The
  // renderer draws them flat and dark, with a scatter of lit windows.
  let sx = -12;
  while (sx < WORLD) {
    const w = 46 + random() * 60;
    skyline.push({ x: sx, y: 0, w, h: 55 + random() * 70, side: 'north' });
    sx += w + 4 + random() * 22;
  }
  let sy = 40;
  while (sy < WORLD - 260) {
    const w = 46 + random() * 60;
    skyline.push({ x: WORLD, y: sy, w, h: 55 + random() * 70, side: 'east' });
    sy += w + 4 + random() * 22;
  }
  return { buildings, trees, lamps, props, fountains, boats, buoys, yards, cranes, skyline };
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
