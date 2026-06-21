#!/bin/sh
set -eu

DESKTOP_DST="/usr/share/applications"
ICON_DST="/usr/share/icons/hicolor/512x512/apps"

rm -f "$ICON_DST/AIDesktopHub.png"

for provider in chatgpt claude gemini grok deepseek qwen zai; do
  rm -f "$DESKTOP_DST/AIDesktopHub-$provider.desktop"
  rm -f "$ICON_DST/AIDesktopHub-$provider.png"
done

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DST" || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi
