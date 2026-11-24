// The screenshot scenes behind ?shot=start|drive|chase|mission|showdown|skyline|rain|port|heli|beach|train|storm|airport.
// Each one plays the real rules forward from a fresh seeded game for a fixed number of
// steps, steered by a simple autopilot that drives toward waypoints, so the frame is what
// a short game really looks like and the same seed always gives the same frame. Each scene
// also sets the clock, so the light suits the moment: a dusk skyline behind the title, a
// midday downtown drive under the new traffic lights, a rainy neon night chase, the port
// heist at golden hour, the harbour showdown at dusk — and, for the heli scene, a five-star
// night pursuit with roadblocks on the ground and the police helicopter's searchlight
// hunting overhead. The beach scene cruises the coast road at golden hour with the new
// resort district in frame: pastel hotels and their pools behind, the sand and the sea
// ahead, umbrellas and beachgoers scattered down the shore. The train scene rides the
// north avenue at dusk under the elevated line, the three-car train ahead with its
// windows lit. The storm scene is a three-star night chase in a thunderstorm: lightning
// over downtown, the streets darker than a plain rainy night, the neon doubled in the
// wet, gusts thickening the rain and splash rings on the asphalt, and a second strike
// due behind the first. The airport scene watches the prop plane lift off the runway at golden hour,
// the hangar and the north road below it, from a car on the parallel street — with a
// fuel truck by the hangar, a staff car on the road, and the windsock leaning in a light breeze.
import { STEP } from './config.js';
import { angleDelta, distance } from './random.js';
import { startRun, stepGame } from './state.js';
import { HIDEOUT, missionMarker, startMission } from './missions.js';
import { setWanted } from './police.js';
import { MARINA, gridTarget, nearestRoadPoint, randomRoadPoint } from './world.js';
import { makeCar, makePed } from './vehicles.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = { move: { x: 0, y: 0 }, sprint: false, handbrake: false, aim: 0, shoot: false, punch: false, enter: false };

/** Put the player in the nearest car, as if they had just stolen it. */
function putPlayerInCar(game) {
  let best = null;
  let bestD = Infinity;
  for (const car of game.cars) {
    const d = distance(car.x, car.y, game.player.x, game.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  game.player.inCar = true;
  game.player.car = best;
  best.traffic = false;
}

/** Steering input that drives the player's car toward `target` through the street grid. */
function driveToward(game, target, stuck) {
  const car = game.player.car;
  const goal = gridTarget(car, target);
  const want = Math.atan2(goal.y - car.y, goal.x - car.x);
  const d = angleDelta(car.angle, want);
  const moved = distance(car.x, car.y, stuck.x, stuck.y);
  if (moved < 1.5) stuck.t += STEP;
  else stuck.t = 0;
  if (stuck.t > 0.7) {
    stuck.backup = 0.6;
    stuck.t = 0;
  }
  stuck.x = car.x;
  stuck.y = car.y;
  const backing = stuck.backup > 0;
  if (backing) stuck.backup -= STEP;
  return {
    move: { x: backing ? (d > 0.12 ? -1 : d < -0.12 ? 1 : 0) : d > 0.12 ? 1 : d < -0.12 ? -1 : 0, y: backing ? 1 : -1 },
    sprint: false,
    handbrake: false,
    aim: want,
    shoot: false,
    punch: false,
    enter: false,
  };
}

/** Drive for `seconds`, steering at whatever `nextTarget()` returns each step. */
function driveRoute(game, nextTarget, seconds) {
  const stuck = { x: game.player.x, y: game.player.y, t: 0, backup: 0 };
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepGame(game, driveToward(game, nextTarget(), stuck), STEP);
    if (game.player.health <= 0) break;
  }
}

/** A fixed route of waypoints, advancing when each one is reached. */
function routeTarget(game, route) {
  let index = 0;
  return () => {
    const target = route[index];
    if (distance(game.player.x, game.player.y, target.x, target.y) < 70) {
      index = (index + 1) % route.length;
    }
    return route[index];
  };
}

/** Keep the side activities out of a staged scene: their triggers stay quiet on cooldown. */
function noActivities(game) {
  game.missions.activity.cooldown = 9999;
}

/** Walk (or sprint) the player toward a point for up to `seconds`, stopping on arrival. */
function walkToward(game, target, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const dx = target.x - game.player.x;
    const dy = target.y - game.player.y;
    if (Math.hypot(dx, dy) < 30) break;
    const len = Math.hypot(dx, dy);
    stepGame(game, {
      move: { x: dx / len, y: dy / len },
      sprint: true,
      handbrake: false,
      aim: Math.atan2(dy, dx),
      shoot: false,
      punch: false,
      enter: false,
    }, STEP);
  }
}

/**
 * Set `game` to the named scene (start, drive, chase, mission, showdown, skyline, rain,
 * port, heli, beach, train, storm or airport; any other name is start) and return the screen to draw over it.
 */
export function stageShot(name, game) {
  if (name === 'skyline') {
    game.clock = 18 * 60 + 35; // dusk: the skyline's windows are lit and the sky is warm
    noActivities(game);
    // A slow cruise east along the northernmost street, the tower silhouettes riding
    // above the car and the title panel over it all.
    game.player.x = 500;
    game.player.y = 150;
    putPlayerInCar(game);
    const car = game.player.car;
    car.x = 500;
    car.y = 150;
    car.angle = 0;
    game.player.x = car.x;
    game.player.y = car.y;
    // Company on the avenue: two cars working the northern street in each direction, so
    // the cruise never reads as an empty road under the towers.
    for (const [tx, ty, ta] of [[950, 150, 0], [1750, 150, Math.PI]]) {
      const extra = makeCar(game.rng, { x: tx, y: ty, angle: ta, traffic: true });
      extra.target = randomRoadPoint(game.rng);
      game.cars.push(extra);
    }
    game.player.health = 400;
    const route = [
      { x: 1300, y: 150 },
      { x: 2100, y: 150 },
      { x: 2100, y: 450 },
      { x: 1300, y: 450 },
    ];
    driveRoute(game, routeTarget(game, route), 5);
    game.dialogue = null;
    return { screen: SCREEN_TITLE };
  }
  if (name === 'heli') {
    game.clock = 21 * 60 + 30; // night: light bars, neon and the searchlight own the frame
    game.weather.rain = 0.7;
    game.weather.lock = true; // wet streets for the whole photograph
    startRun(game);
    noActivities(game);
    game.player.x = 1050;
    game.player.y = 1050;
    putPlayerInCar(game);
    game.player.health = 500; // a staged scene: the pursuit lasts the photograph
    setWanted(game.police, 5); // five stars: roadblocks ahead, the helicopter overhead
    const route = [
      { x: 1950, y: 1050 },
      { x: 1950, y: 1650 },
      { x: 1050, y: 1650 },
      { x: 1050, y: 1050 },
    ];
    driveRoute(game, routeTarget(game, route), 8);
    // Scene dressing, as in the rain scene: string the pursuit out behind the player so
    // the frame reads as a chase, not a convoy stacked on one point. Roadblock cars keep
    // their posts — they are half the point of the picture.
    const car = game.player.car;
    for (const [i, cop] of [...game.police.cars].filter((c) => !c.roadblock).slice(0, 3).entries()) {
      cop.x = car.x - Math.cos(car.angle) * (90 + i * 74);
      cop.y = car.y - Math.sin(car.angle) * (90 + i * 74);
      const road = nearestRoadPoint(cop.x, cop.y);
      cop.x = road.x;
      cop.y = road.y;
      cop.angle = car.angle;
      cop.siren = 1;
    }
    game.dialogue = null;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'storm') {
    game.clock = 22 * 60; // full night: the storm owns the frame, not the hour
    game.weather.rain = 1;
    game.weather.storm = 1;
    game.weather.lock = true; // the thunderstorm stays for the whole photograph
    startRun(game);
    noActivities(game);
    game.player.x = 1050;
    game.player.y = 1050;
    putPlayerInCar(game);
    game.player.health = 400; // a staged scene: the pursuit lasts the photograph
    setWanted(game.police, 3); // three stars of company through the wet downtown blocks
    const route = [
      { x: 1950, y: 1050 },
      { x: 1950, y: 1650 },
      { x: 1050, y: 1650 },
      { x: 1050, y: 1050 },
    ];
    driveRoute(game, routeTarget(game, route), 5);
    // The bolt strikes over the player, mid-flash, so the photograph catches the fork
    // and the white wash together; the weather would let it decay before the paint.
    // The gust is up and a second strike is due, so the frame can catch the echo bolt
    // and the splash rings on the wet asphalt as well.
    game.weather.flash = 0.9;
    game.weather.flicker = true;
    game.weather.gust = 0.7;
    game.weather.doubleStrike = true;
    game.weather.boltX = game.player.x + 160;
    game.weather.boltY = game.player.y - 180;
    game.weather.boltSeed = 42;
    // Scene dressing, as in the rain scene: string the pursuit out behind the player
    // so the frame reads as a chase, not a convoy stacked on one point.
    const car = game.player.car;
    for (const [i, cop] of [...game.police.cars].slice(0, 3).entries()) {
      cop.x = car.x - Math.cos(car.angle) * (85 + i * 72);
      cop.y = car.y - Math.sin(car.angle) * (85 + i * 72);
      const road = nearestRoadPoint(cop.x, cop.y);
      cop.x = road.x;
      cop.y = road.y;
      cop.angle = car.angle;
      cop.siren = 1;
    }
    game.dialogue = null;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'airport') {
    game.clock = 17 * 60 + 45; // golden hour: warm light over the runway, lamps not yet lit
    startRun(game);
    noActivities(game);
    // Rico waits in a car on the north road, one block south of the runway, facing the
    // airfield — the hangar to the west, the runway and the climbing plane to the east.
    game.player.x = 1900;
    game.player.y = 150;
    putPlayerInCar(game);
    const car = game.player.car;
    car.x = 1900;
    car.y = 150;
    car.angle = 0;
    car.speed = 0;
    game.player.x = car.x;
    game.player.y = car.y;
    game.player.health = 400; // a staged scene: the wait lasts the photograph
    // Airfield dressing for the frame: a fuel truck by the hangar and a staff car on
    // the north road, and a light breeze so the windsock leans instead of hanging.
    game.weather.gust = 0.25;
    for (const [vx, vy, va] of [[1700, 130, Math.PI / 2], [2050, 166, Math.PI]]) {
      const extra = makeCar(game.rng, { x: vx, y: vy, angle: va, kind: 'mission', shape: 'van', color: '#c9a13b' });
      game.cars.push(extra);
    }
    // The plane mid-takeoff: past the climb point, most of the way up, a third of the
    // way down the runway's eastbound leg — the frame catches it with the hangar and
    // the runway lights still in view.
    game.plane = { s: 520, speed: 200, alt: 0.87, onGround: false };
    game.dialogue = null;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'rain') {
    game.clock = 22 * 60; // full night: neon, lamp pools and wet streets
    game.weather.rain = 1;
    game.weather.lock = true; // the storm stays for the whole photograph
    startRun(game);
    noActivities(game);
    game.player.x = 1050;
    game.player.y = 1050;
    putPlayerInCar(game);
    game.player.health = 400; // a staged scene: the pursuit lasts the photograph
    setWanted(game.police, 3); // three stars of company through the wet downtown blocks
    const route = [
      { x: 1950, y: 1050 },
      { x: 1950, y: 1650 },
      { x: 1050, y: 1650 },
      { x: 1050, y: 1050 },
    ];
    driveRoute(game, routeTarget(game, route), 7);
    // Scene dressing, as in the chase scene: string the pursuit out behind the player
    // so the frame reads as a chase, not a convoy stacked on one point.
    const car = game.player.car;
    for (const [i, cop] of [...game.police.cars].slice(0, 3).entries()) {
      cop.x = car.x - Math.cos(car.angle) * (85 + i * 72);
      cop.y = car.y - Math.sin(car.angle) * (85 + i * 72);
      const road = nearestRoadPoint(cop.x, cop.y);
      cop.x = road.x;
      cop.y = road.y;
      cop.angle = car.angle;
      cop.siren = 1;
    }
    game.dialogue = null;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'port') {
    game.clock = 17 * 60 + 30; // golden hour over the container yards
    game.missions.index = 9;
    startMission(game, 9); // Harbour Haul: the truck waits between the stacks
    noActivities(game);
    const truck = game.missions.missionCar;
    game.player.x = truck.x;
    game.player.y = truck.y;
    putPlayerInCar(game);
    game.player.health = 400; // a staged scene: the getaway lasts the photograph
    // Roll west out of the yards with the harbour patrol converging: cranes, container
    // stacks and flashing light bars in one frame. A shorter roll than it used to be —
    // the frame stays deep in the yards, where the port reads best.
    driveRoute(game, () => HIDEOUT, 3.6);
    // Scene dressing: put two harbour-patrol cars on the road behind the truck, lights
    // flashing — the pursuit the frame is about.
    const truckNow = game.missions.missionCar;
    for (let i = 0; i < 2; i += 1) {
      const cop = makeCar(game.rng, { x: truckNow.x + 130 + i * 78, y: truckNow.y, angle: Math.PI, kind: 'police', color: '#1c2733', police: true });
      const road = nearestRoadPoint(cop.x, cop.y);
      cop.x = road.x;
      cop.y = road.y;
      cop.angle = Math.PI;
      cop.siren = 1;
      game.police.cars.push(cop);
    }
    game.dialogue = null;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'drive') {
    game.clock = 11 * 60; // late morning, the city at its brightest and busiest
    startRun(game);
    noActivities(game);
    // Start the drive downtown, where the traffic is: the random spawn can be out by the
    // marina, and sixteen seconds is not enough to reach the busy blocks from there.
    game.player.x = 1000;
    game.player.y = 1000;
    putPlayerInCar(game);
    game.player.health = 400; // a staged scene: traffic bumps should not end the drive
    // Scene dressing: downtown is the busiest part of Solmar — seed extra traffic and
    // pedestrians into the central blocks so the frame feels lived in. Rush hour is
    // denser than it used to be: more cars working the loop, more people on the
    // sidewalks, and the new signals bunching both into queues at the lights.
    for (let i = 0; i < 18; i += 1) {
      const spot = { x: 820 + game.rng() * 1060, y: 820 + game.rng() * 1060 };
      const road = nearestRoadPoint(spot.x, spot.y);
      const extra = makeCar(game.rng, { x: road.x, y: road.y, angle: 0, traffic: true });
      // Their first errand stays downtown too: a citywide target would walk half the
      // dressing out of the frame before the photograph is taken.
      const errand = { x: 820 + game.rng() * 1060, y: 820 + game.rng() * 1060 };
      const errandRoad = nearestRoadPoint(errand.x, errand.y);
      extra.target = { x: errandRoad.x, y: errandRoad.y };
      game.cars.push(extra);
    }
    for (let i = 0; i < 18; i += 1) {
      const spot = { x: 820 + game.rng() * 1060, y: 820 + game.rng() * 1060 };
      const road = nearestRoadPoint(spot.x, spot.y);
      game.peds.push(makePed(game.rng, road.x + 42, road.y + 42));
    }
    // A tight loop around the central downtown blocks, inside the dressed box, so the
    // frame ends among the signs and the queues at the lights instead of drifting south
    // to the shore. The waypoints keep clear of the race flag and the courier depot, so
    // no side activity crashes the photograph.
    const route = [
      { x: 1050, y: 1050 },
      { x: 1650, y: 1050 },
      { x: 1650, y: 1650 },
      { x: 1050, y: 1650 },
    ];
    driveRoute(game, routeTarget(game, route), 9);
    // Scene dressing: the autopilot's loop ploughs through the crowds and the law takes
    // an interest — clear the accidental heat so the frame is the busy midday street the
    // scene is about, not a chase.
    game.police.wanted = 0;
    game.police.cars = [];
    game.police.cops = [];
    game.police.heli = null;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    game.clock = 17 * 60 + 40; // golden hour: long light, headlights already glowing
    startRun(game);
    noActivities(game);
    putPlayerInCar(game);
    game.player.health = 400; // a staged scene: the chase lasts the whole photograph
    // A straight eastbound run down the middle road: no corners for the autopilot to
    // wedge on, and the pursuit forms up behind and ahead of the player on its own.
    const car = game.player.car;
    car.x = 900;
    car.y = 1050;
    car.angle = 0;
    car.speed = 0;
    game.player.x = car.x;
    game.player.y = car.y;
    setWanted(game.police, 4); // four stars: the roadblock joins the pursuit
    const steps = Math.floor(2.7 / STEP);
    for (let i = 0; i < steps; i += 1) {
      stepGame(game, { ...IDLE, move: { x: 0, y: -1 } }, STEP);
    }
    // Scene dressing: the pursuit AI convoys its cars onto the same point, which reads
    // as one doubled car in a still frame — string the pack out along the road instead,
    // and drop the mission-one intro dialogue so the frame is pure action.
    const pack = [...game.police.cars].sort((a, b) => a.x - b.x);
    for (let i = 1; i < pack.length; i += 1) {
      if (Math.abs(pack[i].x - pack[i - 1].x) < 60 && Math.abs(pack[i].y - pack[i - 1].y) < 30) {
        pack[i].x = pack[i - 1].x - 62;
        pack[i].y = 1050 + (i % 2 === 0 ? -11 : 11);
        pack[i].angle = 0;
      }
    }
    game.dialogue = null;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    game.clock = 10 * 60;
    game.missions.index = 2;
    startMission(game, 2);
    noActivities(game);
    putPlayerInCar(game);
    // Drive at the mission marker: nine seconds in, the package is still ahead of the player,
    // the two stars are still lit and the police are closing in.
    driveRoute(game, () => missionMarker(game) || randomRoadPoint(game.rng), 9);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'showdown') {
    game.clock = 18 * 60 + 15; // dusk: the marina lamps and headlights are coming on
    game.missions.index = 6;
    startMission(game, 6);
    // Rico walks into the meet at the marina; the trap springs and the rivals open fire.
    // He then falls back west along the shore road to trade shots at range — far enough
    // from the cash case that the photograph cannot accidentally finish the mission.
    game.player.x = MARINA.x - 190;
    game.player.y = MARINA.y;
    game.player.health = 500; // a staged scene: he stands his ground for the photograph
    walkToward(game, MARINA, 4);
    walkToward(game, { x: MARINA.x - 150, y: MARINA.y }, 3);
    // Two and a half seconds of the firefight: Rico aims at a standing rival and shoots.
    const steps = Math.floor(2.5 / STEP);
    for (let i = 0; i < steps; i += 1) {
      const standing = game.missions.hostiles.filter((h) => h.down <= 0);
      const foe = standing[0];
      const aim = foe ? Math.atan2(foe.y - game.player.y, foe.x - game.player.x) : 0;
      stepGame(game, {
        move: { x: 0, y: 0 },
        sprint: false,
        handbrake: false,
        aim,
        shoot: i % 18 === 0,
        punch: false,
        enter: false,
      }, STEP);
      if (game.player.health <= 0) break;
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'train') {
    game.clock = 18 * 60 + 12; // dusk: the lamps are lit, the sky still warm, the train's windows glowing
    startRun(game);
    noActivities(game);
    // Stage the railway: the head car west of Estacion Norte at full cruise. In the
    // seconds the photograph takes it brakes into the station and stops at the
    // platform — a train arriving, doors about to open, over the avenue traffic.
    game.train.s = 430;
    game.train.speed = 128;
    // Rico rides the parallel avenue one block south, eastbound, in a car that has
    // already had a hard day: bent past halfway, its engine smoking over the bonnet.
    // The railway runs on the road's own centreline, so a car on that street would
    // pass hidden under the beam — from the next street over, the photograph gets
    // both layers of the city at once: the train arriving above, Rico racing below.
    game.player.x = 500;
    game.player.y = 750;
    putPlayerInCar(game);
    const car = game.player.car;
    car.x = 500;
    car.y = 750;
    car.angle = 0;
    car.speed = 0;
    car.damage = 68;
    game.player.x = car.x;
    game.player.y = car.y;
    game.player.health = 400; // a staged scene: the avenue run lasts the photograph
    const route = [
      { x: 1700, y: 750 },
      { x: 900, y: 750 },
    ];
    driveRoute(game, routeTarget(game, route), 1.9);
    game.dialogue = null;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'beach') {
    game.clock = 17 * 60 + 45; // golden hour: warm light over the sand, lamps not yet lit
    startRun(game);
    noActivities(game);
    // Beachgoers on the sand: a scatter of strollers among the umbrellas, so the shore
    // reads as a resort at the end of the day, not an empty beach.
    for (let i = 0; i < 14; i += 1) {
      const bx = 180 + game.rng() * 1180;
      const by = 2292 + game.rng() * 34;
      game.peds.push(makePed(game.rng, bx, by));
    }
    // A cruise east along the coast road, the resort blocks on the left and the whole
    // beach on the right. The photograph is taken mid-leg, still on the coast road:
    // at full speed the arcade steering needs a whole block to turn, and a turning
    // frame reads as a car in the sea, not a resort panorama.
    game.player.x = 330;
    game.player.y = 2250;
    putPlayerInCar(game);
    const car = game.player.car;
    car.x = 330;
    car.y = 2250;
    car.angle = 0;
    car.speed = 0;
    game.player.x = car.x;
    game.player.y = car.y;
    game.player.health = 400; // a staged scene: promenade bumps must not end the cruise
    const route = [
      { x: 1500, y: 2250 },
      { x: 1650, y: 1950 },
      { x: 450, y: 1950 },
      { x: 330, y: 2250 },
    ];
    driveRoute(game, routeTarget(game, route), 2.3);
    // The autopilot's cruise brushes the crowds and the law takes an interest — clear
    // the accidental heat so the frame stays the golden-hour shore it is about.
    game.police.wanted = 0;
    game.police.cars = [];
    game.police.cops = [];
    game.police.heli = null;
    game.dialogue = null;
    return { screen: SCREEN_PLAY };
  }
  // start: six seconds of city life behind the title screen, at neon night — the lit
  // windows, the signs and the lamp pools are the city's best face after dark.
  game.clock = 20 * 60 + 45;
  noActivities(game);
  for (let i = 0; i < 6 / STEP; i += 1) stepGame(game, IDLE, STEP);
  return { screen: SCREEN_TITLE };
}
