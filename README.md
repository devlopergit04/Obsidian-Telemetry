<div align="center">

<img src="./.github/assets/obsidian-banner.svg" alt="Obsidian Telemetry Animated Banner" width="100%" />

<br />
<br />

```
[ React 19 ] ── [ Express 4 + ws ] ── [ @kubernetes/client-node ] ── [ Prometheus HTTP ] ── [ License: MIT ]
```

**Full-stack Kubernetes cluster observability, Prometheus metrics, and RBAC-guarded operations console.**

[Architecture](#architecture) · [Implemented Features](#implemented-features) · [Security Model](#security-model) · [Configuration](#configuration) · [Quick Start](#quick-start) · [Deployment](#deployment) · [Testing](#testing) · [Known Limitations](#known-limitations)

</div>

---

## Overview

**Obsidian Telemetry** is an open-source Kubernetes and Prometheus observability platform built with a **Node.js + Express + WebSocket** backend and a **React + TypeScript + Tailwind CSS** frontend.

The backend separates cluster credentials from the browser, communicates directly with Kubernetes API servers via `@kubernetes/client-node` and Prometheus HTTP APIs, enforces role-based access control (`viewer`, `operator`, `admin`), records audit events, and explicitly distinguishes **Live Infrastructure**, **Disconnected** states, and an opt-in **Demo Sandbox** mode.

<div align="center">
  <img src="./.github/assets/telemetry-pulse.svg" alt="Animated Telemetry Sparkline Strip" width="100%" />
</div>

---

## Architecture

```
Browser (React 19 + Vite)
   │  REST (/api/*) + HttpOnly Cookie Auth + WebSocket (/ws/logs, /ws/exec)
   ▼
Node.js / Express Server (server.ts, src/server/*)
   ├── Config & Auth Middleware    (Zod validation, timing-safe tokens, HMAC-SHA256 cookies)
   ├── AuditLogger                 (In-memory bounded ring buffer for auth & mutations)
   ├── KubernetesService           (@kubernetes/client-node v2, SelfSubjectAccessReview)
   ├── PrometheusService           (/api/v1/query, query_range, rules, buildinfo)
   ├── IncidentService             (Alert & pod-health ingestion + operator triage state)
   ├── DemoProvider                (Isolated synthetic dataset when mode=demo)
   └── WebSocket Hub (wsHub.ts)    (Live pod log tailing & gated pod exec)
```

<div align="center">
  <img src="./.github/assets/architecture-flow.svg" alt="Animated System Architecture Diagram" width="100%" />
</div>

### Repository Layout

```
obsidian-telemetry/
├── .github/
│   ├── assets/                        # Animated SVG banners & architecture diagram
│   └── workflows/ci.yml               # GitHub Actions verification pipeline
├── deploy/
│   ├── kubernetes/
│   │   ├── rbac.yaml                  # Least-privilege ServiceAccount & ClusterRole
│   │   └── deployment.yaml            # Hardened non-root in-cluster Deployment
│   └── prometheus/prometheus.yml      # Baseline Prometheus config for Compose
├── src/
│   ├── api/client.ts                  # Typed REST client with cookie credentials
│   ├── components/                    # 6 observability screens + inspector & modals
│   ├── server/
│   │   ├── middleware/auth.ts         # Timing-safe token checks, HMAC cookies, RBAC
│   │   ├── services/                  # k8s, Prometheus, WebSocket, Audit, Incident, Demo
│   │   ├── app.ts                     # Express application factory & Zod schemas
│   │   └── config.ts                  # Zod environment variable loader
│   └── shared/types.ts                # Shared frontend/backend TypeScript contracts
├── tests/                             # Vitest unit, supertest API, and RTL UI tests
├── Dockerfile                         # Multi-stage non-root Node 22 container image
├── docker-compose.yml                 # App + Prometheus local stack
├── server.ts                          # Production/development HTTP + WS server entrypoint
└── package.json
```

---

## Implemented Features

### Core Views (`01` - `06`)

| Index | View                   | Verified Capabilities                                                                                                                                                                                                                                                        |
| :---- | :--------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01`  | **Cluster Overview**   | Explicit disconnected instructions when unconfigured; 4-column telemetry KPI strip (`CPU`, `Memory`, `Network Mbps`, `P99 Latency`) backed by Prometheus; interactive SVG time-series chart (`15m`, `1h`, `6h`, `24h`); live node matrix.                                    |
| `02`  | **Nodes & Workloads**  | Real-time search and namespace/status filters; expandable node rows showing scheduled pods; Deployment scale and rollout restart; Node `Cordon`/`Uncordon`, PDB-checked `Drain`, and `Delete Pod` gated behind confirmation modals and RBAC.                                 |
| `03`  | **Container Logs**     | Namespace, pod, container, and tail-line (`100`/`250`/`500`) selectors calling the Kubernetes Pod Log API, optional live WebSocket `/ws/logs` tailing in live mode, substring/RegExp line filtering, and `.log` export.                                                      |
| `04`  | **Services & Ingress** | Live Kubernetes `Service` and `Ingress` inventory with an SVG routing graph linking Ingress rules to target Services and clickable Service inspection.                                                                                                                       |
| `05`  | **Incidents & PromQL** | Combines Prometheus firing/pending alerts, Warning Kubernetes events, and unhealthy pod/node conditions; operator `Acknowledge` and local `Mark Triaged` actions; interactive PromQL instant query explorer (`POST /api/prometheus/query`); Prometheus alerting rules table. |
| `06`  | **Audit Trail**        | Searchable view of server-recorded authentication outcomes, RBAC denials, WebSocket sessions, and Kubernetes mutation history (`GET /api/audit`).                                                                                                                            |

### Contextual Inspector & Safety Controls

- **Persistent 360px Inspector (`TelemetryDrawer`)**: Inspects live node conditions, pod container states/exit codes, deployment strategies, service ClusterIPs, Kubernetes Events, and raw Kubernetes YAML (`GET /api/manifests/:kind/:name`).
- **Explicit Confirmation Modals (`ConfirmActionModal`)**: All mutating operations require interactive confirmation summarizing the exact Kubernetes target before issuing requests.
- **Explicit Data Source Separation**: Top bar displays `LIVE INFRA`, `DISCONNECTED`, or `DEMO DATA`, alongside a non-dismissible amber banner whenever synthetic demo data is active. Cluster mutations return `400 Bad Request` if attempted in demo mode.

---

## Security Model

- **Server-Side Cluster Credentials**: Kubernetes kubeconfigs, service account tokens, and Prometheus bearer tokens remain exclusively on the backend.
- **Authentication & RBAC (`AUTH_MODE=token` or `optional`)**:
  - `viewer`: Read-only snapshot, logs, manifests, PromQL queries, and audit trail access.
  - `operator`: Node cordon/uncordon/drain, pod deletion, deployment scale/restart, and incident triage.
  - `admin`: Required for WebSocket pod exec (`/ws/exec`).
  - Tokens are validated using `crypto.timingSafeEqual` and exchanged at `POST /api/auth/login` for an HMAC-SHA256 signed, `HttpOnly`, `SameSite=Strict` session cookie (never stored in `localStorage`).
- **Gated Pod Exec (`ENABLE_POD_EXEC=false` by default)**: Disabled by default. Requires `ENABLE_POD_EXEC=true`, an authenticated `admin` session, Kubernetes `pods/exec` RBAC permission, and enforces a configurable idle/session timeout (`EXEC_TIMEOUT_MS`).
- **HTTP Hardening**: `helmet`, strict `CORS_ORIGIN` allowlist checks, `64kb` JSON payload cap, `express-rate-limit` on `/api/*`, and `zod` schema validation on Kubernetes identifiers, replica bounds (`0..200`), and PromQL queries.
- **Least-Privilege Kubernetes RBAC**: Provided manifests in `deploy/kubernetes/rbac.yaml` grant scoped read access plus explicit node/pod/deployment operational verbs without `cluster-admin`.

---

## Configuration

Copy `.env.example` to `.env` and configure for your environment:

| Variable                  | Default                 | Description                                                                               |
| :------------------------ | :---------------------- | :---------------------------------------------------------------------------------------- |
| `PORT`                    | `3000`                  | HTTP and WebSocket listening port.                                                        |
| `CORS_ORIGIN`             | `http://localhost:3000` | Comma-separated allowed browser origins.                                                  |
| `AUTH_MODE`               | `optional`              | Set `token` in production to require authentication on all `/api/*` and `/ws/*` routes.   |
| `SESSION_SECRET`          | random per boot         | 32+ byte secret for HMAC-SHA256 session cookies (required across restarts in production). |
| `OBSIDIAN_ADMIN_TOKEN`    | unset                   | Bearer/login token for `admin` role.                                                      |
| `OBSIDIAN_OPERATOR_TOKEN` | unset                   | Bearer/login token for `operator` role.                                                   |
| `OBSIDIAN_VIEWER_TOKEN`   | unset                   | Bearer/login token for `viewer` role.                                                     |
| `KUBE_MODE`               | `auto`                  | `auto`, `kubeconfig`, `incluster`, `token`, or `disabled`.                                |
| `KUBECONFIG_PATH`         | `~/.kube/config`        | Path to kubeconfig file when using `kubeconfig` mode.                                     |
| `KUBE_CONTEXT`            | current context         | Optional default kubeconfig context name.                                                 |
| `K8S_API_SERVER`          | unset                   | API server URL for `token` mode.                                                          |
| `K8S_BEARER_TOKEN`        | unset                   | ServiceAccount bearer token for `token` mode.                                             |
| `PROMETHEUS_URL`          | unset                   | Base Prometheus HTTP URL (e.g. `http://localhost:9090`).                                  |
| `ENABLE_POD_EXEC`         | `false`                 | Enables `/ws/exec` for authenticated `admin` users when `true`.                           |
| `ENABLE_DEMO_MODE`        | `true`                  | Allows `?mode=demo` synthetic sandbox exploration (`false` recommended in production).    |

---

## Quick Start

### Prerequisites

- Node.js `>= 22.x`
- npm `>= 10.x`

### Local Development

```bash
git clone https://github.com/your-username/obsidian-telemetry.git
cd obsidian-telemetry
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`. If no Kubernetes cluster or Prometheus server is configured, the UI opens in **Disconnected** mode and lets you either configure credentials in `.env` or load the clearly labeled **Demo Sandbox** (when `ENABLE_DEMO_MODE=true`).

### Production Build & Execution

```bash
npm run build
NODE_ENV=production AUTH_MODE=token npm start
```

---

## Deployment

### Docker Compose (App + Prometheus)

```bash
docker compose up --build
```

Starts Prometheus on port `9090` and Obsidian Telemetry on port `3000`.

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

The test suite runs with Vitest, Supertest, and React Testing Library (`jsdom`):

```bash
npm run lint          # TypeScript strict type-check (tsc --noEmit)
npm run lint:code     # Oxlint static analysis (--deny-warnings)
npm run format:check  # Prettier formatting verification
npm test              # Backend unit, API integration, and frontend component tests
npm run build         # Production Vite bundle build
```

---

## Known Limitations

- **Ephemeral Audit & Triage State**: `AuditLogger` uses an in-memory bounded ring buffer (default 500 entries) and `IncidentService` stores local operator acknowledgments in process memory. Restarting the server resets those overlays.
- **Prometheus Query Assumptions**: Overview KPI charts use standard `node_exporter` and HTTP histogram metric names (`node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`, `node_network_receive_bytes_total`, `http_requests_total`, `http_request_duration_seconds_bucket`). Clusters using different exporters will show `Unavailable` for missing series while still supporting arbitrary queries in the PromQL explorer.
- **Node/Pod Metrics**: Per-node and per-pod real-time CPU/memory utilization in the inventory requires Kubernetes `metrics-server` (`metrics.k8s.io/v1beta1`); otherwise the UI displays `n/a` / `Unavailable` instead of estimating values.
- **Live Cluster E2E Scope**: Automated tests exercise the backend services, Express REST/RBAC/Zod layers, and React components using mocked HTTP/service boundaries rather than a live multi-node Kubernetes cluster.

---

## Roadmap (Planned / Not Yet Implemented)

- Persistent audit log and incident triage storage backend (SQLite / PostgreSQL).
- OIDC / OAuth2 SSO integration alongside token authentication.
- Multi-cluster Prometheus federation and custom dashboard query templates.
- Alertmanager silence creation directly from the Incident console.

---

## Contributing & Security

Obsidian Telemetry is open-source software licensed under the [MIT License](./LICENSE).

- See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.
- See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community standards.
- Report vulnerabilities privately following [SECURITY.md](./SECURITY.md).
