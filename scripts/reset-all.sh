#!/usr/bin/env bash
# DEV ONLY. Deletes EVERY danmu and every seeding claim in the kia-danmu Firestore, so demo videos
# can be re-seeded from comments. Client rules forbid deletes, so this goes through the Firebase CLI.
set -euo pipefail
cd "$(dirname "$0")/.."
firebase firestore:delete danmu --recursive --force --project kia-danmu
firebase firestore:delete videos --recursive --force --project kia-danmu
