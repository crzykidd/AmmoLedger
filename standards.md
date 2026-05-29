# Standards implemented

This project implements the following [standards](https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards)
from the crzynet `homelab-configs` repo. Each row pins the **version** that this
project has actually wired up. Bumping a pin is a deliberate act (re-implement against
the new revision in the same commit that updates the pin); standards do not auto-upgrade
adopters.

| Standard | Version | Adopted | Notes |
|---|---|---|---|
| [vexp-context-engine](https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/vexp-context-engine/README.md) | 1.0.1 | 2026-05-29 | Full repo push: `.claude/hooks/vexp-guard.sh` (verbatim), `PreToolUse` guard + `mcp__vexp__*` allows merged into `.claude/settings.json`, `.vexpignore` at root, CLAUDE-snippet pasted verbatim into `CLAUDE.md`. `.vexp/manifest.json` is intentionally **not** tracked (manifest-not-tracked shape — each host owns its index); `.vexp/.gitignore` ignores all generated state. v1.0.1 fix: `.gitignore` un-ignores `.claude/hooks/` (+ `.claude/commands/`) so the guard hook travels via git; vexp's auto-generated `.claude/CLAUDE.md` is untracked (per-host machine state). |

## Not yet formally adopted (de-facto present)

These standards' rules are already wired into `CLAUDE.md` and tooling but have **not**
been formally adopted (pinned here, registered in the homelab-configs registry, or
reconciled against the canonical `CLAUDE-snippet.md`). Formalize before relying on them:

- **release-prep-and-cut** — `/release-prep` + `/release-cut` slash commands exist
  ([.claude/commands/](.claude/commands/)) and CLAUDE.md encodes the hard rules
  (CHANGELOG single source of truth, one commit per prep, never re-tag).
- **code-checkin-and-pr** — CLAUDE.md "Git Workflow" / "Release Process" encode the
  branch strategy (`dev`→`main`, never push to `main`), conventional commit prefixes,
  and GHCR image publishing — as hand-written prose, not the standard's verbatim snippet.
