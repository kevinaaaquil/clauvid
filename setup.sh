#!/usr/bin/env bash
# Set up clauvid's video toolchain after cloning. Safe to re-run: every step checks first and
# skips what is already in place. Everything heavy lands inside this folder (.cache/, .tools/,
# .venv-media/), never in the repo (they are gitignored).
#
#   ./setup.sh            everything (~5 GB of downloads on a fresh machine)
#   ./setup.sh --minimal  only what voiceover-sync, HyperFrames and the share platform need
#                         (Homebrew tools, whisper model, HyperFrames Chrome); skips Python,
#                         Manim, TinyTeX, MusicGen and Kokoro TTS
#   ./setup.sh --check    report what's installed and what's missing; changes nothing
#
# Needs: macOS, Homebrew, Node 20+, curl. See INSTALLED.md for what each piece is for.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MODE=full
for a in "$@"; do
  case "$a" in
    --minimal) MODE=minimal ;;
    --check) MODE=check ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown option: $a (try --help)"; exit 2 ;;
  esac
done

# Same locations as .claude/settings.json, so Claude sessions and this script agree.
export UV_CACHE_DIR="$ROOT/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$ROOT/.tools/uv-python"
export HF_HOME="$ROOT/.cache/huggingface"
export HYPERFRAMES_PYTHON="$ROOT/.venv-media/bin/python"
export HYPERFRAMES_FONT_CACHE_DIR="$ROOT/.cache/hyperframes/fonts"

BREW_PKGS=(ffmpeg whisper-cpp uv pkgconf cairo pango)
PY_PKGS=(torch==2.14.1 transformers==5.18.0 manim==0.21.0 numpy==2.5.3 scipy==1.18.1
         soundfile==0.14.0 pydub==0.25.1 yt-dlp==2026.8.19 kokoro-onnx==0.6.1)
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"
WHISPER_FILE="$ROOT/.cache/hyperframes/whisper/models/ggml-small.en.bin"
WHISPER_SHA256="c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d"
TINYTEX_URL="https://github.com/rstudio/tinytex-releases/releases/download/daily/TinyTeX-1-darwin.tar.xz"
TEX="$ROOT/.tools/TinyTeX/bin/universal-darwin"
TEX_PKGS=(standalone preview doublestroke setspace rsfs relsize ragged2e fundus-calligra microtype
          wasysym physics dvisvgm jknapltx wasy cm-super babel-english gnu-freefont mathastext
          cbfonts-fd amsfonts everysel)
MUSICGEN="facebook/musicgen-small"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
miss() { printf '  \033[33m•\033[0m %s\n' "$*"; MISSING=$((MISSING + 1)); }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
MISSING=0
doing() { [ "$MODE" != check ]; }

# ---------------------------------------------------------------- preflight
step "Preflight"
[ "$(uname)" = Darwin ] || die "setup.sh supports macOS only for now."
command -v brew >/dev/null || die "Homebrew is required: https://brew.sh"
command -v curl >/dev/null || die "curl is required."
command -v node >/dev/null || die "Node 20+ is required (https://nodejs.org, or: brew install node)."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20+ is required (found $(node -v))."
ok "macOS, Homebrew, curl, Node $(node -v)"

# ---------------------------------------------------------------- homebrew
step "Homebrew tools"
for p in "${BREW_PKGS[@]}"; do
  [ "$MODE" = minimal ] && case "$p" in pkgconf|cairo|pango) continue ;; esac
  if brew list --formula "$p" >/dev/null 2>&1; then ok "$p"
  elif doing; then echo "  installing $p…"; brew install "$p" >/dev/null && ok "$p (installed)"
  else miss "$p"; fi
done

# ---------------------------------------------------------------- caches + links
step "Caches inside clauvid/ (linked from ~/.cache)"
mkdir_if() { doing && mkdir -p "$@" || true; }
mkdir_if "$ROOT/.cache/hyperframes" "$ROOT/.cache/huggingface" "$ROOT/.cache/uv" "$ROOT/.tools"
# HyperFrames and Hugging Face look in ~/.cache by default; point those at clauvid/.cache.
for name in hyperframes huggingface; do
  link="$HOME/.cache/$name" target="$ROOT/.cache/$name"
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then ok "~/.cache/$name → clauvid/.cache/$name"
  elif [ -L "$link" ]; then miss "~/.cache/$name points to $(readlink "$link"), not clauvid. Left alone; repoint it yourself if you want."
  elif [ -e "$link" ]; then miss "~/.cache/$name is a real folder. Left alone: move its contents into clauvid/.cache/$name, delete it, and re-run."
  elif doing; then mkdir -p "$HOME/.cache" && ln -s "$target" "$link" && ok "~/.cache/$name → clauvid/.cache/$name (linked)"
  else miss "~/.cache/$name link"; fi
done

# ---------------------------------------------------------------- whisper
step "Whisper model (captions, voiceover-sync)"
if [ -f "$WHISPER_FILE" ] && [ "$(shasum -a 256 "$WHISPER_FILE" | cut -d' ' -f1)" = "$WHISPER_SHA256" ]; then
  ok "ggml-small.en.bin"
elif doing; then
  echo "  downloading ggml-small.en.bin (488 MB)…"
  mkdir -p "$(dirname "$WHISPER_FILE")"
  curl -fL --retry 3 --progress-bar "$WHISPER_URL" -o "$WHISPER_FILE.part"
  [ "$(shasum -a 256 "$WHISPER_FILE.part" | cut -d' ' -f1)" = "$WHISPER_SHA256" ] || { rm -f "$WHISPER_FILE.part"; die "whisper model checksum mismatch"; }
  mv "$WHISPER_FILE.part" "$WHISPER_FILE" && ok "ggml-small.en.bin (downloaded, checksum ok)"
else miss "ggml-small.en.bin"; fi

# ---------------------------------------------------------------- hyperframes chrome
step "HyperFrames render browser"
if npx --yes hyperframes browser path >/dev/null 2>&1; then ok "headless Chrome ($(npx --yes hyperframes browser path 2>/dev/null | tail -1))"
elif doing; then npx --yes hyperframes browser ensure && ok "headless Chrome (downloaded)"
else miss "headless Chrome"; fi

if [ "$MODE" != minimal ]; then
  # -------------------------------------------------------------- python
  step "Python 3.12 venv (.venv-media): Manim, MusicGen, Kokoro TTS runtime"
  if "$HYPERFRAMES_PYTHON" -c "import torch, transformers, manim, soundfile, scipy, kokoro_onnx" >/dev/null 2>&1; then
    ok ".venv-media ($("$HYPERFRAMES_PYTHON" -V 2>&1))"
  elif doing; then
    command -v uv >/dev/null || die "uv missing; the Homebrew step should have installed it."
    uv python install 3.12
    [ -x "$HYPERFRAMES_PYTHON" ] || uv venv --python 3.12 "$ROOT/.venv-media"
    uv pip install --python "$HYPERFRAMES_PYTHON" "${PY_PKGS[@]}"
    ok ".venv-media (installed)"
  else miss ".venv-media with ${PY_PKGS[*]}"; fi

  # -------------------------------------------------------------- tinytex
  step "TinyTeX (LaTeX for Manim MathTex) in .tools/"
  if [ -x "$TEX/tlmgr" ] && "$TEX/kpsewhich" standalone.cls >/dev/null 2>&1; then ok "TinyTeX + packages"
  elif doing; then
    if [ ! -x "$TEX/tlmgr" ]; then
      echo "  downloading TinyTeX (67 MB)…"
      tmp="$(mktemp -d)"
      curl -fL --retry 3 --progress-bar "$TINYTEX_URL" -o "$tmp/tinytex.tar.xz"
      tar -xf "$tmp/tinytex.tar.xz" -C "$ROOT/.tools" && rm -rf "$tmp"
      # Done by hand instead of TinyTeX's installer, which deletes its target and edits /etc/paths.d.
      "$TEX/tlmgr" postaction install script xetex >/dev/null
    fi
    "$TEX/tlmgr" install "${TEX_PKGS[@]}"
    ok "TinyTeX + packages (installed)"
  else miss "TinyTeX + ${#TEX_PKGS[@]} packages"; fi

  # -------------------------------------------------------------- musicgen
  step "MusicGen model (local background music)"
  if ls "$HF_HOME/hub/models--facebook--musicgen-small/snapshots/"*/config.json >/dev/null 2>&1; then ok "$MUSICGEN"
  elif doing; then
    [ -x "$HYPERFRAMES_PYTHON" ] || die "Python venv missing; can't fetch MusicGen."
    echo "  downloading $MUSICGEN (2.2 GB)…"
    "$HYPERFRAMES_PYTHON" -c "from huggingface_hub import snapshot_download as s; s('$MUSICGEN')"
    ok "$MUSICGEN (downloaded)"
  else miss "$MUSICGEN"; fi

  # -------------------------------------------------------------- manim smoke test
  step "Manim"
  if "$ROOT/bin/manim" --version >/dev/null 2>&1; then ok "bin/manim ($("$ROOT/bin/manim" --version 2>/dev/null | head -1))"
  else miss "bin/manim doesn't run yet"; fi
fi

# ---------------------------------------------------------------- summary
step "Done"
if [ "$MODE" = check ]; then
  [ "$MISSING" -eq 0 ] && ok "everything is installed" || echo "  $MISSING missing. Run ./setup.sh$([ "$MODE" = minimal ] && echo ' --minimal') to install."
else
  [ "$MISSING" -eq 0 ] && ok "toolchain ready" || echo "  $MISSING item(s) need attention (see • above)."
  echo "  Start the share platform: share-platform/start.sh → http://localhost:4747"
fi
