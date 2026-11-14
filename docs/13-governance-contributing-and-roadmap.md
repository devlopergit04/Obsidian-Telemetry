# Chapter 13 — Contributing, Governance, Changelog & Roadmap

[Previous: Chapter 12 — Limitations, Troubleshooting & FAQ](./12-limitations-troubleshooting-and-faq.md) · [Docs Index](./README.md)

---

## 37. Contributing Guide

Contributions of bug fixes, cross-platform CLI enhancements, Kubernetes compatibility updates, and test coverage are welcomed under the MIT License.

1. Fork `devlopergit04/Obsidian-Telemetry` and branch from `main`.
2. Install dependencies: `npm install`.
3. Run the development server: `npm run dev` (hot-reload UI + Express API).
4. Before submitting any Pull Request, verify all gates pass cleanly:
   ```bash
   npm run format:check
   npm run lint
   npm run lint:code
   npm test
   npm run build
   ```

See [../CONTRIBUTING.md](../CONTRIBUTING.md) for engineering standards and code conventions.

---

## 38. Security Policy & Responsible Disclosure

Please do **not** open public GitHub Issues for undisclosed security vulnerabilities.

- Report vulnerabilities privately via GitHub Security Advisories on `devlopergit04/Obsidian-Telemetry`.
- Include reproduction steps, affected modules, and potential impact.
- See [../SECURITY.md](../SECURITY.md) for supported release lines and cryptographic architecture notes.

---

## 39. Governance, Code of Conduct & License

- **License**: Free, open-source software licensed under the [MIT License](../LICENSE).
- **Code of Conduct**: All contributors and maintainers adhere to the Contributor Covenant standards documented in [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).
- **Package Stewardship**: Package `obsidian-telemetry` ships zero proprietary telemetry, zero dark patterns, and zero locked enterprise paywalls.

---

## 40. Changelog Summary

Recent highlights in **`v1.0.0`** (full details in [../CHANGELOG.md](../CHANGELOG.md)):

- Full standalone cross-platform `ot` CLI (`start`, `stop`, `restart`, `status`, `update`, `uninstall`, `backup`, `restore`, `passwd`).
- Persistent disk storage (`StateStore`) with UUID-nonced atomic temp-rename writes, `.bak` crash recovery, `.corrupt.<ts>` quarantine, and bounded `server.log` rotation.
- Production security hardening: strict placeholder secret rejection, `scrypt` password hashing, `HttpOnly` + `SameSite=Strict` HMAC cookies, `X-CSRF-Token`, brute-force lockout (`429` + `Retry-After`), `Cache-Control: no-store`, bearer token redaction, and 10s Kubernetes API timeouts.
- Split least-privilege Kubernetes RBAC (`rbac.yaml` vs opt-in `rbac-operator.yaml`) and persistent `PersistentVolumeClaim` (`pvc.yaml`).
- Multi-OS native GitHub Actions CI matrix (`ubuntu-latest`, `windows-latest`, `macos-latest`) and SHA-256 verified release automation.

---

## 41. Roadmap & Future Work

Planned community-driven improvements for upcoming minor releases (`v1.x`):

- Optional multi-user CLI management (`ot useradd`, `ot userdel`, `ot users list`) building directly on `credentials.json`.
- Read-only Helm chart wrapper around `deploy/kubernetes/` manifests for GitOps ArgoCD/Flux users.
- Configurable Prometheus query overrides in `config.json` for non-standard `kube-state-metrics` and custom ingress histograms.
- Optional SQLite / PostgreSQL pluggable state backend for HA multi-replica Kubernetes deployments while keeping zero-dependency JSON persistence as default.

---

[Previous: Chapter 12 — Limitations, Troubleshooting & FAQ](./12-limitations-troubleshooting-and-faq.md) · [Docs Index](./README.md) · [Main README](../README.md)
