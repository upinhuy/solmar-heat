// The story of Solmar Heat: Rico Vega, new in town, working jobs for Mara Solis and her crew.
// Five missions in order, each a small state machine with an objective, a map marker, dialogue
// and a cash reward. A failed mission restarts itself; finishing one starts the next.
import { CAR } from './config.js';
import { distance, pick } from './random.js';
import { cashBurst, makeCar, makeSportCar } from './vehicles.js';
import { parkingSpot, randomRoadPoint } from './world.js';
import { setWanted } from './police.js';

export const HIDEOUT = { x: 150, y: 2100 };

export const MISSIONS = [
  {
    id: 'getaway',
    name: 'First Job: Getaway Driver',
    reward: 400,
    intro: ['Mara Solis: "Rico. You drive, you get paid. The car is marked — get in."', '"Drive it to the hideout, south-west corner. No cops, no problem."'],
    objectives: ['Get in the marked car', 'Drive to the hideout'],
  },
  {
    id: 'pickup',
    name: 'The Pickup',
    reward: 600,
    intro: ['Mara Solis: "A friend is waiting with a package. On foot — keep it quiet."', '"Bring it to the blue door. Do not open it."'],
    objectives: ['Meet the contact', 'Deliver the package to the blue door'],
  },
  {
    id: 'hot',
    name: 'Hot Delivery',
    reward: 900,
    intro: ['Mara Solis: "The package is hot and so are you. Two stars and counting."', '"Ninety seconds to the drop. Drive like Solmar is watching — it is."'],
    objectives: ['Grab the package', 'Deliver it in 90 seconds'],
    timer: 90,
  },
  {
    id: 'tail',
    name: 'The Tail',
    reward: 1200,
    intro: ['Mara Solis: "Follow the grey sedan. Not too close, not too far."', '"If he spots you, the job is blown. Stay in the goldilocks zone."'],
    objectives: ['Tail the grey sedan without being spotted'],
  },
  {
    id: 'heist',
    name: 'The Solmar Heist',
    reward: 2500,
    intro: ['Mara Solis: "Last one, Rico. The armoured car. Take it, lose the heat, bring it home."', '"Do this and Solmar is yours."'],
    objectives: ['Steal the armoured car', 'Lose the heat — reach 0 stars', 'Drive to the hideout'],
  },
];

export function createMissions() {
  return {
    index: 0,
    step: 0,
    active: false,
    timer: 0,
    progress: 0,
    spotted: 0,
    targetCar: null,
    contact: null,
    missionCar: null,
    marker: null,
    door: null,
    finishedAll: false,
    sportUnlocked: false,
  };
}

/** Show dialogue lines at the bottom of the screen for a few seconds each. */
export function say(game, lines) {
  game.dialogue = { lines, index: 0, until: game.time + 4.5 };
}

function placeMissionCar(game, kind, color) {
  const spot = parkingSpot(game.rng);
  const car = makeCar(game.rng, { x: spot.x, y: spot.y, angle: spot.angle, kind, color, missionCar: true });
  game.cars.push(car);
  return car;
}

function farPoint(game, from, minDist) {
  for (let tries = 0; tries < 20; tries += 1) {
    const p = randomRoadPoint(game.rng);
    if (distance(p.x, p.y, from.x, from.y) > minDist) return p;
  }
  return randomRoadPoint(game.rng);
}

/** Begin mission `index` (0-4): set up its cars, people and first marker, say the intro. */
export function startMission(game, index) {
  const m = game.missions;
  const def = MISSIONS[index];
  m.index = index;
  m.step = 0;
  m.active = true;
  m.timer = def.timer || 0;
  m.progress = 0;
  m.spotted = 0;
  m.targetCar = null;
  m.contact = null;
  m.missionCar = null;
  m.marker = null;
  m.door = null;
  const player = game.player;
  if (def.id === 'getaway') {
    m.missionCar = placeMissionCar(game, 'mission', '#b8443a');
    m.marker = { x: m.missionCar.x, y: m.missionCar.y };
  } else if (def.id === 'pickup') {
    const p = farPoint(game, player, 500);
    m.contact = { x: p.x, y: p.y, angle: 0, shirt: '#e8b23a', target: null, down: 0, fade: 0, walkPhase: 0, contact: true };
    game.peds.push(m.contact);
    m.marker = { x: p.x, y: p.y };
  } else if (def.id === 'hot') {
    const p = farPoint(game, player, 300);
    m.marker = { x: p.x, y: p.y };
    setWanted(game.police, 2);
  } else if (def.id === 'tail') {
    const spot = randomRoadPoint(game.rng);
    const car = makeCar(game.rng, { x: spot.x, y: spot.y, angle: 0, kind: 'traffic', color: '#6a6a6a', traffic: true, speedTarget: 130 });
    car.loop = [];
    for (let i = 0; i < 4; i += 1) car.loop.push(randomRoadPoint(game.rng));
    car.loopIndex = 0;
    car.target = car.loop[0];
    game.cars.push(car);
    m.targetCar = car;
    m.marker = { x: car.x, y: car.y };
  } else if (def.id === 'heist') {
    m.missionCar = placeMissionCar(game, 'mission', '#2c3e50');
    m.marker = { x: m.missionCar.x, y: m.missionCar.y };
  }
  say(game, def.intro);
}

function finishMission(game, events) {
  const m = game.missions;
  const def = MISSIONS[m.index];
  game.cash += def.reward;
  cashBurst(game, game.player.x, game.player.y);
  events.push({ type: 'cash', amount: def.reward });
  if (def.id === 'hot' && !m.sportUnlocked) {
    m.sportUnlocked = true;
    const sport = makeSportCar(game.rng, HIDEOUT.x + 80, HIDEOUT.y);
    game.cars.push(sport);
    events.push({ type: 'unlock', text: 'A Vortex GT is parked at the hideout. It is yours now.' });
  }
  m.active = false;
  m.index += 1;
  if (m.index >= MISSIONS.length) {
    m.finishedAll = true;
    say(game, ['Mara Solis: "You did it, Rico. The whole city saw it."', '"Solmar is yours now. Spend it well."']);
    events.push({ type: 'story-done' });
  } else {
    startMission(game, m.index);
  }
  game.save();
}

/** Restart the current mission after a failure. */
function failMission(game, reason) {
  const m = game.missions;
  say(game, [reason, 'The job restarts. Mara is patient — once.']);
  if (m.targetCar) {
    game.cars = game.cars.filter((c) => c !== m.targetCar);
  }
  if (m.missionCar) {
    game.cars = game.cars.filter((c) => c !== m.missionCar);
  }
  if (m.contact) {
    game.peds = game.peds.filter((p) => p !== m.contact);
  }
  setWanted(game.police, 0);
  startMission(game, m.index);
}

export function currentObjective(game) {
  const m = game.missions;
  if (m.finishedAll) return 'Solmar is yours — free roam';
  if (!m.active) return 'Get to work';
  const def = MISSIONS[m.index];
  let text = `${def.name}: ${def.objectives[m.step]}`;
  if (def.id === 'tail') text += ` — ${Math.floor(m.progress)}%`;
  if (def.id === 'hot' && m.step === 1) text += ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
  return text;
}

/** Where the yellow marker points right now, or null. */
export function missionMarker(game) {
  const m = game.missions;
  if (!m.active || m.finishedAll) return null;
  if (m.marker) return m.marker;
  return null;
}

/** One fixed step of the active mission. */
export function updateMissions(game, dt, events) {
  const m = game.missions;
  if (!m.active || m.finishedAll) return;
  const def = MISSIONS[m.index];
  const player = game.player;

  if (game.dialogue && game.time > game.dialogue.until) {
    game.dialogue.index += 1;
    if (game.dialogue.index < game.dialogue.lines.length) game.dialogue.until = game.time + 4.5;
    else game.dialogue = null;
  }

  if (def.id === 'getaway') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Good. Now the hideout — south-west corner."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'pickup') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.contact.x, m.contact.y) < 46 && !player.inCar) {
        m.step = 1;
        game.peds = game.peds.filter((p) => p !== m.contact);
        m.door = farPoint(game, player, 600);
        m.marker = { x: m.door.x, y: m.door.y };
        say(game, ['Contact: "No questions. Blue door, across town."']);
      }
    } else if (distance(player.x, player.y, m.door.x, m.door.y) < 60 && !player.inCar) {
      finishMission(game, events);
    }
  } else if (def.id === 'hot') {
    if (m.step === 0) {
      if (distance(player.x, player.y, m.marker.x, m.marker.y) < 60) {
        m.step = 1;
        m.door = farPoint(game, player, 800);
        m.marker = { x: m.door.x, y: m.door.y };
        m.timer = 90;
        say(game, ['Mara Solis: "Go. Ninety seconds. Do not stop for anyone."']);
      }
    } else {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(game, 'Too slow — the buyer walked away.');
        return;
      }
      if (distance(player.x, player.y, m.door.x, m.door.y) < 70) {
        finishMission(game, events);
      }
    }
  } else if (def.id === 'tail') {
    const target = m.targetCar;
    if (!target) return;
    m.marker = { x: target.x, y: target.y };
    const d = distance(player.x, player.y, target.x, target.y);
    if (d < 90 || d > 480) {
      m.spotted += dt;
      if (m.spotted > 3) {
        failMission(game, 'He spotted you in the mirror. The tail is blown.');
        return;
      }
    } else {
      m.spotted = 0;
      m.progress += dt * 4;
      if (m.progress >= 100) {
        target.traffic = false;
        target.speedTarget = 0;
        finishMission(game, events);
      }
    }
  } else if (def.id === 'heist') {
    if (m.step === 0) {
      if (player.inCar && player.car === m.missionCar) {
        m.step = 1;
        setWanted(game.police, 3);
        m.marker = null;
        say(game, ['Mara Solis: "Three stars. Lose them, then bring it home."']);
      }
    } else if (m.step === 1) {
      if (game.police.wanted === 0) {
        m.step = 2;
        m.marker = { x: HIDEOUT.x, y: HIDEOUT.y };
        say(game, ['Mara Solis: "Clean. Now the hideout."']);
      }
    } else if (distance(player.x, player.y, HIDEOUT.x, HIDEOUT.y) < 90 && player.inCar) {
      finishMission(game, events);
    }
  }
}
