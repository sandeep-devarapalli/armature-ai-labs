#!/bin/sh
set -eu
freshclam --config-file=/etc/clamav/armature-freshclam.conf --stdout
clamd --config-file=/etc/clamav/armature-clamd.conf --foreground &
scanner_pid=$!
freshclam --config-file=/etc/clamav/armature-freshclam.conf --daemon --foreground --checks=12 --stdout &
refresh_pid=$!
trap 'kill "$scanner_pid" "$refresh_pid" 2>/dev/null || true' EXIT HUP INT TERM
# Restart the revision if either essential worker exits; stale definitions never pass health.
wait -n "$scanner_pid" "$refresh_pid" || true
exit 1
