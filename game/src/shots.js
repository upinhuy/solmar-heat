// The screenshot scenes behind ?shot=start|drive|chase|mission|showdown. Each one plays the
// real rules forward from a fresh seeded game for a fixed number of steps, steered by a
// simple autopilot that drives toward waypoints, so the frame is what a short game really
// looks like and the same seed always gives the same frame. Each scene also sets the clock,
// so the light suits the moment: morning over the title, midday downtown, a late-afternoon
// chase, and the harbour showdown at dusk with the lamps coming on.
import { STEP } from './config.js';
import { angleDelta, distance } from './random.js';
import { startRun, stepGame } from './state.js';
import { missionMarker, startMission } from './missions.js';
import { setWanted } from './police.js';
import { MARINA, gridTarget, randomRoadPoint } from './world.js';
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
 * Set `game` to the named scene (start, drive, chase, mission or showdown; any other name
 * is start) and return the screen to draw over it.
 */
export function stageShot(name, game) {
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
    game.clock = 16 * 60 + 20; // golden late afternoon
    startRun(game);
    noActivities(game);
    putPlayerInCar(game);
    game.player.health = 400; // a staged scene: the chase lasts the whole photograph
    setWanted(game.police, 3);
    // A wide loop around the middle of town, so the police can close in.
    const route = [
      { x: 450, y: 1050 },
      { x: 1950, y: 1050 },
      { x: 1950, y: 1950 },
      { x: 450, y: 1950 },
    ];
    driveRoute(game, routeTarget(game, route), 18);
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
  // start: five seconds of city life behind the title screen, mid-morning.
  game.clock = 10 * 60;
  noActivities(game);
  for (let i = 0; i < 5 / STEP; i += 1) stepGame(game, IDLE, STEP);
  return { screen: SCREEN_TITLE };
}
