# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Security Architecture

- **Secure by Default**: Standalone CLI (`ot`) and `NODE_ENV=production` launches enforce `AUTH_MODE=token` automatically, generating a salted `scrypt` password hash for the initial `admin` user and a random 256-bit HMAC session secret in `credentials.json` (`0600` file permissions on POSIX).
- **Session Cookies & CSRF Protection**: Sessions are issued as `HttpOnly`, `SameSite=Strict` HMAC-SHA256 signed cookies (`Secure` enabled automatically when served over HTTPS or `X-Forwarded-Proto: https`). Cookie-authenticated state mutations (`POST`, `DELETE`) require an `X-CSRF-Token` header derived from the session via HMAC.
- **Strict Network Boundaries**: CORS defaults to strict same-host origin matching unless explicitly configured via `CORS_ORIGIN`. WebSocket upgrade handshakes (`/ws/logs`, `/ws/exec`) validate both `Origin` headers and authenticated roles.
- **No Unbounded Command Execution**: `ENABLE_POD_EXEC` is `false` by default and requires authenticated `admin` role plus Kubernetes `pods/exec` RBAC permissions. CLI process control uses PID-verified signal delivery without shell string interpolation.

## Reporting a Vulnerability

If you discover a security vulnerability in Obsidian Telemetry, please report it responsibly rather than opening a public issue immediately.

1. Open a private GitHub Security Advisory on the repository's **Security** tab (`devlopergit04/Obsidian-Telemetry`), or contact the maintainers directly via the repository contact email.
2. Include steps to reproduce the issue, affected files or components, and potential impact.
3. Maintainers will acknowledge receipt within 48 hours and work with you to validate and ship a patch promptly.
