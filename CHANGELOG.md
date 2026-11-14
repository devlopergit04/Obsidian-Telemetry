# Changelog

All notable changes to Obsidian Telemetry are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-14

### Added

- Standalone cross-platform CLI (`ot`) published as `obsidian-telemetry` with `start`, `stop`, `restart`, `status`, `update`, `uninstall`, `backup`, `restore`, and `passwd` subcommands.
- Full-stack Node.js 20+ / Express / `ws` backend and React 19 + Tailwind CSS v4 observability console binding to `0.0.0.0:1392` by default.
- Live Kubernetes API integration (`@kubernetes/client-node`) supporting `kubeconfig`, `incluster`, bearer-token, and `disabled` modes, with multi-context switching, YAML manifest inspection, pod log tailing/WebSocket streaming, and gated `/ws/exec`.
- Safety-checked cluster mutations (node cordon/uncordon, PodDisruptionBudget- and peer-capacity-verified node drain, pod deletion, deployment rollout restart, and replica scaling).
- Real Prometheus HTTP API integration (`/api/v1/status/buildinfo`, `/api/v1/query`, `/api/v1/query_range`, `/api/v1/rules`) with explicit disconnected transparency and opt-in synthetic Demo Sandbox mode.
- Salted `scrypt` local credential storage, HMAC-SHA256 `HttpOnly` `SameSite=Strict` session cookies, CSRF header validation, brute-force failed-login lockouts, JSONL audit trail persistence, atomic disk writes with `.bak` recovery, startup log rotation, and SHA-256 verified backup/restore archives.
- Official installers for Linux/macOS (`install.sh`) and Windows PowerShell (`install.ps1`), Docker / Docker Compose configuration, and least-privilege Kubernetes manifests with PersistentVolumeClaim storage.
- Comprehensive multi-chapter book documentation (`docs/`) and native Linux, Windows, and macOS GitHub Actions CI matrix.
