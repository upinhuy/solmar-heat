// A gta6-01 entry (Node 22, standard library only): the game is this directory's game/
// folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/
// and screenshots/ from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Solmar Heat: an original open-world crime game. Explore the city of Solmar on foot and by
// car, steal cars, run twenty-two story missions for Mara Solis — getaway driving, a timed hot
// delivery, a tail, a heist, a convoy job, a harbour showdown against rivals who shoot back,
// a marked-car swap, a timed night run, a truck heist in the industrial port, a limousine
// dash against the clock, a rush-hour coupe run through the downtown lights, a shootout
// over a cash case in the container yards, a firefight on the sand of the beach resort
// district, a timed coast-road run to a drop at the far end of the beach, a courier
// handoff under the elevated line's north station that turns into a timed getaway, an
// ambush under the viaduct where a rival crew fights for a case, a storm-timed getaway in
// a marked car from the airfield, an ambush over a cash case on the runway itself, a
// firefight in the night market quarter — ten stalls, paper lanterns swaying from
// the string lights, a band playing in sets while the crowd gathers at the stage — and
// a four-star getaway down Spike Alley, where the police lay spike strips across the
// road ahead — the strips unfold over half a second, with reflective chevrons painted
// on the asphalt ahead of them, and a shredded car can limp to one of two kerbside
// repair bays for a free set of tyres — and a
// five-star finale — plus repeatable street races
// and courier runs that pay generously on the side. Earn cash and stay ahead of the Solmar
// police as the wanted level rises: the chase cars aim where you are heading, three stars
// brings an extra car and a faster response, at four stars the
// PD parks roadblocks across the road and lays spike strips ahead of them — a strip
// unfolds over half a second with chevrons painted ahead of it, and a car that
// crosses a laid strip loses half its speed and half its grip until the tyres are
// swapped, at a kerbside repair bay or off-screen — and at five stars a police helicopter hangs over
// the chase with its searchlight on you — unless a thunderstorm has rolled in, when the
// helicopter stays grounded and the pursuit cars hold back to 85% of their pace on the
// wet roads. The traffic, meanwhile, obeys the city's
// working traffic signals — and queues at the red ones with its brake lights lit.
// Over the middle avenues runs the city's elevated loop line: a concrete viaduct on
// pillars carrying a three-car train in a teal-and-cream livery that circles downtown
// forever, braking into its two stations — Estacion Norte and Estacion Sur — holding
// for passengers and pulling away again, its shadow sliding over the traffic below and
// its windows lit after dark. And the city now keeps the receipts of every drive: cars
// bend as they take hits — scuffed noses, cracked windscreens, crumpled wrecks that
// trail engine smoke — and the light street props, dock crates, litter bins and rusty
// harbour barrels, split open when a fast car ploughs through them and leave their
// wreckage lying on the ground.
// The city itself is denser and better lit in this version: buildings drawn as raised
// blocks with lit windows, neon signs and awnings, glowing billboards and litter bins on
// the corners, seven car body shapes with glass and
// brake lights — sedans, vans, a limousine, motorcycles with riders — yellow taxis, park
// plazas with fountains, street props, an industrial port district of container yards and
// gantry cranes painted in harbour colours, a distant skyline, a beach resort district
// along the south-west shore — a wide sand beach with umbrellas, loungers, kiosks, a
// volleyball net and lifeguard towers under its own pier, and a row of pastel resort
// blocks with turquoise pools behind the coast road — a small airfield on the north edge,
// a runway with painted markings and amber edge lights, a taxiway, fuel drums, a windsock
// that leans with the storm gusts, white approach strobes sequencing toward the threshold
// after dark, a hangar, and a prop plane that
// taxis, takes off, circles and lands again forever — flaring onto the strip instead of
// dropping, its landing light burning longer and brighter while it is low — and a marina district along the
// south shore with a boardwalk, a pier, bobbing boats and animated
// water — all under a day/night sky with lamp glow and neon spill after dark, lamplight
// smearing across wet asphalt, thunder under the heavier storms, lightning that forks
// across the sky and flashes over the whole city while the streets darken and the neon
// burns twice as bright in the wet — about a third of the strikes answering themselves
// with a second, weaker bolt, the wind gusting inside a storm band and throwing pale
// splash rings on the asphalt — and rain
// that slicks the streets and doubles the neon. Headlights answer the L key. Put your
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
