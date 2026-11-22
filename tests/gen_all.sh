#!/usr/bin/env bash
# Generate the synthetic test beams into tests/out and run the analysis on them.
set -e
cd "$(dirname "$0")/.."
mkdir -p tests/out
(cd tests && python3 gen_test.py out && python3 gen_typec.py out)
node tests/run_test.js tests/out/*.ies
