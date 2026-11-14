# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Security Architecture

- **Secure by Default**: Standalone CLI (`ot`) and `NODE_ENV=production` launches enforce `AUTH_MODE=token` automatically, forbid known placeholder secrets (`SESSION_SECRET`, `OBSIDIAN_*_TOKEN`), and store salted `scrypt` password hashes plus a 256-bit HMAC session secret in `credentials.json` (`0600` file permissions on POSIX).
- **Brute-Force, Session & CSRF Defense**: Authentication routes apply sliding per-IP limits (`30 req / 15m`) plus `5`-failure consecutive lockouts (`60s` HTTP `429` with `Retry-After`). Sessions use `HttpOnly`, `SameSite=Strict` HMAC-SHA256 cookies (`Secure` when HTTPS / `X-Forwarded-Proto: https`) rotated on password change, paired with HMAC `X-CSRF-Token` validation and `Cache-Control: no-store` on `/api/*`.
- **Strict Network Boundaries**: CORS defaults to strict same-host origin matching unless explicitly configured via `CORS_ORIGIN`. WebSocket upgrade handshakes (`/ws/logs`, `/ws/exec`) validate both `Origin` headers and authenticated roles.
- **Least-Privilege Operations**: `ENABLE_POD_EXEC` is `false` by default, upstream Kubernetes errors strip `Bearer` tokens, API calls enforce `10s` timeouts, and `deploy/kubernetes/rbac.yaml` grants read-only access while mutating RBAC lives separately in `deploy/kubernetes/rbac-operator.yaml`.

## Reporting a Vulnerability

If you discover a security vulnerability in Obsidian Telemetry, please report it responsibly rather than opening a public issue immediately.

1. Open a private GitHub Security Advisory on the repository's **Security** tab (`devlopergit04/Obsidian-Telemetry`), or contact the maintainers directly via the repository contact email.
2. Include steps to reproduce the issue, affected files or components, and potential impact.
3. Maintainers will acknowledge receipt within 48 hours and work with you to validate and ship a patch promptly.
