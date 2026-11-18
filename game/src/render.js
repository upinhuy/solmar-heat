// Drawing only: the city, the cars and people, the HUD, the minimap and the menus. The
// camera follows the player across the 2400x2400 city, and a 1280x720 window of the world is
// fitted to the canvas, letterboxed. Flat shapes, canvas text, no assets.
import { COLORS, FIRST_ROAD, ROAD_GAP, ROAD_WIDTH, WANTED_MAX, WORLD } from './config.js';
import { HIDEOUT, MISSIONS, missionMarker } from './missions.js';
import { ROADS } from './world.js';

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

  function drawCity(game, cam) {
    const { city } = game;
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
    // Hideout: a yellow lot in the south-west corner.
    context.fillStyle = '#8a7a2e';
    context.fillRect(cam.x + HIDEOUT.x - 70, cam.y + HIDEOUT.y - 70, 140, 140);
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
    }
    // Trees and lamps.
    for (const t of city.trees) {
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

  function drawCarShape(car, cam) {
    context.save();
    context.translate(cam.x + car.x, cam.y + car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-24, -13, 48, 26);
    context.fillStyle = car.color;
    context.fillRect(-23, -12, 46, 24);
    // Cabin and windscreen.
    context.fillStyle = 'rgba(20,30,44,0.9)';
    context.fillRect(-6, -10, 14, 20);
    context.fillStyle = '#dfe8f2';
    context.fillRect(8, -10, 4, 20);
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(21, -10, 3, 4);
    context.fillRect(21, 6, 3, 4);
    if (car.police) {
      context.fillStyle = '#e8e8e8';
      context.fillRect(-23, -12, 46, 24);
      context.fillStyle = '#1c2733';
      context.fillRect(-23, -12, 46, 8);
      context.fillStyle = '#1c2733';
      context.fillRect(-23, 4, 46, 8);
      // Light bar, flashing with the siren phase.
      const flash = Math.floor(car.siren * 10) % 2 === 0;
      context.fillStyle = flash ? COLORS.copRed : COLORS.copBlue;
      context.fillRect(-4, -12, 8, 5);
      context.fillStyle = flash ? COLORS.copBlue : COLORS.copRed;
      context.fillRect(-4, 7, 8, 5);
    }
    if (car.missionCar) {
      context.strokeStyle = COLORS.mission;
      context.lineWidth = 3;
      context.strokeRect(-25, -14, 50, 28);
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

  function drawWorld(game, cam) {
    drawCity(game, cam);
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
    // Bullets.
    context.fillStyle = '#ffe9a8';
    for (const b of game.bullets) {
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
    // Mission marker: a pulsing diamond over the target.
    const marker = missionMarker(game);
    if (marker) {
      const pulse = 1 + Math.sin(game.time * 4) * 0.15;
      const mx = cam.x + marker.x;
      const my = cam.y + marker.y - 34;
      context.save();
      context.translate(mx, my);
      context.scale(pulse, pulse);
      context.rotate(Math.PI / 4);
      context.fillStyle = COLORS.mission;
      context.fillRect(-9, -9, 18, 18);
      context.fillStyle = '#10141a';
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
    // Day lighting: a dusk or night tint over the whole view.
    const dark = darkness(game.clock);
    if (dark > 0) {
      context.fillStyle = `rgba(10, 16, 42, ${dark})`;
      context.fillRect(cam.x, cam.y, WORLD, WORLD);
    }
  }

  function drawMinimap(game) {
    const x0 = VIEW_W - MINI - 16;
    const y0 = 16;
    const scale = MINI / WORLD;
    context.fillStyle = 'rgba(16,20,26,0.85)';
    context.fillRect(x0 - 6, y0 - 6, MINI + 12, MINI + 12);
    context.fillStyle = '#22303f';
    context.fillRect(x0, y0, MINI, MINI);
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
    // Hideout.
    context.fillStyle = COLORS.mission;
    context.fillRect(x0 + HIDEOUT.x * scale - 3, y0 + HIDEOUT.y * scale - 3, 6, 6);
    const marker = missionMarker(game);
    if (marker) {
      context.fillStyle = '#ffffff';
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
    context.fillRect(26, 48, Math.max(0, 180 * (p.health / 100)), 12);
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
      const w = Math.min(620, 40 + objective.length * 8.2);
      context.fillRect(14, VIEW_H - 58, w, 44);
      context.fillStyle = COLORS.mission;
      context.fillRect(14, VIEW_H - 58, 4, 44);
      text(objective, 32, VIEW_H - 30, 16, '#ffffff', 'left', 600);
    }
    // Controls hint, bottom-right.
    text('WASD move · Mouse aim · Click shoot · E car · P pause', VIEW_W - 16, VIEW_H - 18, 13, 'rgba(255,255,255,0.6)', 'right');
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
    const width = 640;
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
        'WASD move and drive · Mouse aim · Click to shoot · E to enter a car · P to pause',
        save ? `Saved game: $${save.cash.toLocaleString('en-US')} — mission ${Math.min(save.missionIndex + 1, 5)} of 5` : 'A new story in the city of Solmar',
        '',
      ];
      drawPanel('SOLMAR HEAT', lines, save ? 'Enter — continue · N — new game' : 'Press Enter or click to start', '#f2c230');
      return;
    }
    drawHud(game);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for no one — except right now.', `Cash $${game.cash.toLocaleString('en-US')} · Mission ${Math.min(game.missions.index + 1, 5)} of 5`], 'Press P to resume · R to restart · M to mute');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', [`Rico went down in Solmar. Cash kept: $${game.cash.toLocaleString('en-US')}.`, 'The crew will remember this.'], 'Press Enter to try again', '#d0342c');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar PD caught up with Rico.', `Cash kept: $${game.cash.toLocaleString('en-US')}. Mara is not pleased.`], 'Press Enter to try again', '#2f6fd0');
    } else if (screen === SCREEN_DONE) {
      drawPanel('SOLMAR IS YOURS', ['All five jobs done. Rico Vega owns this city now.', `Final cash: $${game.cash.toLocaleString('en-US')}.`], 'Press Enter to keep roaming free', '#7fd069');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
