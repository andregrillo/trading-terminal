#!/bin/sh
# Run ./start.sh to start Trade Terminal.
cd "$(dirname "$0")" && node scripts/launch.js "$@"
