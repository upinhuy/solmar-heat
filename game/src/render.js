// Drawing only: the city, the cars and people, the HUD, the minimap and the menus. The
// camera follows the player across the 2400x2400 city, and a 1280x720 window of the world is
// fitted to the canvas, letterboxed. The city reads in layers: grass and sidewalks with
// pavement joints, streets with wheel tracks, kerb lines, centrelines and zebra crossings,
// park plazas with fountains, the marina boardwalk and its animated water, the beach
// resort district west of it — a wide sand beach with umbrellas, loungers, kiosks and
// lifeguard towers, pastel resort blocks with pools behind the coast road — the industrial
// port's concrete yards, container stacks and gantry cranes in the south-east, a distant
// skyline ringing the north and east edges, then buildings drawn as low extruded blocks —
// a parapet roof with clutter on top, a windowed south face below it, neon signboards and
// striped awnings on the commercial blocks, billboards glowing over the corners and litter
// bins at the kerbs. Cars are drawn per body shape — sedan,
// hatchback, pickup, van, sport, limousine and motorcycle — with shading, glass
// reflections, wheels, mirrors and lights; taxis wear a roof sign, police a flashing
// light bar. Traffic signals stand at every intersection, their lamps cycling with the
// city's clock, and at five stars a police helicopter hangs over the chase — a ground
// shadow thrown away from the machine, a searchlight pool under it, a blurred rotor
// disc spinning above a dark PD body. Shadows fall in two soft layers. At dusk a warm gradient washes the top of
// the view; at night the street lamps pool light on the asphalt, neon spills onto the
// sidewalks and reflects in wet streaks, windows light up floor by floor and every car
// throws a headlight cone. When it rains the streets shine and the neon doubles. Canvas
// shapes and text, no assets.
import { COLORS, FIRST_ROAD, ROAD_GAP, ROAD_WIDTH, WANTED_MAX, WORLD } from './config.js';
import { COURIER_DEPOT, HIDEOUT, MISSIONS, RACE_START, activityMarker, missionMarker } from './missions.js';
import { BEACH_EAST, BEACH_PIER, BEACH_SAND_TOP, BEACH_WATER_Y, BOARDWALK_Y, PIER, ROADS, WATER_Y, signalPhase } from './world.js';
import { hash01, lerp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_DONE = 'done';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const VIEW_W = 1280;
const VIEW_H = 720;
const MINI = 150;

function hourOf(clockMinutes) {
  return (clockMinutes / 60) % 24;
}

/** 0 in full daylight, 1 at the darkest hour; used for the lighting overlay. */
function darkness(clockMinutes) {
  const h = hourOf(clockMinutes);
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 19) return (h - 17) / 2 * 0.45;
  if (h >= 19 || h < 5) return 0.45;
  return (1 - (h - 5) / 2) * 0.45;
}

function clockText(clockMinutes) {
  const h = Math.floor(hourOf(clockMinutes));
  const m = Math.floor(clockMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 0 in full day, 1 at the heart of dawn or dusk; drives the warm sky wash. */
function duskGlow(clockMinutes) {
  const h = hourOf(clockMinutes);
  if (h >= 16.5 && h < 18) return (h - 16.5) / 1.5;
  if (h >= 18 && h < 19.5) return 1 - (h - 18) / 1.5;
  if (h >= 5 && h < 6.5) return (h - 5) / 1.5;
  if (h >= 6.5 && h < 8) return 1 - (h - 6.5) / 1.5;
  return 0;
}

/** Darken (f < 1) or lighten (f > 1) a #rrggbb colour, returned as rgb(). */
function shade(hex, f) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

/** How tall a building's windowed south face is: taller buildings stand taller. */
function faceHeight(b) {
  return Math.max(8, Math.min(22, b.height * 0.5));
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    view.x = (canvas.width - VIEW_W * view.scale) / 2;
    view.y = (canvas.height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || 400}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || 400} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Trace a rounded-rectangle path; the caller fills or strokes it. */
  function rr(x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + rad, y);
    context.arcTo(x + w, y, x + w, y + h, rad);
    context.arcTo(x + w, y + h, x, y + h, rad);
    context.arcTo(x, y + h, x, y, rad);
    context.arcTo(x, y, x + w, y, rad);
    context.closePath();
  }

  /** The world rectangle the camera currently shows, for skipping off-screen detail. */
  function visible(cam) {
    return { x0: -cam.x - 80, y0: -cam.y - 80, x1: -cam.x + VIEW_W + 80, y1: -cam.y + VIEW_H + 80 };
  }

  /** A neon signboard straddling a building's roofline, glowing once the light goes. */
  function drawSign(b, bx, by, dark) {
    const label = b.sign.text;
    context.font = `700 10px ${FONT}`;
    const w = Math.min(b.w - 8, context.measureText(label).width + 16);
    const x = bx + (b.w - w) / 2;
    const y = by + b.h - 5;
    context.save();
    if (dark > 0.08) {
      context.shadowColor = b.sign.color;
      context.shadowBlur = 13 * dark + 3;
    }
    context.fillStyle = '#17121a';
    rr(x, y, w, 13, 3);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = b.sign.color;
    context.lineWidth = 1.4;
    rr(x, y, w, 13, 3);
    context.stroke();
    context.fillStyle = b.sign.color;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText(label, bx + b.w / 2, y + 10.5);
    context.restore();
  }

  /** One traffic-signal head: a dark post box with red, amber and green lamps stacked
   * down it. The lamp for the current phase burns bright (and glows after dark); the
   * other two sit dim, so a driver can read the light from across the intersection. */
  function drawSignalHead(x, y, phase, dark) {
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.fillRect(x + 1.5, y + 2.5, 7, 17);
    context.fillStyle = '#14161a';
    rr(x, y, 7, 17, 2);
    context.fill();
    const lamps = [['#e23b30', 'red'], ['#f2a81d', 'yellow'], ['#3fd06a', 'green']];
    for (let i = 0; i < 3; i += 1) {
      const [color, name] = lamps[i];
      const lit = phase === name;
      context.save();
      if (lit && dark > 0.1) {
        context.shadowColor = color;
        context.shadowBlur = 7 * dark;
      }
      context.fillStyle = color;
      context.globalAlpha = lit ? 1 : 0.22;
      context.beginPath();
      context.arc(x + 3.5, y + 3.5 + i * 5.5, 1.9, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    context.globalAlpha = 1;
  }

  function drawCity(game, cam) {
    const { city } = game;
    const vis = visible(cam);
    const dark = darkness(game.clock);
    context.fillStyle = COLORS.grass;
    context.fillRect(cam.x, cam.y, WORLD, WORLD);
    // Mown stripes so the grass is not one flat colour.
    context.fillStyle = COLORS.grassDark;
    for (let y = 0; y < WORLD; y += 120) context.fillRect(cam.x, cam.y + y, WORLD, 60);
    // The distant skyline: flat dark towers along the north and east edges, their
    // windows pricking lit as the day darkens. Pure backdrop — the city beyond Solmar.
    for (const t of city.skyline || []) {
      const tx = t.side === 'north' ? cam.x + t.x : cam.x + t.x - t.h;
      const ty = t.side === 'north' ? cam.y : cam.y + t.y;
      const tw = t.side === 'north' ? t.w : t.h;
      const th = t.side === 'north' ? t.h : t.w;
      if (tx > vis.x1 || tx + tw < vis.x0 || ty > vis.y1 || ty + th < vis.y0) continue;
      context.fillStyle = COLORS.skyline;
      context.globalAlpha = 0.88 + dark * 0.12;
      context.fillRect(tx, ty, tw, th);
      context.globalAlpha = 1;
      if (dark > 0.1) {
        context.fillStyle = COLORS.skylineLit;
        const cols = Math.max(2, Math.floor(tw / 13));
        const rowsN = Math.max(2, Math.floor(th / 15));
        for (let cx2 = 0; cx2 < cols; cx2 += 1) {
          for (let ry2 = 0; ry2 < rowsN; ry2 += 1) {
            if (hash01(t.x + cx2 * 71, t.y + ry2 * 97) < 0.16 + dark * 0.3) {
              context.globalAlpha = 0.5 + dark * 0.5;
              context.fillRect(tx + 4 + cx2 * ((tw - 8) / cols), ty + 5 + ry2 * ((th - 9) / rowsN), 3.5, 4.5);
            }
          }
        }
        context.globalAlpha = 1;
      }
    }
    // Sidewalks around every block, with pavement joints so the concrete reads as slabs.
    const blockSize = ROAD_GAP - ROAD_WIDTH;
    for (let ix = 0; ix < 7; ix += 1) {
      for (let iy = 0; iy < 7; iy += 1) {
        const sx = ROADS[ix] + ROAD_WIDTH / 2;
        const sy = ROADS[iy] + ROAD_WIDTH / 2;
        if (sx > vis.x1 || sx + blockSize < vis.x0 || sy > vis.y1 || sy + blockSize < vis.y0) continue;
        context.fillStyle = COLORS.sidewalk;
        context.fillRect(cam.x + sx, cam.y + sy, blockSize, blockSize);
        context.fillStyle = COLORS.sidewalkLine;
        context.globalAlpha = 0.45;
        for (let j = 59; j < blockSize; j += 59) {
          context.fillRect(cam.x + sx + j, cam.y + sy, 1.5, blockSize);
          context.fillRect(cam.x + sx, cam.y + sy + j, blockSize, 1.5);
        }
        context.globalAlpha = 1;
      }
    }
    // Park plazas: a paved apron under each fountain.
    context.fillStyle = COLORS.plaza;
    for (const f of city.fountains) {
      context.fillRect(cam.x + f.x - 62, cam.y + f.y - 62, 124, 124);
    }
    // The port yards: concrete slabs with painted bay lines under the container stacks.
    for (const yard of city.yards || []) {
      if (yard.x > vis.x1 || yard.x + yard.w < vis.x0 || yard.y > vis.y1 || yard.y + yard.h < vis.y0) continue;
      context.fillStyle = COLORS.yard;
      context.fillRect(cam.x + yard.x, cam.y + yard.y, yard.w, yard.h);
      context.strokeStyle = COLORS.yardLine;
      context.globalAlpha = 0.35;
      context.lineWidth = 2;
      for (let ly = yard.y + 34; ly < yard.y + yard.h - 10; ly += 34) {
        context.beginPath();
        context.moveTo(cam.x + yard.x + 8, cam.y + ly);
        context.lineTo(cam.x + yard.x + yard.w - 8, cam.y + ly);
        context.stroke();
      }
      context.globalAlpha = 1;
    }
    // The resort aprons behind the beach: pale packed sand under the hotels, speckled
    // like the beach it serves, with each resort's pool a turquoise inlay — a white rim,
    // a deep lane down the middle and a ladder at the shallow end.
    for (const r of city.resorts || []) {
      if (r.x > vis.x1 || r.x + r.w < vis.x0 || r.y > vis.y1 || r.y + r.h < vis.y0) continue;
      context.fillStyle = COLORS.sandPale;
      context.fillRect(cam.x + r.x, cam.y + r.y, r.w, r.h);
      context.fillStyle = 'rgba(166,143,94,0.35)';
      for (let s = 0; s < 14; s += 1) {
        context.fillRect(cam.x + r.x + hash01(r.x + s * 41, r.y) * (r.w - 8), cam.y + r.y + hash01(r.x, r.y + s * 67) * (r.h - 6), 5, 3);
      }
    }
    for (const pool of city.pools || []) {
      const px = cam.x + pool.x - pool.w / 2;
      const py = cam.y + pool.y - pool.h / 2;
      if (px > vis.x1 || px + pool.w < vis.x0 || py > vis.y1 || py + pool.h < vis.y0) continue;
      context.fillStyle = 'rgba(0,0,0,0.12)';
      rr(px + 3, py + 4, pool.w, pool.h, 9);
      context.fill();
      context.fillStyle = '#e8e2d4';
      rr(px, py, pool.w, pool.h, 9);
      context.fill();
      context.fillStyle = COLORS.pool;
      rr(px + 4, py + 4, pool.w - 8, pool.h - 8, 6);
      context.fill();
      context.fillStyle = COLORS.poolDeep;
      context.fillRect(px + pool.w / 2 - 2, py + 6, 4, pool.h - 12);
      context.strokeStyle = 'rgba(255,255,255,0.4)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(px + 10, py + 7);
      context.lineTo(px + 10, py + pool.h - 7);
      context.moveTo(px + 15, py + 7);
      context.lineTo(px + 15, py + pool.h - 7);
      context.stroke();
    }
    // Roads: asphalt, darker wheel tracks where the tyres run, pale kerb edges.
    context.fillStyle = COLORS.road;
    for (const r of ROADS) {
      context.fillRect(cam.x + r - ROAD_WIDTH / 2, cam.y, ROAD_WIDTH, WORLD);
      context.fillRect(cam.x, cam.y + r - ROAD_WIDTH / 2, WORLD, ROAD_WIDTH);
    }
    context.fillStyle = COLORS.roadTrack;
    for (const r of ROADS) {
      context.fillRect(cam.x + r - 18, cam.y, 10, WORLD);
      context.fillRect(cam.x + r + 8, cam.y, 10, WORLD);
      context.fillRect(cam.x, cam.y + r - 18, WORLD, 10);
      context.fillRect(cam.x, cam.y + r + 8, WORLD, 10);
    }
    context.fillStyle = COLORS.roadEdge;
    context.globalAlpha = 0.5;
    for (const r of ROADS) {
      const halfR = ROAD_WIDTH / 2;
      context.fillRect(cam.x + r - halfR, cam.y, 2, WORLD);
      context.fillRect(cam.x + r + halfR - 2, cam.y, 2, WORLD);
      context.fillRect(cam.x, cam.y + r - halfR, WORLD, 2);
      context.fillRect(cam.x, cam.y + r + halfR - 2, WORLD, 2);
    }
    context.globalAlpha = 1;
    // Dashed centrelines.
    context.fillStyle = COLORS.roadLine;
    for (const r of ROADS) {
      for (let d = 20; d < WORLD; d += 60) {
        context.fillRect(cam.x + r - 2, cam.y + d, 4, 28);
        context.fillRect(cam.x + d, cam.y + r - 2, 28, 4);
      }
    }
    // Manhole covers, now and then along the streets.
    context.fillStyle = 'rgba(0,0,0,0.20)';
    for (const r of ROADS) {
      for (let d = 130; d < WORLD; d += 210) {
        const off = (hash01(r, d) - 0.5) * 26;
        context.beginPath();
        context.arc(cam.x + r + off, cam.y + d, 5, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(cam.x + d, cam.y + r + off, 5, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Wet streets: after dark, and whenever it rains, the asphalt takes a pale sheen —
    // the base the lamp pools and neon reflections sit on.
    const wet = Math.max(game.weather && game.weather.rain > 0 ? 0.9 : 0, dark > 0.2 ? 0.55 : 0);
    if (wet > 0) {
      context.fillStyle = COLORS.wetSheen;
      context.globalAlpha = wet;
      for (const r of ROADS) {
        context.fillRect(cam.x + r - ROAD_WIDTH / 2, cam.y, ROAD_WIDTH, WORLD);
        context.fillRect(cam.x, cam.y + r - ROAD_WIDTH / 2, WORLD, ROAD_WIDTH);
      }
      context.globalAlpha = 1;
    }
    // Zebra crossings at the intersections in view.
    context.fillStyle = COLORS.crosswalk;
    const half = ROAD_WIDTH / 2;
    for (const rx of ROADS) {
      for (const ry of ROADS) {
        if (rx < vis.x0 || rx > vis.x1 || ry < vis.y0 || ry > vis.y1) continue;
        for (let s = -1; s <= 1; s += 1) {
          context.fillRect(cam.x + rx - half + 6, cam.y + ry - half - 14 + (s + 1) * 7, ROAD_WIDTH - 12, 4);
          context.fillRect(cam.x + rx - half + 6, cam.y + ry + half + 3 + (s + 1) * 7, ROAD_WIDTH - 12, 4);
          context.fillRect(cam.x + rx - half - 14 + (s + 1) * 7, cam.y + ry - half + 6, 4, ROAD_WIDTH - 12);
          context.fillRect(cam.x + rx + half + 3 + (s + 1) * 7, cam.y + ry - half + 6, 4, ROAD_WIDTH - 12);
        }
      }
    }
    // Traffic signals at the intersections in view: one head for the north-south flow
    // on the south-east corner, one for east-west on the south-west, each showing its
    // direction's current lamp.
    for (const s of city.signals || []) {
      if (s.x < vis.x0 || s.x > vis.x1 || s.y < vis.y0 || s.y > vis.y1) continue;
      const phase = signalPhase(s, game.time);
      drawSignalHead(cam.x + s.x + half + 7, cam.y + s.y + half + 7, phase.ns, dark);
      drawSignalHead(cam.x + s.x - half - 14, cam.y + s.y + half + 7, phase.ew, dark);
    }
    // The marina shore, east of the beach: boardwalk planks and a railing, a wet-sand
    // band, then open water. The boardwalk starts where the beach ends (BEACH_EAST).
    context.fillStyle = COLORS.boardwalk;
    context.fillRect(cam.x + BEACH_EAST, cam.y + BOARDWALK_Y, WORLD - BEACH_EAST, WATER_Y - BOARDWALK_Y);
    context.fillStyle = COLORS.boardwalkDark;
    for (let x = BEACH_EAST; x < WORLD; x += 26) context.fillRect(cam.x + x, cam.y + BOARDWALK_Y, 2, WATER_Y - BOARDWALK_Y);
    for (let y = BOARDWALK_Y + 12; y < WATER_Y; y += 13) context.fillRect(cam.x + BEACH_EAST, cam.y + y, WORLD - BEACH_EAST, 1.5);
    // The railing along the water: posts and a top rail.
    context.fillStyle = '#4a3826';
    for (let x = BEACH_EAST + 8; x < WORLD; x += 62) context.fillRect(cam.x + x, cam.y + WATER_Y - 7, 3, 7);
    context.fillRect(cam.x + BEACH_EAST, cam.y + WATER_Y - 7, WORLD - BEACH_EAST, 2);
    context.fillStyle = COLORS.sandWet;
    context.fillRect(cam.x + BEACH_EAST, cam.y + WATER_Y, WORLD - BEACH_EAST, 7);
    // The water itself: a deep band under a lighter one, foam at the shore, drifting sparkle.
    context.fillStyle = COLORS.waterDeep;
    context.fillRect(cam.x, cam.y + WATER_Y + 44, WORLD, WORLD - WATER_Y - 44);
    context.fillStyle = COLORS.water;
    context.fillRect(cam.x, cam.y + WATER_Y, WORLD, 44);
    context.strokeStyle = COLORS.foam;
    context.globalAlpha = 0.55;
    context.lineWidth = 2;
    context.beginPath();
    for (let x = 0; x <= WORLD; x += 40) {
      const fy = WATER_Y + 8 + Math.sin(game.time * 1.1 + x * 0.02) * 2.5;
      if (x === 0) context.moveTo(cam.x + x, cam.y + fy);
      else context.lineTo(cam.x + x, cam.y + fy);
    }
    context.stroke();
    context.globalAlpha = 1;
    context.strokeStyle = COLORS.waterLight;
    context.lineWidth = 2;
    for (let row = 0; row < 3; row += 1) {
      const wy = WATER_Y + 24 + row * 26;
      for (let x = 30; x < WORLD; x += 110) {
        const off = Math.sin(game.time * 0.7 + x * 0.05 + row * 2) * 8;
        context.globalAlpha = 0.45 + 0.3 * Math.sin(game.time * 1.4 + x * 0.11 + row * 1.7);
        context.beginPath();
        context.moveTo(cam.x + x + off, cam.y + wy);
        context.lineTo(cam.x + x + 34 + off, cam.y + wy);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    // The beach, west of the marina: a wide wedge of sand laid over the shore the
    // boardwalk used to run — dry pale sand at the top with a speckle of shells, a
    // darker wet band where the waves reach, and its own foam line breathing at the
    // beach's lower waterline. The sea the swimmers get is the same sea; the sand
    // simply shelves into it further out.
    context.fillStyle = COLORS.sandDry;
    context.fillRect(cam.x, cam.y + BEACH_SAND_TOP, BEACH_EAST, BEACH_WATER_Y - BEACH_SAND_TOP);
    if (BEACH_SAND_TOP < vis.y1 && BEACH_WATER_Y > vis.y0) {
      context.fillStyle = 'rgba(255,246,220,0.5)';
      for (let sx = 14; sx < BEACH_EAST; sx += 46) {
        if (sx > vis.x1) break;
        for (let sy = 0; sy < 3; sy += 1) {
          context.fillRect(cam.x + sx + hash01(sx, sy * 31) * 22, cam.y + BEACH_SAND_TOP + 6 + sy * 15 + hash01(sx * 3, sy) * 7, 4, 2.5);
        }
      }
    }
    context.fillStyle = COLORS.sandWet;
    context.fillRect(cam.x, cam.y + BEACH_WATER_Y - 13, BEACH_EAST, 13);
    context.strokeStyle = COLORS.foam;
    context.globalAlpha = 0.6;
    context.lineWidth = 2;
    context.beginPath();
    for (let x = 0; x <= BEACH_EAST; x += 40) {
      const fy = BEACH_WATER_Y + 3 + Math.sin(game.time * 1.1 + x * 0.02 + 2) * 2.5;
      if (x === 0) context.moveTo(cam.x + x, cam.y + fy);
      else context.lineTo(cam.x + x, cam.y + fy);
    }
    context.stroke();
    context.globalAlpha = 1;
    // The beach pier: a second, smaller jetty reaching over the swimming water.
    context.fillStyle = COLORS.boardwalkDark;
    context.fillRect(cam.x + BEACH_PIER.x, cam.y + BEACH_PIER.from, BEACH_PIER.w, BEACH_PIER.to - BEACH_PIER.from);
    context.fillStyle = COLORS.boardwalk;
    context.fillRect(cam.x + BEACH_PIER.x + 3, cam.y + BEACH_PIER.from, BEACH_PIER.w - 6, BEACH_PIER.to - BEACH_PIER.from);
    context.fillStyle = '#241a12';
    for (let y = BEACH_PIER.from + 10; y < BEACH_PIER.to; y += 36) {
      context.fillRect(cam.x + BEACH_PIER.x - 3, cam.y + y, 5, 5);
      context.fillRect(cam.x + BEACH_PIER.x + BEACH_PIER.w - 2, cam.y + y, 5, 5);
    }
    // Kiosks along the top of the sand: a striped awning roof over a pale stall, its
    // name painted on the front — helados, refrescos, cocos.
    for (const k of city.kiosks || []) {
      if (k.x > vis.x1 || k.x < vis.x0) continue;
      const kx = cam.x + k.x - 17;
      const ky = cam.y + k.y - 9;
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(kx + 3, ky + 4, 34, 17);
      context.fillStyle = '#e8e2d4';
      context.fillRect(kx, ky + 4, 34, 15);
      context.fillStyle = 'rgba(0,0,0,0.16)';
      context.fillRect(kx, ky + 16, 34, 3);
      for (let s = 0; s < 38; s += 7) {
        context.fillStyle = (s / 7) % 2 === 0 ? k.color : '#e8e2d4';
        context.fillRect(kx - 2 + s, ky, Math.min(7, 38 - s), 5);
      }
      context.fillStyle = '#4a3a2e';
      context.font = `700 6.5px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(k.label, kx + 17, ky + 13.5);
    }
    // Lifeguard towers: a white hut on stilts with a red cross over the door, watching
    // the swimming water from the middle of the sand.
    for (const t of city.lifeguards || []) {
      if (t.x > vis.x1 || t.x < vis.x0) continue;
      const tx = cam.x + t.x;
      const ty = cam.y + t.y;
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(tx - 9, ty + 3, 22, 15);
      context.strokeStyle = '#6f573c';
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(tx - 8, ty + 8);
      context.lineTo(tx - 5, ty - 4);
      context.moveTo(tx + 8, ty + 8);
      context.lineTo(tx + 5, ty - 4);
      context.stroke();
      context.fillStyle = '#f0ece2';
      context.fillRect(tx - 10, ty - 13, 20, 13);
      context.fillStyle = '#b03024';
      context.fillRect(tx - 10, ty - 15, 20, 3.5);
      context.fillRect(tx - 1.6, ty - 8.5, 3.2, 6.5);
      context.fillRect(tx - 3.2, ty - 7, 6.4, 3.2);
      context.fillStyle = 'rgba(20,30,44,0.85)';
      context.fillRect(tx + 3, ty - 10, 5, 6);
    }
    // Umbrellas and loungers on the sand: a bright canopy on a tilted pole — the
    // canopy breathes a degree or two in the sea breeze — and under each, a lounger
    // or a towel laid out for the sun.
    for (const l of city.loungers || []) {
      if (l.x < vis.x0 || l.x > vis.x1 || l.y < vis.y0 || l.y > vis.y1) continue;
      context.save();
      context.translate(cam.x + l.x, cam.y + l.y);
      context.rotate(l.angle || 0);
      context.fillStyle = 'rgba(0,0,0,0.10)';
      context.fillRect(-12, -4, 26, 10);
      if (l.towel) {
        context.fillStyle = l.color;
        context.globalAlpha = 0.85;
        context.fillRect(-13, -4.5, 26, 9);
        context.globalAlpha = 1;
        context.fillStyle = 'rgba(255,255,255,0.55)';
        context.fillRect(-13, -1.2, 26, 2.2);
      } else {
        context.fillStyle = '#e8e2d4';
        context.fillRect(-14, -4, 28, 8);
        context.fillStyle = l.color;
        context.fillRect(-14, -4, 10, 8);
        context.fillStyle = 'rgba(0,0,0,0.18)';
        context.fillRect(2, -4, 1.6, 8);
      }
      context.restore();
    }
    for (const u of city.umbrellas || []) {
      if (u.x < vis.x0 || u.x > vis.x1 || u.y < vis.y0 || u.y > vis.y1) continue;
      const sway = Math.sin(game.time * 1.2 + (u.phase || 0)) * 0.03;
      context.save();
      context.translate(cam.x + u.x, cam.y + u.y);
      context.rotate(sway);
      context.fillStyle = 'rgba(0,0,0,0.16)';
      context.beginPath();
      context.ellipse(4, 5, 16, 7.5, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#6f573c';
      context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(0, 3);
      context.lineTo(1.5, -3);
      context.stroke();
      context.fillStyle = u.color;
      context.beginPath();
      context.moveTo(-18, -3);
      context.quadraticCurveTo(0, -13.5, 18, -3);
      context.quadraticCurveTo(9, -0.5, 0, -2.6);
      context.quadraticCurveTo(-9, -0.5, -18, -3);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.beginPath();
      context.moveTo(-6, -5);
      context.quadraticCurveTo(0, -10.5, 6, -5);
      context.quadraticCurveTo(0, -3.4, -6, -5);
      context.closePath();
      context.fill();
      context.restore();
    }
    // The pier reaching into the water.
    context.fillStyle = COLORS.boardwalkDark;
    context.fillRect(cam.x + PIER.x, cam.y + PIER.from, PIER.w, PIER.to - PIER.from);
    context.fillStyle = '#241a12';
    for (let y = PIER.from + 8; y < PIER.to; y += 34) {
      context.fillRect(cam.x + PIER.x - 3, cam.y + y, 5, 5);
      context.fillRect(cam.x + PIER.x + PIER.w, cam.y + y, 5, 5);
    }
    // Buoys bob on the swell: a red drum with a white band, and a faint ripple ring.
    for (const buoy of city.buoys || []) {
      const bob = Math.sin(game.time * 1.3 + buoy.phase) * 2;
      context.strokeStyle = 'rgba(191,227,242,0.4)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(cam.x + buoy.x, cam.y + buoy.y + bob, 8 + Math.sin(game.time * 1.3 + buoy.phase) * 1.5, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#c23b2e';
      context.beginPath();
      context.arc(cam.x + buoy.x, cam.y + buoy.y + bob, 4.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8e8e8';
      context.fillRect(cam.x + buoy.x - 4.5, cam.y + buoy.y + bob - 1.5, 9, 3);
    }
    // Boats ride at anchor, bobbing gently: a hull, a cabin, a mast — sailboats fly a sail.
    for (const b of city.boats) {
      const bob = Math.sin(game.time * 0.9 + (b.phase || 0)) * 2;
      context.save();
      context.translate(cam.x + b.x, cam.y + b.y + bob);
      context.rotate(b.angle);
      context.fillStyle = 'rgba(10,30,44,0.35)';
      context.fillRect(-24, 2, 52, 14);
      context.fillStyle = b.color;
      context.fillRect(-26, -10, 52, 18);
      context.fillStyle = shade(b.color.startsWith('#') ? b.color : '#888888', 0.7);
      context.fillRect(-26, 4, 52, 4);
      if (b.sail) {
        context.strokeStyle = '#5d4a35';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(2, -8);
        context.lineTo(2, -34);
        context.stroke();
        context.fillStyle = 'rgba(240,244,248,0.92)';
        context.beginPath();
        context.moveTo(4, -33);
        context.lineTo(4, -10);
        context.lineTo(20, -10);
        context.closePath();
        context.fill();
      } else {
        context.fillStyle = '#e8e8e8';
        context.fillRect(-4, -7, 14, 12);
        context.fillStyle = '#5d4a35';
        context.fillRect(14, -8, 2, 16);
      }
      context.restore();
    }
    // Hideout: a yellow lot in the south-west corner, with painted parking bays and tyres.
    context.fillStyle = '#8a7a2e';
    context.fillRect(cam.x + HIDEOUT.x - 70, cam.y + HIDEOUT.y - 70, 140, 140);
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      context.strokeRect(cam.x + HIDEOUT.x - 58 + i * 30, cam.y + HIDEOUT.y + 26, 26, 34);
    }
    context.fillStyle = '#1c1c1c';
    for (const [tx, ty] of [[-58, -52], [-46, -52], [-52, -40]]) {
      context.beginPath();
      context.arc(cam.x + HIDEOUT.x + tx, cam.y + HIDEOUT.y + ty, 7, 0, Math.PI * 2);
      context.fill();
    }
    text('HIDEOUT', cam.x + HIDEOUT.x, cam.y + HIDEOUT.y + 4, 13, '#f2c230', 'center', 700);
    // Buildings as low extruded blocks: a soft shadow, a windowed south face, then the
    // parapet roof with its clutter. Windows light up as the day darkens. The port's
    // containers take a branch of their own: corrugated boxes in harbour colours.
    for (const b of city.buildings) {
      if (b.x > vis.x1 || b.x + b.w < vis.x0 || b.y > vis.y1 + 40 || b.y + b.h + 24 < vis.y0) continue;
      const bx = cam.x + b.x;
      const by = cam.y + b.y;
      const faceH = faceHeight(b);
      if (b.kind === 'container') {
        const hex = b.color.startsWith('#') ? b.color : '#888888';
        const lift = b.stack === 2 ? 6 : 2;
        // A two-layer shadow, longer for the two-high stacks.
        context.fillStyle = 'rgba(0,0,0,0.13)';
        context.fillRect(bx + 12, by + 11 + lift, b.w, b.h);
        context.fillStyle = 'rgba(0,0,0,0.24)';
        context.fillRect(bx + 6, by + 5 + lift, b.w, b.h);
        // The box: a darker rim (the sides) around a sunlit top face.
        context.fillStyle = shade(hex, 0.7);
        context.fillRect(bx, by, b.w, b.h);
        context.fillStyle = shade(hex, 1.1);
        context.fillRect(bx + 3, by + 3, b.w - 6, b.h - 6);
        // Corrugation ribs across the top.
        context.strokeStyle = 'rgba(0,0,0,0.16)';
        context.lineWidth = 1.5;
        context.beginPath();
        if (b.w >= b.h) {
          for (let rx = bx + 8; rx < bx + b.w - 4; rx += 7) {
            context.moveTo(rx, by + 4);
            context.lineTo(rx, by + b.h - 4);
          }
        } else {
          for (let ry = by + 8; ry < by + b.h - 4; ry += 7) {
            context.moveTo(bx + 4, ry);
            context.lineTo(bx + b.w - 4, ry);
          }
        }
        context.stroke();
        // A second box on top of the tall stacks, and the harbour stencil at the door end.
        if (b.stack === 2) {
          context.fillStyle = shade(hex, 1.22);
          context.fillRect(bx + 6, by - 3, b.w - 12, b.h - 5);
          context.strokeStyle = 'rgba(0,0,0,0.22)';
          context.lineWidth = 1.5;
          context.strokeRect(bx + 6, by - 3, b.w - 12, b.h - 5);
        }
        if (b.w >= 50) text('SOLMAR', bx + 6, by + b.h - 5, 7, 'rgba(255,255,255,0.55)', 'left', 700);
        continue;
      }
      // A soft shadow in two layers: a wide faint throw under a tighter darker one.
      context.fillStyle = 'rgba(0,0,0,0.10)';
      context.fillRect(bx + 13, by + faceH + 14, b.w, b.h);
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(bx + 8, by + faceH + 9, b.w, b.h);
      // The south face and its window grid.
      context.fillStyle = shade(b.color, 0.64);
      context.fillRect(bx, by + b.h, b.w, faceH);
      const cols = Math.max(2, Math.floor(b.w / 17));
      const rowsN = Math.max(1, Math.floor(faceH / 10));
      const litRatio = 0.1 + dark * 0.8;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let ry = 0; ry < rowsN; ry += 1) {
          const lit = hash01(b.x + cx * 131, b.y + ry * 57) < litRatio;
          context.fillStyle = lit ? COLORS.windowLit : COLORS.windowDark;
          context.globalAlpha = lit ? 0.5 + 0.5 * dark : 1;
          context.fillRect(bx + 6 + cx * ((b.w - 12) / cols), by + b.h + 3 + ry * ((faceH - 5) / rowsN), 7, 4.5);
        }
      }
      context.globalAlpha = 1;
      // A striped awning over the shopfront, on the blocks that have one.
      if (b.awning) {
        const aw = b.w - 20;
        const ax = bx + 10;
        const ay = by + b.h + faceH - 6;
        for (let s = 0; s < aw; s += 8) {
          context.fillStyle = (s / 8) % 2 === 0 ? b.awning : '#e8e2d4';
          context.fillRect(ax + s, ay, Math.min(8, aw - s), 5);
        }
        context.fillStyle = 'rgba(0,0,0,0.25)';
        context.fillRect(ax, ay + 5, aw, 1.5);
      }
      // The roof: wall-coloured parapet, inner slab, speckle, clutter, a sunlit top edge.
      context.fillStyle = b.color;
      context.fillRect(bx, by, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(bx + 7, by + 7, b.w - 14, b.h - 14);
      context.fillStyle = 'rgba(255,255,255,0.05)';
      for (let s = 0; s < 6; s += 1) {
        context.fillRect(bx + 10 + hash01(b.x + s * 37, b.y) * Math.max(1, b.w - 26), by + 10 + hash01(b.x, b.y + s * 53) * Math.max(1, b.h - 26), 8, 5);
      }
      for (let gI = 0; gI < (b.gear || 0); gI += 1) {
        const gx = bx + 12 + hash01(b.x + gI * 71, b.y + 9) * Math.max(1, b.w - 40);
        const gy = by + 12 + hash01(b.x + 3, b.y + gI * 91) * Math.max(1, b.h - 36);
        context.fillStyle = 'rgba(0,0,0,0.20)';
        context.fillRect(gx + 2, gy + 3, 16, 11);
        context.fillStyle = '#5a6068';
        context.fillRect(gx, gy, 16, 11);
        context.fillStyle = 'rgba(255,255,255,0.14)';
        context.fillRect(gx, gy, 16, 3);
      }
      if (b.tank) {
        const tx = bx + b.w - 40;
        const ty = by + 16;
        context.fillStyle = 'rgba(0,0,0,0.20)';
        context.beginPath();
        context.arc(tx + 2, ty + 3, 11, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#6e5136';
        context.beginPath();
        context.arc(tx, ty, 11, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#8a6a45';
        context.beginPath();
        context.arc(tx, ty - 2, 8, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = 'rgba(255,255,255,0.10)';
      context.fillRect(bx + 7, by + 7, b.w - 14, 3);
      if (b.sign) drawSign(b, bx, by, dark);
    }
    // Gantry cranes over the port yards: two legs, a long beam with a sunlit top edge, a
    // trolley, and a cable with a hook block hanging over the stacks.
    for (const crane of city.cranes || []) {
      if (crane.x + crane.span < vis.x0 || crane.x - crane.span > vis.x1 || crane.y + 40 < vis.y0 || crane.y - 40 > vis.y1) continue;
      context.save();
      context.translate(cam.x + crane.x, cam.y + crane.y);
      context.rotate(crane.angle);
      const s = crane.span / 2;
      const cMain = crane.color || COLORS.crane;
      const cDark = crane.color ? shade(crane.color, 0.58) : COLORS.craneDark;
      context.fillStyle = 'rgba(0,0,0,0.16)';
      context.fillRect(-s + 9, 0, crane.span, 9);
      context.fillStyle = cDark;
      context.fillRect(-s - 3, -7, 7, 14);
      context.fillRect(s - 4, -7, 7, 14);
      context.fillStyle = cMain;
      context.fillRect(-s - 8, -4.5, crane.span + 16, 9);
      context.fillStyle = 'rgba(255,255,255,0.14)';
      context.fillRect(-s - 8, -4.5, crane.span + 16, 3);
      const trolley = (hash01(crane.x, crane.y) - 0.5) * crane.span * 0.6;
      context.fillStyle = '#c97e2c';
      context.fillRect(trolley - 5, -5, 10, 10);
      context.strokeStyle = 'rgba(20,22,26,0.8)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(trolley, 4);
      context.lineTo(trolley, 17);
      context.stroke();
      context.fillStyle = '#232a33';
      context.fillRect(trolley - 4, 17, 8, 5);
      context.restore();
    }
    // Fountains: a stone ring, blue water with drifting ripple rings, a white spray heart.
    for (const f of city.fountains) {
      context.fillStyle = '#5a544c';
      context.beginPath();
      context.arc(cam.x + f.x, cam.y + f.y, f.r + 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = COLORS.waterLight;
      context.beginPath();
      context.arc(cam.x + f.x, cam.y + f.y, f.r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.5)';
      context.lineWidth = 1.5;
      for (let ring = 0; ring < 2; ring += 1) {
        const rr2 = f.r * (0.45 + 0.3 * ((game.time * 0.5 + ring * 0.5 + f.x * 0.01) % 1));
        context.globalAlpha = 0.5 * (1 - ((game.time * 0.5 + ring * 0.5 + f.x * 0.01) % 1));
        context.beginPath();
        context.arc(cam.x + f.x, cam.y + f.y, rr2, 0, Math.PI * 2);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.fillStyle = 'rgba(255,255,255,0.85)';
      context.beginPath();
      context.arc(cam.x + f.x, cam.y + f.y, 5, 0, Math.PI * 2);
      context.fill();
    }
    // Street props: benches, dumpsters, crates, hydrants, newsboxes and planters.
    for (const p of city.props) {
      context.save();
      context.translate(cam.x + p.x + p.w / 2, cam.y + p.y + p.h / 2);
      context.rotate(p.angle || 0);
      if (p.kind === 'bench') {
        context.fillStyle = '#5d4a35';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        context.fillStyle = '#77603f';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, 3);
      } else if (p.kind === 'dumpster') {
        context.fillStyle = '#2c4a34';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        context.fillStyle = '#1e3324';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, 4);
      } else if (p.kind === 'hydrant') {
        context.fillStyle = '#b03024';
        rr(-4, -5, 8, 10, 3);
        context.fill();
        context.fillStyle = '#d8d8d8';
        context.fillRect(-1.5, -7, 3, 3);
      } else if (p.kind === 'newsbox') {
        context.fillStyle = '#2c4a7a';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        context.fillStyle = '#dfe8f2';
        context.fillRect(-p.w / 2 + 1.5, -p.h / 2 + 1.5, p.w - 3, 3.5);
      } else if (p.kind === 'planter') {
        context.fillStyle = '#6e5136';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        context.fillStyle = '#2e7a3e';
        context.beginPath();
        context.ellipse(0, 0, p.w / 2 - 2, p.h / 2 - 1, 0, 0, Math.PI * 2);
        context.fill();
      } else if (p.kind === 'bin') {
        // A litter bin: a dark green drum with a paler lid and a rim of shadow.
        context.fillStyle = 'rgba(0,0,0,0.22)';
        context.beginPath();
        context.ellipse(1.5, 2, 6, 5, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#2c4a34';
        context.beginPath();
        context.arc(0, 0, 5, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#3d6b47';
        context.beginPath();
        context.arc(0, 0, 3.4, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#141c16';
        context.beginPath();
        context.arc(0, 0, 1.6, 0, Math.PI * 2);
        context.fill();
      } else if (p.kind === 'net') {
        // The beach volleyball net: two posts and a white-banded mesh strung between.
        context.fillStyle = 'rgba(0,0,0,0.18)';
        context.fillRect(-p.w / 2 + 2, -p.h / 2 + 2, p.w, p.h);
        context.fillStyle = '#4a3826';
        context.fillRect(-p.w / 2 - 1, -p.h / 2 - 2, 3, p.h + 4);
        context.fillRect(p.w / 2 - 2, -p.h / 2 - 2, 3, p.h + 4);
        context.fillStyle = 'rgba(240,244,248,0.75)';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, 1.8);
        context.strokeStyle = 'rgba(240,244,248,0.4)';
        context.lineWidth = 1;
        for (let nx = -p.w / 2 + 6; nx < p.w / 2; nx += 6) {
          context.beginPath();
          context.moveTo(nx, -p.h / 2);
          context.lineTo(nx, p.h / 2);
          context.stroke();
        }
      } else if (p.kind === 'billboard') {
        // A street-corner billboard: two posts, a dark panel, a neon-lit slogan. After
        // dark the board glows like the signs it competes with.
        context.fillStyle = 'rgba(0,0,0,0.22)';
        context.fillRect(-p.w / 2 + 2, -p.h / 2 + 3, p.w, p.h);
        context.fillStyle = '#23262b';
        context.fillRect(-p.w / 2 + 3, 1, 3, 5);
        context.fillRect(p.w / 2 - 6, 1, 3, 5);
        context.save();
        if (dark > 0.08) {
          context.shadowColor = p.color;
          context.shadowBlur = 9 * dark + 2;
        }
        context.fillStyle = '#17121a';
        rr(-p.w / 2, -p.h / 2, p.w, p.h, 2);
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = p.color;
        context.lineWidth = 1.3;
        rr(-p.w / 2, -p.h / 2, p.w, p.h, 2);
        context.stroke();
        context.fillStyle = p.color;
        context.font = `700 7.5px ${FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(p.text, 0, 0.5);
        context.restore();
      } else {
        context.fillStyle = '#a8854f';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        context.strokeStyle = '#77603f';
        context.lineWidth = 2;
        context.strokeRect(-p.w / 2 + 2, -p.h / 2 + 2, p.w - 4, p.h - 4);
      }
      context.restore();
    }
    // Trees and lamps. Palms sway gently over a bare trunk; round trees are layered canopies.
    for (const t of city.trees) {
      context.fillStyle = 'rgba(0,0,0,0.20)';
      context.beginPath();
      context.ellipse(cam.x + t.x + 5, cam.y + t.y + 6, t.r * 1.05, t.r * 0.8, 0, 0, Math.PI * 2);
      context.fill();
      if (t.palm) {
        const sway = Math.sin(game.time * 0.9 + t.x * 0.13) * 0.05;
        context.strokeStyle = '#6f573c';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(cam.x + t.x, cam.y + t.y);
        context.lineTo(cam.x + t.x + 3, cam.y + t.y - 12);
        context.stroke();
        context.strokeStyle = '#2e7a3e';
        context.lineWidth = 2.5;
        for (let frond = 0; frond < 6; frond += 1) {
          const a = (frond / 6) * Math.PI * 2 + 0.4 + sway;
          context.beginPath();
          context.moveTo(cam.x + t.x + 3, cam.y + t.y - 12);
          context.quadraticCurveTo(
            cam.x + t.x + 3 + Math.cos(a) * t.r * 0.8,
            cam.y + t.y - 12 + Math.sin(a) * t.r * 0.5 - 3,
            cam.x + t.x + 3 + Math.cos(a) * t.r * 1.25,
            cam.y + t.y - 12 + Math.sin(a) * t.r * 0.8 + 4,
          );
          context.stroke();
        }
        context.fillStyle = '#6e5136';
        context.beginPath();
        context.arc(cam.x + t.x + 1, cam.y + t.y - 10, 2.4, 0, Math.PI * 2);
        context.arc(cam.x + t.x + 5, cam.y + t.y - 9, 2.2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = '#1e4d28';
      context.beginPath();
      context.arc(cam.x + t.x, cam.y + t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2c6e38';
      context.beginPath();
      context.arc(cam.x + t.x + t.r * 0.3, cam.y + t.y + t.r * 0.2, t.r * 0.62, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#3a7a44';
      context.beginPath();
      context.arc(cam.x + t.x - t.r * 0.28, cam.y + t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2);
      context.fill();
    }
    for (const l of city.lamps) {
      context.fillStyle = '#2b2b2b';
      context.fillRect(cam.x + l.x - 2, cam.y + l.y - 2, 4, 4);
      if (dark > 0.05) {
        context.fillStyle = `rgba(255,214,120,${0.35 + dark})`;
        context.fillRect(cam.x + l.x - 1.5, cam.y + l.y - 1.5, 3, 3);
      }
    }
  }

  /** One car, drawn by body shape: shadow, shaded body, glass with a sky reflection,
   * wheels, mirrors, seams and lights. Police cars get the livery, a PD door badge and a
   * flashing light bar; taxis get a roof sign and a checker stripe. */
  function drawCarShape(car, cam, dark) {
    const len = car.len || 46;
    const wid = car.wid || 24;
    context.save();
    context.translate(cam.x + car.x, cam.y + car.y);
    context.rotate(car.angle);
    // Ground shadow, in two layers so its edge falls off softly.
    context.fillStyle = 'rgba(0,0,0,0.13)';
    context.beginPath();
    context.ellipse(3, 4, len / 2 + 6, wid / 2 + 5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(0,0,0,0.30)';
    context.beginPath();
    context.ellipse(2, 3, len / 2 + 2, wid / 2 + 2, 0, 0, Math.PI * 2);
    context.fill();
    if (car.shape === 'moto') {
      // A motorcycle: a wheel at each end of a slim frame, the rider leaning over it.
      context.fillStyle = '#14161a';
      context.fillRect(len / 2 - 6, -2.5, 8, 5);
      context.fillRect(-len / 2 - 2, -2.5, 8, 5);
      context.fillStyle = car.color;
      rr(-len / 2 + 3, -wid / 2 + 2, len - 6, wid - 4, 4);
      context.fill();
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(-len / 2 + 3, -wid / 2 + 2, 7, wid - 4);
      context.fillStyle = 'rgba(255,255,255,0.14)';
      context.fillRect(2, -wid / 2 + 3, len / 2 - 6, 2.5);
      context.fillStyle = car.riderShirt || '#7a9cc9';
      context.beginPath();
      context.ellipse(-1, 0, 9, 6.5, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = car.riderHelmet || '#d8d8d8';
      context.beginPath();
      context.arc(3, 0, 4.6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(20,30,44,0.85)';
      context.fillRect(6.2, -3, 2.2, 6);
      context.fillStyle = '#ffe9a8';
      context.fillRect(len / 2 - 2, -2, 3, 4);
      if (car.brake) {
        context.fillStyle = '#ff5040';
        context.fillRect(-len / 2 - 1, -2, 3, 4);
      }
      if (car.missionCar) {
        context.strokeStyle = COLORS.mission;
        context.lineWidth = 3;
        rr(-len / 2 - 2, -wid / 2 - 2, len + 4, wid + 4, 7);
        context.stroke();
      }
      context.restore();
      return;
    }
    // Wheels with pale hubs.
    context.fillStyle = '#14161a';
    const wx = len / 2 - 11;
    const wy = wid / 2 - 2;
    context.fillRect(wx - 4, -wy - 3, 9, 5);
    context.fillRect(wx - 4, wy - 2, 9, 5);
    context.fillRect(-wx - 5, -wy - 3, 9, 5);
    context.fillRect(-wx - 5, wy - 2, 9, 5);
    context.fillStyle = '#4a5058';
    context.fillRect(wx - 1, -wy - 1, 3, 2);
    context.fillRect(wx - 1, wy, 3, 2);
    context.fillRect(-wx - 2, -wy - 1, 3, 2);
    context.fillRect(-wx - 2, wy, 3, 2);
    // The body: a rounded shell, a sheen over the top, a darker tail.
    context.fillStyle = car.color;
    rr(-len / 2, -wid / 2, len, wid, 6);
    context.fill();
    context.fillStyle = 'rgba(0,0,0,0.10)';
    context.fillRect(-len / 2, -wid / 2, len * 0.2, wid);
    context.fillStyle = 'rgba(255,255,255,0.08)';
    rr(-len / 2 + 2, -wid / 2 + 2, len - 4, wid - 4, 5);
    context.fill();
    const glass = 'rgba(20,30,44,0.9)';
    const glint = (gx, gw) => {
      context.save();
      context.beginPath();
      context.rect(gx, -wid / 2 + 3, gw, wid - 6);
      context.clip();
      context.fillStyle = 'rgba(255,255,255,0.20)';
      context.beginPath();
      context.moveTo(gx - 2, wid / 2);
      context.lineTo(gx + gw * 0.55, -wid / 2);
      context.lineTo(gx + gw * 0.8, -wid / 2);
      context.lineTo(gx + gw * 0.25, wid / 2);
      context.closePath();
      context.fill();
      context.restore();
    };
    if (car.shape === 'van') {
      // A tall box: windshield at the very nose, panel seams, a rear door split.
      context.fillStyle = '#dfe8f2';
      context.fillRect(len / 2 - 9, -wid / 2 + 3, 4, wid - 6);
      context.fillStyle = glass;
      context.fillRect(len / 2 - 15, -wid / 2 + 3, 5, wid - 6);
      glint(len / 2 - 15, 5);
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(2, -wid / 2, 2, wid);
      context.fillRect(-len / 2 + 12, -wid / 2, 2, wid);
      context.fillRect(-len / 2, -1, 12, 2);
    } else if (car.shape === 'pickup') {
      // Cab up front, an open bed behind with rail lines.
      context.fillStyle = glass;
      context.fillRect(len * 0.06, -wid / 2 + 3, len * 0.3, wid - 6);
      glint(len * 0.06, len * 0.3);
      context.fillStyle = '#dfe8f2';
      context.fillRect(len * 0.36, -wid / 2 + 3, 3, wid - 6);
      context.fillStyle = 'rgba(0,0,0,0.28)';
      context.fillRect(-len / 2 + 3, -wid / 2 + 3, len * 0.38, wid - 6);
      context.strokeStyle = 'rgba(255,255,255,0.25)';
      context.lineWidth = 1.5;
      context.strokeRect(-len / 2 + 3, -wid / 2 + 3, len * 0.38, wid - 6);
    } else if (car.shape === 'sport') {
      // Low and wide: a centre stripe, a small teardrop cabin, a rear spoiler.
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(-len / 2, -3, len, 6);
      context.fillStyle = glass;
      context.fillRect(-len * 0.1, -wid / 2 + 4, len * 0.3, wid - 8);
      glint(-len * 0.1, len * 0.3);
      context.fillStyle = '#14161a';
      context.fillRect(-len / 2 - 2, -wid / 2 + 1, 4, wid - 2);
    } else if (car.shape === 'hatch') {
      // The glass runs long toward the tail.
      context.fillStyle = glass;
      context.fillRect(-len * 0.3, -wid / 2 + 3, len * 0.48, wid - 6);
      glint(-len * 0.3, len * 0.48);
      context.fillStyle = '#dfe8f2';
      context.fillRect(len * 0.18, -wid / 2 + 3, 3, wid - 6);
    } else if (car.shape === 'limo') {
      // A long saloon: glass along most of its length, a pale roof band down the middle,
      // a chrome line and two extra door seams.
      context.fillStyle = glass;
      context.fillRect(-len * 0.34, -wid / 2 + 3, len * 0.62, wid - 6);
      glint(-len * 0.34, len * 0.62);
      context.fillStyle = 'rgba(232,232,232,0.8)';
      context.fillRect(-len * 0.34, -2, len * 0.62, 4);
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fillRect(-len / 2 + 2, wid / 2 - 4, len - 4, 2);
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(-len * 0.05, -wid / 2 + 2, 1.5, wid - 4);
      context.fillRect(len * 0.18, -wid / 2 + 2, 1.5, wid - 4);
    } else {
      // Sedan: cabin amidships, glass front and back, door seams.
      context.fillStyle = glass;
      context.fillRect(-len * 0.14, -wid / 2 + 3, len * 0.34, wid - 6);
      glint(-len * 0.14, len * 0.34);
      context.fillStyle = '#dfe8f2';
      context.fillRect(len * 0.2, -wid / 2 + 3, 3, wid - 6);
      context.fillStyle = 'rgba(223,232,242,0.6)';
      context.fillRect(-len * 0.2, -wid / 2 + 3, 3, wid - 6);
      context.fillStyle = 'rgba(0,0,0,0.16)';
      context.fillRect(-len * 0.02, -wid / 2 + 2, 1.5, wid - 4);
      context.fillRect(-len * 0.3, -wid / 2 + 2, 1.5, wid - 4);
    }
    // Mirrors and a nose grille.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(len * 0.22, -wid / 2 - 2, 4, 3);
    context.fillRect(len * 0.22, wid / 2 - 1, 4, 3);
    context.fillRect(len / 2 - 2, -wid / 2 + 7, 2, wid - 14);
    // Headlights, and tail lights that flare while the car brakes.
    context.fillStyle = '#ffe9a8';
    context.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 4);
    context.fillRect(len / 2 - 2, wid / 2 - 6, 3, 4);
    context.fillStyle = '#fff6d8';
    context.fillRect(len / 2 - 1, -wid / 2 + 3, 1.5, 2);
    context.fillRect(len / 2 - 1, wid / 2 - 5, 1.5, 2);
    if (car.brake) {
      context.save();
      context.shadowColor = '#ff3b2e';
      context.shadowBlur = 7;
      context.fillStyle = '#ff5040';
      context.fillRect(-len / 2 - 1, -wid / 2 + 2, 3, 4);
      context.fillRect(-len / 2 - 1, wid / 2 - 6, 3, 4);
      context.restore();
    } else {
      context.fillStyle = '#a02c22';
      context.fillRect(-len / 2 - 1, -wid / 2 + 2, 2, 4);
      context.fillRect(-len / 2 - 1, wid / 2 - 6, 2, 4);
    }
    // A taxi's checker stripe and lit roof sign.
    if (car.taxi) {
      for (let s = 0; s < 6; s += 1) {
        context.fillStyle = s % 2 === 0 ? '#14161a' : '#e8e8e8';
        context.fillRect(-len / 2 + 4 + s * 4, wid / 2 - 4, 4, 3);
      }
      context.fillStyle = '#fff3c4';
      rr(-6, -4, 12, 8, 2);
      context.fill();
      context.fillStyle = '#14161a';
      context.font = `700 6px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('TAXI', 0, 2.5);
    }
    if (car.police) {
      context.fillStyle = '#e8e8e8';
      rr(-len / 2, -wid / 2, len, wid, 6);
      context.fill();
      context.fillStyle = '#1c2733';
      context.fillRect(-len / 2, -wid / 2, len, 8);
      context.fillRect(-len / 2, wid / 2 - 8, len, 8);
      context.fillStyle = glass;
      context.fillRect(-len * 0.14, -wid / 2 + 3, len * 0.34, wid - 6);
      glint(-len * 0.14, len * 0.34);
      context.fillStyle = '#e8e8e8';
      context.font = `800 9px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('PD', 0, 3.5);
      // Light bar, flashing on the car's own phase.
      const flash = Math.floor(((car.siren || 0) + (car.flashPhase || 0)) * 2.4) % 2 === 0;
      context.save();
      if (dark > 0.1) {
        context.shadowBlur = 10 * dark;
        context.shadowColor = flash ? COLORS.copRed : COLORS.copBlue;
      }
      context.fillStyle = flash ? COLORS.copRed : COLORS.copBlue;
      context.fillRect(-4, -wid / 2, 8, 5);
      context.fillStyle = flash ? COLORS.copBlue : COLORS.copRed;
      context.fillRect(-4, wid / 2 - 5, 8, 5);
      context.restore();
    }
    if (car.missionCar) {
      context.strokeStyle = COLORS.mission;
      context.lineWidth = 3;
      rr(-len / 2 - 2, -wid / 2 - 2, len + 4, wid + 4, 7);
      context.stroke();
    }
    context.restore();
  }

  function drawPed(ped, cam) {
    context.save();
    context.translate(cam.x + ped.x, cam.y + ped.y);
    if (ped.down > 0) {
      context.rotate(Math.PI / 2);
      context.globalAlpha = Math.max(0.25, Math.min(1, ped.down));
    } else {
      context.fillStyle = 'rgba(0,0,0,0.10)';
      context.beginPath();
      context.ellipse(2, 6, 11, 6.5, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.beginPath();
      context.ellipse(1, 5, 8, 5, 0, 0, Math.PI * 2);
      context.fill();
    }
    const swing = Math.sin(ped.walkPhase) * 3;
    context.fillStyle = '#222';
    context.fillRect(-4 + swing, 4, 3, 8);
    context.fillRect(1 - swing, 4, 3, 8);
    context.fillStyle = ped.shirt;
    context.beginPath();
    context.arc(0, 0, 9, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.25)';
    context.lineWidth = 1;
    context.stroke();
    // Head: skin, with a cap of hair turned toward the facing.
    const hx = Math.cos(ped.angle) * 3;
    const hy = Math.sin(ped.angle) * 3;
    context.fillStyle = ped.skin || '#e8c39a';
    context.beginPath();
    context.arc(hx, hy, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.hair || '#241a12';
    context.beginPath();
    context.arc(hx - Math.cos(ped.angle) * 1.2, hy - Math.sin(ped.angle) * 1.2, 4.4, 0, Math.PI * 2);
    context.fill();
    // A cap, on the heads that wear one: a dome and a brim toward the facing.
    if (ped.cap) {
      context.fillStyle = ped.cap;
      context.beginPath();
      context.arc(hx, hy, 4.9, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(hx + Math.cos(ped.angle) * 3.6, hy + Math.sin(ped.angle) * 3.6, 2.6, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function drawPlayer(game, cam) {
    const p = game.player;
    context.save();
    context.translate(cam.x + p.x, cam.y + p.y);
    if (p.inCar) {
      context.restore();
      return;
    }
    context.fillStyle = 'rgba(0,0,0,0.12)';
    context.beginPath();
    context.ellipse(2, 7, 13, 7.5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(1, 6, 10, 6, 0, 0, Math.PI * 2);
    context.fill();
    // Aim line.
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(p.aim) * 30, Math.sin(p.aim) * 30);
    context.stroke();
    const swing = Math.sin(p.walkPhase) * 3;
    context.fillStyle = '#222';
    context.fillRect(-4 + swing, 4, 3, 8);
    context.fillRect(1 - swing, 4, 3, 8);
    context.fillStyle = COLORS.player;
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = COLORS.playerDark;
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#e8c39a';
    context.beginPath();
    context.arc(Math.cos(p.aim) * 3, Math.sin(p.aim) * 3, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#3a2c14';
    context.beginPath();
    context.arc(Math.cos(p.aim) * 2 - 1, Math.sin(p.aim) * 2 - 1, 5, 0, Math.PI * 2);
    context.fill();
    // The pistol.
    context.fillStyle = '#222';
    context.fillRect(Math.cos(p.aim) * 10, Math.sin(p.aim) * 10, 8, 3);
    context.restore();
  }

  /** A pulsing diamond over a target, in the given colour. */
  function drawMarker(x, y, color, time) {
    const pulse = 1 + Math.sin(time * 4) * 0.15;
    context.save();
    context.translate(x, y - 34);
    context.scale(pulse, pulse);
    context.rotate(Math.PI / 4);
    context.fillStyle = color;
    context.fillRect(-9, -9, 18, 18);
    context.fillStyle = '#10141a';
    context.fillRect(-4, -4, 8, 8);
    context.restore();
  }

  /** A ground ring and label at a side-activity start point, while it is on offer. */
  function drawStartIcon(game, cam, point, color, label) {
    const pulse = 30 + Math.sin(game.time * 3) * 4;
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cam.x + point.x, cam.y + point.y, pulse, 0, Math.PI * 2);
    context.stroke();
    text(label, cam.x + point.x, cam.y + point.y - 40, 13, color, 'center', 800);
  }

  /** The police helicopter at five stars, drawn last so it rides over the whole city:
   * a soft ground shadow thrown away from the machine (that offset is what sells the
   * altitude), a pale searchlight pool where the beam lands, the dark body with its PD
   * band and glass nose, blinking nav lights, and over it all a translucent rotor disc
   * with two blurred blade lines sweeping on the rotor's own clock. */
  function drawHeli(game, cam, dark) {
    const heli = game.police.heli;
    if (!heli) return;
    const hx = cam.x + heli.x;
    const hy = cam.y + heli.y;
    context.fillStyle = 'rgba(0,0,0,0.20)';
    context.beginPath();
    context.ellipse(hx - 36, hy + 42, 34, 13, heli.angle, 0, Math.PI * 2);
    context.fill();
    const pool = context.createRadialGradient(hx, hy, 4, hx, hy, 76);
    pool.addColorStop(0, `rgba(255,246,214,${0.10 + dark * 0.32})`);
    pool.addColorStop(1, 'rgba(255,246,214,0)');
    context.fillStyle = pool;
    context.beginPath();
    context.arc(hx, hy, 76, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.translate(hx, hy);
    context.rotate(heli.angle);
    // Tail boom and fin.
    context.fillStyle = '#232a33';
    context.fillRect(-54, -3, 36, 6);
    context.fillRect(-58, -7, 6, 14);
    // Skids.
    context.strokeStyle = '#10141a';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-14, -13);
    context.lineTo(16, -13);
    context.moveTo(-14, 13);
    context.lineTo(16, 13);
    context.stroke();
    // The body: a dark teardrop with a pale PD band and a glass nose.
    context.fillStyle = '#2b3542';
    context.beginPath();
    context.ellipse(0, 0, 26, 14, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8e8e8';
    context.fillRect(-8, -14, 9, 28);
    context.fillStyle = 'rgba(20,30,44,0.9)';
    context.beginPath();
    context.ellipse(17, 0, 8, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#8a6420';
    context.font = `800 8px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('PD', -3.5, 3);
    // Nav lights at the tail: red and green, trading blinks on the rotor's clock.
    const blink = Math.sin(heli.rotor * 0.5) > 0;
    context.fillStyle = blink ? '#ff5040' : 'rgba(255,80,64,0.3)';
    context.beginPath();
    context.arc(-55, -7, 2.4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = blink ? 'rgba(63,208,106,0.3)' : '#3fd06a';
    context.beginPath();
    context.arc(-55, 7, 2.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // The rotor disc: a faint full circle and two blade lines sweeping through it.
    context.save();
    context.translate(hx, hy);
    context.fillStyle = 'rgba(200,210,220,0.09)';
    context.beginPath();
    context.arc(0, 0, 46, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(220,228,238,0.20)';
    context.lineWidth = 3;
    const ra = heli.rotor % Math.PI;
    context.beginPath();
    context.moveTo(Math.cos(ra) * -44, Math.sin(ra) * -44);
    context.lineTo(Math.cos(ra) * 44, Math.sin(ra) * 44);
    context.moveTo(Math.cos(ra + Math.PI / 2) * -44, Math.sin(ra + Math.PI / 2) * -44);
    context.lineTo(Math.cos(ra + Math.PI / 2) * 44, Math.sin(ra + Math.PI / 2) * 44);
    context.stroke();
    context.restore();
  }

  function drawWorld(game, cam) {
    drawCity(game, cam);
    const dark = darkness(game.clock);
    const activity = game.missions.activity;
    if (!activity.kind && activity.cooldown <= 0) {
      drawStartIcon(game, cam, RACE_START, COLORS.race, 'RACE');
      drawStartIcon(game, cam, COURIER_DEPOT, COLORS.courier, 'COURIER');
    }
    for (const car of game.cars) drawCarShape(car, cam, dark);
    for (const car of game.police.cars) drawCarShape(car, cam, dark);
    for (const ped of game.peds) drawPed(ped, cam);
    for (const cop of game.police.cops) {
      // Foot cops read as pedestrians in police blue, with a cap.
      drawPed({ x: cop.x, y: cop.y, angle: cop.angle, shirt: '#2f6fd0', hair: '#141c26', walkPhase: game.time * 9, down: 0 }, cam);
      context.fillStyle = '#1c2733';
      context.beginPath();
      context.arc(cam.x + cop.x, cam.y + cop.y - 4, 5, Math.PI, 0);
      context.fill();
    }
    // Bullets: the player's are pale gold, a rival's are hot pink.
    for (const b of game.bullets) {
      context.fillStyle = b.hostile ? '#ff7ab0' : '#ffe9a8';
      context.beginPath();
      context.arc(cam.x + b.x, cam.y + b.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    // Particles. Rain falls as slanted streaks, a muzzle flash as a spiked glare, and
    // everything else — smoke, sparks, spray, casings — as a soft dot.
    for (const p of game.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'rain') {
        context.strokeStyle = p.color;
        context.lineWidth = 1.4;
        context.beginPath();
        context.moveTo(cam.x + p.x, cam.y + p.y);
        context.lineTo(cam.x + p.x - 3, cam.y + p.y + 11);
        context.stroke();
      } else if (p.kind === 'flash') {
        context.fillStyle = p.color;
        context.beginPath();
        context.arc(cam.x + p.x, cam.y + p.y, p.size * 0.55, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = p.color;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(cam.x + p.x - p.size, cam.y + p.y);
        context.lineTo(cam.x + p.x + p.size, cam.y + p.y);
        context.moveTo(cam.x + p.x, cam.y + p.y - p.size);
        context.lineTo(cam.x + p.x, cam.y + p.y + p.size);
        context.stroke();
      } else {
        context.fillStyle = p.color;
        context.beginPath();
        context.arc(cam.x + p.x, cam.y + p.y, p.size, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;
    drawPlayer(game, cam);
    // Mission marker: a pulsing yellow diamond; the activity marker rides beside it in its
    // own colour (race green, courier cyan).
    const marker = missionMarker(game);
    if (marker) drawMarker(cam.x + marker.x, cam.y + marker.y, COLORS.mission, game.time);
    const aMarker = activityMarker(game);
    if (aMarker) {
      drawMarker(cam.x + aMarker.x, cam.y + aMarker.y, activity.kind === 'race' ? COLORS.race : COLORS.courier, game.time + 1);
    }
    // A dawn or dusk wash: warm light spilling down from the top of the view, its
    // strength easing with the hour (lerp keeps the shoulder of the glow soft).
    const glow = duskGlow(game.clock);
    if (glow > 0.01) {
      const warm = lerp(0.05, 0.22, glow);
      const grad = context.createLinearGradient(0, 0, 0, 560);
      grad.addColorStop(0, `rgba(255,150,70,${warm})`);
      grad.addColorStop(1, 'rgba(255,150,70,0)');
      context.fillStyle = grad;
      context.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // Day lighting: a dusk or night tint over the whole view.
    if (dark > 0) {
      context.fillStyle = `rgba(10, 16, 42, ${dark})`;
      context.fillRect(cam.x, cam.y, WORLD, WORLD);
      if (dark > 0.12) drawNightLights(game, cam, dark);
    }
    // The helicopter flies above the lighting: drawn after the tint, so its searchlight
    // pool burns through the night instead of drowning in it.
    drawHeli(game, cam, dark);
  }

  /** After dark: lamp pools, neon spill, light-bar glows and headlight cones, added lightly. */
  function drawNightLights(game, cam, dark) {
    const vis = visible(cam);
    const raining = game.weather && game.weather.rain > 0;
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const l of game.city.lamps) {
      if (l.x < vis.x0 || l.x > vis.x1 || l.y < vis.y0 || l.y > vis.y1) continue;
      context.fillStyle = 'rgba(255,196,92,0.035)';
      context.beginPath();
      context.arc(cam.x + l.x, cam.y + l.y, 46, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,205,105,0.05)';
      context.beginPath();
      context.arc(cam.x + l.x, cam.y + l.y, 28, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,220,140,0.07)';
      context.beginPath();
      context.arc(cam.x + l.x, cam.y + l.y, 14, 0, Math.PI * 2);
      context.fill();
      // In the rain the pool smears: a wet reflection streak trailing off the lamp,
      // the way lamplight drags across soaked asphalt.
      if (raining) {
        context.fillStyle = 'rgba(255,205,105,0.05)';
        context.beginPath();
        context.ellipse(cam.x + l.x, cam.y + l.y + 17, 5.5, 16, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Neon signs spill their colour onto the sidewalk below the face, and — on wet
    // ground, after dark or in the rain — smear a long reflection streak below that.
    const rainBoost = game.weather && game.weather.rain > 0 ? 1 : 0;
    for (const b of game.city.buildings) {
      if (!b.sign) continue;
      if (b.x > vis.x1 || b.x + b.w < vis.x0 || b.y > vis.y1 || b.y + b.h < vis.y0) continue;
      context.fillStyle = b.sign.color;
      context.globalAlpha = 0.05 + 0.04 * dark;
      context.beginPath();
      context.ellipse(cam.x + b.x + b.w / 2, cam.y + b.y + b.h + faceHeight(b) + 9, b.w * 0.42, 10, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.10;
      context.beginPath();
      context.arc(cam.x + b.x + b.w / 2, cam.y + b.y + b.h, 15, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.06 + 0.05 * dark + rainBoost * 0.06;
      context.beginPath();
      context.ellipse(cam.x + b.x + b.w / 2, cam.y + b.y + b.h + faceHeight(b) + 30 + rainBoost * 16, b.w * 0.3, 17 + rainBoost * 13, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
    const cone = (car, strength) => {
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const px = -fy;
      const py = fx;
      const nose = (car.len || 46) / 2;
      context.fillStyle = `rgba(255,240,190,${strength})`;
      context.beginPath();
      context.moveTo(cam.x + car.x + fx * nose, cam.y + car.y + fy * nose);
      context.lineTo(cam.x + car.x + fx * (nose + 100) + px * 34, cam.y + car.y + fy * (nose + 100) + py * 34);
      context.lineTo(cam.x + car.x + fx * (nose + 100) - px * 34, cam.y + car.y + fy * (nose + 100) - py * 34);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(255,246,210,0.05)';
      context.beginPath();
      context.ellipse(cam.x + car.x + fx * (nose + 4), cam.y + car.y + fy * (nose + 4), 10, 6, car.angle, 0, Math.PI * 2);
      context.fill();
    };
    for (const car of game.cars) {
      if (car.x < vis.x0 || car.x > vis.x1 || car.y < vis.y0 || car.y > vis.y1) continue;
      cone(car, 0.045);
    }
    for (const car of game.police.cars) {
      cone(car, 0.05);
      // The light bar throws red and blue pools that swap with its flash.
      const flash = Math.floor(((car.siren || 0) + (car.flashPhase || 0)) * 2.4) % 2 === 0;
      context.fillStyle = flash ? 'rgba(255,60,50,0.10)' : 'rgba(70,130,255,0.10)';
      context.beginPath();
      context.arc(cam.x + car.x, cam.y + car.y, 26, 0, Math.PI * 2);
      context.fill();
    }
    // The beach kiosks burn warm after dark: a small amber pool on the sand in front of
    // each stall, so the resort shore glows the way the marina's lamps do.
    for (const k of game.city.kiosks || []) {
      if (k.x < vis.x0 || k.x > vis.x1 || k.y < vis.y0 - 60 || k.y > vis.y1) continue;
      context.fillStyle = 'rgba(255,190,100,0.05)';
      context.beginPath();
      context.ellipse(cam.x + k.x, cam.y + k.y + 12, 30, 15, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,205,120,0.08)';
      context.beginPath();
      context.arc(cam.x + k.x, cam.y + k.y, 11, 0, Math.PI * 2);
      context.fill();
    }
    // The player stays readable in the dark.
    context.fillStyle = 'rgba(255,230,160,0.06)';
    context.beginPath();
    context.arc(cam.x + game.player.x, cam.y + game.player.y, 44, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawMinimap(game) {
    const x0 = VIEW_W - MINI - 16;
    const y0 = 16;
    const scale = MINI / WORLD;
    context.fillStyle = 'rgba(16,20,26,0.85)';
    rr(x0 - 6, y0 - 6, MINI + 12, MINI + 12, 8);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.14)';
    context.lineWidth = 1;
    rr(x0 - 6, y0 - 6, MINI + 12, MINI + 12, 8);
    context.stroke();
    context.fillStyle = '#22303f';
    context.fillRect(x0, y0, MINI, MINI);
    // The sea along the south edge.
    context.fillStyle = COLORS.water;
    context.fillRect(x0, y0 + WATER_Y * scale, MINI, (WORLD - WATER_Y) * scale);
    context.strokeStyle = '#5a6a7a';
    context.lineWidth = 1;
    for (const r of ROADS) {
      context.beginPath();
      context.moveTo(x0 + r * scale, y0);
      context.lineTo(x0 + r * scale, y0 + MINI);
      context.stroke();
      context.beginPath();
      context.moveTo(x0, y0 + r * scale);
      context.lineTo(x0 + MINI, y0 + r * scale);
      context.stroke();
    }
    // The port yards in the south-east, grey against the green.
    context.fillStyle = COLORS.yard;
    for (const yard of game.city.yards || []) {
      context.fillRect(x0 + yard.x * scale, y0 + yard.y * scale, yard.w * scale, yard.h * scale);
    }
    // The beach along the south-west shore: a sand strip where the sea meets the city,
    // and the resort aprons in pale sand behind the coast road.
    context.fillStyle = COLORS.sandDry;
    context.fillRect(x0, y0 + BEACH_SAND_TOP * scale, BEACH_EAST * scale, (WORLD - BEACH_SAND_TOP) * scale);
    for (const r of game.city.resorts || []) {
      context.fillRect(x0 + r.x * scale, y0 + r.y * scale, r.w * scale, r.h * scale);
    }
    // Hideout and the side-activity starts.
    context.fillStyle = COLORS.mission;
    context.fillRect(x0 + HIDEOUT.x * scale - 3, y0 + HIDEOUT.y * scale - 3, 6, 6);
    const activity = game.missions.activity;
    if (!activity.kind && activity.cooldown <= 0) {
      context.fillStyle = COLORS.race;
      context.fillRect(x0 + RACE_START.x * scale - 2.5, y0 + RACE_START.y * scale - 2.5, 5, 5);
      context.fillStyle = COLORS.courier;
      context.fillRect(x0 + COURIER_DEPOT.x * scale - 2.5, y0 + COURIER_DEPOT.y * scale - 2.5, 5, 5);
    }
    const aMarker = activityMarker(game);
    if (aMarker) {
      context.strokeStyle = activity.kind === 'race' ? COLORS.race : COLORS.courier;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x0 + aMarker.x * scale, y0 + aMarker.y * scale, 5, 0, Math.PI * 2);
      context.stroke();
    }
    const marker = missionMarker(game);
    if (marker) {
      context.fillStyle = COLORS.mission;
      context.beginPath();
      context.arc(x0 + marker.x * scale, y0 + marker.y * scale, 4, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of game.police.cars) {
      context.fillStyle = COLORS.copRed;
      context.beginPath();
      context.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
      context.fill();
    }
    // The helicopter, when it is up: a white dot shadowing the chase from the air.
    if (game.police.heli) {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(x0 + game.police.heli.x * scale, y0 + game.police.heli.y * scale, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    // The player, with a tick showing which way he faces.
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(x0 + game.player.x * scale, y0 + game.player.y * scale, 3.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x0 + game.player.x * scale, y0 + game.player.y * scale);
    context.lineTo(x0 + (game.player.x + Math.cos(game.player.angle) * 90) * scale, y0 + (game.player.y + Math.sin(game.player.angle) * 90) * scale);
    context.stroke();
    text('SOLMAR', x0 + MINI / 2, y0 + MINI + 22, 11, 'rgba(255,255,255,0.65)', 'center', 700);
  }

  function drawHud(game) {
    const p = game.player;
    // Top-left: health, cash, wanted — a rounded panel with a hairline border.
    context.fillStyle = 'rgba(16,20,26,0.85)';
    rr(14, 14, 300, 96, 8);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.10)';
    context.lineWidth = 1;
    rr(14, 14, 300, 96, 8);
    context.stroke();
    text('RICO VEGA', 26, 38, 15, '#ffffff', 'left', 700);
    context.fillStyle = '#3a3f46';
    rr(26, 48, 180, 12, 6);
    context.fill();
    const healthW = Math.max(0, 180 * Math.min(1, p.health / 100));
    if (healthW > 0) {
      context.fillStyle = p.health > 30 ? '#7fd069' : '#d0342c';
      if (p.health <= 30) context.globalAlpha = 0.7 + 0.3 * Math.sin(game.time * 6);
      rr(26, 48, healthW, 12, 6);
      context.fill();
      context.globalAlpha = 1;
    }
    text(`$${game.cash.toLocaleString('en-US')}`, 26, 84, 20, COLORS.cash, 'left', 700);
    text(clockText(game.clock), 218, 84, 16, '#ffffff', 'left', 600);
    // Wanted stars, glowing while the heat is on.
    let stars = '';
    for (let i = 0; i < WANTED_MAX; i += 1) stars += i < game.police.wanted ? '★' : '☆';
    context.save();
    if (game.police.wanted > 0) {
      context.shadowColor = '#f2c230';
      context.shadowBlur = 7;
    }
    text(stars, 26, 106, 20, '#f2c230', 'left', 700);
    context.restore();
    // Objective bar, bottom-left.
    const objective = game.objectiveText;
    if (objective) {
      context.fillStyle = 'rgba(16,20,26,0.85)';
      const w = Math.min(680, 40 + objective.length * 8.2);
      rr(14, VIEW_H - 58, w, 44, 8);
      context.fill();
      const active = game.missions.activity;
      context.fillStyle = active.kind === 'race' ? COLORS.race : active.kind === 'delivery' ? COLORS.courier : COLORS.mission;
      context.fillRect(14, VIEW_H - 58, 4, 44);
      text(objective, 32, VIEW_H - 30, 16, '#ffffff', 'left', 600);
    }
    // Controls hint, bottom-right.
    text('WASD move · Mouse aim · Click shoot · E car · F punch · H horn · P pause', VIEW_W - 16, VIEW_H - 18, 13, 'rgba(255,255,255,0.6)', 'right');
    drawMinimap(game);
    // Dialogue box.
    if (game.dialogue) {
      const line = game.dialogue.lines[game.dialogue.index];
      context.fillStyle = 'rgba(16,20,26,0.92)';
      const w = Math.min(900, 60 + line.length * 7.6);
      rr((VIEW_W - w) / 2, VIEW_H - 128, w, 56, 8);
      context.fill();
      context.fillStyle = COLORS.mission;
      context.fillRect((VIEW_W - w) / 2, VIEW_H - 128, w, 3);
      text(line, VIEW_W / 2, VIEW_H - 94, 16, '#ffffff', 'center');
    }
    // Arrest warning.
    if (game.police.arrestTimer > 0.2) {
      text('A COP HAS YOU — MASH A KEY TO BREAK FREE', VIEW_W / 2, 150, 20, '#ff6a5e', 'center', 700);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 730;
    const height = 150 + lines.length * 34;
    const x = (VIEW_W - width) / 2;
    const y = (VIEW_H - height) / 2;
    context.fillStyle = 'rgba(16,20,26,0.94)';
    rr(x, y, width, height, 12);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.12)';
    context.lineWidth = 1;
    rr(x, y, width, height, 12);
    context.stroke();
    context.fillStyle = accent || COLORS.mission;
    context.fillRect(x, y, width, 4);
    // The title in a gold-to-white gradient, with a soft shadow pass under it.
    context.font = `800 46px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillText(title, VIEW_W / 2 + 2, y + 74);
    const grad = context.createLinearGradient(0, y + 30, 0, y + 74);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, accent || COLORS.mission);
    context.fillStyle = grad;
    context.fillText(title, VIEW_W / 2, y + 72);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW_W / 2, y + 122 + index * 34, 19, 'rgba(255,255,255,0.75)', 'center');
    }
    text(prompt, VIEW_W / 2, y + height - 34, 20, COLORS.mission, 'center', 700);
  }

  function cameraFor(game) {
    const cx = game.player.x - VIEW_W / 2;
    const cy = game.player.y - VIEW_H / 2;
    // A hard crash kicks the camera: a fast, small jitter that dies with game.shake.
    const shake = game.shake || 0;
    const jx = shake > 0 ? Math.sin(game.time * 91) * shake : 0;
    const jy = shake > 0 ? Math.cos(game.time * 113) * shake * 0.7 : 0;
    return {
      x: -Math.max(0, Math.min(WORLD - VIEW_W, cx)) + jx,
      y: -Math.max(0, Math.min(WORLD - VIEW_H, cy)) + jy,
    };
  }

  /** Convert a CSS-pixel mouse position on the canvas into world coordinates. */
  function screenToWorld(game, mx, my) {
    const ratio = window.devicePixelRatio || 1;
    const cam = cameraFor(game);
    return {
      x: ((mx * ratio - view.x) / view.scale) - cam.x,
      y: ((my * ratio - view.y) / view.scale) - cam.y,
    };
  }

  /** Paint one frame: the world through the camera, then the HUD or a panel for the screen. */
  function draw(game, screen, info) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0e13';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const cam = cameraFor(game);
    drawWorld(game, cam);
    if (screen === SCREEN_TITLE) {
      const save = info && info.save;
      const lines = [
        'Solmar is open. Steal cars, dodge the law, run jobs for Mara Solis.',
        'Sixteen story missions, a beach resort district, a five-star helicopter.',
        'WASD move and drive · Mouse aim · Click to shoot · E car · P pause',
        save ? `Saved game: $${save.cash.toLocaleString('en-US')} — mission ${Math.min(save.missionIndex + 1, MISSIONS.length)} of ${MISSIONS.length}` : 'A new story in the city of Solmar',
        '',
      ];
      drawPanel('SOLMAR HEAT', lines, save ? 'Enter — continue · N — new game' : 'Press Enter or click to start', '#f2c230');
      return;
    }
    drawHud(game);
    if (screen === SCREEN_PAUSED) {
      const stats = game.missions.stats;
      drawPanel('Paused', [
        'The city waits for no one — except right now.',
        `Cash $${game.cash.toLocaleString('en-US')} · Mission ${Math.min(game.missions.index + 1, MISSIONS.length)} of ${MISSIONS.length}`,
        `Street races won: ${stats.races} · Courier runs: ${stats.deliveries}`,
      ], 'Press P to resume · R for a fresh run · M to mute');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', [`Rico went down in Solmar. Cash kept: $${game.cash.toLocaleString('en-US')}.`, 'The crew will remember this.'], 'Press Enter to try again', '#d0342c');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar PD caught up with Rico.', `Cash kept: $${game.cash.toLocaleString('en-US')}. Mara is not pleased.`], 'Press Enter to try again', '#2f6fd0');
    } else if (screen === SCREEN_DONE) {
      const stats = game.missions.stats;
      drawPanel('SOLMAR IS YOURS', [
        'All sixteen jobs done. Rico Vega owns this city now.',
        `Final cash: $${game.cash.toLocaleString('en-US')} · Races won: ${stats.races} · Deliveries: ${stats.deliveries}`,
      ], 'Press Enter to keep roaming free', '#7fd069');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
