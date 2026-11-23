// A gta6-01 entry (Node 22, standard library only): the game is this directory's game/
// folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/
// and screenshots/ from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Solmar Heat: an original open-world crime game. Explore the city of Solmar on foot and by
// car, steal cars, run twelve story missions for Mara Solis — getaway driving, a timed hot
// delivery, a tail, a heist, a convoy job, a harbour showdown against rivals who shoot back,
// a marked-car swap, a timed night run, a truck heist in the industrial port, a limousine
// dash against the clock, and a five-star finale — plus repeatable street races
// and courier runs for cash on the side. Earn cash and stay ahead of the Solmar police as
// the wanted level rises: the chase cars aim where you are heading, and at four stars the
// PD parks roadblocks across the road.
// The city itself is denser and better lit in this version: buildings drawn as raised
// blocks with lit windows, neon signs and awnings, seven car body shapes with glass and
// brake lights — sedans, vans, a limousine, motorcycles with riders — yellow taxis, park
// plazas with fountains, street props, an industrial port district of container yards and
// gantry cranes, a distant skyline, and a marina district along the south shore with a boardwalk, a pier, bobbing boats and animated
// water — all under a day/night sky with lamp glow and neon spill after dark, and rain
// that slicks the streets and doubles the neon. Put your
// 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
