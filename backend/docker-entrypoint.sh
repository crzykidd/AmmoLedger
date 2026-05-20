#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# AmmoLedger backend entrypoint
#
# Honors PUID / PGID environment variables so the container writes to the
# mounted /data volume as a UID/GID of the operator's choosing. Defaults to
# 1000:1000 (matching the image's build-time appuser) for backward
# compatibility — existing deployments that don't set PUID/PGID see no
# change in behavior.
#
# This follows the common self-hosted convention (LinuxServer.io style):
#   - start as root
#   - remap the appuser's UID/GID to PUID/PGID
#   - fix ownership of /data
#   - drop privileges via gosu and exec the app
# ---------------------------------------------------------------------------

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Validate PUID/PGID are integers; fall back to 1000 with a warning if not.
if ! echo "$PUID" | grep -qE '^[0-9]+$'; then
    echo "WARNING: PUID='$PUID' is not a valid integer — falling back to 1000" >&2
    PUID=1000
fi
if ! echo "$PGID" | grep -qE '^[0-9]+$'; then
    echo "WARNING: PGID='$PGID' is not a valid integer — falling back to 1000" >&2
    PGID=1000
fi

# Adjust the appuser group's GID if it differs from PGID.
CURRENT_GID="$(getent group appuser | cut -d: -f3)"
if [ "$CURRENT_GID" != "$PGID" ]; then
    # If another group already owns PGID, use it; otherwise remap appuser's group.
    if getent group "$PGID" >/dev/null 2>&1; then
        EXISTING_GROUP="$(getent group "$PGID" | cut -d: -f1)"
        echo "Using existing group '$EXISTING_GROUP' for GID $PGID"
        usermod -g "$PGID" appuser
    else
        groupmod -g "$PGID" appuser
    fi
fi

# Adjust the appuser UID if it differs from PUID.
CURRENT_UID="$(id -u appuser)"
if [ "$CURRENT_UID" != "$PUID" ]; then
    usermod -u "$PUID" appuser
fi

# Ensure /data is owned by the (possibly remapped) appuser. This is what
# lets SQLite, backups, and uploads write successfully. Only chown if the
# current ownership doesn't already match, to avoid a slow recursive chown
# on every restart for large data dirs.
DATA_OWNER="$(stat -c '%u' /data 2>/dev/null || echo '')"
if [ "$DATA_OWNER" != "$PUID" ]; then
    echo "Adjusting /data ownership to ${PUID}:${PGID}..."
    chown -R "${PUID}:${PGID}" /data
fi

echo "Starting AmmoLedger backend as UID ${PUID} GID ${PGID}"

# Drop privileges to appuser and exec the app (PID 1 signal handling preserved)
exec gosu appuser "$@"
