---
name: 2026-06-12-docs-accuracy-notifications-and-env
status: done
created: 2026-06-12
model: sonnet
completed: 2026-06-13
result: Verified no notification sender exists (smtplib/discord webhook absent from backend). Marked smtp: and notifications: blocks in config.template.yaml as PLANNED/Phase 9. Updated INSTALL.md in 3 places (quick-start config list, network topology paragraph, config-only settings table). Added AL_BACKUP_INCLUDE_PHOTOS + AL_IMAGE_SEARCH_* to Key ENV variables block and cross-ref to INSTALL.md. No code files touched.
---

# Task: Stop docs from advertising unimplemented notifications; complete env reference

Docs-only accuracy fixes. No code behavior changes.

## Before you start

- Confirm the gap: Phase 9 (Notifications) is "NOT STARTED" per `CLAUDE.md`, and
  `backend/utils/config.py` only *validates* the `notifications:`/`smtp:` blocks (~224–317)
  — there is no sender (grep `backend/` for `smtplib`, Discord/webhook POST: none). Yet
  `docs/INSTALL.md:58, 109, 221–222` and `backend/config.template.yaml:139–160` present
  Discord/SMTP/low-stock alerts as working optional features.
- Read `backend/utils/config.py:40–42` (reads `AL_IMAGE_SEARCH_ENABLED` /
  `AL_IMAGE_SEARCH_PROVIDER` / `AL_IMAGE_SEARCH_API_KEY`), `docs/INSTALL.md:201–203` (these
  ARE documented there), and `backend/config.template.yaml:11–21` (the "Key ENV variables"
  comment block that lists backup vars but omits the image-search ones).

## Working tree check

Run `git status --porcelain`, cross-reference the files below, ask before touching dirty
ones. This prompt file is exempt.

## What to do

1. **Mark notifications as planned / not yet active** (Medium — currently misleading).
   In `docs/INSTALL.md` (the smtp/notifications/low-stock mentions) and in
   `backend/config.template.yaml` (the `notifications:`/`smtp:`/`low_stock` blocks), clearly
   label these as **planned / not yet implemented** (config is accepted and validated but no
   alerts are sent yet — Phase 9). Don't delete the config scaffolding; just stop implying
   it does something. Keep wording consistent with how the project describes other
   roadmap items.
2. **Complete the template ENV reference** (Low). Append `AL_IMAGE_SEARCH_ENABLED`,
   `AL_IMAGE_SEARCH_PROVIDER`, and `AL_IMAGE_SEARCH_API_KEY` to the "Key ENV variables"
   comment block in `config.template.yaml:11–21` (backup vars are listed but these three
   aren't), OR reword that block's header to "(see docs/INSTALL.md for the full list)".
   `docs/INSTALL.md` already documents them — no change needed there.

## Conventions to honor

- Docs-only commit → `docs:` prefix. No CHANGELOG entry needed unless you judge the
  notifications clarification user-facing (a short **Changed**/docs note is fine).
- Keep the PRD/README untouched unless they also claim notifications are live (check; if so,
  fix them too in the same commit).

## When done

Per `prompts/TEMPLATE.md`: update frontmatter, `git mv` to `done/`/`failed/`, and (spawned
agent) prepare the tree and report the proposed ONE commit back — no commit, no push.
Suggested message: `docs: mark notifications as not-yet-implemented and complete env reference`.
