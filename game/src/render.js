// Drawing only: the city, the cars and people, the HUD, the minimap and the menus. The
// camera follows the player across the 2400x2400 city, and a 1280x720 window of the world is
// fitted to the canvas, letterboxed. The city reads in layers: grass and sidewalks, streets
// with centrelines and zebra crossings, park plazas with fountains, the marina boardwalk
// and its water, then buildings, props, trees and lamps. Cars are drawn per body shape —
// sedan, hatchback, pickup, van, sport — with wheels, glass and details. At night the
// street lamps glow and every car throws a headlight cone. Flat shapes, canvas text, no assets.
import { COLORS, FIRST_ROAD, ROAD_GAP, ROAD_WIDTH, WANTED_MAX, WORLD } from './config.js';
import { COURIER_DEPOT, HIDEOUT, MISSIONS, RACE_START, activityMarker, missionMarker } from './missions.js';
import { BOARDWALK_Y, PIER, ROADS, WATER_Y } from './world.js';

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

  /** The world rectangle the camera currently shows, for skipping off-screen detail. */
  function visible(cam) {
    return { x0: -cam.x - 80, y0: -cam.y - 80, x1: -cam.x + VIEW_W + 80, y1: -cam.y + VIEW_H + 80 };
  }

  function drawCity(game, cam) {
    const { city } = game;
    const vis = visible(cam);
    context.fillStyle = COLORS.grass;
    context.fillRect(cam.x, cam.y, WORLD, WORLD);
    // Mown stripes so the grass is not one flat colour.
    context.fillStyle = COLORS.grassDark;
    for (let y = 0; y < WORLD; y += 120) context.fillRect(cam.x, cam.y + y, WORLD, 60);
    // Sidewalks around every block.
    context.fillStyle = COLORS.sidewalk;
    for (let ix = 0; ix < 7; ix += 1) {
      for (let iy = 0; iy < 7; iy += 1) {
        context.fillRect(cam.x + ROADS[ix] + ROAD_WIDTH / 2, cam.y + ROADS[iy] + ROAD_WIDTH / 2, ROAD_GAP - ROAD_WIDTH, ROAD_GAP - ROAD_WIDTH);
      }
    }
    // Park plazas: a paved apron under each fountain.
    context.fillStyle = COLORS.plaza;
    for (const f of city.fountains) {
      context.fillRect(cam.x + f.x - 62, cam.y + f.y - 62, 124, 124);
    }
    // Roads.
    context.fillStyle = COLORS.road;
    for (const r of ROADS) {
      context.fillRect(cam.x + r - ROAD_WIDTH / 2, cam.y, ROAD_WIDTH, WORLD);
      context.fillRect(cam.x, cam.y + r - ROAD_WIDTH / 2, WORLD, ROAD_WIDTH);
    }
    // Dashed centrelines.
    context.fillStyle = COLORS.roadLine;
    for (const r of ROADS) {
      for (let d = 20; d < WORLD; d += 60) {
        context.fillRect(cam.x + r - 2, cam.y + d, 4, 28);
        context.fillRect(cam.x + d, cam.y + r - 2, 28, 4);
      }
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
    // The marina shore: boardwalk planks, then open water with drifting wave lines.
    context.fillStyle = COLORS.boardwalk;
    context.fillRect(cam.x, cam.y + BOARDWALK_Y, WORLD, WATER_Y - BOARDWALK_Y);
    context.fillStyle = COLORS.boardwalkDark;
    for (let x = 0; x < WORLD; x += 26) context.fillRect(cam.x + x, cam.y + BOARDWALK_Y, 2, WATER_Y - BOARDWALK_Y);
    context.fillStyle = COLORS.water;
    context.fillRect(cam.x, cam.y + WATER_Y, WORLD, WORLD - WATER_Y);
    context.strokeStyle = COLORS.waterLight;
    context.lineWidth = 2;
    for (let row = 0; row < 2; row += 1) {
      const wy = WATER_Y + 22 + row * 30;
      for (let x = 30; x < WORLD; x += 110) {
        const off = Math.sin(game.time * 0.7 + x * 0.05 + row * 2) * 8;
        context.beginPath();
        context.moveTo(cam.x + x + off, cam.y + wy);
        context.lineTo(cam.x + x + 34 + off, cam.y + wy);
        context.stroke();
      }
    }
    // The pier reaching into the water.
    context.fillStyle = COLORS.boardwalkDark;
    context.fillRect(cam.x + PIER.x, cam.y + PIER.from, PIER.w, PIER.to - PIER.from);
    context.fillStyle = '#241a12';
    for (let y = PIER.from + 8; y < PIER.to; y += 34) {
      context.fillRect(cam.x + PIER.x - 3, cam.y + y, 5, 5);
      context.fillRect(cam.x + PIER.x + PIER.w, cam.y + y, 5, 5);
    }
    // Boats ride at anchor: a hull, a cabin, a mast line.
    for (const b of city.boats) {
      context.save();
      context.translate(cam.x + b.x, cam.y + b.y);
      context.rotate(b.angle);
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(-26, -9, 54, 20);
      context.fillStyle = b.color;
      context.fillRect(-26, -10, 52, 18);
      context.fillStyle = '#e8e8e8';
      context.fillRect(-4, -7, 14, 12);
      context.fillStyle = '#5d4a35';
      context.fillRect(14, -8, 2, 16);
      context.restore();
    }
    // Hideout: a yellow lot in the south-west corner, with painted parking bays.
    context.fillStyle = '#8a7a2e';
    context.fillRect(cam.x + HIDEOUT.x - 70, cam.y + HIDEOUT.y - 70, 140, 140);
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      context.strokeRect(cam.x + HIDEOUT.x - 58 + i * 30, cam.y + HIDEOUT.y + 26, 26, 34);
    }
    text('HIDEOUT', cam.x + HIDEOUT.x, cam.y + HIDEOUT.y + 4, 13, '#f2c230', 'center', 700);
    // Buildings with a roof and a shaded side, so the blocks read as blocks.
    for (const b of city.buildings) {
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(cam.x + b.x + 6, cam.y + b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(cam.x + b.x, cam.y + b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(cam.x + b.x + 8, cam.y + b.y + 8, b.w - 16, b.h - 16);
      context.fillStyle = 'rgba(255,255,255,0.08)';
      context.fillRect(cam.x + b.x + 8, cam.y + b.y + 8, b.w - 16, 6);
      // A water tank or vent box on some roofs, for skyline variety.
      if (b.w > 120 && b.h > 120) {
        context.fillStyle = 'rgba(0,0,0,0.18)';
        context.fillRect(cam.x + b.x + b.w - 44, cam.y + b.y + 14, 22, 16);
      }
    }
    // Fountains: a stone ring, blue water, a white spray heart.
    for (const f of city.fountains) {
      context.fillStyle = '#5a544c';
      context.beginPath();
      context.arc(cam.x + f.x, cam.y + f.y, f.r + 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = COLORS.waterLight;
      context.beginPath();
      context.arc(cam.x + f.x, cam.y + f.y, f.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.85)';
      context.beginPath();
      context.arc(cam.x + f.x, cam.y + f.y, 5, 0, Math.PI * 2);
      context.fill();
    }
    // Street props: benches, dumpsters and crates.
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
      } else {
        context.fillStyle = '#a8854f';
        context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        context.strokeStyle = '#77603f';
        context.lineWidth = 2;
        context.strokeRect(-p.w / 2 + 2, -p.h / 2 + 2, p.w - 4, p.h - 4);
      }
      context.restore();
    }
    // Trees and lamps. Palms get a bare trunk and a frond star; round trees a two-tone canopy.
    for (const t of city.trees) {
      if (t.palm) {
        context.strokeStyle = '#6f573c';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(cam.x + t.x, cam.y + t.y);
        context.lineTo(cam.x + t.x + 3, cam.y + t.y - 12);
        context.stroke();
        context.strokeStyle = '#2e7a3e';
        context.lineWidth = 2.5;
        for (let frond = 0; frond < 6; frond += 1) {
          const a = (frond / 6) * Math.PI * 2 + 0.4;
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
        continue;
      }
      context.fillStyle = '#1e4d28';
      context.beginPath();
      context.arc(cam.x + t.x, cam.y + t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#3a7a44';
      context.beginPath();
      context.arc(cam.x + t.x - 2, cam.y + t.y - 2, t.r * 0.7, 0, Math.PI * 2);
      context.fill();
    }
    for (const l of city.lamps) {
      context.fillStyle = '#2b2b2b';
      context.fillRect(cam.x + l.x - 2, cam.y + l.y - 2, 4, 4);
    }
  }

  /** One car, drawn by body shape: wheels first, then the body, glass and its details. */
  function drawCarShape(car, cam) {
    const len = car.len || 46;
    const wid = car.wid || 24;
    context.save();
    context.translate(cam.x + car.x, cam.y + car.y);
    context.rotate(car.angle);
    // Wheels peek out at the corners.
    context.fillStyle = '#14161a';
    const wx = len / 2 - 11;
    const wy = wid / 2 - 2;
    context.fillRect(wx - 4, -wy - 3, 9, 5);
    context.fillRect(wx - 4, wy - 2, 9, 5);
    context.fillRect(-wx - 5, -wy - 3, 9, 5);
    context.fillRect(-wx - 5, wy - 2, 9, 5);
    // Soft shadow, then the body.
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-len / 2 + 2, -wid / 2 + 3, len, wid);
    context.fillStyle = car.color;
    context.fillRect(-len / 2, -wid / 2, len, wid);
    const glass = 'rgba(20,30,44,0.9)';
    if (car.shape === 'van') {
      // A tall box: windshield at the very nose, panel seams, a rear door split.
      context.fillStyle = '#dfe8f2';
      context.fillRect(len / 2 - 9, -wid / 2 + 3, 4, wid - 6);
      context.fillStyle = glass;
      context.fillRect(len / 2 - 15, -wid / 2 + 3, 5, wid - 6);
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(2, -wid / 2, 2, wid);
      context.fillRect(-len / 2 + 12, -wid / 2, 2, wid);
      context.fillRect(-len / 2, -1, 12, 2);
    } else if (car.shape === 'pickup') {
      // Cab up front, an open bed behind with rail lines.
      context.fillStyle = glass;
      context.fillRect(len * 0.06, -wid / 2 + 3, len * 0.3, wid - 6);
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
      context.fillStyle = '#14161a';
      context.fillRect(-len / 2 - 2, -wid / 2 + 1, 4, wid - 2);
    } else if (car.shape === 'hatch') {
      // The glass runs long toward the tail.
      context.fillStyle = glass;
      context.fillRect(-len * 0.3, -wid / 2 + 3, len * 0.48, wid - 6);
      context.fillStyle = '#dfe8f2';
      context.fillRect(len * 0.18, -wid / 2 + 3, 3, wid - 6);
    } else {
      // Sedan: cabin amidships, glass front and back.
      context.fillStyle = glass;
      context.fillRect(-len * 0.14, -wid / 2 + 3, len * 0.34, wid - 6);
      context.fillStyle = '#dfe8f2';
      context.fillRect(len * 0.2, -wid / 2 + 3, 3, wid - 6);
      context.fillStyle = 'rgba(223,232,242,0.6)';
      context.fillRect(-len * 0.2, -wid / 2 + 3, 3, wid - 6);
    }
    // Headlights and tail lights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 4);
    context.fillRect(len / 2 - 2, wid / 2 - 6, 3, 4);
    context.fillStyle = '#a02c22';
    context.fillRect(-len / 2 - 1, -wid / 2 + 2, 2, 4);
    context.fillRect(-len / 2 - 1, wid / 2 - 6, 2, 4);
    if (car.police) {
      context.fillStyle = '#e8e8e8';
      context.fillRect(-len / 2, -wid / 2, len, wid);
      context.fillStyle = '#1c2733';
      context.fillRect(-len / 2, -wid / 2, len, 8);
      context.fillRect(-len / 2, wid / 2 - 8, len, 8);
      context.fillStyle = glass;
      context.fillRect(-len * 0.14, -wid / 2 + 3, len * 0.34, wid - 6);
      // Light bar, flashing with the siren phase.
      const flash = Math.floor(car.siren * 10) % 2 === 0;
      context.fillStyle = flash ? COLORS.copRed : COLORS.copBlue;
      context.fillRect(-4, -wid / 2, 8, 5);
      context.fillStyle = flash ? COLORS.copBlue : COLORS.copRed;
      context.fillRect(-4, wid / 2 - 5, 8, 5);
    }
    if (car.missionCar) {
      context.strokeStyle = COLORS.mission;
      context.lineWidth = 3;
      context.strokeRect(-len / 2 - 2, -wid / 2 - 2, len + 4, wid + 4);
    }
    context.restore();
  }

  function drawPed(ped, cam) {
    context.save();
    context.translate(cam.x + ped.x, cam.y + ped.y);
    if (ped.down > 0) {
      context.rotate(Math.PI / 2);
      context.globalAlpha = Math.max(0.25, Math.min(1, ped.down));
    }
    const swing = Math.sin(ped.walkPhase) * 3;
    context.fillStyle = '#222';
    context.fillRect(-4 + swing, 4, 3, 8);
    context.fillRect(1 - swing, 4, 3, 8);
    context.fillStyle = ped.shirt;
    context.beginPath();
    context.arc(0, 0, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8c39a';
    context.beginPath();
    context.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
    context.fill();
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
    context.fillStyle = COLORS.playerDark;
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#e8c39a';
    context.beginPath();
    context.arc(Math.cos(p.aim) * 3, Math.sin(p.aim) * 3, 6, 0, Math.PI * 2);
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

  function drawWorld(game, cam) {
    drawCity(game, cam);
    const activity = game.missions.activity;
    if (!activity.kind && activity.cooldown <= 0) {
      drawStartIcon(game, cam, RACE_START, COLORS.race, 'RACE');
      drawStartIcon(game, cam, COURIER_DEPOT, COLORS.courier, 'COURIER');
    }
    for (const car of game.cars) drawCarShape(car, cam);
    for (const car of game.police.cars) drawCarShape(car, cam);
    for (const ped of game.peds) drawPed(ped, cam);
    for (const cop of game.police.cops) {
      // Foot cops read as pedestrians in police blue, with a cap.
      drawPed({ x: cop.x, y: cop.y, angle: cop.angle, shirt: '#2f6fd0', walkPhase: game.time * 9, down: 0 }, cam);
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
    // Particles.
    for (const p of game.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(cam.x + p.x, cam.y + p.y, p.size, 0, Math.PI * 2);
      context.fill();
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
    // Day lighting: a dusk or night tint over the whole view.
    const dark = darkness(game.clock);
    if (dark > 0) {
      context.fillStyle = `rgba(10, 16, 42, ${dark})`;
      context.fillRect(cam.x, cam.y, WORLD, WORLD);
      if (dark > 0.12) drawNightLights(game, cam, dark);
    }
  }

  /** After dark: lamp pools, headlight cones and a soft halo on the player, added lightly. */
  function drawNightLights(game, cam, dark) {
    const vis = visible(cam);
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const l of game.city.lamps) {
      if (l.x < vis.x0 || l.x > vis.x1 || l.y < vis.y0 || l.y > vis.y1) continue;
      context.fillStyle = 'rgba(255,196,92,0.05)';
      context.beginPath();
      context.arc(cam.x + l.x, cam.y + l.y, 30, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,214,120,0.07)';
      context.beginPath();
      context.arc(cam.x + l.x, cam.y + l.y, 15, 0, Math.PI * 2);
      context.fill();
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
    };
    for (const car of game.cars) {
      if (car.x < vis.x0 || car.x > vis.x1 || car.y < vis.y0 || car.y > vis.y1) continue;
      cone(car, 0.045);
    }
    for (const car of game.police.cars) cone(car, 0.05);
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
    context.fillRect(x0 - 6, y0 - 6, MINI + 12, MINI + 12);
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
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(x0 + game.player.x * scale, y0 + game.player.y * scale, 3.5, 0, Math.PI * 2);
    context.fill();
    text('SOLMAR', x0 + MINI / 2, y0 + MINI + 22, 11, 'rgba(255,255,255,0.65)', 'center', 700);
  }

  function drawHud(game) {
    const p = game.player;
    // Top-left: health, cash, wanted.
    context.fillStyle = 'rgba(16,20,26,0.85)';
    context.fillRect(14, 14, 300, 96);
    text('RICO VEGA', 26, 38, 15, '#ffffff', 'left', 700);
    context.fillStyle = '#3a3f46';
    context.fillRect(26, 48, 180, 12);
    context.fillStyle = p.health > 30 ? '#7fd069' : '#d0342c';
    context.fillRect(26, 48, Math.max(0, 180 * Math.min(1, p.health / 100)), 12);
    text(`$${game.cash.toLocaleString('en-US')}`, 26, 84, 20, COLORS.cash, 'left', 700);
    text(clockText(game.clock), 218, 84, 16, '#ffffff', 'left', 600);
    // Wanted stars.
    let stars = '';
    for (let i = 0; i < WANTED_MAX; i += 1) stars += i < game.police.wanted ? '★' : '☆';
    text(stars, 26, 106, 20, '#f2c230', 'left', 700);
    // Objective bar, bottom-left.
    const objective = game.objectiveText;
    if (objective) {
      context.fillStyle = 'rgba(16,20,26,0.85)';
      const w = Math.min(680, 40 + objective.length * 8.2);
      context.fillRect(14, VIEW_H - 58, w, 44);
      const active = game.missions.activity;
      context.fillStyle = active.kind === 'race' ? COLORS.race : active.kind === 'delivery' ? COLORS.courier : COLORS.mission;
      context.fillRect(14, VIEW_H - 58, 4, 44);
      text(objective, 32, VIEW_H - 30, 16, '#ffffff', 'left', 600);
    }
    // Controls hint, bottom-right.
    text('WASD move · Mouse aim · Click shoot · E car · F punch · P pause', VIEW_W - 16, VIEW_H - 18, 13, 'rgba(255,255,255,0.6)', 'right');
    drawMinimap(game);
    // Dialogue box.
    if (game.dialogue) {
      const line = game.dialogue.lines[game.dialogue.index];
      context.fillStyle = 'rgba(16,20,26,0.92)';
      const w = Math.min(900, 60 + line.length * 7.6);
      context.fillRect((VIEW_W - w) / 2, VIEW_H - 128, w, 56);
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
    context.fillRect(x, y, width, height);
    context.fillStyle = accent || COLORS.mission;
    context.fillRect(x, y, width, 4);
    text(title, VIEW_W / 2, y + 72, 46, '#ffffff', 'center', 800);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW_W / 2, y + 122 + index * 34, 19, 'rgba(255,255,255,0.75)', 'center');
    }
    text(prompt, VIEW_W / 2, y + height - 34, 20, COLORS.mission, 'center', 700);
  }

  function cameraFor(game) {
    const cx = game.player.x - VIEW_W / 2;
    const cy = game.player.y - VIEW_H / 2;
    return {
      x: -Math.max(0, Math.min(WORLD - VIEW_W, cx)),
      y: -Math.max(0, Math.min(WORLD - VIEW_H, cy)),
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
        'Eight story missions, plus street races and courier runs on the side.',
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
        'All eight jobs done. Rico Vega owns this city now.',
        `Final cash: $${game.cash.toLocaleString('en-US')} · Races won: ${stats.races} · Deliveries: ${stats.deliveries}`,
      ], 'Press Enter to keep roaming free', '#7fd069');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
