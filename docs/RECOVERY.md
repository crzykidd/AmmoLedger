# AmmoLedger Recovery Procedures

Manual escape hatches for the rare cases where the database is in a state the
application cannot recover from on its own.

> If you are reading this because restore left you with a broken database, **do
> not panic — your pre-import backup or original `.zip`/`.db` file is still
> intact**. AmmoLedger's restore code is structured so the live database is
> only swapped in at the very end; if anything earlier failed, the original
> file is still at `/data/ammoledger.db`. The recipe below is for cases where
> the swap already happened on an older build before the restore-stats fix
> shipped, and you are now staring at the corrupted file.

---

## `malformed database schema (sqlite_stat1) - invalid rootpage`

### Symptom (invalid rootpage)

The app boots, but the first real query (typically login) fails. The backend
log contains:

```text
WARNI [database] Could not set SQLite PRAGMAs: malformed database schema (sqlite_stat1) - invalid rootpage
sqlite3.DatabaseError: malformed database schema (sqlite_stat1) - invalid rootpage
[SQL: SELECT ... FROM users WHERE users.email = ?]
```

### Cause (dangling stat rootpage)

A pre-fix restore ran `ANALYZE` on the migrated database, which allocated
new pages for `sqlite_stat1` into the file's `-wal` sidecar. The restore
step then moved only `ammoledger.db` into place — the committed-by-reference
stat pages were left stranded in the abandoned WAL. The moved file's
`sqlite_master` recorded a rootpage **past the end of the file's page
count** (e.g. `rootpage = 142` in a file only 139 pages long). Every query
that touches the schema catalog now fails before it even gets to your data.

### Diagnostic signature

You can confirm you are looking at this exact corruption — and not generic
file damage — by checking the rootpage against the file's page count:

```bash
# File size / page size = page count
ls -l ammoledger.db                                            # bytes
sqlite3 ammoledger.db "PRAGMA page_size;"                      # usually 4096
# Pull the offending rootpage out of the schema (this may itself error;
# if it does, try the .recover-only path below)
sqlite3 ammoledger.db "SELECT name, rootpage FROM sqlite_master \
  WHERE name LIKE 'sqlite_stat%';"
```

If the rootpage for `sqlite_stat1` (or `sqlite_stat4`) is greater than
`file_size / page_size`, and you see a non-empty `ammoledger.db-wal` next to
the main file, you are looking at the dangling-rootpage corruption. The
missing pages live in that `-wal`.

This is fixed in the current AmmoLedger build — new restores checkpoint the
WAL and drop out of WAL mode before swapping the file, and the backend's
startup also auto-repairs any database that already has the corruption.
Existing databases that the auto-repair cannot fix (because the WAL is also
gone) need to be recovered by hand with the recipe below.

### Why `DROP TABLE sqlite_stat1` does not work

SQLite cannot parse the schema well enough to honor the drop — the same
broken `sqlite_master` row that is breaking your queries also blocks the
fix. You need to dump the data out and rebuild a fresh file.

### Recovery (`.recover` rebuild)

The working tool is the SQLite shell's `.recover` command, which scrapes
content directly from the underlying pages without trusting `sqlite_master`.

1. **Stop the AmmoLedger container** so nothing else is writing to the file:

   ```bash
   docker compose stop backend
   ```

2. **Make a sidecar copy of the broken DB *and* its WAL/SHM** before
   touching anything. This is your safety net if `.recover` produces
   something unexpected — **and** for the dangling-rootpage corruption it
   is load-bearing, because the missing pages live in the `-wal`:

   ```bash
   cp /path/to/data/ammoledger.db      /path/to/data/ammoledger.broken.db
   cp /path/to/data/ammoledger.db-wal  /path/to/data/ammoledger.broken.db-wal
   cp /path/to/data/ammoledger.db-shm  /path/to/data/ammoledger.broken.db-shm
   ```

   If `-wal` and `-shm` do not exist, just copy the main `.db` and skip the
   other two — but be aware that without the WAL the data behind the
   dangling rootpage may already be lost, and `.recover` may produce a file
   with the stat tables missing or partial.

3. **Recover into a fresh file**, with the `-wal`/`-shm` sidecars still
   present alongside the broken DB so `.recover` reads from a complete WAL
   snapshot:

   ```bash
   sqlite3 /path/to/data/ammoledger.broken.db ".recover" \
     | sqlite3 /path/to/data/ammoledger.fixed.db
   ```

   `.recover` emits SQL statements (CREATE + INSERT) reconstructed from the
   page content of the main file *and* any present WAL; piping that into a
   brand-new file produces a clean database with no stale `sqlite_stat1`
   rootpage.

   > **Note on the `sqlite3` binary.** Some distro-packaged SQLite CLIs are
   > built without the `dbpage` virtual table that `.recover` depends on.
   > If `.recover` errors with something like `no such module: dbpage`,
   > use one of these instead:
   >
   > - The official precompiled **sqlite-tools** binary from
   >   <https://sqlite.org/download.html> (the `sqlite3` shell in that
   >   bundle is built with `dbpage` enabled).
   > - Python's bundled `sqlite3` module also includes `dbpage`. You can
   >   shell out to it with:
   >
   >   ```bash
   >   python3 -c "import sqlite3, sys; \
   >     con = sqlite3.connect(sys.argv[1]); \
   >     print('\n'.join(con.iterdump()))" \
   >     /path/to/data/ammoledger.broken.db \
   >     | sqlite3 /path/to/data/ammoledger.fixed.db
   >   ```
   >
   >   `iterdump()` is a stricter alternative that requires the schema to
   >   be parseable, so it does not always work where `.recover` does —
   >   try `.recover` first.

4. **Verify the rebuilt file:**

   ```bash
   sqlite3 /path/to/data/ammoledger.fixed.db "PRAGMA integrity_check;"
   ```

   Expected output: a single line `ok`. If it returns anything else, stop
   and investigate — do not put the file into place.

   You can also spot-check that user data made it through:

   ```bash
   sqlite3 /path/to/data/ammoledger.fixed.db "SELECT count(*) FROM users;"
   sqlite3 /path/to/data/ammoledger.fixed.db "SELECT count(*) FROM ammo_box;"
   ```

5. **Clear any `-wal` / `-shm` files next to the live DB** before swapping
   the recovered file in. The recovered file is a fresh single-file DB; any
   leftover sidecars from the broken state would only confuse the next
   boot:

   ```bash
   rm -f /path/to/data/ammoledger.db-wal /path/to/data/ammoledger.db-shm
   ```

6. **Swap the recovered file in:**

   ```bash
   mv /path/to/data/ammoledger.db        /path/to/data/ammoledger.preswap.db
   mv /path/to/data/ammoledger.fixed.db  /path/to/data/ammoledger.db
   ```

   Keep `ammoledger.broken.db` and `ammoledger.preswap.db` around until
   you have confirmed the app is healthy. Delete them once login and a few
   reads/writes succeed.

7. **Restart the container:**

   ```bash
   docker compose start backend
   ```

8. **Log in and confirm.** The backend log should no longer show the
   `sqlite_stat1` warning, and login should return a session token as
   normal. If anything still looks wrong, restore one of the sidecar copies
   from step 2 and reach out via GitHub Issues with the recovery output.

### Why this works

`.recover` reads B-tree pages directly and re-emits the schema and rows it
finds, ignoring the bogus `sqlite_master` entry that was breaking queries.
The new file built by the second `sqlite3` invocation starts fresh, so
there is no stale `sqlite_stat1` rootpage to invalidate. The application's
own startup path will rebuild planner statistics from scratch the next time
`PRAGMA optimize` runs.

---

## `database disk image is malformed` (immediately after restore)

### Symptom (disk image malformed)

Restore reports success, but the next request fails. The backend log contains
something like:

```text
sqlite3.DatabaseError: database disk image is malformed
```

`PRAGMA integrity_check` on the restored file fails to even prepare (it
doesn't return a row of errors — the statement itself errors out). This
appears on the very first read after restore, before any user activity.

### Cause (non-durable file placement)

A pre-fix restore extracted the database into a `tempfile.mkdtemp()` directory
on the container's *overlay filesystem*, then used `shutil.move` to place it
onto the bind-mounted `/data`. Across filesystems `shutil.move` is a copy +
delete with **no `fsync`**. On weak-fsync mounts — Docker Desktop bind mounts
on Windows (virtiofs → NTFS) are the most common offender — the app reopened
the file before all of its pages had been flushed to disk, and read a
partially-flushed image.

This is fixed in the current AmmoLedger build. `_durable_replace()` now stages
the file in the destination's *own* directory (guaranteed same filesystem),
fsyncs the file, fsyncs the directory, `os.replace`s into place, then fsyncs
the directory again before the engine reopens the database. If you are seeing
this symptom on a build from after the durable-swap fix, the cause is
something other than file-placement durability — investigate disk/FS errors
on the host before assuming AmmoLedger is at fault.

### Recovery (disk image malformed)

If you are still on a pre-fix build, **do not** keep retrying the restore — it
will repeatedly leave you with a malformed file. Either:

1. Upgrade AmmoLedger to a build that has the durable swap, then restore the
   same backup file again. The new restore code path produces a durably
   flushed single file and will not exhibit the symptom.
2. Or, if you cannot upgrade yet, restore on a host that does not go through
   a weak-fsync bind mount (native Linux / ext4, or a Docker named volume
   instead of a host bind mount). The same backup file restored on a strong-
   fsync filesystem is fine.

If the malformed file is the only copy you have left and you cannot re-
restore from the original backup, treat it as a generic corruption and try
the [`.recover` rebuild recipe above](#recovery-recover-rebuild) —
`.recover` works regardless of the corruption mode and is your best chance
of pulling rows out of a partially-flushed file.

---

## Other "the DB just won't open" situations

If `.recover` cannot help — for example, the file is truncated or the
underlying disk has bad sectors — the next line of defense is your most
recent pre-import backup or scheduled backup. AmmoLedger writes one
automatically before every import (see `docs/INSTALL.md` → Backups), and
manual backups live in the same directory. Restoring one of those through
the regular **Admin → Backups → Restore** UI is always safer than hand-
editing the database.
