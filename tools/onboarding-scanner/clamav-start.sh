#!/bin/sh
set -eu
# Do not start the listener with an old snapshot while freshclam runs in parallel.
freshclam --config-file=/etc/clamav/armature-freshclam.conf --stdout
exec clamd --config-file=/etc/clamav/armature-clamd.conf --foreground
