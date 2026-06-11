#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN_SRC="$ROOT/packages/opencode/bin/opencodex-dev"
LINK_TARGET="$HOME/bin/opencodex"

echo "==> Installing dependencies..."
bun install --ignore-scripts

echo "==> Creating opencodex-dev wrapper script..."
cat > "$BIN_SRC" << WRAPPER
#!/bin/bash
export OPENCODE_ORIG_CWD="\$(pwd)"
cd "$ROOT/packages/opencode" && bun run --conditions=browser ./src/index.ts "\$@"
WRAPPER
chmod +x "$BIN_SRC"

echo "==> Linking opencodex command..."
mkdir -p ~/bin
ln -sf "$BIN_SRC" "$LINK_TARGET"
ln -sf "$BIN_SRC" "$HOME/bin/ox"

export PATH="$HOME/bin:$PATH"

echo "==> Testing opencodex..."
VERSION=$(opencodex --version 2>&1)
echo "    opencodex --version => $VERSION"

echo ""
echo "✅ opencodex installed successfully!"
echo "   Command: opencodex | ox  (ensure ~/bin is in PATH)"
echo "   Link:    $LINK_TARGET -> $BIN_SRC"
echo "   Run 'ox' or 'opencodex' to start TUI"