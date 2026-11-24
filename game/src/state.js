// The game state and one fixed simulation step. No drawing and no browser calls here: the
// loop in main.js and the shot scenes in shots.js both drive the game through stepGame().
// stepGame returns the events that happened, so the caller can play sounds and announce them.
// The step also keeps the city breathing: fountain spray arcs over the plazas, dust motes
// drift through the streets, foam sparkles lift off the beach shoreline where the waves
// break, a horn blast from the player's car scatters the crowd wide,
// the weather turns — rain rolls in, slicks the streets and rolls out again, and some
// rain bands are thunderstorms: lightning strikes every few seconds, the screen flashes
// and the thunder rolls after it — a hard
// crash kicks the camera (game.shake, which the renderer reads), the elevated train
// circles its loop and pauses at its stations, the airfield's prop plane flies its
// touch-and-go circuit over the northern blocks, hard impacts bend the cars (a wrecked
// engine smokes), and the light street props — crates, bins, dock barrels — split open
// when a fast car ploughs through them and leave their wreckage on the ground.
import { AIR_LOOP_LENGTH, BEACH_EAST, BEACH_WATER_Y, TRAIN_LOOP_LENGTH, TRAIN_STATIONS, airportPointAt, createCity, hitsBuilding, parkingSpot, randomRoadPoint, resolveBuildings } from './world.js';
import { CAR, CITY_POPULATION, PLANE, PLAYER, SAVE_KEY, STEP, TRAIN, WORLD } from './config.js';
import { createRandom, distance, pick, smoothstep } from './random.js';
import {
  cashBurst,
  debrisBurst,
  driftSmoke,
  driveCar,
  exhaust,
  makeCar,
  makePed,
  makeParticle,
  muzzleFlash,
  planeTrail,
  sparks,
  tyreSmoke,
  updateBullet,
  updateParticle,
  updatePed,
  updateTraffic,
} from './vehicles.js';
import { addWanted, createPolice, updatePolice } from './police.js';
import {
  MISSIONS,
  activityObjective,
  createMissions,
  currentObjective,
  startMission,
  updateActivities,
  updateMissions,
} from './missions.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(game) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: game.cash,
        missionIndex: game.missions.index,
        sportUnlocked: game.missions.sportUnlocked,
        races: game.missions.stats.races,
        deliveries: game.missions.stats.deliveries,
      }),
    );
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

export function createGame(seed, saved) {
  const rng = createRandom(seed);
  const city = createCity(rng);
  const start = randomRoadPoint(rng);
  const player = {
    x: start.x,
    y: start.y,
    angle: 0,
    aim: 0,
    health: PLAYER.health,
    inCar: false,
    car: null,
    walkPhase: 0,
    punchCooldown: 0,
    shootCooldown: 0,
    stealCooldown: 0,
    pedCooldown: 0,
    hornCd: 0,
    lastHurt: -99,
  };
  const game = {
    rng,
    seed,
    city,
    player,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    debris: [], // wreckage decals left on the ground where props broke (capped in stepGame)
    // The elevated train: `s` is the head car's arc length along the loop, `speed` its
    // current pace, `dwell` the seconds left at a station, `lastStop` the station it
    // most recently served (so it never brakes twice for the same stop).
    train: { s: 300, speed: TRAIN.speed, dwell: 0, lastStop: -1 },
    // The airfield plane: `s` is its arc length along the circuit, `speed` its pace,
    // `alt` its altitude — 0 with the wheels on the runway, 1 at cruise. It starts
    // mid-runway, already rolling for takeoff.
    plane: { s: 0, speed: 90, alt: 0 },
    police: createPolice(),
    missions: createMissions(),
    cash: 0,
    clock: 9 * 60, // 09:00 in the morning
    time: 0,
    // The weather: rain 0..1, and storm 0/1 — a storm band is heavy rain with
    // lightning. `flash` is the lightning's brightness, decaying fast with one
    // flicker back; `boltX`/`boltY` is where the last bolt struck, near the player.
    weather: { rain: 0, nextChange: 75, lock: false, storm: 0, flash: 0, flicker: false, nextBolt: 8, boltX: 0, boltY: 0, boltSeed: 0 },
    shake: 0, // camera kick from the last hard impact, in world units, decaying
    dialogue: null,
    objectiveText: '',
    audio: null,
    save() {
      saveGame(game);
    },
  };
  // Parked cars and traffic.
  for (let i = 0; i < CITY_POPULATION.parkedCars; i += 1) game.cars.push(makeCar(rng, {}));
  for (let i = 0; i < CITY_POPULATION.trafficCars; i += 1) {
    const spot = randomRoadPoint(rng);
    const car = makeCar(rng, { x: spot.x, y: spot.y, angle: 0, traffic: true });
    car.target = randomRoadPoint(rng);
    game.cars.push(car);
  }
  for (let i = 0; i < CITY_POPULATION.pedestrians; i += 1) game.peds.push(makePed(rng));
  if (saved) {
    game.cash = saved.cash || 0;
    game.missions.sportUnlocked = !!saved.sportUnlocked;
    game.missions.stats.races = saved.races || 0;
    game.missions.stats.deliveries = saved.deliveries || 0;
    if ((saved.missionIndex || 0) >= MISSIONS.length) {
      game.missions.index = MISSIONS.length;
      game.missions.finishedAll = true;
    } else {
      game.missions.index = saved.missionIndex || 0;
    }
  }
  return game;
}

function nearestCar(game, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of game.cars) {
    const d = distance(car.x, car.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function hurtPlayer(game, amount) {
  game.player.health -= amount;
  game.player.lastHurt = game.time;
}

/** Enter or exit the nearest car. Returns an event, if any. */
function enterExitCar(game) {
  const player = game.player;
  if (player.inCar) {
    const car = player.car;
    player.inCar = false;
    player.car = null;
    player.x = car.x - Math.cos(car.angle) * 0 + 30;
    player.y = car.y + 30;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    return null;
  }
  const car = nearestCar(game, player.x, player.y, 52);
  if (!car) return null;
  player.inCar = true;
  player.car = car;
  car.traffic = false;
  car.speedTarget = 0;
  if (!car.missionCar && player.stealCooldown <= 0) {
    addWanted(game.police, 1);
    player.stealCooldown = 4;
    return { type: 'steal' };
  }
  return null;
}

function playerShoot(game, events) {
  const player = game.player;
  if (player.shootCooldown > 0 || player.inCar) return;
  player.shootCooldown = PLAYER.shootCooldown;
  const bx = player.x + Math.cos(player.aim) * 20;
  const by = player.y + Math.sin(player.aim) * 20;
  game.bullets.push({ x: bx, y: by, vx: Math.cos(player.aim) * PLAYER.bulletSpeed, vy: Math.sin(player.aim) * PLAYER.bulletSpeed, life: 1.1 });
  muzzleFlash(game, bx, by, player.aim);
  events.push({ type: 'shot', x: bx, y: by });
}

function playerPunch(game, events) {
  const player = game.player;
  if (player.punchCooldown > 0 || player.inCar) return;
  player.punchCooldown = PLAYER.punchCooldown;
  events.push({ type: 'punch', x: player.x + Math.cos(player.aim) * 26, y: player.y + Math.sin(player.aim) * 26 });
  for (const ped of game.peds) {
    if (ped.down > 0) continue;
    if (distance(ped.x, ped.y, player.x, player.y) < PLAYER.punchRange + 10) {
      ped.down = 3;
      sparks(game, ped.x, ped.y, 6);
      if (player.pedCooldown <= 0) {
        addWanted(game.police, 1);
        player.pedCooldown = 4;
      }
    }
  }
  for (const cop of game.police.cops) {
    if (distance(cop.x, cop.y, player.x, player.y) < PLAYER.punchRange + 10) {
      cop.x += Math.cos(player.aim) * 40;
      cop.y += Math.sin(player.aim) * 40;
      cop.arrest = 0;
    }
  }
}

/**
 * One fixed step of the elevated railway. The train runs its loop forever: it cruises,
 * brakes into the next station it has not just served, holds there with the doors open
 * for TRAIN.dwell seconds, and pulls away again. It never collides with anything — the
 * viaduct is above the streets — so this is pure motion, and the renderer reads the
 * consist's positions straight off game.train.s.
 */
function updateTrain(game, dt) {
  const t = game.train;
  if (t.dwell > 0) {
    t.dwell -= dt;
    t.speed = 0;
    return;
  }
  // The next station ahead that this run has not just left.
  const LEN = TRAIN_LOOP_LENGTH;
  let next = null;
  for (const st of TRAIN_STATIONS) {
    if (st.index === t.lastStop) continue;
    const d = (((st.s - t.s) % LEN) + LEN) % LEN;
    if (!next || d < next.d) next = { d, st };
  }
  let target = TRAIN.speed;
  if (next && next.d < TRAIN.brakeZone) {
    // Ease in: full speed at the edge of the zone, a crawl at the platform.
    target = Math.max(9, (TRAIN.speed * next.d) / TRAIN.brakeZone);
  }
  const rate = target < t.speed ? TRAIN.brake : TRAIN.accel;
  t.speed += Math.max(-rate * dt, Math.min(rate * dt, target - t.speed));
  t.s = (t.s + t.speed * dt) % LEN;
  if (next && next.d <= 2.5 && t.speed <= 12) {
    // Arrived: settle exactly on the platform mark and open the doors.
    t.s = next.st.s;
    t.speed = 0;
    t.dwell = TRAIN.dwell;
    t.lastStop = next.st.index;
  }
  // Once the train is well clear of the station it last served, that station is a
  // normal future stop again.
  if (t.lastStop >= 0) {
    const served = TRAIN_STATIONS[t.lastStop];
    const away = (((t.s - served.s) % LEN) + LEN) % LEN;
    if (away > 260 && away < LEN - 260) t.lastStop = -1;
  }
}

/**
 * One fixed step of the airfield plane. It flies touch-and-go circuits forever: the
 * runway straight is the loop's first stretch, so the cycle is a landing roll that
 * slows to a taxi, a power-up down the same strip, a climb out over the northern
 * blocks, a cruise around the circuit, and a descent back onto the strip. Speed and
 * altitude both follow the arc length: slow on the first stretch of the runway,
 * accelerating down the rest of it, cruising in the air, easing in on final approach;
 * altitude is 0 on the ground, ramps up as the wheels leave the strip, holds at cruise,
 * and ramps back down on the approach. It never collides with anything — the sky is
 * its own layer — so this is pure motion, and the renderer reads the plane's position
 * straight off game.plane.s and game.plane.alt.
 */
function updatePlane(game, dt) {
  const p = game.plane;
  const LEN = AIR_LOOP_LENGTH;
  // The runway straight is s in [0, 560]: the first 200 are the landing roll slowing
  // to a taxi, the rest is the takeoff power-up. In the air it cruises; on final
  // approach (the last 420 of the loop) it eases in for the touchdown.
  let target = PLANE.cruise;
  if (p.s < 200) target = PLANE.roll;
  else if (p.s >= LEN - PLANE.descendAt) target = PLANE.approach;
  const rate = target < p.speed ? PLANE.brake : PLANE.accel;
  p.speed += Math.max(-rate * dt, Math.min(rate * dt, target - p.speed));
  p.s = (p.s + p.speed * dt) % LEN;
  // Altitude: 0 on the ground until the wheels leave the strip, an S-curve up to
  // cruise, 1 around the circuit, and an S-curve back down on the approach — touching
  // down exactly as the loop wraps back onto the runway.
  const climb = smoothstep(PLANE.liftAt, PLANE.climbEnd, p.s);
  const descend = 1 - smoothstep(LEN - PLANE.descendAt, LEN, p.s);
  p.alt = Math.min(climb, descend);
  // A climbing plane leaves a thin white trail off its tail, so the eye follows the
  // circuit it is flying.
  if (p.alt > 0.5 && game.rng() < dt * 8) {
    const tail = airportPointAt(p.s - 34);
    planeTrail(game, tail.x, tail.y - p.alt * PLANE.altDraw);
  }
}

/** The light props a fast car can smash through: dock crates, litter bins, barrels. */
const BREAKABLE = { crate: ['#a8854f', '#77603f'], bin: ['#2c4a34', '#3d6b47'], barrel: ['#8a5a2c', '#5d3c1c', '#b8443a'] };

/**
 * One fixed step. `input` is { move: {x,y}, sprint, handbrake, aim, shoot, punch, enter }.
 * Returns { events, busted, wasted }.
 */
export function stepGame(game, input, dt) {
  const events = [];
  const player = game.player;
  game.time += dt;
  game.clock += dt * 0.5; // one in-game minute every two real seconds
  game.shake = Math.max(0, game.shake - dt * 26); // a camera kick settles in about a quarter second
  // The weather turns on its own clock: dry spells and rain bands alternate, unless a
  // staged scene has pinned the sky with weather.lock. Some rain bands are
  // thunderstorms: heavy rain, and lightning every few seconds while they last.
  const w = game.weather;
  if (!w.lock) {
    w.nextChange -= dt;
    if (w.nextChange <= 0) {
      w.nextChange = 50 + game.rng() * 70;
      if (w.rain > 0) {
        w.rain = 0;
        w.storm = 0;
        w.flash = 0;
      } else {
        const stormy = game.rng() < 0.45; // nearly half the rain bands come with thunder
        w.storm = stormy ? 1 : 0;
        w.rain = stormy ? 1 : 0.5 + game.rng() * 0.3;
        if (stormy) w.nextBolt = 2 + game.rng() * 4;
      }
    }
  }
  // Lightning: during a storm a bolt strikes every few seconds, near the player, and
  // the thunder event carries the sound. The flash decays fast, with one flicker back
  // as the bolt branches — the renderer reads game.weather.flash every frame.
  if (w.storm > 0 && !w.lock) {
    w.nextBolt -= dt;
    if (w.nextBolt <= 0) {
      w.nextBolt = 3.5 + game.rng() * 5.5;
      w.flash = 1;
      w.flicker = true;
      w.boltX = player.x + (game.rng() - 0.5) * 900;
      w.boltY = player.y + (game.rng() - 0.5) * 500 - 120;
      w.boltSeed = game.rng() * 1000;
      events.push({ type: 'thunder' });
    }
  }
  if (w.flash > 0) {
    w.flash = Math.max(0, w.flash - dt * 2.4);
    if (w.flicker && w.flash < 0.6) {
      w.flash = 0.85; // the bolt branches: one bright flicker back before it dies
      w.flicker = false;
    }
  }
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.stealCooldown = Math.max(0, player.stealCooldown - dt);
  player.pedCooldown = Math.max(0, player.pedCooldown - dt);
  player.hornCd = Math.max(0, player.hornCd - dt);
  player.aim = input.aim;
  updateTrain(game, dt); // the elevated line keeps its own timetable, whatever Rico does
  updatePlane(game, dt); // the airfield plane keeps its own circuit, whatever Rico does

  if (input.enter) {
    const event = enterExitCar(game);
    if (event) events.push(event);
  }
  // The horn: a short blast that startles nearby pedestrians into a scatter — a generous
  // radius and a full half-second of flight, so a honk in traffic reliably clears a path.
  if (input.horn && player.inCar && player.hornCd <= 0) {
    player.hornCd = 0.5;
    events.push({ type: 'horn', x: player.x, y: player.y });
    for (const ped of game.peds) {
      if (ped.down <= 0 && distance(ped.x, ped.y, player.x, player.y) < 150) ped.flee = Math.max(ped.flee, 0.6);
    }
  }
  if (input.punch) playerPunch(game, events);
  if (input.shoot) playerShoot(game, events);

  if (player.inCar && player.car) {
    const car = player.car;
    const move = input.move;
    const carInput = {
      forward: move.y < 0,
      back: move.y > 0,
      left: move.x < 0,
      right: move.x > 0,
      handbrake: input.handbrake,
    };
    const impact = driveCar(car, carInput, dt, game.city.buildings);
    if (impact > 25) {
      // Every real hit bends the car a little. driveCar reports the full impact when
      // the car wedges against a building and 40% of it when it slides off, so a
      // handful of hard crashes — or a season of small ones — adds up to a wreck.
      car.damage = Math.min(100, (car.damage || 0) + impact * 0.045);
    }
    if (impact > 300) {
      hurtPlayer(game, 8);
      sparks(game, car.x, car.y, 10);
      game.shake = Math.min(7, impact / 70); // the camera feels a hard hit, then settles
      events.push({ type: 'crash', x: car.x, y: car.y });
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed > 60 && game.rng() < dt * 8) exhaust(game, car);
    if (input.handbrake && speed > 200 && game.rng() < dt * 30) tyreSmoke(game, car);
    // A real drift — fast, with the tail stepped out sideways — lays its own smoke down,
    // handbrake or not.
    const sideSlip = Math.abs(-car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle));
    if (speed > 260 && sideSlip > 110 && game.rng() < dt * 26) driftSmoke(game, car);
    // Running a pedestrian over.
    for (const ped of game.peds) {
      if (ped.down > 0) continue;
      if (distance(ped.x, ped.y, car.x, car.y) < 26 && Math.abs(car.vx) + Math.abs(car.vy) > 120) {
        ped.down = 4;
        sparks(game, ped.x, ped.y, 8);
        events.push({ type: 'crash', x: ped.x, y: ped.y });
        if (player.pedCooldown <= 0) {
          addWanted(game.police, 1);
          player.pedCooldown = 4;
        }
      }
    }
    // Light street props break under a fast car: crates splinter, bins crumple and
    // dock barrels split, each leaving its wreckage on the ground behind it. Heavy
    // furniture — benches, dumpsters, planters, billboards — is rooted and stays.
    const carSpeed = Math.hypot(car.vx, car.vy);
    if (carSpeed > 140) {
      for (const prop of game.city.props) {
        if (prop.broken || !BREAKABLE[prop.kind]) continue;
        const px = prop.x + prop.w / 2;
        const py = prop.y + prop.h / 2;
        if (distance(px, py, car.x, car.y) < (car.radius || 17) + 13) {
          prop.broken = true;
          debrisBurst(game, px, py, BREAKABLE[prop.kind], 9);
          for (let d = 0; d < 4; d += 1) {
            game.debris.push({
              x: px + (game.rng() - 0.5) * 26,
              y: py + (game.rng() - 0.5) * 20,
              rot: game.rng() * Math.PI,
              color: BREAKABLE[prop.kind][d % BREAKABLE[prop.kind].length],
              size: 3 + game.rng() * 4,
            });
          }
          if (game.debris.length > 140) game.debris.splice(0, game.debris.length - 140);
          car.damage = Math.min(100, (car.damage || 0) + 2); // smashing through things is not free
          events.push({ type: 'smash', x: px, y: py });
        }
      }
    }
  } else {
    const move = input.move;
    const len = Math.hypot(move.x, move.y);
    const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (len > 0) {
      const nx = move.x / len;
      const ny = move.y / len;
      player.x += nx * speed * dt;
      player.y += ny * speed * dt;
      player.angle = Math.atan2(ny, nx);
      player.walkPhase += dt * 10;
      resolveBuildings(game.city.buildings, player, PLAYER.radius);
      player.x = Math.max(20, Math.min(WORLD - 20, player.x));
      player.y = Math.max(20, Math.min(WORLD - 20, player.y));
    }
  }

  // Traffic and pedestrians keep the city alive. The traffic gets the game clock, so it
  // can read the traffic signals and stop at the red ones.
  for (const car of game.cars) {
    if (car.traffic) updateTraffic(car, dt, game.rng, game.city.buildings, game.cars, game.time);
  }
  // Gentle separation so moving traffic does not stack on one spot. Parked cars, mission
  // cars and the player's car are never shoved: a shove could push one into a building,
  // where the collision code would wedge it forever.
  const movers = game.cars.filter((c) => c.traffic || c.police);
  for (const car of movers) {
    for (const other of movers) {
      if (other === car) continue;
      const d = distance(car.x, car.y, other.x, other.y);
      if (d > 0 && d < 40) {
        const push = (40 - d) / 2;
        const a = Math.atan2(car.y - other.y, car.x - other.x);
        const nx = car.x + Math.cos(a) * push * 0.5;
        const ny = car.y + Math.sin(a) * push * 0.5;
        if (!hitsBuilding(game.city.buildings, nx, ny, 17)) {
          car.x = nx;
          car.y = ny;
        }
      }
    }
  }
  // Pedestrians scatter when the player's car bears down on them fast.
  const threat = player.inCar && player.car
    ? { x: player.x, y: player.y, danger: Math.hypot(player.car.vx, player.car.vy) > 170 }
    : { x: player.x, y: player.y, danger: false };
  for (const ped of game.peds) {
    if (ped.contact || ped.hostile) continue; // mission people are driven by missions.js
    updatePed(ped, dt, game.rng, threat);
  }

  // Bullets fly and hit people and police cars. A rival's bullet (hostile) hunts the player.
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    if (!updateBullet(b, dt, game.city.buildings)) {
      game.bullets.splice(i, 1);
      continue;
    }
    if (b.hostile) {
      if (!player.inCar && distance(b.x, b.y, player.x, player.y) < 14) {
        hurtPlayer(game, 7);
        sparks(game, player.x, player.y, 5);
        game.bullets.splice(i, 1);
      }
      continue;
    }
    let hit = false;
    for (const ped of game.peds) {
      if (ped.down > 0 || ped.contact) continue;
      if (distance(b.x, b.y, ped.x, ped.y) < 14) {
        ped.down = 4;
        sparks(game, ped.x, ped.y, 8);
        if (player.pedCooldown <= 0) {
          addWanted(game.police, 1);
          player.pedCooldown = 4;
        }
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const car of game.police.cars) {
        if (distance(b.x, b.y, car.x, car.y) < 24) {
          sparks(game, b.x, b.y, 6);
          car.damage = Math.min(100, (car.damage || 0) + 5); // shot-up cruisers smoke like any wreck
          if (player.pedCooldown <= 0) {
            addWanted(game.police, 1);
            player.pedCooldown = 4;
          }
          hit = true;
          break;
        }
      }
    }
    if (hit) game.bullets.splice(i, 1);
  }

  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    if (!updateParticle(game.particles[i], dt)) game.particles.splice(i, 1);
  }

  // A badly bent engine smokes: past half damage a car trails dark puffs from under
  // its hood, and near totalled it coughs flame-orange flickers between them. The
  // player's car, the traffic and the law all wear their history the same way.
  for (const car of [...game.cars, ...game.police.cars]) {
    const dmg = car.damage || 0;
    if (dmg < 35) continue;
    const rate = dmg >= 55 ? 7 : 2.2;
    if (game.rng() < dt * rate) {
      const nose = (car.len || 46) / 2 - 5;
      const flicker = dmg > 85 && game.rng() < 0.3;
      game.particles.push(makeParticle(
        car.x + Math.cos(car.angle) * nose + (game.rng() - 0.5) * 6,
        car.y + Math.sin(car.angle) * nose + (game.rng() - 0.5) * 6,
        (game.rng() - 0.5) * 14,
        -16 - game.rng() * 14,
        0.7 + game.rng() * 0.4,
        flicker ? '#e07b39' : '#3a3a3a',
        flicker ? 3 : 4.5 + game.rng() * 2,
      ));
    }
  }

  // Ambience: fountain spray arcs over the plazas, and dust motes drift near the player.
  if (game.city.fountains.length && game.rng() < dt * 14) {
    const f = pick(game.rng, game.city.fountains);
    const spray = makeParticle(
      f.x + (game.rng() - 0.5) * 6,
      f.y + (game.rng() - 0.5) * 6,
      (game.rng() - 0.5) * 130,
      -60 - game.rng() * 90,
      0.55,
      '#cfe8f7',
      2,
    );
    spray.grav = 340;
    game.particles.push(spray);
  }
  if (game.rng() < dt * 5) {
    game.particles.push(makeParticle(
      player.x + (game.rng() - 0.5) * 1100,
      player.y + (game.rng() - 0.5) * 700,
      12 + game.rng() * 14,
      3 + game.rng() * 6,
      3 + game.rng() * 2,
      '#d8cf9a',
      1.8,
    ));
  }
  // The beach shoreline breathes: along the sand, west of the marina, the breaking
  // waves throw up brief white flecks at the waterline — visible whenever the player
  // is near the shore, silent everywhere else.
  if (player.y > 1750 && game.rng() < dt * 9) {
    game.particles.push(makeParticle(
      60 + game.rng() * (BEACH_EAST - 120),
      BEACH_WATER_Y + 2 + game.rng() * 10,
      (game.rng() - 0.5) * 16,
      -14 - game.rng() * 22,
      0.7 + game.rng() * 0.5,
      '#eaf6fb',
      1.6,
    ));
  }
  // Rain: fast streaks slanting down around the player, gone in half a second. The
  // renderer draws kind 'rain' as a line, not a dot, and the wet streets do the rest.
  // A thunderstorm throws its rain down harder than a plain shower does.
  if (game.weather.rain > 0) {
    const drops = Math.round(game.weather.rain * (game.weather.storm > 0 ? 5 : 3));
    for (let i = 0; i < drops; i += 1) {
      const drop = makeParticle(
        player.x + (game.rng() - 0.5) * 1250,
        player.y + (game.rng() - 0.5) * 750,
        -55,
        640,
        0.55,
        '#aebfd2',
        1.4,
      );
      drop.kind = 'rain';
      game.particles.push(drop);
    }
  }

  const busted = updatePolice(game, dt, events);
  updateMissions(game, dt, events);
  updateActivities(game, dt, events);
  game.objectiveText = activityObjective(game) || currentObjective(game);

  // Health comes back slowly when nobody has hurt the player lately.
  if (game.time - player.lastHurt > PLAYER.regenDelay && player.health < PLAYER.health) {
    player.health = Math.min(PLAYER.health, player.health + PLAYER.regenRate * dt);
  }

  if (busted === 'busted') return { events, busted: true, wasted: false };
  if (player.health <= 0) return { events, busted: false, wasted: true };
  return { events, busted: false, wasted: false };
}

/** Begin a fresh run: reset the player and start the first mission. */
export function startRun(game) {
  game.player.health = PLAYER.health;
  game.player.inCar = false;
  game.player.car = null;
  game.police.wanted = 0;
  game.police.cars = [];
  game.police.cops = [];
  game.police.heli = null; // a fresh run starts with an empty sky
  if (!game.missions.active && !game.missions.finishedAll) {
    startMission(game, game.missions.index);
  }
}
