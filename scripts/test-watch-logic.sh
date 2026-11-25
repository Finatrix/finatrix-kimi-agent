#!/bin/sh
# Compiles the watch app's UI-free logic and its checks on the Mac, then runs them.
# No simulator or watch needed. Used by CI-less local runs and by docs/WATCH.md.
set -e
cd "$(dirname "$0")/../ios/App/FinatriXWatch"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
swiftc -o "$out/check" WatchLogic.swift LogicTests/main.swift
"$out/check"
