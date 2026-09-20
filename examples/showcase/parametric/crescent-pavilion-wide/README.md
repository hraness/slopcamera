# Wider crescent pavilion

This revision uses the original pavilion's design and stage identities and the
same [base.scene.json](base.scene.json). Only three parameter values change in
[design.json](design.json): span 6.2 to 8 m, crown height 4.1 to 3.3 m, and plan
curvature 1.1 to 1.6 rad. The walk length and timber member dimensions stay the same.

Follow the [shared prerequisites and commands](../README.md#reproduce-a-retained-study)
with `study=crescent-pavilion-wide`. Compare its lower, wider opening and tighter
curve against the [original pavilion](../crescent-pavilion/README.md).

To author this change yourself, save `{ "span": 8, "rise": 3.3, "bend": 1.6 }`
as `pavilion-values.json`, then run from the repository root:

```sh
slopcamera scene design set examples/showcase/parametric/crescent-pavilion/design.json \
  --parameters pavilion-values.json \
  --output artifacts/slopcamera/generated/pavilion-wide.design.json --json
```

Compile that new source with the original base scene into a fresh output
directory. The source derives from the MIT-licensed Slopcamera pavilion at
[`6d53343b13fbc507bc3b25eb7453008e38ff93e9`](https://github.com/hraness/slopcamera/tree/6d53343b13fbc507bc3b25eb7453008e38ff93e9/examples/design).
This visual comparison does not certify structural performance.
