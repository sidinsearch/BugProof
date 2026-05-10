#!/usr/bin/env bash
# Reproduce the hang. Use --timeout when capturing or this will run forever.
set -e
cd "$(dirname "$0")"
python3 app.py
