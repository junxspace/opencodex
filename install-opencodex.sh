#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
OPENCODE_DIR="$ROOT/packages/opencode"
BIN_DEV="$OPENCODE_DIR/bin/opencode-dev"
BIN_PROD="$OPENCODE_DIR/bin/opencode-local"
LINK_TARGET="$HOME/bin/opencode"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dev] [--with-web-ui] [--fetch-models] [--no-models-dev]

  $(basename "$0")                Install production binary (current platform, no Web UI embed)
  $(basename "$0") --dev          Install development build (runs TypeScript via bun)
  $(basename "$0") --with-web-ui  Also embed Web UI in the binary (slower, needs app build deps)
  $(basename "$0") --fetch-models Download the models.dev catalog during build (default: local snapshot)
  $(basename "$0") --no-models-dev  Embed an empty model catalog (for custom providers only)

Environment:
  MODELS_DEV_API_JSON  Path to a local models snapshot JSON (overrides --fetch-models / --no-models-dev)

After changing source code:
  production: re-run $(basename "$0")
  development: run oc directly (no reinstall needed)
EOF
}

DEV=0
WITH_WEB_UI=0
FETCH_MODELS=0
NO_MODELS_DEV=0
for arg in "$@"; do
  case "$arg" in
    --dev) DEV=1 ;;
    --with-web-ui) WITH_WEB_UI=1 ;;
    --fetch-models) FETCH_MODELS=1 ;;
    --no-models-dev) NO_MODELS_DEV=1 ;;
    --skip-embed-web-ui) ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ "$FETCH_MODELS" -eq 1 ] && [ "$NO_MODELS_DEV" -eq 1 ]; then
  echo "Use only one of --fetch-models or --no-models-dev" >&2
  exit 1
fi

resolve_models_snapshot() {
  if [ -n "${MODELS_DEV_API_JSON:-}" ]; then
    if [ ! -f "$MODELS_DEV_API_JSON" ]; then
      echo "MODELS_DEV_API_JSON does not exist: $MODELS_DEV_API_JSON" >&2
      exit 1
    fi
    echo "$MODELS_DEV_API_JSON"
    return
  fi

  if [ "$FETCH_MODELS" -eq 1 ]; then
    return
  fi

  if [ "$NO_MODELS_DEV" -eq 1 ]; then
    local empty="$OPENCODE_DIR/.cache/empty-models.json"
    mkdir -p "$(dirname "$empty")"
    printf '{}\n' >"$empty"
    echo "$empty"
    return
  fi

  local fixture="$OPENCODE_DIR/test/tool/fixtures/models-api.json"
  if [ ! -f "$fixture" ]; then
    echo "Local models snapshot not found: $fixture" >&2
    echo "Use --fetch-models or set MODELS_DEV_API_JSON" >&2
    exit 1
  fi
  echo "$fixture"
}

resolve_binary_name() {
  local platform arch
  case "$(uname -s)" in
    Darwin) platform=darwin ;;
    Linux) platform=linux ;;
    MINGW* | MSYS* | CYGWIN*)
      echo "Windows is not supported by this install script. Build manually with: bun run build" >&2
      exit 1
      ;;
    *)
      echo "Unsupported platform: $(uname -s)" >&2
      exit 1
      ;;
  esac

  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac

  echo "opencode-${platform}-${arch}"
}

echo "==> Installing dependencies..."
bun install --ignore-scripts

if [ "$DEV" -eq 1 ]; then
  echo "==> Creating development wrapper..."
  cat >"$BIN_DEV" <<WRAPPER
#!/bin/bash
export OPENCODE_ORIG_CWD="\$(pwd)"
cd "$OPENCODE_DIR" && bun run --conditions=browser ./src/index.ts "\$@"
WRAPPER
  chmod +x "$BIN_DEV"
  BIN_SRC="$BIN_DEV"
  MODE="development"
else
  BUILD_ARGS=(--single --skip-install)
  if [ "$WITH_WEB_UI" -eq 0 ]; then
    BUILD_ARGS+=(--skip-embed-web-ui)
  fi
  MODELS_SNAPSHOT="$(resolve_models_snapshot)"
  if [ -n "$MODELS_SNAPSHOT" ]; then
    export MODELS_DEV_API_JSON="$MODELS_SNAPSHOT"
    if [ "$NO_MODELS_DEV" -eq 1 ]; then
      echo "==> Building production binary (current platform, empty model catalog)..."
    else
      echo "==> Building production binary (current platform, local models snapshot)..."
    fi
  else
    echo "==> Building production binary (current platform, fetching models.dev)..."
  fi
  (cd "$OPENCODE_DIR" && bun run build -- "${BUILD_ARGS[@]}")

  BINARY_NAME="$(resolve_binary_name)"
  BINARY_PATH="$OPENCODE_DIR/dist/$BINARY_NAME/bin/opencode"
  if [ ! -x "$BINARY_PATH" ]; then
    echo "Build succeeded but binary not found: $BINARY_PATH" >&2
    exit 1
  fi

  echo "==> Creating production wrapper..."
  cat >"$BIN_PROD" <<WRAPPER
#!/bin/bash
export OPENCODE_ORIG_CWD="\$(pwd)"
exec "$BINARY_PATH" "\$@"
WRAPPER
  chmod +x "$BIN_PROD"
  BIN_SRC="$BIN_PROD"
  MODE="production"
fi

echo "==> Linking opencode command..."
mkdir -p ~/bin
ln -sf "$BIN_SRC" "$LINK_TARGET"
ln -sf "$BIN_SRC" "$HOME/bin/oc"

export PATH="$HOME/bin:$PATH"

echo "==> Testing opencode..."
VERSION=$(opencode --version 2>&1)
echo "    opencode --version => $VERSION"

echo ""
echo "✅ opencode installed successfully! ($MODE mode)"
echo "   Command: opencode | oc  (ensure ~/bin is in PATH)"
echo "   Link:    $LINK_TARGET -> $BIN_SRC"
if [ "$DEV" -eq 1 ]; then
  echo "   Tip: code changes take effect immediately; reinstall only when dependencies change"
else
  echo "   Tip: re-run ./install-opencode.sh after code changes to refresh the binary"
  echo "   Tip: use ./install-opencode.sh --dev for live TypeScript development"
  if [ "$WITH_WEB_UI" -eq 0 ]; then
    echo "   Tip: use ./install-opencode.sh --with-web-ui if you need the embedded Web UI server"
  fi
fi
echo "   Run 'oc' or 'opencode' to start TUI"
