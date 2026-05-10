#!/usr/bin/env bash
# Reproduce the Node missing-module failure. Run with no args.
set -e
cd "$(dirname "$0")"
node app.js
