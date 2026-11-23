// The screenshot scenes behind ?shot=start|drive|chase|mission|showdown|skyline|rain|port.
// Each one plays the real rules forward from a fresh seeded game for a fixed number of
// steps, steered by a simple autopilot that drives toward waypoints, so the frame is what
// a short game really looks like and the same seed always gives the same frame. Each scene
// also sets the clock, so the light suits the moment: a dusk skyline behind the title, a
// midday downtown drive, a rainy neon night chase, the port heist at golden hour, and the
// harbour showdown at dusk.
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
 * Set `game` to the named scene (start, drive, chase, mission, showdown, skyline, rain or
 * port; any other name is start) and return the screen to draw over it.
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
    // stacks and flashing light bars in one frame.
    driveRoute(game, () => HIDEOUT, 4.5);
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
    // pedestrians into the eastern blocks so the frame feels lived in.
    for (let i = 0; i < 8; i += 1) {
      const spot = { x: 820 + game.rng() * 1060, y: 820 + game.rng() * 1060 };
      const road = nearestRoadPoint(spot.x, spot.y);
      const extra = makeCar(game.rng, { x: road.x, y: road.y, angle: 0, traffic: true });
      extra.target = randomRoadPoint(game.rng);
      game.cars.push(extra);
    }
    for (let i = 0; i < 10; i += 1) {
      const spot = { x: 820 + game.rng() * 1060, y: 820 + game.rng() * 1060 };
      const road = nearestRoadPoint(spot.x, spot.y);
      game.peds.push(makePed(game.rng, road.x + 42, road.y + 42));
    }
    // A loop around the eastern downtown blocks, full of traffic. The waypoints keep clear
    // of the race flag and the courier depot, so no side activity crashes the photograph.
    const route = [
      { x: 1050, y: 1050 },
      { x: 1950, y: 1050 },
      { x: 1950, y: 1950 },
      { x: 1050, y: 1950 },
    ];
    driveRoute(game, routeTarget(game, route), 16);
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
  // start: six seconds of city life behind the title screen, at neon night — the lit
  // windows, the signs and the lamp pools are the city's best face after dark.
  game.clock = 20 * 60 + 45;
  noActivities(game);
  for (let i = 0; i < 6 / STEP; i += 1) stepGame(game, IDLE, STEP);
  return { screen: SCREEN_TITLE };
}
