#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
javac App.java
java App
