# Decisions

Append-only record of non-obvious engineering decisions for AmmoLedger — approaches
chosen, alternatives rejected, and workarounds. Newest entry at the top. Part of the
[handoff-prompt-workflow](https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/handoff-prompt-workflow/README.md)
standard (see `standards.md`).

---

## 2026-05-29 — Scheduled-job timezone via `app.timezone` (#43)

Daily task/backup schedules (`interval_value` `"HH:MM"`) were fired by an
`APScheduler.BackgroundScheduler()` with no explicit timezone, so they ran in the
container's local zone (UTC). The Tasks UI then converted that to the *browser's* zone
for display but left the edit field expecting the raw UTC value — display and edit
disagreed.

- **Chosen:** a single `app.timezone` config key (env `AL_TIMEZONE`, default `TZ` env →
  `UTC`) passed to `BackgroundScheduler(timezone=ZoneInfo(...))`. One zone governs every
  cron job (tasks *and* `scheduled_backup`). The frontend learns it from a new
  `timezone` field on `/system/version` and shows/accepts daily times in that zone,
  labelled — so display and edit finally agree.
- **`next_run_at` stored as naive UTC** (`_to_utc_naive()` converts the aware run-time
  before stripping tzinfo) rather than naive-in-scheduler-zone. Keeps it an absolute
  instant consistent with the app's other naive-UTC timestamps; a no-op when the zone is
  UTC, correct when it isn't.
- **Rejected — rely on the Docker `TZ` env alone:** `tzlocal` would pick it up for
  APScheduler, but the frontend still needs the value to label/parse, and a first-class
  config key is overrideable independently of the OS and validated (IANA name) by
  `validate_config`. `TZ` is honored as the default source, not the only lever.
- **Default stays `UTC`** so existing deployments are behavior-identical; honoring a
  local zone is opt-in.
- **Not addressed (pre-existing, out of scope):** the frontend parses naive-UTC
  timestamp strings with `new Date(...)`, which treats them as browser-local. Relative
  displays ("in 5 hours") are tolerant of this; a proper app-wide UTC-parse convention
  is a separate change.

## 2026-05-29 — Adopted four crzynet standards

Formalized adoption of `code-checkin-and-pr` (v1.1.0), `release-prep-and-cut` (v1.0.0),
`handoff-prompt-workflow` (v1.5.0), and `repo-sandbox-permissions` (v1.0.0), joining the
already-pinned `vexp-context-engine` (v1.0.1).

- **code-checkin-and-pr** was de-facto present in prose; CI already implements all five
  required checks (the PR-only image-build verification lives in `docker-publish.yml`,
  not `ci.yml`) plus the registry-retention policy. No CI changes were needed — only the
  verbatim `CLAUDE-snippet.md` paste and formalization in `standards.md`.
- **repo-sandbox-permissions** adopted at **local-only** scope: the sandbox block lives
  in `.claude/settings.local.json` (already gitignored), not the committed
  `.claude/settings.json`. Stack registries wired for Python + Node (this is a
  FastAPI + React repo).
