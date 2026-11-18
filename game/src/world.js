// The city of Solmar: an 8x8 grid of streets, blocks full of buildings, trees and lamps, and
// the helpers the rest of the game uses to ask the city questions (is this a road? does this
// circle hit a building? where is the nearest street?). Nothing here draws or listens to input.
import { COLORS, FIRST_ROAD, ROAD_GAP, ROAD_WIDTH, WORLD } from './config.js';
import { clamp, pick, range } from './random.js';

export const ROADS = [];
for (let i = 0; i < 8; i += 1) ROADS.push(FIRST_ROAD + i * ROAD_GAP);

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
 * The next point to aim at when driving from `from` to `to` through the street grid: the
 * destination itself when both are on one street, otherwise the intersection that puts the
 * driver on the destination's street. Keeps cars on roads instead of through buildings.
 */
export function gridTarget(from, to) {
  const fx = nearestRoadLine(from.x);
  const fy = nearestRoadLine(from.y);
  const tx = nearestRoadLine(to.x);
  const ty = nearestRoadLine(to.y);
  const sameStreet = (fx === tx && Math.abs(from.x - to.x) < 90) || (fy === ty && Math.abs(from.y - to.y) < 90);
  if (sameStreet) return { x: to.x, y: to.y };
  const a = { x: tx, y: fy };
  const b = { x: fx, y: ty };
  const da = (from.x - a.x) ** 2 + (from.y - a.y) ** 2;
  const db = (from.x - b.x) ** 2 + (from.y - b.y) ** 2;
  return da <= db ? a : b;
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
  const half = ROAD_WIDTH / 2;
  // One building per block, inset from the streets, with a roof colour and a height for shading.
  for (let ix = 0; ix < 7; ix += 1) {
    for (let iy = 0; iy < 7; iy += 1) {
      const bx = ROADS[ix] + half + 18;
      const by = ROADS[iy] + half + 18;
      const bw = ROAD_GAP - ROAD_WIDTH - 36;
      const bh = ROAD_GAP - ROAD_WIDTH - 36;
      // A few blocks are parks instead of buildings.
      if (random() < 0.14) {
        for (let t = 0; t < 5; t += 1) {
          trees.push({ x: bx + random() * bw, y: by + random() * bh, r: 9 + random() * 7 });
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
      for (let t = 0; t < 2; t += 1) {
        trees.push({ x: bx + random() * bw, y: by + random() * bh, r: 8 + random() * 6 });
      }
    }
  }
  for (const r of ROADS) {
    for (let d = 120; d < WORLD; d += 300) {
      lamps.push({ x: r + half + 6, y: d });
      lamps.push({ x: d, y: r + half + 6 });
    }
  }
  return { buildings, trees, lamps };
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
