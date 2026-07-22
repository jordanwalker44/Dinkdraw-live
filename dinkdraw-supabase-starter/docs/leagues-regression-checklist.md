# DinkDraw Leagues regression checklist

Run this checklist before applying the League migration or deploying League UI changes.

## Existing tournament formats

- Create and complete a singles round robin.
- Create and complete rotating-partner doubles.
- Create and complete fixed-partner doubles.
- Create and complete mixed rotating doubles.
- Create and complete Cream of the Crop.
- Generate and complete a supported playoff bracket.
- Confirm player score-reporting permissions still behave normally.
- Confirm reopening and correcting a score rebuilds player statistics.
- Confirm My Tournaments, My Stats, Leaderboard, results, and share cards still load.

## League isolation checks

- Confirm a normal tournament creates no `league_session_players` rows.
- Confirm completing a normal tournament updates no `league_sessions` row.
- Confirm only an entitled organization owner/admin can create a league.
- Confirm league participants do not need a premium entitlement.
- Confirm a session cannot start with unclaimed regular positions or unresolved attendance.
- Confirm a substitute cannot cover two regular positions in one session.
- Confirm starting a session twice returns the same linked tournament.

## Rotating-doubles league checks

- For an even roster of N players, confirm the first N-1 sessions contain every partnership once.
- Confirm weekly partners remain fixed for the entire session.
- Confirm every weekly team plays every other team exactly twice.
- Confirm the two matches against an opponent are consecutive and remain on the same court.
- Confirm Team A/Team B orientation reverses for the second match.
- Confirm the linked tournament opens in the existing fixed-partner live scoring experience.

## Standings checks

- Confirm only completed sessions affect season standings.
- Confirm each win and point differential is attributed to the regular league position.
- Confirm the actual substitute receives personal DinkDraw match statistics.
- Confirm a substitute below the regular player's average receives no upward adjustment.
- Confirm a substitute above the regular player's average is capped at that average.
- Confirm adjusted wins rank first and point differential breaks ties.
