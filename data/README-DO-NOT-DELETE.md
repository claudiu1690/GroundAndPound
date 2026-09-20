# `data/gyms.json` — DO NOT DELETE

> This notice lives in a sibling file because `gyms.json` is strict JSON and cannot carry a
> comment header, and adding a `_comment` element to the array would be picked up by
> `scripts/seedGyms.js` as an eleventh gym. The same warning is repeated in
> `models/gymModel.js`.

**The Home Camp reads `data/gyms.json` at boot. Deleting it fails the process.**

After `GYMS_RETIRED=true` the ten gyms stop being playable and this file starts *looking*
deletable. It is not. It is a read-only input to:

| Consumer | What breaks if it is deleted |
|---|---|
| `consts/homeCampConfig.js#GYM_PERK_CATALOG` | Every Home Camp Rank-4 perk's **name and effect text** comes from this file. The camp does not define its own perk copy — that is how the camp and the gym could never disagree about what `corner_confidence` is called. |
| `consts/homeCampConfig.js#validateHomeCampConfig()` | Reads it at **require time** and throws. `GYM_PERK_CATALOG` empty ⇒ boot failure. Also re-checks that every slug has a `GYM_SLUG_TO_DOMAIN` entry. |
| `services/homeCampService.js#deriveInitialCampState` | Converts a player's gym history into their camp's starter coach and their banked Discipline Familiarity. Without the slugs, every conversion produces a blank `NEW` camp. |
| `consts/badgeCatalog.js` | 10 gym badge definitions are keyed by these slugs. |

## Never delete, in this or any later change

- `data/gyms.json`
- `models/gymModel.js` and the `Gym` collection
- `fighter.gymRanks`, `fighter.gymPerks`, `fighter.activeGymId`, `fighter.activeGymPaidUntil`
- the 10 gym badge definitions in `consts/badgeCatalog.js`
- `GYM_PERK_CATALOG`

## Safe to delete — but only together, and only in their own change

`services/trainingService.js`, `services/gymRankService.js`, `controllers/gymController.js`,
`routes/gymRoutes.js`, `specialMovesService.rollMoveDrop`, `specialMovesCatalog.DROP_BASE_RATE`.

Deleting any one of those while `GYMS_RETIRED` can still be flipped back to `false` takes the
gym path down with no way to restore it without a deploy — which defeats the entire point of the
cutover being a flag flip.
