# AmmoLedger Community Data

This directory contains community-maintained lookup data for AmmoLedger.
All running instances sync from these files automatically.

## Contributing

1. Fork this repository
2. Edit the appropriate YAML file
3. Add your entry in alphabetical order
4. Submit a pull request

Or from the app: Admin → Lookups → "Generate PR Content" to export your
local entries as YAML.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full details.

## Files

| File | Contents |
|------|----------|
| `dealers.yaml` | Online and local ammo dealers |
| `manufacturers.yaml` | Ammunition and firearm manufacturers |
| `calibers.yaml` | Caliber / cartridge names |
| `ammo_types.yaml` | Bullet / projectile types |
| `firearm_action_types.yaml` | Action taxonomy (semi-auto pistol, revolver, etc.) |
| `firearm_models.yaml` | Firearm model catalog (manufacturer + model + defaults) |
| `firearm_compliance_tags.yaml` | Jurisdiction-status tags (CA-roster, NFA, etc.) |
| `firearm_frame_sizes.yaml` | Frame size taxonomy (Micro, Compact, Full-Size, etc.) |
| `firearm_optic_cuts.yaml` | Slide optic-cut footprints (RMR, DeltaPoint Pro, etc.) |
| `firearm_rail_types.yaml` | Accessory rail types (Picatinny, M-LOK, etc.) |
| `firearm_finishes.yaml` | Standardized firearm finishes (Cerakote, Blued, etc.) |
