# Design — improve-PD-9

## Where the values come from
`detectAutoCorrections()` builds one event per waiver file with fixed fields, and `runDetect()` turns the event into a
correction with `mappedReqIds: []` and `gateThatShouldHaveCaught: ev.gateIds[0] ?? null`. The event is the right place to
learn from the file, because `runDetect` already copies `suggestedFailureMode` and `gateIds[0]` from it. Only `mappedReqIds`
is new on the event.

## Reading the waiver
The waiver text is data, read with three plain rules and no interpretation beyond them:
- ids: every `FR-n`, `NFR-n` or `BC-n` in the file, once each, in order of first appearance (the schema pattern is
  `^(FR|NFR|BC)-\d+$`; a `TC-n` is dropped rather than failing validation);
- missing mechanism: the phrase "has no mechanism" appears, as the NFR-17, 18 and 20 waivers write it;
- otherwise the old default stays (`skipped-convention`).

A waiver that names no id (none in this repository) keeps today's values, so this is only ever more information, never less.

## Gates
`G3` is the capability-plan gate that runs `check-acceptance-methods.mjs --mode=existence`; `G4` runs `--mode=artifact`
(`gate-status.mjs`). A missing mechanism is what the existence check should have caught; a missing test is what the
artifact check should have caught.

## Why the five recorded corrections stay
`--detect` skips an `autoKey` it has already recorded, and corrections are append-only. Editing COR-1 to COR-5 would rewrite
dispositions the owner signed, so it is left to a separate, reviewed change if the owner wants it.
