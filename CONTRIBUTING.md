# Contributing to AmmoLedger Community Data

AmmoLedger ships with community-maintained lookup data for dealers, manufacturers, calibers, and ammo types. This data is synced automatically from this repository so all installations stay current without manual updates.

## What can I contribute?

- **Dealers** — online retailers, local gun shops, gun shows, and auction sites
- **Manufacturers** — ammunition manufacturers with their official website URL
- **Calibers** — standard and wildcat cartridge designations
- **Ammo Types** — projectile types (FMJ, HP, BTHP, etc.)

## File locations

| Table | File |
|---|---|
| Dealers | `community/dealers.yaml` |
| Manufacturers | `community/manufacturers.yaml` |
| Calibers | `community/calibers.yaml` |
| Ammo Types | `community/ammo_types.yaml` |

## How to add an entry

1. Fork the repository
2. Edit the appropriate YAML file in `community/`
3. Add your entry following the format below
4. Open a pull request with a short description of what you're adding

## YAML format

### Dealers

```yaml
dealers:
  - name: "Lucky Gunner"
    url: "https://www.luckygunner.com"
    types: "online"
    country: "US"
    state: ""
```

**Fields:**
- `name` — display name (required)
- `url` — website URL (optional, empty string if none)
- `types` — comma-separated list from: `online`, `local`, `auction`, `gun_show` (optional)
- `country` — ISO 3166-1 alpha-2 country code (default: `US`)
- `state` — ISO 3166-2 subdivision code without country prefix, e.g. `WA` not `US-WA` (optional, US only)

### Manufacturers

```yaml
manufacturers:
  - name: "Federal"
    url: "https://www.federalpremium.com"
```

**Fields:**
- `name` — manufacturer name (required)
- `url` — official website URL (optional, empty string if none)

### Calibers

```yaml
calibers:
  - name: "9mm Luger"
```

**Fields:**
- `name` — caliber designation (required); use the most widely recognized name

### Ammo Types

```yaml
ammo_types:
  - name: "FMJ"
```

**Fields:**
- `name` — projectile type abbreviation or name (required)

## Guidelines

- **No duplicates** — search the file before adding; check for alternate spellings
- **Standard names** — use the most common industry designation for calibers and types
- **Real entries only** — dealers must be currently active, manufacturers must produce ammunition
- **URLs** — must be the manufacturer's or retailer's primary domain; leave blank if unknown
- **US bias is fine** — the community data started US-centric; international entries are welcome

## How sync works

When AmmoLedger starts or when an admin clicks **Check for Updates** on the Lookups page, it fetches these YAML files directly from the `main` branch of this repository. New entries are added as **pending** and require an admin to review and import them via the Lookups page UI. Existing imported entries are updated in place.

If GitHub is unreachable, AmmoLedger falls back to the bundled YAML files shipped inside the Docker image. This means offline installations always have a baseline dataset.

## Questions?

Open an issue at <https://github.com/crzykidd/AmmoLedger/issues>.
