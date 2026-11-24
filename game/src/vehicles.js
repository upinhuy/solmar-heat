// Cars and people: the player driving, traffic following the streets (and yielding instead
// of piling up — and easing off along the coast road, where the promenade crowds cross to
// the beach), pedestrians on the sidewalks who scatter when a car comes at them fast,
// bullets and particles. Cars come in several body shapes — sedan, hatchback, estate wagon,
// pickup, van, the low sport shape, a long limousine and a narrow motorcycle with a rider — each with
// its own size, and the odd yellow taxi among the sedans. Brake lights flare when a car
// slows hard, and police light bars each flash on their own phase. Cars also carry their
// history with them: every hard impact adds to a car's damage, and a badly damaged car
// trails engine smoke and wears its dents where the renderer can draw them. Physics is simple
// arcade: accelerate, steer by speed, grip damps sideways slide, buildings stop you with
// a thud. The airfield's prop plane leaves a different trail: thin white puffs off its
// wingtips while it climbs, gone a second later.
import { CAR, MARKET, PED_SPEED, PLAYER, REPAIR, ROAD_WIDTH, SPIKE, TRAFFIC_SPEED, WORLD } from './config.js';
import { angleDelta, clamp, distance, intRange, pick, pickWeighted, range } from './random.js';
import { gridTarget, hitsBuilding, MARKET_BOUNDS, MARKET_STAGE, nearestRoadLine, nearestRoadPoint, parkingSpot, randomRoadPoint, signalPhase, ROADS } from './world.js';

const CAR_COLORS = [
  '#b8443a', '#3a6db8', '#c9a13b', '#4d8a4d', '#7a4d8a', '#c9c9c9', '#3a3a3a', '#d06a2c',
  '#2c8a8a', '#8a2f4d', '#31572c', '#b8b8d0', '#5b2333', '#0f6f6a', '#e07b39', '#9db2ce',
  '#704214', '#486581',
];
const SPORT_COLORS = ['#e8b23a', '#d0342c', '#2f6fd0', '#e8e8e8'];
const PED_SHIRTS = ['#d8d8d8', '#7a9cc9', '#c97a7a', '#8ac97a', '#c9b27a', '#9a7ac9', '#e07b39', '#39c2d7', '#a03a5e', '#f2e3c9', '#5b7a99'];
const PED_HAIR = ['#241a12', '#4a3220', '#8a6420', '#c9c9c9', '#6e2f22', '#101010'];
const PED_SKIN = ['#e8c39a', '#c98e5f', '#8a5a34', '#f2d3ac', '#6e4525'];

// Body shapes: length, width and collision radius per silhouette.
export const CAR_SHAPES = {
  sedan: { len: 46, wid: 24, radius: 17 },
  hatch: { len: 40, wid: 23, radius: 16 },
  estate: { len: 48, wid: 24, radius: 17 }, // the long-roofed wagon, new to the fleet
  pickup: { len: 48, wid: 24, radius: 17 },
  van: { len: 56, wid: 26, radius: 19 },
  sport: { len: 44, wid: 23, radius: 16 },
  limo: { len: 68, wid: 25, radius: 21 },
  moto: { len: 30, wid: 11, radius: 10 },
};
const CIVILIAN_SHAPES = ['sedan', 'sedan', 'hatch', 'hatch', 'estate', 'pickup', 'van'];

let nextCarId = 1;

export function makeCar(random, opts) {
  const spot = opts.spot || parkingSpot(random);
  const kind = opts.kind || 'civilian'; // civilian | traffic | police | mission | sport
  let shape = opts.shape || null;
  if (!shape) {
    if (kind === 'sport') shape = 'sport';
    else if (kind === 'police' || kind === 'mission') shape = 'sedan';
    else {
      // One weighted roll instead of two coin flips: the odd motorcycle weaving
      // through traffic, rarer still a limousine, and the everyday shapes sharing
      // the rest — the estate wagon joined the fleet this version.
      shape = pickWeighted(random, [['moto', 8], ['limo', 6], ['civilian', 86]]);
      if (shape === 'civilian') shape = pick(random, CIVILIAN_SHAPES);
    }
  }
  const body = CAR_SHAPES[shape];
  // A share of the civilian sedans are taxis: yellow, with a roof sign the renderer adds.
  const taxi = opts.taxi ?? (kind === 'civilian' && shape === 'sedan' && random() < 0.16);
  return {
    id: nextCarId++,
    kind,
    shape,
    len: body.len,
    wid: body.wid,
    radius: body.radius,
    x: opts.x ?? spot.x,
    y: opts.y ?? spot.y,
    angle: opts.angle ?? spot.angle,
    speed: 0,
    color: opts.color || (taxi ? '#f2c230' : pick(random, CAR_COLORS)),
    taxi,
    brake: false, // set while the car is braking or crawling: the tail lights flare
    flashPhase: random() * 2, // police light bars flash out of sync with each other
    traffic: opts.traffic || false,
    police: opts.police || false,
    missionCar: opts.missionCar || false,
    driver: opts.driver || null, // the ped driving a traffic car, if any
    riderShirt: pick(random, PED_SHIRTS), // a motorcycle's rider, drawn over the bike
    riderHelmet: pick(random, ['#d8d8d8', '#b8443a', '#2f6fd0', '#14161a']),
    target: null, // traffic: next intersection
    speedTarget: opts.speedTarget || (shape === 'moto' ? TRAFFIC_SPEED + 45 : TRAFFIC_SPEED),
    vx: 0,
    vy: 0,
    wrecked: false,
    damage: 0, // 0..100 of accumulated hurt: dents, cracked glass, engine smoke past halfway
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
  car.brake = !!input.back || !!input.handbrake;
  along -= along * CAR.drag * dt;
  // Shredded tyres (a spike strip hit): the car tops out at barely half speed and
  // loses half its grip, so it slides wide on every corner until the tyres are swapped.
  const spiked = car.spikeTimer > 0;
  along = clamp(along, -CAR.maxReverse, spiked ? CAR.maxSpeed * SPIKE.speedMult : CAR.maxSpeed);
  side *= Math.max(0, 1 - CAR.grip * (spiked ? SPIKE.gripMult : 1) * dt);
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
  const radius = car.radius || CAR.radius;
  if (hitsBuilding(buildings, car.x, car.y, radius)) {
    // Slide along the wall: try the x-only move, then the y-only move, before stopping.
    car.x = oldX + car.vx * dt;
    car.y = oldY;
    if (hitsBuilding(buildings, car.x, car.y, radius)) {
      car.x = oldX;
      car.y = oldY + car.vy * dt;
      if (hitsBuilding(buildings, car.x, car.y, radius)) {
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

/**
 * Traffic cars follow the street grid: they steer at the grid-routed goal for their
 * destination (the destination itself on a shared street, otherwise the intersection that
 * leads to it), and on arrival pick the next intersection along their street. `others` is
 * every car in the world: a driver slows down when another car is close ahead, so the
 * streets queue instead of stacking into one another. They also obey the traffic
 * signals: approaching an intersection, a car eases up to the stop line on red — and on
 * amber, when it can still stop in time — and waits there with its brake lights lit
 * until its direction gets the green. `time` is the game clock the signals phase off.
 * A car wedged against a building gives up on its destination after a second and picks
 * a fresh one.
 */
export function updateTraffic(car, dt, random, buildings, others, time) {
  if (!car.target) {
    car.target = randomRoadPoint(random);
  }
  if (distance(car.x, car.y, car.target.x, car.target.y) < 14) {
    // Arrived. A car whose target is held by its owner (a mission van) simply waits there;
    // any other car picks a new destination on a street, usually straight on.
    if (!car.holdTarget) {
      const onVertical = Math.abs(car.x - nearestRoadPoint(car.x, car.y).x) < 4;
      const options = [];
      for (const r of ROADS) {
        if (onVertical) options.push({ x: r, y: car.y });
        else options.push({ x: car.x, y: r });
      }
      car.target = pick(random, options);
    }
    return;
  }
  const goal = gridTarget(car, car.target);
  const dx = goal.x - car.x;
  const dy = goal.y - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  const turn = angleDelta(car.angle, want);
  car.angle += clamp(turn, -2.4 * dt, 2.4 * dt);
  // Slow down when the goal is off the nose: a slower car turns tighter and stays on the
  // street instead of swinging wide across the block corners.
  let speed = Math.min(car.speedTarget, dist * 2) * clamp(1.15 - Math.abs(turn) * 0.55, 0.3, 1);
  // The coast road runs along the beach: drivers ease off there, where the promenade
  // crowds drift across to the sand — the shore traffic ambles instead of hurrying.
  if (Math.abs(car.y - 2250) < 34) speed *= 0.78;
  // Yield: something close ahead in my lane means I crawl until it clears.
  if (others) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    for (const other of others) {
      if (other === car) continue;
      const ox = other.x - car.x;
      const oy = other.y - car.y;
      const ahead = ox * fx + oy * fy;
      const side = Math.abs(-ox * fy + oy * fx);
      if (ahead > 0 && ahead < 54 && side < 20) {
        speed *= 0.3;
        break;
      }
    }
  }
  // The traffic signals: only the next intersection ahead matters, and only while the
  // car is still on the street that leads to it. Inside the box already, a car carries
  // on through whatever the light says; held at the line for more than five seconds, it
  // creeps through anyway — a jam at the lights must never wedge the city shut.
  if (time !== undefined) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const vertical = Math.abs(fy) > Math.abs(fx);
    const dirSign = vertical ? Math.sign(fy) : Math.sign(fx);
    if (car.lightPass !== undefined) {
      const behind = (vertical ? car.lightPass - car.y : car.lightPass - car.x) * dirSign;
      if (behind < -12) {
        car.lightPass = undefined;
        car.lightWait = 0;
      }
    }
    const cross = vertical ? nearestRoadLine(car.x) : nearestRoadLine(car.y);
    const onStreet = Math.abs((vertical ? car.x : car.y) - cross) < 36;
    if (onStreet && dirSign !== 0) {
      for (const line of ROADS) {
        const aheadDist = (vertical ? line - car.y : line - car.x) * dirSign;
        if (aheadDist <= 0 || aheadDist > 88) continue;
        if (aheadDist < ROAD_WIDTH / 2 + 4) break; // inside the box: carry on through
        const ix = ROADS.indexOf(vertical ? cross : line);
        const iy = ROADS.indexOf(vertical ? line : cross);
        const phase = signalPhase({ offset: (ix * 5 + iy * 7) % 12 }, time);
        const mine = vertical ? phase.ns : phase.ew;
        const stopDist = aheadDist - (ROAD_WIDTH / 2 + 9);
        const mustStop = mine === 'red' || (mine === 'yellow' && stopDist > 16);
        if (mustStop && car.lightPass !== line) {
          if (stopDist <= 2.5) {
            speed = 0;
            car.lightWait = (car.lightWait || 0) + dt;
            if (car.lightWait > 5) car.lightPass = line; // held too long: creep through
          } else {
            speed = Math.min(speed, Math.max(10, stopDist * 2.2));
            car.lightWait = 0;
          }
        }
        break; // only the next intersection matters
      }
    }
  }
  car.brake = speed < 26 || (Math.abs(turn) > 0.45 && speed < 110); // crawling in a queue, stopped at a red light, braking for a corner, or hauling the nose around one: lights flare
  const oldX = car.x;
  const oldY = car.y;
  car.x += Math.cos(car.angle) * speed * dt;
  car.y += Math.sin(car.angle) * speed * dt;
  car.vx = Math.cos(car.angle) * speed;
  car.vy = Math.sin(car.angle) * speed;
  if (hitsBuilding(buildings, car.x, car.y, car.radius || CAR.radius)) {
    // A corner cut too fine: stay out of the building and slide back toward the street,
    // so the car noses out of the block instead of wedging against the wall.
    car.x = oldX;
    car.y = oldY;
    const road = nearestRoadPoint(car.x, car.y);
    const nx = car.x + (road.x - car.x) * 0.65;
    const ny = car.y + (road.y - car.y) * 0.65;
    if (!hitsBuilding(buildings, nx, ny, car.radius || CAR.radius)) {
      car.x = nx;
      car.y = ny;
    }
  }
  // Wedged: barely any net movement over the last second and a half (a wall, or a jam
  // that will not clear). A free car picks a fresh destination; a car whose owner holds
  // its target slides fully onto the street instead.
  if (car.anchorX === undefined) {
    car.anchorX = car.x;
    car.anchorY = car.y;
    car.anchorAge = 0;
  }
  car.anchorAge += dt;
  if (car.anchorAge > 1.5) {
    // Waiting at a red light is not being wedged: the destination stays.
    if (distance(car.x, car.y, car.anchorX, car.anchorY) < 6 && !(car.lightWait > 0)) {
      if (car.holdTarget) {
        const road = nearestRoadPoint(car.x, car.y);
        if (!hitsBuilding(buildings, road.x, road.y, car.radius || CAR.radius)) {
          car.x = road.x;
          car.y = road.y;
        }
      } else {
        car.target = randomRoadPoint(random);
      }
    }
    car.anchorX = car.x;
    car.anchorY = car.y;
    car.anchorAge = 0;
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
    hair: pick(random, PED_HAIR),
    skin: pick(random, PED_SKIN),
    cap: random() < 0.3 ? pick(random, ['#b8443a', '#2f6fd0', '#e8b23a', '#d8d8d8']) : null, // some wear a cap over the hair
    target: null,
    down: 0, // >0 while knocked down
    fade: 0,
    flee: 0, // >0 while running from a threat
    walkPhase: random() * Math.PI * 2,
  };
}

/**
 * A market browser: a pedestrian who lives in the night market quarter instead of the
 * sidewalks — slower, browsing between the stalls, never wandering off the plaza.
 * `bob` is the browser's own phase for the band-set bounce: during a set the crowd
 * drifts toward the stage and bobs to the beat, each browser on its own phase.
 */
export function makeMarketPed(random) {
  const ped = makePed(random);
  ped.x = MARKET_BOUNDS.x + 20 + random() * (MARKET_BOUNDS.w - 40);
  ped.y = MARKET_BOUNDS.y + 20 + random() * (MARKET_BOUNDS.h - 40);
  ped.speed = PED_SPEED * 0.7; // browsers stroll, they do not hurry
  ped.market = true;
  ped.target = null;
  ped.bob = random() * Math.PI * 2;
  return ped;
}

/**
 * Pedestrians stroll along the sidewalks and cross streets at intersections. When `threat`
 * is a fast car bearing down close by, they dive out of the way and run until it passes.
 * Market browsers get one more behaviour: while the band is playing a set (`game.bandSet`)
 * they drift toward the stage and gather in front of it, bobbing to the beat on their own
 * `bob` phase — and when the set ends they wander back out among the stalls.
 */
export function updatePed(ped, dt, random, threat, game) {
  if (ped.down > 0) {
    // Knocked down: lie still until the timer runs out, then get up and walk off.
    ped.down -= dt;
    return;
  }
  if (threat && threat.danger) {
    const d = distance(ped.x, ped.y, threat.x, threat.y);
    if (d < 85) ped.flee = 1.1;
  }
  if (ped.flee > 0 && threat) {
    ped.flee -= dt;
    const away = Math.atan2(ped.y - threat.y, ped.x - threat.x);
    // Run away, biased sideways: diving straight back along the car's path is no escape.
    const dodge = away + (ped.x + ped.y > threat.x + threat.y ? 0.7 : -0.7);
    ped.angle += clamp(angleDelta(ped.angle, dodge), -6 * dt, 6 * dt);
    ped.x += Math.cos(ped.angle) * 168 * dt;
    ped.y += Math.sin(ped.angle) * 168 * dt;
    ped.x = clamp(ped.x, 40, WORLD - 40);
    ped.y = clamp(ped.y, 40, WORLD - 40);
    ped.walkPhase += dt * 15;
    return;
  }
  const gathering = ped.market && game && game.bandSet;
  if (!ped.target || distance(ped.x, ped.y, ped.target.x, ped.target.y) < 10) {
    if (gathering) {
      // The band is playing: gather in a loose crowd in front of the stage, inside
      // the gather radius, facing the curtain — the set's audience, not browsers.
      ped.target = {
        x: MARKET_STAGE.x + MARKET_STAGE.w / 2 + (random() - 0.5) * 2 * MARKET.gatherRadius,
        y: MARKET_STAGE.y + MARKET_STAGE.h + 8 + random() * MARKET.gatherRadius,
      };
    } else if (ped.market) {
      // Market browsers pick their next stall inside the plaza and stay there.
      ped.target = {
        x: MARKET_BOUNDS.x + 20 + random() * (MARKET_BOUNDS.w - 40),
        y: MARKET_BOUNDS.y + 20 + random() * (MARKET_BOUNDS.h - 40),
      };
    } else {
      const p = randomRoadPoint(random);
      // Offset onto the sidewalk beside the street.
      ped.target = { x: p.x + 42, y: p.y + 42 };
    }
  }
  const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  ped.angle += clamp(angleDelta(ped.angle, want), -3 * dt, 3 * dt);
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  ped.x = clamp(ped.x, 40, WORLD - 40);
  ped.y = clamp(ped.y, 40, WORLD - 40);
  // A browser gathered for a set bobs to the beat — a faster walk phase, on its own
  // bob phase — instead of strolling; everyone else walks at the usual pace.
  ped.walkPhase += dt * (gathering ? 14 : 9);
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
  if (p.grav) p.vy += p.grav * dt; // fountain spray arcs back down; smoke and dust do not
  if (p.rot !== undefined) p.rot += (p.spin || 0) * dt; // debris chunks tumble as they fly
  p.life -= dt;
  return p.life > 0;
}

/** A short dust puff behind a driving car, and sparks on a hard hit. */
export function exhaust(game, car) {
  const back = { x: car.x - Math.cos(car.angle) * 24, y: car.y - Math.sin(car.angle) * 24 };
  // Mostly pale dust; now and then a darker, fatter puff from a hard-working engine.
  const dirty = game.rng() < 0.22;
  const puff = makeParticle(back.x, back.y, -Math.cos(car.angle) * 30 + range(game.rng, -15, 15), -Math.sin(car.angle) * 30 + range(game.rng, -15, 15), dirty ? 0.7 : 0.5, dirty ? '#5f5a52' : '#9a9a9a', dirty ? 4.5 : 3);
  game.particles.push(puff);
}

/** Grey tyre smoke when the handbrake bites at speed: a fat, slow, pale puff. */
export function tyreSmoke(game, car) {
  const side = game.rng() < 0.5 ? 1 : -1;
  const px = car.x - Math.cos(car.angle) * 16 + Math.sin(car.angle) * 10 * side;
  const py = car.y - Math.sin(car.angle) * 16 - Math.cos(car.angle) * 10 * side;
  game.particles.push(makeParticle(px, py, range(game.rng, -20, 20), range(game.rng, -20, 20), 0.8, '#c9c9c9', 5));
}

/**
 * Spike strips: the PD's roadblock dressing. A strip is a band across the road, `angle`
 * along its long axis; a car crosses it when it is close along the band and near its
 * centreline. The first crossing shreds the car's tyres — `spikeTimer` starts, the car
 * takes damage, sparks fly and the tyres throw a burst of smoke — and the strip is
 * spent (`hit`), so a second car can cross the same spot unharmed. Only the car's own
 * strip timer matters afterwards: driveCar reads it every step. A strip still unfolding
 * (`deploy` under 1) cannot bite yet: a car crossing mid-unfold passes over harmlessly.
 */
export function spikeCheck(game, car, events) {
  if (!game.police || !game.police.strips) return;
  for (const strip of game.police.strips) {
    if (strip.hit) continue;
    if ((strip.deploy ?? 1) < 1) continue; // still unfolding — no teeth out yet
    const dx = car.x - strip.x;
    const dy = car.y - strip.y;
    const alongStrip = Math.abs(dx * Math.cos(strip.angle) + dy * Math.sin(strip.angle));
    const acrossStrip = Math.abs(-dx * Math.sin(strip.angle) + dy * Math.cos(strip.angle));
    if (alongStrip < SPIKE.length / 2 + (car.radius || CAR.radius) * 0.5 && acrossStrip < 8) {
      strip.hit = true;
      car.spikeTimer = SPIKE.duration;
      car.damage = (car.damage || 0) + SPIKE.damage;
      sparks(game, car.x, car.y, 10);
      shredSmoke(game, car);
      if (events) events.push({ type: 'spike', x: car.x, y: car.y });
    }
  }
}

/**
 * Tyre-repair bays: two kerbside workshops where a shredded car is fixed for free.
 * Drive a car with shredded tyres over an open bay and the tyres are swapped on the
 * spot — the shred timer clears, the car straightens out a little, and the bay goes
 * quiet for REPAIR.cooldown seconds before it opens again. A car with sound tyres
 * rolling over a bay does nothing: the bay is for wrecks, not for show.
 */
export function repairCheck(game, car, events) {
  if (!game.repairs || !car || car.spikeTimer <= 0) return;
  for (const bay of game.repairs) {
    if (!bay.active) continue;
    if (distance(car.x, car.y, bay.x, bay.y) > REPAIR.radius) continue;
    car.spikeTimer = 0;
    car.damage = Math.max(0, (car.damage || 0) - 20); // a fresh set of tyres, and the worst of the dent knocked out
    bay.active = false;
    bay.cooldown = REPAIR.cooldown;
    sparks(game, bay.x, bay.y, 6);
    if (events) events.push({ type: 'repair', x: bay.x, y: bay.y });
    return;
  }
}

/** The shredding burst itself: dark smoke and pale rubber dust off all four tyres. */
export function shredSmoke(game, car) {
  for (let i = 0; i < 8; i += 1) {
    const a = game.rng() * Math.PI * 2;
    const r = 12 + game.rng() * 10;
    game.particles.push(makeParticle(car.x + Math.cos(a) * r, car.y + Math.sin(a) * r, range(game.rng, -30, 30), range(game.rng, -30, 30), 0.9, game.rng() < 0.5 ? '#3a3a3a' : '#d8d2c4', 4.5));
  }
}

export function sparks(game, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    const a = game.rng() * Math.PI * 2;
    const s = 60 + game.rng() * 160;
    game.particles.push(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + game.rng() * 0.3, '#f2c230', 2.5));
  }
}

export function cashBurst(game, x, y) {
  for (let i = 0; i < intRange(game.rng, 12, 17); i += 1) {
    const a = game.rng() * Math.PI * 2;
    const s = 40 + game.rng() * 120;
    game.particles.push(makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.7, '#7fd069', 3));
  }
}

/** A gunshot's dressing: one bright flash particle at the muzzle and a brass casing that
 * pops sideways and falls. The flash is a single frame's glare; the casing lingers. */
export function muzzleFlash(game, x, y, angle) {
  const flash = makeParticle(x, y, Math.cos(angle) * 26, Math.sin(angle) * 26, 0.07, '#ffd76a', 6);
  flash.kind = 'flash';
  game.particles.push(flash);
  const side = angle + Math.PI / 2;
  const casing = makeParticle(x, y, Math.cos(side) * (30 + game.rng() * 30), Math.sin(side) * (30 + game.rng() * 30), 0.5, '#c9a13b', 1.6);
  casing.grav = 260;
  game.particles.push(casing);
}

/** Tyre smoke with a drift's colour: darker and fatter than a handbrake puff, laid down
 * while the car slides sideways at speed. */
export function driftSmoke(game, car) {
  const side = game.rng() < 0.5 ? 1 : -1;
  const px = car.x - Math.cos(car.angle) * 14 + Math.sin(car.angle) * 9 * side;
  const py = car.y - Math.sin(car.angle) * 14 - Math.cos(car.angle) * 9 * side;
  game.particles.push(makeParticle(px, py, range(game.rng, -14, 14), range(game.rng, -14, 14), 0.9, '#8f8a80', 6));
}

/** The burst when a street prop breaks under a car: a fan of tumbling chunks in the
 * prop's own colours. The renderer draws kind 'chunk' as a small spinning square, so
 * the pieces read as splinters and shards rather than smoke. */
export function debrisBurst(game, x, y, colors, n) {
  for (let i = 0; i < n; i += 1) {
    const a = game.rng() * Math.PI * 2;
    const s = 50 + game.rng() * 190;
    const chunk = makeParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + game.rng() * 0.5, pick(game.rng, colors), 2.4 + game.rng() * 2.4);
    chunk.kind = 'chunk';
    chunk.spin = (game.rng() - 0.5) * 14;
    chunk.rot = game.rng() * Math.PI;
    game.particles.push(chunk);
  }
}

/** The airfield plane's trail: a thin white puff off the tail while it climbs, gone in
 * under a second — just enough to draw the eye along the circuit it is flying. High
 * on the climb the trail doubles, a thicker plume off the tail. */
export function planeTrail(game, x, y, dense) {
  game.particles.push(makeParticle(
    x + range(game.rng, -6, 6),
    y + range(game.rng, -6, 6),
    range(game.rng, -10, 10),
    range(game.rng, -10, 10),
    0.9,
    '#eef2f6',
    3,
  ));
  if (dense) {
    game.particles.push(makeParticle(
      x + range(game.rng, -8, 8),
      y + range(game.rng, -8, 8),
      range(game.rng, -8, 8),
      range(game.rng, -8, 8),
      1.1,
      '#eef2f6',
      4,
    ));
  }
}

/** A rain splash where heavy storm rain hits the street: a pale ring that spreads and
 * fades in a third of a second. The renderer draws kind 'splash' as a ring, not a dot. */
export function rainSplash(game, x, y) {
  const ring = makeParticle(x, y, 0, 0, 0.32, '#c8d6e2', 3);
  ring.kind = 'splash';
  game.particles.push(ring);
}
