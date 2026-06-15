#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
OPENCODE_DIR="$ROOT/packages/opencode"
BIN_DEV="$OPENCODE_DIR/bin/opencodex-dev"
BIN_PROD="$OPENCODE_DIR/bin/opencodex-local"
LINK_TARGET="$HOME/bin/opencodex"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dev] [--with-web-ui]

  $(basename "$0")              Install production binary (current platform, no Web UI embed)
  $(basename "$0") --dev        Install development build (runs TypeScript via bun)
  $(basename "$0") --with-web-ui  Also embed Web UI in the binary (slower, needs app build deps)

After changing source code:
  production: re-run $(basename "$0")
  development: run ox directly (no reinstall needed)
EOF
}

DEV=0
WITH_WEB_UI=0
for arg in "$@"; do
  case "$arg" in
    --dev) DEV=1 ;;
    --with-web-ui) WITH_WEB_UI=1 ;;
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
  echo "==> Building production binary (current platform)..."
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

echo "==> Linking opencodex command..."
mkdir -p ~/bin
ln -sf "$BIN_SRC" "$LINK_TARGET"
ln -sf "$BIN_SRC" "$HOME/bin/ox"

export PATH="$HOME/bin:$PATH"

echo "==> Testing opencodex..."
VERSION=$(opencodex --version 2>&1)
echo "    opencodex --version => $VERSION"

echo ""
echo "✅ opencodex installed successfully! ($MODE mode)"
echo "   Command: opencodex | ox  (ensure ~/bin is in PATH)"
echo "   Link:    $LINK_TARGET -> $BIN_SRC"
if [ "$DEV" -eq 1 ]; then
  echo "   Tip: code changes take effect immediately; reinstall only when dependencies change"
else
  echo "   Tip: re-run ./install-opencodex.sh after code changes to refresh the binary"
  echo "   Tip: use ./install-opencodex.sh --dev for live TypeScript development"
  if [ "$WITH_WEB_UI" -eq 0 ]; then
    echo "   Tip: use ./install-opencodex.sh --with-web-ui if you need the embedded Web UI server"
  fi
fi
echo "   Run 'ox' or 'opencodex' to start TUI"
