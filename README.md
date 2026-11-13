<div align="center">

<img src="./.github/assets/obsidian-banner.svg" alt="Obsidian Telemetry Animated Banner" width="100%" />

<br />
<br />

```
[ CLI: ot ] ── [ Node.js + Express + ws ] ── [ React 19 ] ── [ Kubernetes + Prometheus ] ── [ MIT ]
```

**Cross-platform self-hosted infrastructure observability, Kubernetes cluster telemetry, and RBAC-guarded operations console.**

[Installation](#installation) · [CLI Usage](#cli-usage) · [Architecture](#architecture) · [Persistence](#persistent-storage) · [Security Model](#security-model) · [Configuration](#configuration) · [Deployment](#deployment) · [Testing](#testing)

</div>

---

## Overview

**Obsidian Telemetry** is an open-source, self-hosted Kubernetes and Prometheus observability platform distributed as both an npm CLI package (`obsidian-telemetry`) and standalone source project.

A single `ot` command launches the production web dashboard and WebSocket backend on port `1392` (`0.0.0.0:1392`) without requiring Docker, systemd, PM2, or cloud hosting. All cluster credentials, local `scrypt` authentication hashes, incident triage overlays, and JSONL audit trails remain on the host server.

<div align="center">
  <img src="./.github/assets/telemetry-pulse.svg" alt="Animated Telemetry Sparkline Strip" width="100%" />
</div>

---

## Installation

### Prerequisites

- **Node.js `>= 20.0.0`** (includes `npm`)
- Supported platforms: **Linux** (x64, arm64), **macOS** (Intel & Apple Silicon), **Windows 10/11/Server**

### Option A: Install via npm (Linux, macOS, Windows)

```bash
npm install -g obsidian-telemetry
```

After installation, start the service from any directory:

```bash
ot
```

### Option B: Install Script for Linux & macOS

```bash
curl -fsSL https://raw.githubusercontent.com/devlopergit04/Obsidian-Telemetry/main/install.sh | sh
```

The installer verifies OS/architecture compatibility and Node.js `>= 20`, installs `obsidian-telemetry` into `~/.local/share/obsidian-telemetry/npm` without modifying system directories or requiring root privileges, links `~/.local/bin/ot`, and verifies `ot --version`.

### Option C: Install Script for Windows (PowerShell)

Windows CMD and PowerShell do not execute POSIX shell scripts natively. Use the official PowerShell installer in Windows PowerShell or PowerShell 7:

```powershell
irm https://raw.githubusercontent.com/devlopergit04/Obsidian-Telemetry/main/install.ps1 | iex
```

Or download and run locally:

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/devlopergit04/Obsidian-Telemetry/main/install.ps1 -OutFile install.ps1
.\install.ps1
```

---

## CLI Usage

The primary CLI executable is `ot`.

### Startup Output

Running `ot` (or `ot start`) starts the background service on `0.0.0.0:1392` by default and prints the access details:

```text
Obsidian Telemetry

Status: Running
PID: 48210
Host: 0.0.0.0
Port: 1392

Dashboard: http://localhost:1392
Auth Mode: token

Initial Administrator Credentials (shown once):
  Username: admin
  Password: <generated-once-on-first-boot>
```

On another machine on your local network or VPS, open:

```text
http://SERVER-IP:1392
```

### Commands

| Command        | Description                                                                          |
| :------------- | :----------------------------------------------------------------------------------- |
| `ot`           | Start Obsidian Telemetry on the configured host/port (default `0.0.0.0:1392`).       |
| `ot start`     | Explicitly start the background service.                                             |
| `ot stop`      | Gracefully stop the running Obsidian Telemetry service (`SIGTERM`).                  |
| `ot restart`   | Stop and cleanly restart Obsidian Telemetry.                                         |
| `ot status`    | Report whether the backend is running, its PID, bound host/port, and dashboard URL.  |
| `ot update`    | Update `obsidian-telemetry` to the latest release and restart if previously running. |
| `ot uninstall` | Stop the service and remove Obsidian Telemetry managed files after confirmation.     |

### Options

| Flag                | Description                                                                                                     |
| :------------------ | :-------------------------------------------------------------------------------------------------------------- |
| `-p, --port <port>` | Override HTTP listening port (default `1392`, or `OT_PORT`). Port conflicts fail fast without silent switching. |
| `-H, --host <host>` | Override bind interface (default `0.0.0.0`, or `OT_HOST`).                                                      |
| `-f, --foreground`  | Attach process logs directly to the current terminal instead of daemonizing.                                    |
| `-y, --yes`         | Skip interactive confirmation for `ot uninstall`.                                                               |
| `-v, --version`     | Display installed package version.                                                                              |
| `-h, --help`        | Show CLI usage help.                                                                                            |

---

## Persistent Storage

Obsidian Telemetry stores persistent runtime data in platform-standard locations (override anytime with `OT_HOME`):

| Platform    | Configuration & Credentials                               | Runtime State, Audit Log, PID & Logs               |
| :---------- | :-------------------------------------------------------- | :------------------------------------------------- |
| **Linux**   | `~/.config/obsidian-telemetry`                            | `~/.local/share/obsidian-telemetry`                |
| **macOS**   | `~/Library/Application Support/Obsidian Telemetry/config` | `~/Library/Application Support/Obsidian Telemetry` |
| **Windows** | `%APPDATA%\Obsidian Telemetry`                            | `%LOCALAPPDATA%\Obsidian Telemetry`                |

Managed files:

- `credentials.json` (`0600` on POSIX) — persistent 256-bit HMAC session secret and salted `scrypt` password hashes.
- `config.json` — optional persisted server defaults.
- `state.json` — persistent operator incident acknowledgements and local triage state.
- `audit.jsonl` — append-only JSONL audit log for logins, denials, WebSocket streams, and cluster operations.
- `obsidian.pid` — active process metadata (`pid`, `host`, `port`, `startedAt`, `version`).
- `logs/server.log` — background daemon output log.

JSON state files include `schemaVersion` metadata and create `.bak` backups automatically before schema upgrades.

---

## Architecture

```
Browser (React 19 + Tailwind)
   │  REST (/api/*) + HttpOnly Cookie Auth + CSRF + WebSocket (/ws/logs, /ws/exec)
   ▼
Obsidian Telemetry CLI & Server (dist-server/src/cli/ot.js -> dist-server/server.js)
   ├── Platform & StateStore       (Cross-platform paths, scrypt users, state.json, audit.jsonl)
   ├── Auth & CSRF Middleware      (HMAC-SHA256 cookies, timing-safe tokens, X-CSRF-Token)
   ├── KubernetesService           (@kubernetes/client-node v2, SelfSubjectAccessReview)
   ├── PrometheusService           (/api/v1/query, query_range, rules, buildinfo)
   ├── IncidentService             (Persistent alert triage merged with live cluster signals)
   ├── DemoProvider                (Isolated opt-in synthetic mode when mode=demo)
   └── WebSocket Hub (wsHub.ts)    (Origin-checked live pod logs & admin-gated exec)
```

<div align="center">
  <img src="./.github/assets/architecture-flow.svg" alt="Animated System Architecture Diagram" width="100%" />
</div>

### Core Views (`01` - `06`)

| Index | View                   | Capabilities                                                                                                                                                                                                                       |
| :---- | :--------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01`  | **Cluster Overview**   | Disconnected configuration guide when unlinked; 4-column Prometheus telemetry strip (`CPU`, `Memory`, `Network Mbps`, `P99 Latency`); interactive SVG time-series chart (`15m`, `1h`, `6h`, `24h`); live node health matrix.       |
| `02`  | **Nodes & Workloads**  | Search and namespace/status filtering; expandable node rows with scheduled pods; Deployment scale and rollout restart; Node `Cordon`/`Uncordon`, PDB-checked `Drain`, and `Delete Pod` gated behind confirmation dialogs and RBAC. |
| `03`  | **Container Logs**     | Namespace, pod, container, and tail-line (`100`/`250`/`500`) retrieval, live `/ws/logs` WebSocket streaming, substring/RegExp line filtering, and `.log` export.                                                                   |
| `04`  | **Services & Ingress** | Live Kubernetes `Service` and `Ingress` inventory with interactive SVG routing graph and Service inspection.                                                                                                                       |
| `05`  | **Incidents & PromQL** | Combines Prometheus firing/pending alerts, Warning Kubernetes events, and unhealthy pod/node states; persistent operator `Acknowledge` / `Mark Triaged` actions; interactive PromQL explorer and alerting rules table.             |
| `06`  | **Audit Trail**        | Searchable audit view backed by persistent `audit.jsonl` recording authentication events, RBAC/CSRF rejections, WebSocket streams, and cluster operations.                                                                         |

---

## Security Model

- **Authenticated by Default in Production & CLI Mode**: `ot` defaults `AUTH_MODE=token`, automatically generating a random initial password for the `admin` account stored exclusively as a salted `scrypt` hash (`credentials.json`, mode `0600`). Passwords can be updated inside the **Session & RBAC Authentication** dialog.
- **Role-Based Access Control**: Supports both local user accounts (`username` + `password`) and static bearer tokens (`OBSIDIAN_ADMIN_TOKEN`, `OBSIDIAN_OPERATOR_TOKEN`, `OBSIDIAN_VIEWER_TOKEN`) validated via `crypto.timingSafeEqual`.
- **HttpOnly Cookies & CSRF Protection**: Logins set an `HttpOnly`, `SameSite=Strict` HMAC-SHA256 signed session cookie (automatically marking `Secure` on HTTPS or TLS-terminated `X-Forwarded-Proto: https`, while functioning cleanly on local/LAN HTTP `http://SERVER-IP:1392`). Cookie-authenticated `POST`/`DELETE` mutations require an in-memory `X-CSRF-Token` header verified via HMAC.
- **WebSocket Protection**: Upgrade handshakes verify `Origin` headers against the request host or `CORS_ORIGIN` allowlist and enforce token/session authentication before opening log or exec streams.
- **Safe Operational Guardrails**: `ENABLE_POD_EXEC` is `false` by default, demo mode blocks all mutations (`400 Bad Request`), and Express enforces `helmet`, strict CORS, `64kb` JSON limits, `express-rate-limit` (RFC 7239 `Forwarded` / `X-Forwarded-For` aware), and `zod` input validation.

---

## Configuration

| Variable                  | Default                           | Description                                                                         |
| :------------------------ | :-------------------------------- | :---------------------------------------------------------------------------------- |
| `OT_HOST`                 | `0.0.0.0`                         | Listening network interface (`HOST` supported as fallback).                         |
| `OT_PORT`                 | `1392`                            | HTTP and WebSocket port (`PORT` supported as fallback).                             |
| `OT_HOME`                 | Platform default                  | Custom base directory for config, credentials, audit log, PID, and logs.            |
| `OT_ADMIN_PASSWORD`       | Generated once                    | Pre-seed initial `admin` password on first bootstrap for automated installs.        |
| `CORS_ORIGIN`             | Same-host dynamic                 | Comma-separated explicit allowed browser origins.                                   |
| `AUTH_MODE`               | `token` (prod) / `optional` (dev) | Enforce authentication (`token`) or allow anonymous read-only viewing (`optional`). |
| `SESSION_SECRET`          | Persisted 256-bit secret          | Override HMAC session signing key.                                                  |
| `OBSIDIAN_ADMIN_TOKEN`    | unset                             | Optional static bearer/login token for `admin`.                                     |
| `OBSIDIAN_OPERATOR_TOKEN` | unset                             | Optional static bearer/login token for `operator`.                                  |
| `OBSIDIAN_VIEWER_TOKEN`   | unset                             | Optional static bearer/login token for `viewer`.                                    |
| `KUBE_MODE`               | `auto`                            | `auto`, `kubeconfig`, `incluster`, `token`, or `disabled`.                          |
| `KUBECONFIG_PATH`         | `~/.kube/config`                  | Custom kubeconfig path.                                                             |
| `KUBE_CONTEXT`            | current context                   | Default kubeconfig context name.                                                    |
| `K8S_API_SERVER`          | unset                             | API server URL for `token` mode.                                                    |
| `K8S_BEARER_TOKEN`        | unset                             | ServiceAccount bearer token for `token` mode.                                       |
| `PROMETHEUS_URL`          | unset                             | Base Prometheus HTTP URL (e.g. `http://localhost:9090`).                            |
| `ENABLE_POD_EXEC`         | `false`                           | Enables `/ws/exec` for authenticated `admin` accounts when `true`.                  |
| `ENABLE_DEMO_MODE`        | `true`                            | Allows explicitly switching to synthetic demo mode when disconnected.               |

---

## Deployment

### Source Build & Local Execution

```bash
git clone https://github.com/devlopergit04/Obsidian-Telemetry.git
cd Obsidian-Telemetry
npm install
npm run build
node dist-server/cli/ot.js
```

For hot-reload frontend development:

```bash
npm run dev
```

### Docker Compose (App + Prometheus)

```bash
docker compose up --build
```

Starts Prometheus on `http://localhost:9090` and Obsidian Telemetry on `http://localhost:1392` with persistent container state in the `obsidian_state` volume.

### Kubernetes In-Cluster Deployment

```bash
kubectl create namespace observability
kubectl create secret generic obsidian-telemetry-secrets \
  -n observability \
  --from-literal=session-secret="$(openssl rand -hex 32)" \
  --from-literal=admin-token="$(openssl rand -hex 24)" \
  --from-literal=operator-token="$(openssl rand -hex 24)"

kubectl apply -f deploy/kubernetes/rbac.yaml
kubectl apply -f deploy/kubernetes/deployment.yaml
```

---

## Testing

```bash
npm run lint          # TypeScript strict type-check (tsc --noEmit)
npm run lint:code     # Oxlint static analysis (--deny-warnings)
npm run format:check  # Prettier formatting check
npm test              # Vitest unit, API integration, persistence, and UI tests
npm run build         # Production Vite frontend + compiled dist-server backend & CLI
```

---

## Known Limitations

- **Prometheus Query Names**: Built-in KPI series query standard `node_exporter` and HTTP histogram metrics (`node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`, `node_network_receive_bytes_total`, `http_requests_total`, `http_request_duration_seconds_bucket`). Missing series render `Unavailable` while custom queries work via the PromQL explorer.
- **Metrics Server Dependency**: Per-node and per-pod live CPU/memory metrics require Kubernetes `metrics-server` (`metrics.k8s.io/v1beta1`); otherwise inventory cells show `n/a`.
- **Single-Host Persistence**: State persistence (`state.json`, `audit.jsonl`, `credentials.json`) targets single-node self-hosted deployments rather than multi-replica shared database clusters.

---

## Contributing & License

Obsidian Telemetry is open-source software released under the [MIT License](./LICENSE).

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)
