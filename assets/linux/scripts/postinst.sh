#!/bin/sh
set -eu

if [ -d "/opt/AI Desktop Hub" ]; then
  APP_DIR="/opt/AI Desktop Hub"
elif [ -d "/opt/AIDesktopHub" ]; then
  APP_DIR="/opt/AIDesktopHub"
else
  echo "No se encontro el directorio de instalacion de AI Desktop Hub" >&2
  exit 1
fi
DESKTOP_SRC="$APP_DIR/resources/assets/linux/desktop"
MAIN_ICON_SRC="$APP_DIR/resources/assets/icons/aidesktophub.png"
ICON_SRC="$APP_DIR/resources/assets/icons/providers"
DESKTOP_DST="/usr/share/applications"
ICON_DST="/usr/share/icons/hicolor/512x512/apps"

install -Dm644 "$MAIN_ICON_SRC" "$ICON_DST/AIDesktopHub.png"

for provider in chatgpt claude gemini grok deepseek qwen zai; do
  install -Dm644 "$DESKTOP_SRC/AIDesktopHub-$provider.desktop" "$DESKTOP_DST/AIDesktopHub-$provider.desktop"
  install -Dm644 "$ICON_SRC/$provider.png" "$ICON_DST/AIDesktopHub-$provider.png"
done

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DST" || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi
