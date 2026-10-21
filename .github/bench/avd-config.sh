#!/usr/bin/env bash
# Upstream's nightly lowers the pixel_6 AVD to 720x1600@280 to lighten
# SwiftShader rendering; android-emulator-runner has no input for it, so it is
# set here, after the AVD is created and before the emulator starts.
set -euo pipefail
for cfg in "${ANDROID_AVD_HOME:-$HOME/.android/avd}"/*.avd/config.ini "$HOME"/.config/.android/avd/*.avd/config.ini; do
  [ -f "$cfg" ] || continue
  printf 'hw.lcd.width=720\nhw.lcd.height=1600\nhw.lcd.density=280\n' >> "$cfg"
  echo "patched $cfg"; grep -E 'hw\.(lcd|ramSize|cpu)' "$cfg"
done
