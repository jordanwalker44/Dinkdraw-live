# Club Demo Studio

Open `/admin/demo`, or use **Open Club Demo Studio** on `/admin/features`.
An authenticated account must pass the existing `is_dinkdraw_admin` RPC.
No database migration is needed.

1. Enter a club name and event title, upload a PNG/JPG/WEBP/GIF logo under 3 MB,
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

Groups of four play three rounds of rotating doubles, using the existing
Cream-of-the-Crop stage scheduler. For pool/postseason demos, the top two players
in each pool form a championship team and the other two form a consolation team.
Each draw uses the existing single-elimination graph builder. Scores are
repeatable and standings derive from completed pool matches. This is a sample
sales scenario, not a replacement for every production event format.

The studio reuses OrganizationBrandBanner, TournamentBracket, PoolStandingsTables,
and PublicTvDisplay. The event header and player match preview are demo-specific;
they are not the complete production player page. Cream-of-the-Crop progression,
Moneyball, and multiple-elimination demos are not yet available.

## Verification

`npm run test:demo` checks all supported roster sizes and formats, participation,
standings arithmetic, bracket advancement, reproducibility, and reset.
`npm run build` checks the complete production compilation and types.

Manual check with an admin session: upload a logo, change a player name, save,
reload and reopen; advance into brackets; inspect phone/TV previews; download PNG;
and verify the image contains the intended logo and no studio controls.
