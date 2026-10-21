#!/usr/bin/env bash
# Starts what both arms test against, the way upstream's nightly does it
# (.github/scripts/run-nightly-e2e.sh at 9af1cb0b, kept in this repo):
# - the dev-env mock backend: PostgreSQL :5433, Redis :6380 and the fixture
#   manager :1986 (the PDS :3000 comes up on the first fixture POST).
#   Linux: `pnpm --dir dev-env start` (docker compose dev-env/dev-infra).
#   macOS (no Docker on GitHub's macOS runners): brew postgresql@14 and Redis
#   7.4.7 built from source, then `pnpm --dir dev-env start:external`.
# - Metro on 8081 with the e2e profile's env, pre-warmed for the platform.
# This is setup, not suite time: each step's seconds go to out/steps.txt.
# Usage: services.sh <android|ios>
set -euo pipefail

platform="${1:?usage: services.sh <android|ios>}"
OUT="$PWD/out"
mkdir -p "$OUT"
now() { python3 -c 'import time; print(time.time())'; }
since() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }

wait_for_port() {
  local port="$1" label="$2" attempts="${3:-300}"
  for ((i = 1; i <= attempts; i++)); do
    if nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for $label on port $port" >&2
  tail -n 80 "$OUT"/*.log >&2 || true
  return 1
}

t=$(now)
if [ "$platform" = ios ]; then
  brew install postgresql@14 > "$OUT/native-dependencies.log" 2>&1
  postgres_bin="$(brew --prefix postgresql@14)/bin"
  redis_version=7.4.7
  tmp="${RUNNER_TEMP:-/tmp}"
  curl -fsSL -o "$tmp/redis.tar.gz" "https://download.redis.io/releases/redis-${redis_version}.tar.gz"
  echo "c97e57b0df330a9e091cacff012bebe763c275398cf36ff44cdba876814b595b  $tmp/redis.tar.gz" | shasum -a 256 --check
  tar -xzf "$tmp/redis.tar.gz" -C "$tmp"
  make -C "$tmp/redis-${redis_version}" -j "$(sysctl -n hw.ncpu)" >> "$OUT/native-dependencies.log" 2>&1
  redis_bin="$tmp/redis-${redis_version}/src"

  rm -rf "$tmp/bench-postgres"
  "$postgres_bin/initdb" -D "$tmp/bench-postgres" --auth=trust --username=pg --no-locale > "$OUT/postgres-init.log" 2>&1
  "$postgres_bin/pg_ctl" -D "$tmp/bench-postgres" -o "-p 5433 -h 127.0.0.1" -l "$OUT/postgres.log" start
  "$redis_bin/redis-server" --bind 127.0.0.1 --port 6380 --save "" --appendonly no \
    --daemonize yes --pidfile "$OUT/redis.pid" --logfile "$OUT/redis.log"
  wait_for_port 5433 PostgreSQL
  wait_for_port 6380 Redis
  nohup pnpm --dir dev-env start:external > "$OUT/mock-server.log" 2>&1 &
else
  nohup pnpm --dir dev-env start > "$OUT/mock-server.log" 2>&1 &
fi
wait_for_port 1986 "the mock-server manager"
echo "backend_s=$(since "$t")" >> "$OUT/steps.txt"

t=$(now)
EXPO_PUBLIC_ENV=e2e NODE_ENV=development RN_SRC_EXT=e2e.ts,e2e.tsx \
  nohup pnpm exec expo start --dev-client --clear --port 8081 > "$OUT/metro.log" 2>&1 &
wait_for_port 8081 Metro
curl -fsS -o /dev/null --max-time 900 "http://localhost:8081/index.bundle?platform=${platform}&dev=true&minify=false"
echo "metro_prewarm_s=$(since "$t")" >> "$OUT/steps.txt"
cat "$OUT/steps.txt"
