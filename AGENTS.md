Firecrawl is a web scraper API. The directory you have access to is a monorepo:
 - `apps/api` has the actual API and worker code
 - `apps/*-sdk` are various SDKs

When making changes to the API, here are the general steps you should take:
1. Write some end-to-end tests that assert your win conditions, if they don't already exist
  - 1 happy path (more is encouraged if there are multiple happy paths with significantly different code paths taken)
  - 1+ failure path(s)
  - Generally, E2E (called `snips` in the API) is always preferred over unit testing.
  - In the API, always use `scrapeTimeout` from `./lib` to set the timeout you use for scrapes.
  - These tests will be ran on a variety of configurations. You should gate tests in the following manner:
    - If it requires fire-engine: `!process.env.TEST_SUITE_SELF_HOSTED`
    - If it requires AI: `!process.env.TEST_SUITE_SELF_HOSTED || process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL`
2. Write code to achieve your win conditions
3. Run your tests using `pnpm harness jest ...`
  - `pnpm harness` is a command that gets the API server and workers up for you to run the tests. Don't try to `pnpm start` manually.
  - The full test suite takes a long time to run, so you should try to only execute the relevant tests locally, and let CI run the full test suite.
4. Push to a branch, open a PR, and let CI run to verify your win condition.
Keep these steps in mind while building your TODO list.

## Cursor Cloud specific instructions

The dev environment (Docker, Redis, `libpq-dev`, the FoundationDB client lib, and Rust stable) is preinstalled in the VM snapshot. The startup script only refreshes Node deps (`pnpm install` in `apps/api`, which also rebuilds the `@mendable/firecrawl-rs` native module). The Go html→markdown shared lib and the TypeScript build are produced automatically by the harness at startup, so they are not part of the startup script.

Non-obvious caveats for running services here:
- `dockerd` and `redis-server` are NOT auto-started (no systemd in the container). Before running the harness, start both once per VM boot: `sudo dockerd` (e.g. in a tmux session) and `redis-server --port 6379`. The harness itself provisions the Postgres (`firecrawl-nuq-postgres`) and RabbitMQ (`firecrawl-nuq-rabbitmq`) containers via Docker, but it does NOT start Redis.
- Docker is configured for docker-in-docker with the `fuse-overlayfs` storage driver and `containerd-snapshotter` disabled (see `/etc/docker/daemon.json`); this combo is required on this kernel for Docker 29.
- Run the API for local dev with `pnpm dev` from `apps/api` (dev harness with auto-restart). `apps/api/.env` sets `REDIS_URL`, `USE_DB_AUTHENTICATION=false`, and intentionally leaves `NUQ_DATABASE_URL`/`NUQ_RABBITMQ_URL` unset so the harness manages those containers on `localhost:5432` / `localhost:5672`. The API listens on `http://localhost:3002`.
- Rust must be >= 1.85 (edition2024) for the native module; the snapshot's default toolchain is stable (1.96+). The README's `curl GET /test` route is outdated — use `/is-production` for a health check and `POST /v2/scrape` for a real request.
- This is a self-hosted setup (no fire-engine/cloud): run tests with `TEST_SUITE_SELF_HOSTED=true` so cloud-only snips are skipped. Some `snips` still assume fire-engine and will 400; that is an environment limitation, not a regression. Services must already be up (via `pnpm dev`) when running `pnpm exec vitest run <file>`.