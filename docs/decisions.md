# Decisions

Append-only record of non-obvious engineering decisions for AmmoLedger — approaches
chosen, alternatives rejected, and workarounds. Newest entry at the top. Part of the
[handoff-prompt-workflow](https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/handoff-prompt-workflow/README.md)
standard (see `standards.md`).

---

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
