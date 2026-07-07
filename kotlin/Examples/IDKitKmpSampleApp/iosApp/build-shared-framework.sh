#!/bin/sh
# Xcode build phase: builds the Kotlin shared framework for the current
# Xcode configuration/SDK via Gradle's embedAndSignAppleFrameworkForXcode.
#
# Xcode's environment has no JAVA_HOME and a minimal PATH, so locate a
# Gradle-compatible JDK (17-21) across common install locations first.
set -eu

java_major() {
  "$1/bin/java" -version 2>&1 | head -n 1 | sed -E 's/.*version "([0-9]+).*/\1/'
}

resolve_jdk() {
  for candidate in \
    "${JAVA_HOME:-}" \
    "$(/usr/libexec/java_home -v 17 2>/dev/null || true)" \
    "$(/usr/libexec/java_home -v 21 2>/dev/null || true)" \
    /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
    /usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    [ -n "$candidate" ] && [ -x "$candidate/bin/java" ] || continue
    major="$(java_major "$candidate" || true)"
    case "$major" in
      17|18|19|20|21)
        echo "$candidate"
        return 0
        ;;
    esac
  done
  return 1
}

if JDK="$(resolve_jdk)"; then
  export JAVA_HOME="$JDK"
  echo "Using JAVA_HOME=$JAVA_HOME"
else
  echo "error: No JDK 17-21 found for Gradle. Install one (e.g. brew install openjdk@17)" >&2
  exit 1
fi

cd "$SRCROOT/.."
exec ./gradlew :shared:embedAndSignAppleFrameworkForXcode
