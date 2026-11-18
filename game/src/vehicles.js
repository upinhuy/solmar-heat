// Cars and people: the player driving, traffic following the streets, pedestrians on the
// sidewalks, bullets and particles. Physics is simple arcade: accelerate, steer by speed,
// grip damps sideways slide, buildings stop you with a thud.
import { CAR, PED_SPEED, PLAYER, TRAFFIC_SPEED, WORLD } from './config.js';
import { angleDelta, clamp, distance, pick, range } from './random.js';
import { hitsBuilding, isOnRoad, nearestRoadPoint, parkingSpot, randomRoadPoint, resolveBuildings, ROADS } from './world.js';

const CAR_COLORS = ['#b8443a', '#3a6db8', '#c9a13b', '#4d8a4d', '#7a4d8a', '#c9c9c9', '#3a3a3a', '#d06a2c', '#2c8a8a'];
const SPORT_COLORS = ['#e8b23a', '#d0342c', '#2f6fd0'];
const PED_SHIRTS = ['#d8d8d8', '#7a9cc9', '#c97a7a', '#8ac97a', '#c9b27a', '#9a7ac9'];

let nextCarId = 1;

export function makeCar(random, opts) {
  const spot = opts.spot || parkingSpot(random);
  return {
    id: nextCarId,
    kind: opts.kind || 'civilian', // civilian | traffic | police | mission | sport
    x: opts.x ?? spot.x,
    y: opts.y ?? spot.y,
    angle: opts.angle ?? spot.angle,
    speed: 0,
    color: opts.color || pick(random, CAR_COLORS),
    traffic: opts.traffic || false,
    police: opts.police || false,
    missionCar: opts.missionCar || false,
    driver: opts.driver || null, // the ped driving a traffic car, if any
    target: null, // traffic: next intersection
    speedTarget: opts.speedTarget || TRAFFIC_SPEED,
    vx: 0,
    vy: 0,
    wrecked: false,
    siren: 0,
  };
}

export function makeSportCar(random, x, y) {
  return makeCar(random, { x, y, angle: 0, kind: 'sport', color: pick(random, SPORT_COLORS), speedTarget: TRAFFIC_SPEED });
}

/** Drive a car with arcade physics. input: {forward, back, left, right, handbrake}. */
export function driveCar(car, input, dt, buildings) {
  const forward = Math.cos(car.angle);
  const right = Math.sin(car.angle);
  let along = car.vx * forward + car.vy * right;
  let side = -car.vx * right + car.vy * forward;
  if (input.forward) along += CAR.accel * dt;
  if (input.back) along -= (along > 0 ? CAR.brake : CAR.reverseAccel) * dt;
  if (input.handbrake) along *= Math.max(0, 1 - 3.2 * dt);
  along -= along * CAR.drag * dt;
  along = clamp(along, -CAR.maxReverse, CAR.maxSpeed);
  side *= Math.max(0, 1 - CAR.grip * dt);
  if (Math.abs(along) > 12) {
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    car.angle += steer * CAR.steer * (along > 0 ? 1 : -1) * Math.min(1, Math.abs(along) / 160) * dt;
  }
  const f = Math.cos(car.angle);
  const r = Math.sin(car.angle);
  car.vx = f * along - r * side;
  car.vy = r * along + f * side;
  const oldX = car.x;
  const oldY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.x = clamp(car.x, 30, WORLD - 30);
  car.y = clamp(car.y, 30, WORLD - 30);
  const impact = Math.abs(along);
  if (hitsBuilding(buildings, car.x, car.y, CAR.radius)) {
    // Slide along the wall: try the x-only move, then the y-only move, before stopping.
    car.x = oldX + car.vx * dt;
    car.y = oldY;
    if (hitsBuilding(buildings, car.x, car.y, CAR.radius)) {
      car.x = oldX;
      car.y = oldY + car.vy * dt;
      if (hitsBuilding(buildings, car.x, car.y, CAR.radius)) {
        car.x = oldX;
        car.y = oldY;
        car.vx *= -0.25;
        car.vy *= -0.25;
        return impact;
      }
      car.vx = 0;
      return impact * 0.4;
    }
    car.vy = 0;
    return impact * 0.4;
  }
  return 0;
}

/** Traffic cars follow the street grid: pick the next intersection, drive to it, turn. */
export function updateTraffic(car, dt, random, buildings) {
  if (!car.target) {
    const p = randomRoadPoint(random);
    car.target = p;
  }
  const dx = car.target.x - car.x;
  const dy = car.target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 14) {
    // At an intersection: pick a new one on a street, usually straight on.
    const onVertical = Math.abs(car.x - nearestRoadPoint(car.x, car.y).x) < 4;
    const options = [];
    for (const r of ROADS) {
      if (onVertical) options.push({ x: r, y: car.y });
      else options.push({ x: car.x, y: r });
    }
    car.target = pick(random, options);
    return;
  }
  const want = Math.atan2(dy, dx);
  car.angle += clamp(angleDelta(car.angle, want), -2.4 * dt, 2.4 * dt);
  const speed = Math.min(car.speedTarget, dist * 2);
  car.x += Math.cos(car.angle) * speed * dt;
  car.y += Math.sin(car.angle) * speed * dt;
  if (hitsBuilding(buildings, car.x, car.y, CAR.radius)) {
    car.target = randomRoadPoint(random);
  }
}

export function makePed(random, x, y) {
  const p = randomRoadPoint(random);
  return {
    x: x ?? p.x,
    y: y ?? p.y,
    angle: random() * Math.PI * 2,
    speed: PED_SPEED * (0.8 + random() * 0.5),
    shirt: pick(random, PED_SHIRTS),
    target: null,
    down: 0, // >0 while knocked down
    fade: 0,
    walkPhase: random() * Math.PI * 2,
  };
}

/** Pedestrians stroll along the sidewalks and cross streets at intersections. */
export function updatePed(ped, dt, random) {
  if (ped.down > 0) {
    // Knocked down: lie still until the timer runs out, then get up and walk off.
    ped.down -= dt;
    return;
  }
  if (!ped.target || distance(ped.x, ped.y, ped.target.x, ped.target.y) < 10) {
    const p = randomRoadPoint(random);
    // Offset onto the sidewalk beside the street.
    ped.target = { x: p.x + 42, y: p.y + 42 };
  }
  const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  ped.angle += clamp(angleDelta(ped.angle, want), -3 * dt, 3 * dt);
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  ped.x = clamp(ped.x, 40, WORLD - 40);
  ped.y = clamp(ped.y, 40, WORLD - 40);
  ped.walkPhase += dt * 9;
}

export function makeBullet(x, y, angle) {
  return { x, y, vx: Math.cos(angle) * PLAYER.bulletSpeed, vy: Math.sin(angle) * PLAYER.bulletSpeed, life: 1.1 };
}

export function updateBullet(bullet, dt, buildings) {
  bullet.x += bullet.vx * dt;
  bullet.y += bullet.vy * dt;
  bullet.life -= dt;
  if (bullet.life <= 0) return false;
  if (bullet.x < 0 || bullet.y < 0 || bullet.x > WORLD || bullet.y > WORLD) return false;
  if (hitsBuilding(buildings, bullet.x, bullet.y, 2)) return false;
  return true;
}

export function makeParticle(x, y, vx, vy, life, color, size) {
  return { x, y, vx, vy, life, maxLife: life, color, size };
}

export function updateParticle(p, dt) {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= 1 - 2 * dt;
  p.vy *= 1 - 2 * dt;
  p.life -= dt;
  return p.life > 0;
}

/** A short dust puff behind a driving car, and sparks on a hard hit. */
export function exhaust(game, car) {
  const back = { x: car.x - Math.cos(car.angle) * 24, y: car.y - Math.sin(car.angle) * 24 };
  game.particles.push(makeParticle(back.x, back.y, -Math.cos(car.angle) * 30 + range(game.rng, -15, 15), -Math.sin(car.angle) * 30 + range(game.rng, -15, 15), 0.5, '#9a9a9a', 3));
}

export function sparks(game, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    const a = game.rng() * Math.PI * 2;
    const s = 60 + game.rng() * 160;
    game.particles.push(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + game.rng() * 0.3, '#f2c230', 2.5));
  }
}

export function cashBurst(game, x, y) {
  for (let i = 0; i < 14; i += 1) {
    const a = game.rng() * Math.PI * 2;
    const s = 40 + game.rng() * 120;
    game.particles.push(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.7, '#7fd069', 3));
  }
}
