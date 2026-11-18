// Solmar Heat: shared constants. One place for every number the rest of the game tunes from.
export const WORLD = 2400; // the city is WORLD x WORLD world units
export const ROAD_GAP = 300; // distance between street centrelines
export const ROAD_WIDTH = 64; // drivable width of a street
export const FIRST_ROAD = 150; // centreline of the first street

export const STEP = 1 / 60; // fixed simulation step, seconds

export const PLAYER = {
  radius: 13,
  walkSpeed: 185,
  sprintSpeed: 265,
  health: 100,
  punchDamage: 14,
  punchRange: 36,
  punchCooldown: 0.45,
  shootCooldown: 0.22,
  bulletSpeed: 820,
  bulletDamage: 26,
  regenDelay: 6,
  regenRate: 4,
};

export const CAR = {
  radius: 17,
  length: 46,
  width: 24,
  accel: 430,
  reverseAccel: 260,
  maxSpeed: 540,
  maxReverse: 170,
  brake: 720,
  steer: 2.7,
  grip: 2.4, // lateral velocity damping
  drag: 0.5,
};

export const TRAFFIC_SPEED = 150;
export const PED_SPEED = 55;

export const WANTED_MAX = 5;
export const COP = {
  carSpeed: 480,
  footSpeed: 200,
  arrestTime: 1.4,
  spawnDistance: 720,
  despawnDistance: 1700,
};

export const COLORS = {
  grass: '#2e5d3a',
  grassDark: '#274f31',
  road: '#3a3f46',
  roadLine: '#d8c95a',
  sidewalk: '#6d6a63',
  building: ['#7a5a44', '#5d6b7a', '#8a6f4d', '#4d5d6b', '#75604f', '#66755a'],
  roof: ['#4a3a2e', '#3d4a57', '#5d4a35', '#37424e'],
  player: '#e8b23a',
  playerDark: '#8a6420',
  copCar: '#1c2733',
  copBlue: '#2f6fd0',
  copRed: '#d0342c',
  mission: '#f2c230',
  cash: '#7fd069',
  hud: '#10141a',
};

export const SAVE_KEY = 'solmar-heat-save-v1';
