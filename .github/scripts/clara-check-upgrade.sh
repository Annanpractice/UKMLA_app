#!/usr/bin/env bash
set -euo pipefail
mkdir -p upgrade-review
adb install baseline.apk | tee upgrade-review/baseline-install.txt
adb shell run-as app.clara.assistant.cards mkdir -p files
adb shell run-as app.clara.assistant.cards sh -c '"echo clara-original-data > files/upgrade-marker.txt"'
adb install -r verified-apk/Clara-v2.1.0-Cards.apk | tee upgrade-review/update-install.txt
adb shell run-as app.clara.assistant.cards cat files/upgrade-marker.txt > upgrade-review/preserved-data.txt
test "$(tr -d '\r\n' < upgrade-review/preserved-data.txt)" = clara-original-data
adb shell dumpsys package app.clara.assistant.cards > upgrade-review/package.txt
adb shell am start -W -n app.clara.assistant.cards/app.pocketgemma.MainActivity | tee upgrade-review/launch.txt
sleep 2
adb shell pidof app.clara.assistant.cards > upgrade-review/process.txt
adb exec-out screencap -p > upgrade-review/android16-upgrade.png
