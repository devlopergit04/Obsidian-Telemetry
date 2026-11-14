# Chapter 12 — Scaling Limits, Known Limitations, Troubleshooting & FAQ

[Previous: Chapter 11 — Testing, CI & Standards](./11-testing-and-ci.md) · [Docs Index](./README.md) · [Next: Chapter 13 — Contributing, Governance & Roadmap](./13-governance-contributing-and-roadmap.md)

---

## 33. Performance & Scaling Limits

| Dimension                   | Current Bound / Design Limit                                                   | Reason                                                                                                          |
| :-------------------------- | :----------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| **API JSON Body**           | `64 KiB` (`express.json({ limit: '64kb' })`)                                   | Prevents memory exhaustion payloads while accommodating PromQL queries and auth payloads.                       |
| **Audit Log Ring**          | `2,500` lines in `audit.jsonl` (max `250` returned per `/api/audit` query)     | Keeps single-host JSONL reads deterministic in sub-millisecond time.                                            |
| **Daemon Log File**         | `5 MiB` per file (`server.log`, `.1`, `.2`, `.3`)                              | `rotateLogIfNeededSync` caps background daemon disk usage around `~20 MiB`.                                     |
| **Rate Limit Defaults**     | `240` API req/min per IP; `30` auth req/15m; `5` login fails -> `60s` lockout  | Prevents credential stuffing and UI polling storms.                                                             |
| **Kubernetes API Timeout**  | `10,000 ms` per cluster snapshot / manifest / log snapshot                     | Avoids hung event loops against overloaded API servers.                                                         |
| **Single-Host Concurrency** | Designed for 1–25 concurrent operators & clusters up to ~500 Pods per snapshot | Uses single-process Node.js event loop and local filesystem JSON persistence rather than multi-node PostgreSQL. |

---

## 34. Known Limitations & Real-World Boundaries

1. **Single-Host Local Persistence**: `state.json`, `credentials.json`, and `audit.jsonl` live on local host disk (or single `ReadWriteOnce` PVC in Kubernetes). Running multiple horizontally scaled replicas against separate volumes will not share session secrets or incident acknowledgements.
2. **Prometheus Metric Names**: Built-in KPI cards expect standard `node_exporter` (`node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`, `node_network_receive_bytes_total`) and HTTP histogram series (`http_request_duration_seconds_bucket`). Missing exporters render `Unavailable` cleanly while PromQL Explorer handles any metric schema.
3. **Kubernetes `metrics-server` Dependency**: Live CPU/memory consumption columns per Node and Pod require Kubernetes `metrics-server` (`metrics.k8s.io/v1beta1`); otherwise cells show `n/a`.
4. **Local Sandbox Verification Boundaries**: While cross-platform Node/path logic and CI workflows target Linux, macOS, and Windows natively, native Windows `.cmd` shim execution and macOS `launchd`/`Application Support` behavior are validated via the GitHub Actions native OS matrix rather than inside a Linux build container.

---

## 35. Troubleshooting Guide

### Problem: `Error: Port 1392 on 0.0.0.0 is already in use by another process`

- **Cause**: Another process (or stale service) already holds TCP `1392`.
- **Resolution**: Inspect what holds the port (`ss -tlnp | grep 1392` or `lsof -i :1392`), stop the conflicting service, or run `ot start --port 2392` / set `OT_PORT=2392`.

### Problem: `Invalid SESSION_SECRET in production: must be at least 32 characters and not a known placeholder`

- **Cause**: A template placeholder (`change-me-*`, `replace-with-*`, `secret`) or short string was passed to `SESSION_SECRET` while `NODE_ENV=production`.
- **Resolution**: Unset `SESSION_SECRET` (so `credentials.json` generates a secure 256-bit key automatically) or supply `SESSION_SECRET="$(openssl rand -hex 32)"`.

### Problem: Forgot `admin` Password After Initial Boot

- **Resolution**: On the host shell, run:
  ```bash
  ot passwd admin --password "NewStrongPassword123!"
  ```
  Or pass a new password interactively via `ot passwd admin`.

### Problem: Dashboard Shows `DISCONNECTED` Instead of Cluster Nodes

- **Cause**: No reachable kubeconfig/ServiceAccount (`KUBE_MODE`) or invalid `PROMETHEUS_URL`.
- **Resolution**: Verify `kubectl get nodes` works in the same shell/user context, confirm `KUBECONFIG_PATH`, check `PROMETHEUS_URL`, or toggle **Demo Cluster** (when `ENABLE_DEMO_MODE=true`) solely for UI inspection.

### Problem: `403 Invalid or missing CSRF token` or Cookie Not Persisting Over Reverse Proxy

- **Cause**: Reverse proxy stripped `Host`, `Origin`, or `X-Forwarded-Proto` headers, or browser domain does not match `CORS_ORIGIN`.
- **Resolution**: Verify Nginx/Caddy forwards `Host`, `X-Forwarded-Proto`, `X-Forwarded-For`, and WebSocket `Upgrade`/`Connection` headers per [Chapter 03](./03-reverse-proxy-tls-and-systemd.md), and set `CORS_ORIGIN=https://your-domain`.

---

## 36. Frequently Asked Questions (FAQ)

**Q: Does Obsidian Telemetry require Docker to install or run?**  
A: No. `npm install -g obsidian-telemetry && ot` runs directly on Node.js `>= 20` on Linux, macOS, and Windows. Docker is strictly optional.

**Q: Why does `ot` ask for a password by default instead of opening an unauthenticated dashboard?**  
A: Exposing cluster inventories or pod logs on `0.0.0.0:1392` without authentication is dangerous on shared LANs and VPS hosts. `ot` automatically enforces `AUTH_MODE=token` and generates a random initial password on first launch. You can intentionally relax local dev launches with `AUTH_MODE=optional`.

**Q: Can Obsidian Telemetry drain or delete my cluster resources silently in Demo Mode?**  
A: No. Every mutating endpoint invokes `rejectDemoMutation()` (`400 Bad Request`), and `KubernetesService` only executes real cluster writes when running in `live` mode with both `operator`/`admin` app role and upstream Kubernetes RBAC (`rbac-operator.yaml`).

**Q: Can `ot` run natively with `curl | sh` on Windows CMD?**  
A: No. Windows CMD and PowerShell do not execute POSIX shell scripts natively. Use `npm install -g obsidian-telemetry` or `install.ps1` in PowerShell as documented in [Chapter 01](./01-introduction-and-quickstart.md).

**Q: Does the application make calls to external AI services or telemetry phone-home servers?**  
A: No. Zero outbound phone-home, analytics, or external AI service calls exist anywhere in the codebase.

---

[Previous: Chapter 11 — Testing, CI & Standards](./11-testing-and-ci.md) · [Docs Index](./README.md) · [Next: Chapter 13 — Contributing, Governance & Roadmap](./13-governance-contributing-and-roadmap.md)
