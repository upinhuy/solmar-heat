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
// bins at the kerbs. Downtown, one block is the night market quarter: warm festival paving,
// eight food stalls with striped awnings and lanterns, a stage with a red curtain and a
// band, and string lights sagging between posts over the crowd. Over the middle avenues rides the elevated railway: a concrete
// viaduct on pillars with pale rails, two canopied stations, and a three-car train in a
// teal-and-cream livery circling above the traffic, its shadow sliding along the street
// below — drawn over the ground traffic, because everything on the street passes under
// it. Along the north edge, east of centre, runs the airfield: a marked runway with amber
// edge lights and a hangar, and a little prop plane flying touch-and-go circuits over the
// northern blocks, its shadow sliding over the rooftops. Cars are drawn per body shape — sedan,
// hatchback, pickup, van, sport, limousine and motorcycle — with shading, glass
// reflections, wheels, mirrors and lights; taxis wear a roof sign, police a flashing
// light bar, and a bent car wears its damage: scuffed nose corners, a cracked
// windscreen, a crumpled nose on a near-wreck. Traffic signals stand at every intersection, their lamps cycling with the
// city's clock, and at five stars a police helicopter hangs over the chase — a ground
// shadow thrown away from the machine, a searchlight pool under it, a blurred rotor
// disc spinning above a dark PD body. Shadows fall in two soft layers. At dusk a warm gradient washes the top of
// the view; at night the street lamps pool light on the asphalt, neon spills onto the
// sidewalks and reflects in wet streaks, windows light up floor by floor and every car
// throws a headlight cone — L toggles the player's own lights, and in a storm every
// beam stretches further on the wet streets. When it rains the streets shine and the
// neon doubles. When a thunderstorm rolls in, the streets go darker still, the neon
// burns harder in the wet, gusts thicken the fall and throw splash rings on the
// asphalt, and lightning strikes: a jagged bolt over the city and a white flash across
// the whole view, with thunder rolling after it — and about a third of the strikes
// answer themselves with a second, weaker bolt. Canvas
// shapes and text, no assets.
import { COLORS, FIRST_ROAD, PLANE, ROAD_GAP, ROAD_WIDTH, TRAIN, WANTED_MAX, WORLD } from './config.js';
import { COURIER_DEPOT, HIDEOUT, MISSIONS, RACE_START, activityMarker, missionMarker } from './missions.js';
import { AIRPORT_DRUMS, AIRPORT_RUNWAY, AIRPORT_TAXIWAY, AIRPORT_WINDSOCK, BEACH_EAST, BEACH_PIER, BEACH_SAND_TOP, BEACH_WATER_Y, BOARDWALK_Y, PIER, ROADS, TRAIN_LOOP_LENGTH, WATER_Y, airportPointAt, signalPhase, trainPointAt } from './world.js';
import { hash01, lerp, triWave } from './random.js';

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

  /** The airfield on the north edge: a dark asphalt strip with a dashed centreline,
   * white threshold bars at each end, amber edge lights that glow after dark, and the
   * airfield's name painted on the strip — the runway the little prop plane rolls down
   * and lifts off from, over and over. A taxiway joins the strip to the hangar door,
   * fuel drums stand by the hangar's west wall, a windsock leans with the storm gusts
   * east of the hangar, and white approach strobes sequence down the strip's west end
   * after dark, one after the other toward the threshold. */
  function drawAirport(game, cam, dark) {
    const r = AIRPORT_RUNWAY;
    const rx = cam.x + r.x;
    const ry = cam.y + r.y;
    if (rx + r.w < -80 || rx > VIEW_W + 80 || ry + r.h < -80 || ry > VIEW_H + 80) return;
    // The strip: dark asphalt with a paler shoulder line top and bottom.
    context.fillStyle = COLORS.runway;
    context.fillRect(rx, ry, r.w, r.h);
    context.fillStyle = 'rgba(255,255,255,0.16)';
    context.fillRect(rx, ry, r.w, 2);
    context.fillRect(rx, ry + r.h - 2, r.w, 2);
    // The taxiway: a grey tongue from the strip's north edge up to the hangar door.
    const tw = AIRPORT_TAXIWAY;
    context.fillStyle = '#4a4d52';
    context.fillRect(cam.x + tw.x, cam.y + tw.y, tw.w, tw.h);
    // Threshold bars at each end: four white bars across the strip.
    context.fillStyle = COLORS.runwayLine;
    for (const endX of [rx + 8, rx + r.w - 8]) {
      for (let i = 0; i < 4; i += 1) {
        context.fillRect(endX - 3, ry + 5 + i * 9, 6, 5);
      }
    }
    // The dashed centreline down the middle of the strip.
    for (let x = rx + 26; x < rx + r.w - 26; x += 34) {
      context.fillRect(x, ry + r.h / 2 - 2, 20, 4);
    }
    // The name painted on the strip, read from the north road.
    text('SOLMAR AIR', rx + r.w / 2, ry + r.h / 2 + 12, 13, 'rgba(232,232,232,0.5)', 'center', 800);
    // Amber edge lights down both sides: dots by day, glowing beads after dark.
    for (let x = r.x + 14; x <= r.x + r.w - 14; x += 52) {
      for (const edgeY of [r.y + 4, r.y + r.h - 4]) {
        context.save();
        if (dark > 0.1) {
          context.shadowColor = COLORS.runwayLight;
          context.shadowBlur = 8 * dark;
        }
        context.fillStyle = COLORS.runwayLight;
        context.globalAlpha = dark > 0.1 ? 1 : 0.55;
        context.beginPath();
        context.arc(cam.x + x, cam.y + edgeY, 2.6, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
    // Approach strobes: five white beads west of the threshold, sequencing toward the
    // strip after dark — the landing lane, blinking the plane home.
    if (dark > 0.08) {
      for (let i = 0; i < 5; i += 1) {
        const sx = cam.x + r.x - 24 - i * 30;
        const sy = cam.y + r.y + r.h / 2;
        const lit = Math.floor(game.time * 3 - i) % 5 === 0;
        context.save();
        if (lit) {
          context.shadowColor = COLORS.runwayStrobe;
          context.shadowBlur = 10;
        }
        context.fillStyle = lit ? COLORS.runwayStrobe : 'rgba(255,255,255,0.25)';
        context.beginPath();
        context.arc(sx, sy, lit ? 3 : 2, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
    // Fuel drums by the hangar's west wall: rust-red cylinders, two down and one up.
    for (const drum of AIRPORT_DRUMS) {
      context.fillStyle = '#8a3a2c';
      context.beginPath();
      context.arc(cam.x + drum.x, cam.y + drum.y, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.25)';
      context.beginPath();
      context.arc(cam.x + drum.x - 1.5, cam.y + drum.y - 1.5, 1.6, 0, Math.PI * 2);
      context.fill();
    }
    // The windsock east of the hangar: a pole with an orange cone that leans with the
    // storm gusts and flutters on the wind — still in a calm, near-horizontal in a gale.
    const ws = AIRPORT_WINDSOCK;
    const gust = game.weather ? game.weather.gust || 0 : 0;
    const lean = 0.35 + gust * 1.1 + Math.sin(game.time * 3.1) * 0.06;
    const wpx = cam.x + ws.x;
    const wpy = cam.y + ws.y;
    context.strokeStyle = '#5a5f66';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(wpx, wpy + 14);
    context.lineTo(wpx, wpy - 12);
    context.stroke();
    context.save();
    context.translate(wpx, wpy - 12);
    context.rotate(lean);
    context.fillStyle = COLORS.windsock;
    context.beginPath();
    context.moveTo(0, -3.5);
    context.lineTo(16, -1.5);
    context.lineTo(16, 1.5);
    context.lineTo(0, 3.5);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.55)';
    context.fillRect(4, -3.5, 3, 7);
    context.restore();
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
    // The night market's plaza: warm festival paving over the whole market block,
    // speckled like the resort aprons, so the quarter reads as one place by day.
    const mk = city.market && city.market.bounds;
    if (mk && mk.x < vis.x1 && mk.x + mk.w > vis.x0 && mk.y < vis.y1 && mk.y + mk.h > vis.y0) {
      context.fillStyle = COLORS.marketPlaza;
      context.fillRect(cam.x + mk.x, cam.y + mk.y, mk.w, mk.h);
      context.fillStyle = 'rgba(255,220,150,0.14)';
      for (let s = 0; s < 16; s += 1) {
        context.fillRect(cam.x + mk.x + hash01(mk.x + s * 41, mk.y) * (mk.w - 8), cam.y + mk.y + hash01(mk.x, mk.y + s * 67) * (mk.h - 6), 5, 3);
      }
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
    // the base the lamp pools and neon reflections sit on. A thunderstorm wets it hardest.
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
    // The airfield's runway, laid over the grass strip on the north edge.
    drawAirport(game, cam, dark);
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
      // A food stall: a wooden counter with goods on top, a striped awning overhead
      // and a lantern swaying at the corner — the market's own little shopfront.
      if (b.kind === 'stall') {
        context.fillStyle = 'rgba(0,0,0,0.18)';
        context.fillRect(bx + 3, by + 4, b.w, b.h);
        context.fillStyle = '#6b4a2f';
        context.fillRect(bx, by, b.w, b.h);
        context.fillStyle = shade('#6b4a2f', 1.25);
        context.fillRect(bx + 2, by + 2, b.w - 4, 6);
        // Goods on the counter: bright dots in fruit and spice colours.
        const goods = ['#e2583e', '#f2a541', '#3e8f6a', '#d94f70'];
        for (let gI = 0; gI < 4; gI += 1) {
          context.fillStyle = goods[(gI + b.x) % goods.length];
          context.beginPath();
          context.arc(bx + 7 + gI * 7, by + 5, 2.4, 0, Math.PI * 2);
          context.fill();
        }
        // The awning: stripes overhanging the counter, and the stall's sign below it.
        for (let s = 0; s < b.w + 4; s += 8) {
          context.fillStyle = (s / 8) % 2 === 0 ? b.awning : '#e8e2d4';
          context.fillRect(bx - 2 + s, by - 7, Math.min(8, b.w + 4 - s), 7);
        }
        context.fillStyle = 'rgba(0,0,0,0.25)';
        context.fillRect(bx - 2, by, b.w + 4, 1.5);
        text(b.label, bx + b.w / 2, by + b.h - 4, 7, '#fff6e0', 'center', 700);
        // The lantern: a warm dot swaying at the stall's corner on a short line.
        const sway = triWave(game.time * 0.8 + b.x * 0.05) * 2;
        context.strokeStyle = 'rgba(40,32,24,0.8)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(bx + b.w - 4, by - 7);
        context.lineTo(bx + b.w - 4 + sway, by - 2);
        context.stroke();
        context.fillStyle = COLORS.lantern;
        context.beginPath();
        context.arc(bx + b.w - 4 + sway, by, 2.6, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      // The festival stage: a low wooden platform with a red curtain backdrop, and
      // the band on it — three figures bobbing to the beat, swaying with the music.
      if (b.kind === 'stage') {
        context.fillStyle = 'rgba(0,0,0,0.18)';
        context.fillRect(bx + 4, by + 5, b.w, b.h);
        context.fillStyle = COLORS.stageFloor;
        context.fillRect(bx, by, b.w, b.h);
        context.fillStyle = shade(COLORS.stageFloor, 0.7);
        context.fillRect(bx, by + b.h - 8, b.w, 8);
        // The curtain: a red backdrop with darker folds, behind the band.
        context.fillStyle = COLORS.stageCurtain;
        context.fillRect(bx + 6, by + 3, b.w - 12, 15);
        context.fillStyle = 'rgba(0,0,0,0.28)';
        for (let fx = bx + 14; fx < bx + b.w - 8; fx += 13) {
          context.fillRect(fx, by + 3, 4, 15);
        }
        // The band: a singer and two players, bobbing on the beat.
        const bandShirts = ['#e8b23a', '#39c2d7', '#d94f70'];
        for (let mI = 0; mI < 3; mI += 1) {
          const mx = bx + 24 + mI * 21;
          const bob = triWave(game.time * 2 + mI * 1.3) * 2.5;
          context.fillStyle = bandShirts[mI];
          context.fillRect(mx - 4, by + 20 + bob, 8, 10);
          context.fillStyle = '#e8c39a';
          context.beginPath();
          context.arc(mx, by + 17 + bob, 3.6, 0, Math.PI * 2);
          context.fill();
        }
        if (b.sign) text(b.sign.text, bx + b.w / 2, by - 4, 9, b.sign.color, 'center', 700);
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
      // The hangar's door: a wide dark opening on its south face, with a pale frame —
      // the plane's home, and the pilot's shelter from the storm.
      if (b.kind === 'hangar') {
        context.fillStyle = '#2b2f36';
        context.fillRect(bx + b.w / 2 - 34, by + b.h - 2, 68, faceH - 1);
        context.strokeStyle = 'rgba(232,232,232,0.55)';
        context.lineWidth = 1.5;
        context.strokeRect(bx + b.w / 2 - 34, by + b.h - 2, 68, faceH - 1);
        context.strokeStyle = 'rgba(232,232,232,0.3)';
        for (let d = -20; d <= 20; d += 10) {
          context.beginPath();
          context.moveTo(bx + b.w / 2 + d, by + b.h - 2);
          context.lineTo(bx + b.w / 2 + d, by + b.h + faceH - 3);
          context.stroke();
        }
      }
      context.fillStyle = 'rgba(255,255,255,0.10)';
      context.fillRect(bx + 7, by + 7, b.w - 14, 3);
      if (b.sign) drawSign(b, bx, by, dark);
    }
    // The market's string lights: sagging spans between the plaza posts, bulbs strung
    // along each one — warm by day, glowing after dark (drawNightLights adds the pools).
    if (city.market) {
      context.strokeStyle = 'rgba(40,32,24,0.85)';
      context.lineWidth = 1.5;
      for (const span of city.market.lights) {
        const mx = (span.x1 + span.x2) / 2;
        const my = (span.y1 + span.y2) / 2 + 12; // the sag: the wire dips mid-span
        context.beginPath();
        context.moveTo(cam.x + span.x1, cam.y + span.y1 - 14);
        context.quadraticCurveTo(cam.x + mx, cam.y + my - 14, cam.x + span.x2, cam.y + span.y2 - 14);
        context.stroke();
        const n = 6;
        for (let i = 1; i <= n; i += 1) {
          const t = i / (n + 1);
          const lx = (1 - t) * (1 - t) * span.x1 + 2 * (1 - t) * t * mx + t * t * span.x2;
          const ly = (1 - t) * (1 - t) * span.y1 + 2 * (1 - t) * t * my + t * t * span.y2 - 14;
          context.fillStyle = dark > 0.3 ? '#ffd98a' : COLORS.lantern;
          context.beginPath();
          context.arc(cam.x + lx, cam.y + ly, 2.5, 0, Math.PI * 2);
          context.fill();
        }
      }
      // The posts themselves: thin poles with a little crossbar at the top.
      context.fillStyle = '#3a3226';
      for (const post of city.market.posts) {
        context.fillRect(cam.x + post.x - 1.5, cam.y + post.y - 16, 3, 16);
        context.fillRect(cam.x + post.x - 5, cam.y + post.y - 16, 10, 2);
      }
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
      if (p.broken) {
        // What a fast car leaves behind: a crate is two crossed splintered planks, a
        // bin a squashed drum with its lid flung beside it, a barrel a split half-drum
        // leaking a dark stain onto the ground.
        if (p.kind === 'bin') {
          context.fillStyle = '#223d29';
          context.beginPath();
          context.ellipse(0, 1, 6.5, 4, 0, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#3d6b47';
          context.beginPath();
          context.ellipse(7, -3, 3.4, 2.4, 0.7, 0, Math.PI * 2);
          context.fill();
        } else if (p.kind === 'barrel') {
          context.fillStyle = 'rgba(20,16,10,0.4)';
          context.beginPath();
          context.ellipse(3, 3, 10, 6, 0.4, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = COLORS.barrelDark;
          context.fillRect(-6, -3, 12, 6);
          context.fillStyle = COLORS.barrel;
          context.fillRect(-6, -3, 12, 2.4);
        } else {
          context.fillStyle = '#77603f';
          context.fillRect(-p.w / 2, -2, p.w, 4);
          context.fillStyle = '#5d4a35';
          context.save();
          context.rotate(0.5);
          context.fillRect(-p.w / 2 + 2, -1.8, p.w - 4, 3.6);
          context.restore();
        }
      } else if (p.kind === 'bench') {
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
      } else if (p.kind === 'barrel') {
        // A dock barrel: a rust-brown drum with two darker bands and a pale glint on
        // its lid — fuel for the cranes, trouble for a careless driver.
        context.fillStyle = 'rgba(0,0,0,0.22)';
        context.beginPath();
        context.ellipse(1.5, 2, 7.5, 6.5, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = COLORS.barrel;
        context.beginPath();
        context.arc(0, 0, 6.5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = COLORS.barrelDark;
        context.lineWidth = 1.6;
        context.beginPath();
        context.arc(0, 0, 4.4, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.arc(0, 0, 2, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = 'rgba(255,255,255,0.20)';
        context.beginPath();
        context.arc(-2, -2.4, 1.6, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = '#a8854f';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        context.strokeStyle = '#77603f';
        context.lineWidth = 2;
        context.strokeRect(-p.w / 2 + 2, -p.h / 2 + 2, p.w - 4, p.h - 4);
      }
      context.restore();
    }
    // Wreckage lying where props broke: splinters and shards flat on the ground,
    // left behind by whatever ploughed through them.
    for (const d of game.debris || []) {
      if (d.x < vis.x0 || d.x > vis.x1 || d.y < vis.y0 || d.y > vis.y1) continue;
      context.save();
      context.translate(cam.x + d.x, cam.y + d.y);
      context.rotate(d.rot);
      context.fillStyle = d.color;
      context.globalAlpha = 0.85;
      context.fillRect(-d.size, -d.size * 0.32, d.size * 2, d.size * 0.64);
      context.restore();
    }
    context.globalAlpha = 1;
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
    // The car's history, worn on its body: scuffed nose corners once it has taken a
    // few hits, a cracked windscreen past halfway, a crumpled black nose when it is
    // nearly a wreck. Motorcycles are too small to dent — their riders just fall off.
    const dmg = car.damage || 0;
    if (dmg > 20 && car.shape !== 'moto') {
      context.fillStyle = 'rgba(20,18,16,0.35)';
      context.beginPath();
      context.ellipse(len / 2 - 4, -wid / 2 + 3, 6, 3.4, 0.5, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(len / 2 - 4, wid / 2 - 3, 6, 3.4, -0.5, 0, Math.PI * 2);
      context.fill();
      if (dmg > 45) {
        context.strokeStyle = 'rgba(240,246,250,0.55)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(len * 0.1, 0);
        context.lineTo(len * 0.02, -wid / 4);
        context.moveTo(len * 0.1, 0);
        context.lineTo(len * 0.16, wid / 5);
        context.moveTo(len * 0.1, 0);
        context.lineTo(len * 0.2, -2);
        context.stroke();
      }
      if (dmg > 70) {
        context.fillStyle = 'rgba(15,13,12,0.45)';
        context.beginPath();
        context.moveTo(len / 2, -wid / 2 + 2);
        context.lineTo(len / 2 - 9, 0);
        context.lineTo(len / 2, wid / 2 - 2);
        context.closePath();
        context.fill();
      }
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

  /** The elevated railway's structure, drawn over the streets and the ground traffic:
   * a soft shadow thrown south-east, pillars standing in the avenues, the concrete
   * beam with its darker bed, cross ties, and two pale rails catching the light. The
   * stations get a platform slab beside the track, a striped canopy on posts, and
   * their name painted where a passenger would read it. The train itself is drawn
   * separately, after the night tint, so its lit windows burn through the dark.
   * The track never moves, so its strokes are built once as Path2D objects in world
   * coordinates and replayed each frame under a camera translation — the loop is the
   * longest single drawing the game makes, and rebuilding it per frame would cost
   * more than the rest of the city combined. */
  let viaductPaths = null;
  function buildViaductPaths() {
    const SAMPLES = 170;
    const pts = [];
    for (let i = 0; i <= SAMPLES; i += 1) pts.push(trainPointAt((i / SAMPLES) * TRAIN_LOOP_LENGTH));
    const trace = new Path2D();
    for (let i = 0; i < pts.length; i += 1) {
      if (i === 0) trace.moveTo(pts[i].x, pts[i].y);
      else trace.lineTo(pts[i].x, pts[i].y);
    }
    const ties = new Path2D();
    for (let s = 0; s < TRAIN_LOOP_LENGTH; s += 24) {
      const p = trainPointAt(s);
      const px = -Math.sin(p.angle);
      const py = Math.cos(p.angle);
      ties.moveTo(p.x - px * 12.5, p.y - py * 12.5);
      ties.lineTo(p.x + px * 12.5, p.y + py * 12.5);
    }
    const rails = [-8.5, 8.5].map((off) => {
      const path = new Path2D();
      for (let i = 0; i < pts.length; i += 1) {
        const px = -Math.sin(pts[i].angle) * off;
        const py = Math.cos(pts[i].angle) * off;
        if (i === 0) path.moveTo(pts[i].x + px, pts[i].y + py);
        else path.lineTo(pts[i].x + px, pts[i].y + py);
      }
      return path;
    });
    return { trace, ties, rails };
  }

  function drawViaduct(game, cam, dark) {
    const vis = visible(cam);
    const rail = game.city.rail;
    if (!rail) return;
    if (!viaductPaths) viaductPaths = buildViaductPaths();
    context.save();
    context.translate(cam.x, cam.y);
    // The shadow the whole structure throws on the street below.
    context.save();
    context.translate(13, 15);
    context.strokeStyle = 'rgba(0,0,0,0.16)';
    context.lineWidth = 36;
    context.stroke(viaductPaths.trace);
    context.restore();
    // The beam and its bed.
    context.strokeStyle = COLORS.viaduct;
    context.lineWidth = 31;
    context.stroke(viaductPaths.trace);
    context.strokeStyle = COLORS.viaductBed;
    context.lineWidth = 24;
    context.stroke(viaductPaths.trace);
    // Ties under the rails, then the rails themselves.
    context.strokeStyle = COLORS.tie;
    context.globalAlpha = 0.55;
    context.lineWidth = 4;
    context.stroke(viaductPaths.ties);
    context.globalAlpha = 1;
    context.strokeStyle = COLORS.railSteel;
    context.lineWidth = 2.4;
    for (const path of viaductPaths.rails) context.stroke(path);
    context.restore();
    // Pillars: a dark post with a lighter capital disc where it meets the beam.
    for (const p of rail.pillars) {
      if (p.x < vis.x0 || p.x > vis.x1 || p.y < vis.y0 || p.y > vis.y1) continue;
      context.fillStyle = 'rgba(0,0,0,0.20)';
      context.beginPath();
      context.ellipse(cam.x + p.x + 4, cam.y + p.y + 5, 10, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = COLORS.viaductDark;
      context.fillRect(cam.x + p.x - 5, cam.y + p.y - 5, 10, 10);
      context.fillStyle = COLORS.viaduct;
      context.beginPath();
      context.arc(cam.x + p.x, cam.y + p.y, 8.5, 0, Math.PI * 2);
      context.fill();
    }
    // Stations: platform, canopy, name. The platform hugs the track on the city side.
    for (const st of rail.stations) {
      if (st.x < vis.x0 - 120 || st.x > vis.x1 + 120 || st.y < vis.y0 - 90 || st.y > vis.y1 + 90) continue;
      const cx = cam.x + st.x;
      const cy = cam.y + st.y + st.side * 34;
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(cx - 88 + 4, cy - 15 + 5, 176, 30);
      context.fillStyle = COLORS.platform;
      context.fillRect(cx - 88, cy - 15, 176, 30);
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.fillRect(cx - 88, cy - (st.side > 0 ? 15 : -13), 176, 2.5);
      // The canopy: a striped awning on four posts, halfway down the platform.
      context.fillStyle = COLORS.viaductDark;
      for (const ox of [-52, 52]) {
        context.fillRect(cx + ox - 2, cy - 8, 4, 16);
      }
      for (let s2 = 0; s2 < 120; s2 += 10) {
        context.fillStyle = (s2 / 10) % 2 === 0 ? COLORS.trainBody : COLORS.trainCream;
        context.fillRect(cx - 60 + s2, cy - 10, 10, 20);
      }
      context.fillStyle = dark > 0.15 ? '#ffd98a' : '#2b3542';
      context.font = `700 10px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(st.name, cx, cy + 27 * st.side);
    }
  }

  /** The elevated train itself: three cars in a teal-and-cream livery with a yellow
   * stripe, riding the loop above the traffic. Its ground shadow slides along the
   * street a car-length away — that offset is what sells the height, the same trick
   * the helicopter uses. Windows are dark glass by day and lit segments after dark;
   * the head car throws a headlight beam at night and the tail car wears red lamps. */
  function drawTrain(game, cam, dark) {
    const t = game.train;
    if (!t) return;
    const step = TRAIN.carLen + TRAIN.carGap;
    for (let i = TRAIN.cars - 1; i >= 0; i -= 1) {
      const c = trainPointAt(t.s - TRAIN.carLen / 2 - i * step);
      if (c.x < -cam.x - 120 || c.x > -cam.x + VIEW_W + 120 || c.y < -cam.y - 120 || c.y > -cam.y + VIEW_H + 120) continue;
      context.save();
      context.translate(cam.x + c.x, cam.y + c.y);
      context.rotate(c.angle);
      // Ground shadow, thrown away from the body.
      context.fillStyle = 'rgba(0,0,0,0.20)';
      context.beginPath();
      context.ellipse(11, 15, TRAIN.carLen / 2 + 5, TRAIN.carWid / 2 + 4, 0, 0, Math.PI * 2);
      context.fill();
      // Bogies under the body, near each end.
      context.fillStyle = '#1c1f24';
      context.fillRect(-TRAIN.carLen / 2 + 5, -TRAIN.carWid / 2 + 3, 11, TRAIN.carWid - 6);
      context.fillRect(TRAIN.carLen / 2 - 16, -TRAIN.carWid / 2 + 3, 11, TRAIN.carWid - 6);
      // The body: teal sides, a cream roof panel, a yellow stripe down each flank.
      context.fillStyle = COLORS.trainBody;
      rr(-TRAIN.carLen / 2, -TRAIN.carWid / 2, TRAIN.carLen, TRAIN.carWid, 7);
      context.fill();
      context.fillStyle = COLORS.trainStripe;
      context.fillRect(-TRAIN.carLen / 2 + 3, -TRAIN.carWid / 2 + 1.6, TRAIN.carLen - 6, 2.2);
      context.fillRect(-TRAIN.carLen / 2 + 3, TRAIN.carWid / 2 - 3.8, TRAIN.carLen - 6, 2.2);
      context.fillStyle = COLORS.trainCream;
      rr(-TRAIN.carLen / 2 + 7, -TRAIN.carWid / 2 + 5.5, TRAIN.carLen - 14, TRAIN.carWid - 11, 5);
      context.fill();
      // The window band: dark glass segments along the roof panel, lit from inside
      // once the light goes — passengers, going somewhere, above the traffic.
      const segs = 5;
      for (let s2 = 0; s2 < segs; s2 += 1) {
        const wx = -TRAIN.carLen / 2 + 11 + s2 * ((TRAIN.carLen - 22) / segs);
        const lit = dark > 0.12 && hash01(Math.round(c.x) + i * 31, s2 * 17) < 0.75;
        context.fillStyle = lit ? COLORS.windowLit : 'rgba(20,30,44,0.85)';
        context.fillRect(wx, -TRAIN.carWid / 2 + 8, (TRAIN.carLen - 22) / segs - 3, TRAIN.carWid - 16);
      }
      if (i === 0) {
        // The head car: a pale nose, a destination board, and the headlight.
        context.fillStyle = COLORS.trainCream;
        rr(TRAIN.carLen / 2 - 9, -TRAIN.carWid / 2 + 4, 9, TRAIN.carWid - 8, 4);
        context.fill();
        context.fillStyle = '#17121a';
        context.fillRect(TRAIN.carLen / 2 - 7.5, -5, 4.5, 10);
        context.fillStyle = '#ffb84d';
        context.fillRect(TRAIN.carLen / 2 - 7, -3.6, 3.5, 2.2);
        context.fillRect(TRAIN.carLen / 2 - 7, 1.4, 3.5, 2.2);
        context.save();
        if (dark > 0.1) {
          context.shadowColor = '#ffe9a8';
          context.shadowBlur = 12 * dark;
        }
        context.fillStyle = '#fff3c4';
        context.beginPath();
        context.arc(TRAIN.carLen / 2 + 1, 0, 2.8, 0, Math.PI * 2);
        context.fill();
        context.restore();
        if (dark > 0.15) {
          // The beam ahead of the train, washing the track in front of it.
          context.fillStyle = 'rgba(255,240,190,0.10)';
          context.beginPath();
          context.moveTo(TRAIN.carLen / 2, -4);
          context.lineTo(TRAIN.carLen / 2 + 95, -20);
          context.lineTo(TRAIN.carLen / 2 + 95, 20);
          context.lineTo(TRAIN.carLen / 2, 4);
          context.closePath();
          context.fill();
        }
      }
      if (i === TRAIN.cars - 1) {
        // The tail car wears two red lamps at the back of the consist.
        context.fillStyle = '#ff5040';
        context.fillRect(-TRAIN.carLen / 2 - 1, -TRAIN.carWid / 2 + 4, 2.6, 4);
        context.fillRect(-TRAIN.carLen / 2 - 1, TRAIN.carWid / 2 - 8, 2.6, 4);
      }
      context.restore();
    }
  }

  /** The airfield's prop plane, drawn last so it rides over the whole city: a ground
   * shadow at its true position on the runway or the rooftops below, and the plane
   * itself lifted up and north of that shadow by its altitude — the gap between the two
   * is what sells the height, the same trick the train and the helicopter use. A white
   * fuselage with a blue stripe and a red tail, a spinning prop blur at the nose, and
   * nav lights — red on the left wingtip, green on the right, a white strobe blinking
   * on the tail. On the ground it sits on the runway; in the air it grows a touch with
   * altitude, the way a near thing does. */
  function drawPlane(game, cam, dark) {
    const p = game.plane;
    if (!p) return;
    const pos = airportPointAt(p.s);
    if (pos.x < -cam.x - 140 || pos.x > -cam.x + VIEW_W + 140 || pos.y < -cam.y - 140 || pos.y > -cam.y + VIEW_H + 140) return;
    const alt = p.alt || 0;
    const lift = alt * PLANE.altDraw;
    const scale = 1 + alt * 0.15;
    // The ground shadow, at the plane's true position, shrinking as it climbs.
    context.fillStyle = `rgba(0,0,0,${0.28 - alt * 0.14})`;
    context.beginPath();
    context.ellipse(cam.x + pos.x + 6, cam.y + pos.y + 8, 24 * (1 - alt * 0.25), 9 * (1 - alt * 0.25), pos.angle, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.translate(cam.x + pos.x, cam.y + pos.y - lift);
    context.rotate(pos.angle);
    context.scale(scale, scale);
    // The wings: one long bar across the fuselage, with a darker root.
    context.fillStyle = COLORS.planeBody;
    rr(-8, -26, 16, 52, 4);
    context.fill();
    context.fillStyle = 'rgba(0,0,0,0.12)';
    context.fillRect(-8, -8, 16, 5);
    context.fillRect(-8, 3, 16, 5);
    // The tailplane: a smaller bar at the back.
    context.fillStyle = COLORS.planeTail;
    rr(-24, -13, 8, 26, 3);
    context.fill();
    // The fuselage: a white body with a blue stripe down each flank and a glass nose.
    context.fillStyle = COLORS.planeBody;
    rr(-26, -7, 52, 14, 7);
    context.fill();
    context.fillStyle = COLORS.planeStripe;
    context.fillRect(-24, -2.5, 48, 5);
    context.fillStyle = 'rgba(20,30,44,0.9)';
    context.beginPath();
    context.ellipse(18, 0, 7, 5, 0, 0, Math.PI * 2);
    context.fill();
    // The propeller: a pale spinning disc at the nose, with two blade lines sweeping
    // through it on the plane's own clock.
    context.save();
    context.translate(28, 0);
    context.fillStyle = 'rgba(200,210,220,0.16)';
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(220,228,238,0.35)';
    context.lineWidth = 2;
    const pa = (game.time * 31) % Math.PI;
    context.beginPath();
    context.moveTo(Math.cos(pa) * -10, Math.sin(pa) * -10);
    context.lineTo(Math.cos(pa) * 10, Math.sin(pa) * 10);
    context.moveTo(Math.cos(pa + Math.PI / 2) * -10, Math.sin(pa + Math.PI / 2) * -10);
    context.lineTo(Math.cos(pa + Math.PI / 2) * 10, Math.sin(pa + Math.PI / 2) * 10);
    context.stroke();
    context.fillStyle = '#3a3a3a';
    context.beginPath();
    context.arc(0, 0, 2.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // Nav lights: red on the left wingtip, green on the right, and a white strobe on
    // the tail that blinks on the plane's own clock. After dark the wingtips glow.
    context.save();
    if (dark > 0.15) {
      context.shadowColor = '#ff5040';
      context.shadowBlur = 7;
    }
    context.fillStyle = '#ff5040';
    context.beginPath();
    context.arc(-2, -26, 2.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.save();
    if (dark > 0.15) {
      context.shadowColor = '#3fd06a';
      context.shadowBlur = 7;
    }
    context.fillStyle = '#3fd06a';
    context.beginPath();
    context.arc(-2, 26, 2.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    const strobe = Math.sin(game.time * 6) > 0.6;
    context.save();
    if (strobe) {
      context.shadowColor = '#ffffff';
      context.shadowBlur = 8;
    }
    context.fillStyle = strobe ? '#ffffff' : 'rgba(255,255,255,0.35)';
    context.beginPath();
    context.arc(-25, 0, 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // At night the landing light throws a pale cone ahead of the nose — longer and
    // brighter while the plane is low on climb-out or final approach, when the strip
    // below is what it is lighting.
    if (dark > 0.15) {
      const low = alt > 0.02 && alt < 0.6;
      const reach = low ? 110 : 70;
      const spread = low ? 22 : 16;
      context.fillStyle = low ? 'rgba(255,240,190,0.14)' : 'rgba(255,240,190,0.08)';
      context.beginPath();
      context.moveTo(26, -3);
      context.lineTo(26 + reach, -spread);
      context.lineTo(26 + reach, spread);
      context.lineTo(26, 3);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  /** A lightning bolt during a thunderstorm: a jagged white-blue stroke from the sky
   * down to the strike point the weather picked, glowing while the flash lasts. The
   * jaggedness is seeded off the strike, so the same bolt keeps its shape while it
   * flickers — it never redraws itself mid-flash. */
  function drawLightning(game, cam) {
    const w = game.weather;
    if (!w || w.flash <= 0.05) return;
    const x0 = cam.x + w.boltX;
    const y0 = cam.y + w.boltY - 300;
    const x1 = cam.x + w.boltX;
    const y1 = cam.y + w.boltY;
    const segs = 9;
    context.save();
    context.globalAlpha = Math.min(1, w.flash);
    context.strokeStyle = COLORS.bolt;
    context.lineWidth = 3;
    context.shadowColor = COLORS.bolt;
    context.shadowBlur = 14;
    context.beginPath();
    context.moveTo(x0, y0);
    for (let i = 1; i < segs; i += 1) {
      const t = i / segs;
      const jx = (hash01(Math.round(w.boltSeed), i * 13) - 0.5) * 52;
      const jy = (hash01(Math.round(w.boltSeed) + 7, i * 29) - 0.5) * 10;
      context.lineTo(x0 + (x1 - x0) * t + jx, y0 + (y1 - y0) * t + jy);
    }
    context.lineTo(x1, y1);
    context.stroke();
    // Branches off the main stroke, fainter, for the forked look: two jagged forks
    // that reach the ground, each keeping its own seeded shape while the flash lasts.
    context.globalAlpha = Math.min(1, w.flash) * 0.55;
    context.strokeStyle = COLORS.boltBranch;
    context.lineWidth = 1.8;
    for (const [forkT, forkSeed, forkDir] of [[0.55, 3, 1], [0.72, 11, -1]]) {
      const bx = x0 + (x1 - x0) * forkT + (hash01(Math.round(w.boltSeed), forkSeed) - 0.5) * 40;
      const by = y0 + (y1 - y0) * forkT;
      const endX = bx + forkDir * (46 + hash01(Math.round(w.boltSeed), forkSeed + 1) * 30);
      const endY = y1 + 26;
      context.beginPath();
      context.moveTo(bx, by);
      for (let i = 1; i <= 3; i += 1) {
        const t = i / 3;
        const jx = (hash01(Math.round(w.boltSeed), forkSeed + i * 7) - 0.5) * 26;
        context.lineTo(bx + (endX - bx) * t + jx, by + (endY - by) * t);
      }
      context.stroke();
    }
    context.restore();
  }

  function drawWorld(game, cam) {
    drawCity(game, cam);
    // Police spike strips lie flat on the asphalt across the road ahead, drawn over
    // the road and under the cars: a dark band with steel teeth, dulled flat once
    // they have bitten a set of tyres.
    for (const strip of game.police.strips || []) {
      context.save();
      context.translate(cam.x + strip.x, cam.y + strip.y);
      context.rotate(strip.angle);
      context.fillStyle = COLORS.spikeBand;
      context.fillRect(-20, -6, 40, 12);
      context.fillStyle = strip.hit ? COLORS.spikeHit : COLORS.spikeTooth;
      for (let tx = -17; tx <= 17; tx += 6.8) {
        context.beginPath();
        context.moveTo(tx - 2.5, -6);
        context.lineTo(tx, strip.hit ? -1.5 : 6);
        context.lineTo(tx + 2.5, -6);
        context.closePath();
        context.fill();
      }
      context.restore();
    }
    // A thunderstorm darkens the streets beyond the hour's own dark, and the neon
    // burns harder in the wet — the storm's own light, on top of the night's.
    const stormDark = game.weather && game.weather.storm > 0 ? 0.16 : 0;
    const dark = Math.min(0.62, darkness(game.clock) + stormDark);
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
      } else if (p.kind === 'chunk') {
        // Debris from a broken prop: a small square tumbling on its own spin.
        context.save();
        context.translate(cam.x + p.x, cam.y + p.y);
        context.rotate(p.rot || 0);
        context.fillStyle = p.color;
        context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        context.restore();
      } else if (p.kind === 'splash') {
        // A rain splash: a pale ring spreading on the asphalt as it fades.
        context.strokeStyle = p.color;
        context.lineWidth = 1.2;
        context.beginPath();
        context.ellipse(cam.x + p.x, cam.y + p.y, p.size + (1 - p.life / p.maxLife) * 9, (p.size + (1 - p.life / p.maxLife) * 9) * 0.55, 0, 0, Math.PI * 2);
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
    // The elevated railway's structure rides over the ground world: streets, cars and
    // people all pass under the viaduct, so it is painted after them.
    drawViaduct(game, cam, dark);
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
    // Lightning: the bolt over the world, and the white flash across the whole view.
    if (game.weather && game.weather.flash > 0.05) {
      drawLightning(game, cam);
      context.fillStyle = `rgba(223,233,255,${game.weather.flash * 0.26})`;
      context.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // The helicopter flies above the lighting: drawn after the tint, so its searchlight
    // pool burns through the night instead of drowning in it.
    drawHeli(game, cam, dark);
    // The train rides above the lighting too: its lit windows and headlight beam stay
    // bright over the darkened streets below.
    drawTrain(game, cam, dark);
    // And the plane rides above everything: it is the highest thing in Solmar.
    drawPlane(game, cam, dark);
  }

  /** After dark: lamp pools, neon spill, light-bar glows and headlight cones, added lightly.
   * In a thunderstorm the neon burns harder still: the wet streets throw the colours
   * back twice as far, so the signs smear long reflections down the asphalt. */
  function drawNightLights(game, cam, dark) {
    const vis = visible(cam);
    const raining = game.weather && game.weather.rain > 0;
    const storm = game.weather && game.weather.storm > 0;
    const neonBoost = storm ? 1.8 : 1; // the storm doubles the neon's spill on wet streets
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
      context.globalAlpha = (0.05 + 0.04 * dark) * neonBoost;
      context.beginPath();
      context.ellipse(cam.x + b.x + b.w / 2, cam.y + b.y + b.h + faceHeight(b) + 9, b.w * 0.42, 10, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.10 * neonBoost;
      context.beginPath();
      context.arc(cam.x + b.x + b.w / 2, cam.y + b.y + b.h, 15, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = (0.06 + 0.05 * dark + rainBoost * 0.06) * neonBoost;
      context.beginPath();
      context.ellipse(cam.x + b.x + b.w / 2, cam.y + b.y + b.h + faceHeight(b) + 30 + rainBoost * 16, b.w * 0.3, 17 + rainBoost * 13, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
    // Headlight cones: every car throws one after dark. In a thunderstorm the beams
    // stretch further and burn brighter on the wet streets — and the player's own cone
    // answers the L key: headlights off, and Rico drives dark.
    const coneBoost = storm ? 1.55 : 1;
    const coneLen = storm ? 130 : 100;
    const cone = (car, strength, len) => {
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const px = -fy;
      const py = fx;
      const nose = (car.len || 46) / 2;
      context.fillStyle = `rgba(255,240,190,${strength})`;
      context.beginPath();
      context.moveTo(cam.x + car.x + fx * nose, cam.y + car.y + fy * nose);
      context.lineTo(cam.x + car.x + fx * (nose + len) + px * 34, cam.y + car.y + fy * (nose + len) + py * 34);
      context.lineTo(cam.x + car.x + fx * (nose + len) - px * 34, cam.y + car.y + fy * (nose + len) - py * 34);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(255,246,210,0.05)';
      context.beginPath();
      context.ellipse(cam.x + car.x + fx * (nose + 4), cam.y + car.y + fy * (nose + 4), 10, 6, car.angle, 0, Math.PI * 2);
      context.fill();
    };
    for (const car of game.cars) {
      if (car.x < vis.x0 || car.x > vis.x1 || car.y < vis.y0 || car.y > vis.y1) continue;
      const darkCar = car === game.player.car && game.player.lights === false;
      cone(car, darkCar ? 0 : 0.045 * coneBoost, coneLen);
    }
    for (const car of game.police.cars) {
      cone(car, 0.05 * coneBoost, coneLen);
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
    // The night market glows after dark: a warm pool over the plaza from the string
    // lights, a brighter one over each stall's lantern, and the stage's own spotlight.
    if (game.city.market) {
      const mk = game.city.market.bounds;
      context.fillStyle = 'rgba(255,180,90,0.045)';
      context.beginPath();
      context.ellipse(cam.x + mk.x + mk.w / 2, cam.y + mk.y + mk.h / 2, mk.w * 0.62, mk.h * 0.55, 0, 0, Math.PI * 2);
      context.fill();
      for (const b of game.city.buildings) {
        if (b.kind !== 'stall') continue;
        if (b.x < vis.x0 || b.x > vis.x1 || b.y < vis.y0 || b.y > vis.y1) continue;
        context.fillStyle = 'rgba(255,190,100,0.07)';
        context.beginPath();
        context.arc(cam.x + b.x + b.w / 2, cam.y + b.y + b.h / 2, 16, 0, Math.PI * 2);
        context.fill();
      }
      const st = game.city.market.stage;
      context.fillStyle = 'rgba(255,200,120,0.08)';
      context.beginPath();
      context.ellipse(cam.x + st.x + st.w / 2, cam.y + st.y + st.h / 2, 64, 34, 0, 0, Math.PI * 2);
      context.fill();
    }
    // The runway's edge lights throw their own amber pools on the strip after dark, so
    // the airfield reads from the north road the way the lamps read downtown.
    if (game.city.airport) {
      const r = game.city.airport.runway;
      for (let x = r.x + 14; x <= r.x + r.w - 14; x += 104) {
        for (const edgeY of [r.y + 4, r.y + r.h - 4]) {
          if (x < vis.x0 || x > vis.x1 || edgeY < vis.y0 || edgeY > vis.y1) continue;
          context.fillStyle = 'rgba(255,215,106,0.06)';
          context.beginPath();
          context.arc(cam.x + x, cam.y + edgeY, 13, 0, Math.PI * 2);
          context.fill();
        }
      }
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
    // The airfield on the north edge: a grey strip where the runway runs.
    if (game.city.airport) {
      const r = game.city.airport.runway;
      context.fillStyle = '#6a6f76';
      context.fillRect(x0 + r.x * scale, y0 + r.y * scale, r.w * scale, Math.max(2, r.h * scale));
    }
    // The night market quarter: a warm amber block downtown, where the stalls are.
    if (game.city.market) {
      const mk = game.city.market.bounds;
      context.fillStyle = '#c97e2c';
      context.fillRect(x0 + mk.x * scale, y0 + mk.y * scale, mk.w * scale, mk.h * scale);
    }
    // Spike strips on the minimap: short red ticks across the road, gone when the heat dies.
    context.strokeStyle = '#d0342c';
    context.lineWidth = 1.5;
    for (const strip of game.police.strips || []) {
      const dx = Math.cos(strip.angle);
      const dy = Math.sin(strip.angle);
      context.beginPath();
      context.moveTo(x0 + (strip.x - dx * 20) * scale, y0 + (strip.y - dy * 20) * scale);
      context.lineTo(x0 + (strip.x + dx * 20) * scale, y0 + (strip.y + dy * 20) * scale);
      context.stroke();
    }
    // The elevated loop: a pale rounded square over the middle avenues, and the train
    // itself as a bright teal dot forever circling it.
    context.strokeStyle = 'rgba(140,225,232,0.8)';
    context.lineWidth = 1.6;
    rr(x0 + 450 * scale, y0 + 450 * scale, 1500 * scale, 1500 * scale, 7);
    context.stroke();
    if (game.train) {
      const tp = trainPointAt(game.train.s);
      context.fillStyle = COLORS.trainBody;
      context.beginPath();
      context.arc(x0 + tp.x * scale, y0 + tp.y * scale, 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(x0 + tp.x * scale, y0 + tp.y * scale, 1.4, 0, Math.PI * 2);
      context.fill();
    }
    // The plane on its circuit: a small white dot with a blue ring, over the north edge.
    // The ring widens with altitude, so a climbing plane reads higher than a taxiing one.
    if (game.plane) {
      const pp = airportPointAt(game.plane.s);
      const altRing = 4 + (game.plane.alt || 0) * 3;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(x0 + pp.x * scale, y0 + pp.y * scale, 2.6, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = COLORS.planeStripe;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(x0 + pp.x * scale, y0 + pp.y * scale, altRing, 0, Math.PI * 2);
      context.stroke();
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
    text('WASD move · Mouse aim · Click shoot · E car · F punch · H/B horn · P pause', VIEW_W - 16, VIEW_H - 18, 13, 'rgba(255,255,255,0.6)', 'right');
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
        'Twenty-two story missions, a night market district under string lights, police spike strips at four stars, an elevated railway circling downtown, a five-star helicopter, and a prop plane over the airfield.',
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
        'All twenty-two jobs done. Rico Vega owns this city now.',
        `Final cash: $${game.cash.toLocaleString('en-US')} · Races won: ${stats.races} · Deliveries: ${stats.deliveries}`,
      ], 'Press Enter to keep roaming free', '#7fd069');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
