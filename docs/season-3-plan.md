# Season 3 release plan

Owner decisions 2026-10-28. Season 2 ends **Sun 2026-11-29** (started 2026-09-20 + `SEASON_LENGTH_DAYS`
70). A **5-day off-season** follows (`SEASON_GAP_DAYS`), so Season 3 opens automatically on
**Fri 2026-12-04** and ends **Fri 2027-02-12**. Theme: winter / Christmas. Name: **Black Ice** (owner, 2026-10-28). Advent calendar was
proposed and dropped by the owner.

## v2.3.0: roadmap, social links, off-season (target 2026-10-30 to 11-02)

- Roadmap page (`/?page=roadmap`): Roadmap button in the landing hero, in the in-game bottom bar and
  at the top of What's New.
- Instagram / Facebook / TikTok links on the landing page.
- **The off-season rule.** It must be on production **before Sun 2026-11-29**: Season 3 is created
  the moment Season 2 ends, and without this code it would open on Nov 29.
- `npm test` forced to local databases.

Built on `feat/landing-roadmap`. Cut and release it **before any 3.0 work merges into `develop`**,
or the 2.3 release branch picks up half-finished Season 3 features.

## v3.0.0: Season 3 (opens Fri 2026-12-04)

**Watch the tease window.** The landing hero starts counting down to the next season 14 days before
it opens (Fri 2026-11-20). It reads the name from the same `pickTwistForSeason` path the rollover
uses, so until the Season 3 twist override is on production it will advertise "Season 3 · The
Contenders". Ship the override (backend constant only) before Nov 20, or accept two weeks of the
old name. The twist is chosen when Season 2 ends (Nov 29), so the override must be live by then at
the latest.

| Item | Size | Notes |
|---|---|---|
| Winter season skin + twist | 2 to 3 days | See `docs/season-3-spec.md` §1. |
| Holiday banner pieces | 2 to 3 days | Earned free by fighting in Season 3, kept forever. Cosmetic only. |
| Player portraits | 5 to 7 days | `docs/fighter-portraits-spec.md`, **player pool only**. Opponents keep initials until 3.1. |
| Kicks honesty fix | half a day | Library LEG copy; Leg Kick Attrition removed. No engine change. |

### Timeline

| When | Work |
|---|---|
| Oct 28 to Nov 2 | v2.3 (roadmap, social links, off-season rule). Owner answers the 3.0 spec questions. |
| Nov 3 to 6 | Winter skin + twist |
| Nov 7 to 10 | Holiday banner pieces |
| Nov 11 to 18 | Player portraits (build-feature pipeline) |
| Nov 19 | Kicks honesty fix. Twist override on production before the Nov 20 tease (a small 2.3.x if needed). |
| Nov 20 to 26 | Buffer: staging rehearsal of the S2 end, the 5-day off-season and the S3 opening; GDD, Library, changelog `3.0` (`major: true`). |
| **Fri Nov 27** | Cut `release/3.0` from `develop`, fixes only |
| **Sun Nov 29** | Season 2 ends and pays out on its own. Off-season starts. |
| **Tue Dec 1 to Thu Dec 3** | Merge to `main`, tag `v3.0.0`, deploy. Check the winter skin and twist on production before anyone can fight. Back-merge to `develop`. |
| **Fri Dec 4** | Season 3 opens on its own. |

## v3.1.0: mid-season drop (target around Fri 2026-12-18)

| Item | Size | Notes |
|---|---|---|
| Fight Camp redesign | 5 to 10 days | `mockups/fight-camp-redesigns.html`, 7 variants; owner picks one. |
| Opponent portraits | 3 to 4 days + art | 60 faces, not generated. Generation needs the owner's yes on tool, model, prompts, count and cost. |
| Holiday fight card | about 2 days | Special Events card, date-gated around Christmas / New Year. |

Cut `release/3.1` around Dec 11.

## Season 4 (v4.0.0, opens 2027-02-17)

Season 3 ends 2027-02-12, then the 5-day off-season.

- Real kick mechanic (fight-engine change plus balance sweeps across all 8 style mirrors). Lands on a
  fresh ladder so nobody's standing was earned under the old rules.
