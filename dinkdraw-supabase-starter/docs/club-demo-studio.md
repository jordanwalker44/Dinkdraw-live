# Club Demo Studio

Open `/admin/demo`, or use **Open Club Demo Studio** on `/admin/features`.
An authenticated account must pass the existing `is_dinkdraw_admin` RPC.
No database migration is needed.

1. Enter a club name and event title, upload a PNG/JPG/WEBP/GIF/SVG logo under 10 MB,
   and choose branding colors.
2. Choose 8, 16, or 32 fictional players and the event format. Names are populated
   automatically and editable. Shuffle names creates a new roster and resets scores.
3. Simulate rounds individually or complete the tournament immediately.
4. Select public brackets/matches, player match preview, pool standings, or TV.
5. Use phone width and screenshot mode, or Download PNG to export just the preview.
6. Click Save demo. Use Duplicate to personalize another prospect without replacing
   an existing saved demo. Escape exits screenshot mode.

## Isolation and persistence

Demos and resized logos are stored only in localStorage, scoped to the signed-in
admin user ID. No tournament, player, organization, prize, notification, or stats
records are written. Clearing site data removes saved demos; they do not sync
between browsers, devices, localhost, and production. Changes require Save demo.
The admin gate controls the UI; local browser storage is not encrypted storage.
There are no public demo links in this version.

## Supported simulation

Supported options:

- Round Robin: rotating doubles, fixed partners, mixed doubles, and singles.
- Pool Play + Brackets and Moneyball: rotating or mixed doubles, with split,
  single, first-round consolation, double, and triple elimination.
- Cream of the Crop: nine rounds across three stages using the production court
  movement scheduler.
- Premium League: four sample weeks, three rounds each, with the production
  partnership rotation and cumulative standings.

Moneyball displays illustrative prizes for one sample event; no payments or
real series wins are recorded. Multi-elimination finals run to the loss limit.
Demos use repeatable sample scores and standings calculated from those scores.

The studio reuses the production branding, bracket, pool standings, and TV
components. Player match cards, league preview, and sample prize summary are
demo-specific, not replicas of the complete production player or league pages.

Logo selection uses FileReader and an HTML image decoder, then resizes to a PNG.
A thumbnail and status appear beside the file picker. Save demo keeps that logo
in browser storage. HEIC is not supported; export as PNG or JPG first.

## Verification

`npm run test:demo` checks all supported roster sizes and formats, participation,
standings arithmetic, bracket advancement, reproducibility, and reset.
`npm run build` checks the complete production compilation and types.

Manual check with an admin session: upload a logo, change a player name, save,
reload and reopen; advance into brackets; inspect phone/TV previews; download PNG;
and verify the image contains the intended logo and no studio controls.
