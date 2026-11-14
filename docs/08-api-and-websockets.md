# Chapter 08 — REST API & WebSocket Protocol Reference

[Previous: Chapter 07 — Kubernetes & Prometheus](./07-kubernetes-and-prometheus.md) · [Docs Index](./README.md) · [Next: Chapter 09 — Docker & Kubernetes Deployment](./09-deployment-containers-and-k8s.md)

---

## 23. Complete REST API Reference

All `/api/*` endpoints return `Cache-Control: no-store`, pass Helmet + CORS + `64kb` JSON parser + `express-rate-limit`, and validate inputs via Zod schemas.

### 23.1 Health & Authentication Routes

| Method & Path             | Min Role                  | Request Payload / Query                                          | Response / Status Codes                                                                                                                                                                                              |
| :------------------------ | :------------------------ | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`         | Public                    | none                                                             | `200 OK` `{ status: "ok", service: "obsidian-telemetry", timestamp, kubernetesMode, prometheusConfigured, demoModeEnabled, podExecEnabled }`                                                                         |
| `GET /api/auth/session`   | Public                    | Cookie or Bearer header                                          | `200 OK` `{ authenticated, authMode, role, actorId, podExecEnabled, demoModeEnabled, csrfToken? }`                                                                                                                   |
| `POST /api/auth/login`    | Public                    | `{ token }` OR `{ username, password }`                          | `200 OK` + sets `HttpOnly`, `SameSite=Strict` `obsidian_session` cookie + returns `{ ..., csrfToken }`; `401` invalid credentials; `429` + `Retry-After` after 5 consecutive failures per `IP:actor` or 30 req / 15m |
| `POST /api/auth/logout`   | Cookie / Public           | `X-CSRF-Token` if cookie-authenticated                           | `200 OK` `{ ok: true }` + clears cookie                                                                                                                                                                              |
| `POST /api/auth/password` | Authenticated (`viewer+`) | `{ currentPassword, newPassword (>= 8 chars) }` + `X-CSRF-Token` | `200 OK` `{ ok: true, csrfToken }` (rotates cookie & CSRF token); `401` wrong current password                                                                                                                       |

### 23.2 Telemetry, Kubernetes Discovery & Prometheus Routes

| Method & Path                                   | Min Role (`token` mode requires auth) | Parameters                                | Behavior & Status Codes                                                                  |
| :---------------------------------------------- | :------------------------------------ | :---------------------------------------- | :--------------------------------------------------------------------------------------- |
| `GET /api/clusters/snapshot`                    | `viewer`                              | `?mode=live                               | demo&context=<ctx>&window=15m                                                            | 1h                              | 6h                               | 24h`                                                              | `200 OK` full `ClusterSnapshot`; `403` if `mode=demo` while `ENABLE_DEMO_MODE=false` |
| `POST /api/prometheus/query`                    | `viewer`                              | `{ query: string (1..1024) }`             | `200 OK` PromQL result; `400` invalid query; `502` upstream Prometheus unavailable/error |
| `GET /api/namespaces/:namespace/pods/:pod/logs` | `viewer`                              | `?container=&tailLines=10..1000&mode=live | demo&context=`                                                                           | `200 OK` `{ sourceMode, logs }` |
| `GET /api/manifests/:kind/:name`                | `viewer`                              | `:kind` in `node                          | pod                                                                                      | deployment                      | service`, `?namespace=&context=` | `200 OK` `{ yaml }`; `404` resource not found; `503` disconnected |
| `GET /api/audit`                                | `viewer`                              | `?limit=1..250`                           | `200 OK` `{ entries: AuditEntry[] }` newest-first                                        |

### 23.3 Mutating Cluster & Incident Triage Routes

All routes below require **authenticated `operator` or `admin`**, valid **`X-CSRF-Token`** when cookie-authenticated, and reject `mode=demo` calls with `400 Bad Request`.

| Method & Path                                               | Min Role   | Payload / Params                     | Status Codes                                                                               |
| :---------------------------------------------------------- | :--------- | :----------------------------------- | :----------------------------------------------------------------------------------------- |
| `POST /api/nodes/:name/cordon`                              | `operator` | `?context=`                          | `200 OK` `{ ok: true, nodeName, unschedulable: true }`                                     |
| `POST /api/nodes/:name/uncordon`                            | `operator` | `?context=`                          | `200 OK` `{ ok: true, nodeName, unschedulable: false }`                                    |
| `POST /api/nodes/:name/drain`                               | `operator` | `?context=`                          | `200 OK` or `207 Multi-Status` `{ evicted, skipped, failed }`; `409` on PDB/capacity block |
| `DELETE /api/namespaces/:namespace/pods/:pod`               | `operator` | `?context=`                          | `200 OK` `{ ok: true, namespace, pod }`                                                    |
| `POST /api/namespaces/:namespace/deployments/:name/restart` | `operator` | `?context=`                          | `200 OK` `{ ok: true, namespace, name }`                                                   |
| `POST /api/namespaces/:namespace/deployments/:name/scale`   | `operator` | `{ replicas: 0..200 }` + `?context=` | `200 OK` `{ ok: true, namespace, name, replicas }`                                         |
| `POST /api/incidents/:id/acknowledge`                       | `operator` | Path `:id`                           | `200 OK` `{ ok: true, incidentId, acknowledged: true, ... }`                               |
| `POST /api/incidents/:id/resolve`                           | `operator` | Path `:id`                           | `200 OK` `{ ok: true, incidentId, resolvedLocally: true, ... }`                            |

---

## 24. WebSocket Protocol (`/ws/logs` & `/ws/exec`)

`src/server/services/wsHub.ts` handles HTTP `Upgrade` requests using `ws` (`noServer: true`).

### 24.1 Handshake Security Checks

1. Rejects unknown upgrade paths cleanly.
2. Validates `Origin` header against current `Host` or `CORS_ORIGIN` (`HTTP/1.1 403 Forbidden`).
3. Extracts `Authorization: Bearer ...` or `obsidian_session` cookie; in `AUTH_MODE=token`, unauthenticated handshakes terminate immediately with `HTTP/1.1 401 Unauthorized`.
4. Validates `namespace` and `pod` query parameters against Kubernetes DNS label regex `/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/` (closes `1008 Invalid parameters` otherwise).

### 24.2 `/ws/logs` Message Frames

**Query**: `ws(s)://host:1392/ws/logs?namespace=<ns>&pod=<pod>&container=<c>&context=<ctx>`

Server -> Client JSON messages:

- `{ "type": "log", "data": "<timestamped log chunk>" }`
- `{ "type": "error", "message": "<reason>" }` (followed by close code `1011`)

### 24.3 `/ws/exec` Message Frames (Strict Admin + Opt-In)

**Query**: `ws(s)://host:1392/ws/exec?namespace=<ns>&pod=<pod>&container=<c>&context=<ctx>`

Requires BOTH `ENABLE_POD_EXEC=true` AND `auth.role === 'admin'`; otherwise denies with audit entry (`WS_POD_EXEC` `denied`) and closes `1008`. Automatically terminates at `EXEC_TIMEOUT_MS` (default `300000ms` = 5 minutes).

- **Client -> Server**: `{ "type": "stdin", "data": "<command or keystrokes>" }`
- **Server -> Client**: `{ "type": "stdout", "data": "..." }`, `{ "type": "stderr", "data": "..." }`, `{ "type": "status", "status": ... }`, `{ "type": "error", "message": "..." }`

---

[Previous: Chapter 07 — Kubernetes & Prometheus](./07-kubernetes-and-prometheus.md) · [Docs Index](./README.md) · [Next: Chapter 09 — Docker & Kubernetes Deployment](./09-deployment-containers-and-k8s.md)
