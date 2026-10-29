#!/bin/sh
# Double-click this on a Mac to start Trade Terminal.
cd "$(dirname "$0")" || exit 1
# Finder may not inherit the PATH from your usual shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node scripts/launch.js "$@"
