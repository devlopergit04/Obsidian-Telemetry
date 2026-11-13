#!/bin/sh
set -eu

PACKAGE_SPEC="${OT_NPM_SPEC:-obsidian-telemetry@latest}"
INSTALL_PREFIX="${OT_INSTALL_PREFIX:-${HOME}/.local/share/obsidian-telemetry/npm}"
BIN_DIR="${OT_BIN_DIR:-${HOME}/.local/bin}"

log() {
  printf '%s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

detect_os() {
  OS_RAW="$(uname -s 2>/dev/null || printf 'unknown')"
  case "$OS_RAW" in
    Linux)
      OS_NAME="linux"
      ;;
    Darwin)
      OS_NAME="macos"
      ;;
    CYGWIN*|MINGW*|MSYS*)
      fail "Windows shell environments (Git Bash / MSYS2 / Cygwin) should use the PowerShell installer instead:
  irm https://raw.githubusercontent.com/devlopergit04/Obsidian-Telemetry/main/install.ps1 | iex"
      ;;
    *)
      fail "Unsupported operating system: ${OS_RAW}. Obsidian Telemetry installer supports Linux and macOS."
      ;;
  esac
}

detect_arch() {
  ARCH_RAW="$(uname -m 2>/dev/null || printf 'unknown')"
  case "$ARCH_RAW" in
    x86_64|amd64)
      ARCH_NAME="x64"
      ;;
    arm64|aarch64)
      ARCH_NAME="arm64"
      ;;
    *)
      ARCH_NAME="$ARCH_RAW"
      ;;
  esac
}

check_node_runtime() {
  if ! command -v node >/dev/null 2>&1; then
    if [ "$OS_NAME" = "macos" ]; then
      fail "Node.js 20 or newer is required, but 'node' was not found. Install it with: brew install node@22 (or download from https://nodejs.org/)."
    fi
    fail "Node.js 20 or newer is required, but 'node' was not found. Install Node.js LTS (>= 20) via your package manager, nvm, or https://nodejs.org/ and re-run."
  fi

  if ! command -v npm >/dev/null 2>&1; then
    fail "npm was not found in PATH. Ensure npm is installed alongside Node.js (>= 20) and re-run."
  fi

  NODE_VERSION_RAW="$(node -v 2>/dev/null || printf 'v0.0.0')"
  NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0')"

  if [ "$NODE_MAJOR" -lt 20 ]; then
    fail "Detected Node.js ${NODE_VERSION_RAW}, but Node.js >= 20.0.0 is required."
  fi

  log "Runtime check passed: Node.js ${NODE_VERSION_RAW} (${OS_NAME}/${ARCH_NAME})"
}

install_package() {
  mkdir -p "$INSTALL_PREFIX" || fail "Unable to create installation directory: ${INSTALL_PREFIX}"
  mkdir -p "$BIN_DIR" || fail "Unable to create binary directory: ${BIN_DIR}"

  log "Installing ${PACKAGE_SPEC} into ${INSTALL_PREFIX}..."
  if ! npm install -g --no-fund --no-audit --prefix "$INSTALL_PREFIX" "$PACKAGE_SPEC"; then
    fail "npm installation failed. Verify network connectivity and write access to ${INSTALL_PREFIX}."
  fi

  SOURCE_BIN="${INSTALL_PREFIX}/bin/ot"
  if [ ! -f "$SOURCE_BIN" ]; then
    fail "Installation completed but '${SOURCE_BIN}' was not created."
  fi

  chmod 755 "$SOURCE_BIN" 2>/dev/null || true
  TARGET_BIN="${BIN_DIR}/ot"
  rm -f "$TARGET_BIN"
  ln -s "$SOURCE_BIN" "$TARGET_BIN" || fail "Unable to link ${TARGET_BIN} -> ${SOURCE_BIN}"

  INSTALLED_VERSION="$("$TARGET_BIN" --version 2>/dev/null || printf '')"
  if [ -z "$INSTALLED_VERSION" ]; then
    fail "Installed binary at ${TARGET_BIN} failed self-check (--version)."
  fi

  log ""
  log "Installed ${INSTALLED_VERSION}"
  log "Executable: ${TARGET_BIN}"

  case ":${PATH}:" in
    *":${BIN_DIR}:"*)
      log ""
      log "Run 'ot' to start Obsidian Telemetry."
      ;;
    *)
      log ""
      log "Note: '${BIN_DIR}' is not currently in your PATH."
      log "Add it to your shell profile (~/.bashrc or ~/.zshrc):"
      log "  export PATH=\"${BIN_DIR}:\$PATH\""
      log ""
      log "Then run 'ot' (or run '${TARGET_BIN}' directly now)."
      ;;
  esac
}

main() {
  log "Obsidian Telemetry Installer"
  detect_os
  detect_arch
  check_node_runtime
  install_package
}

main "$@"
