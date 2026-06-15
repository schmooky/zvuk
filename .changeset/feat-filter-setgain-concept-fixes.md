---
"@schmooky/zvuk": minor
---

Add `Filter.setGain(db)` to adjust the peaking-filter gain live (previously `gain` could only be set at construction). Also fixed concept-page docs: the Engine state union now lists `interrupted` (5 states, not 4), the Filter API surface shows `input`/`output` as `GainNode` (not `BiquadFilterNode`) plus the new `setGain`, and the manual Spatializer recipe now routes a source into the node `connectInto()` returns (the previous snippet produced silence).
