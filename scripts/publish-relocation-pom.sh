#!/bin/bash
set -euo pipefail

# One-time script: publish a relocation POM for the superseded com.worldcoin:idkit-kotlin
# artifact (last real release: 3.1.0, from the archived worldcoin/idkit-kotlin repo),
# pointing consumers at the renamed com.worldcoin:idkit artifact in this monorepo.
#
# Maven resolves <relocation> automatically; for Gradle users the POM mainly serves as
# discoverable documentation of the rename on central.sonatype.com / mvnrepository.com.
#
# Run AFTER the first com.worldcoin:idkit release is live on Maven Central, so the
# relocation target exists.
#
# Requirements:
#   - gpg with the release signing key imported (same key used by CI for Central)
#   - Central Portal user token with access to the com.worldcoin namespace
#
# Usage:
#   MAVEN_CENTRAL_USERNAME=... MAVEN_CENTRAL_PASSWORD=... \
#     scripts/publish-relocation-pom.sh <target-version> [signing-key-id]
#
#   <target-version>  the com.worldcoin:idkit version on Central to relocate to (e.g. 4.1.0)
#   [signing-key-id]  optional gpg key selector; defaults to gpg's default key
#
# If MAVEN_CENTRAL_USERNAME/PASSWORD are unset, the script still produces the bundle zip
# and prints instructions for manual upload in the Central Portal UI.

TARGET_VERSION="${1:?usage: publish-relocation-pom.sh <target-version> [signing-key-id]}"
SIGNING_KEY_ID="${2:-}"

# Must sort above 3.1.0 so resolvers treat the relocation POM as the latest version
# of the old coordinates.
RELOCATION_VERSION="3.2.0"
GROUP_ID="com.worldcoin"
OLD_ARTIFACT_ID="idkit-kotlin"
NEW_ARTIFACT_ID="idkit"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

ARTIFACT_DIR="$WORK_DIR/com/worldcoin/$OLD_ARTIFACT_ID/$RELOCATION_VERSION"
POM_FILE="$ARTIFACT_DIR/$OLD_ARTIFACT_ID-$RELOCATION_VERSION.pom"
BUNDLE="$PWD/$OLD_ARTIFACT_ID-$RELOCATION_VERSION-relocation-bundle.zip"

mkdir -p "$ARTIFACT_DIR"

echo "📝 Generating relocation POM ($GROUP_ID:$OLD_ARTIFACT_ID:$RELOCATION_VERSION -> $GROUP_ID:$NEW_ARTIFACT_ID:$TARGET_VERSION)"

cat > "$POM_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>$GROUP_ID</groupId>
  <artifactId>$OLD_ARTIFACT_ID</artifactId>
  <version>$RELOCATION_VERSION</version>
  <packaging>pom</packaging>
  <name>IDKit (Kotlin) — relocated</name>
  <description>This artifact has been renamed. Use com.worldcoin:idkit, published from the worldcoin/idkit monorepo.</description>
  <url>https://github.com/worldcoin/idkit</url>
  <licenses>
    <license>
      <name>MIT License</name>
      <url>https://opensource.org/licenses/MIT</url>
    </license>
  </licenses>
  <developers>
    <developer>
      <id>worldcoin</id>
      <name>Worldcoin</name>
    </developer>
  </developers>
  <scm>
    <connection>scm:git:https://github.com/worldcoin/idkit.git</connection>
    <developerConnection>scm:git:ssh://git@github.com/worldcoin/idkit.git</developerConnection>
    <url>https://github.com/worldcoin/idkit</url>
  </scm>
  <distributionManagement>
    <relocation>
      <groupId>$GROUP_ID</groupId>
      <artifactId>$NEW_ARTIFACT_ID</artifactId>
      <version>$TARGET_VERSION</version>
      <message>idkit-kotlin moved to the worldcoin/idkit monorepo and was renamed to com.worldcoin:idkit.</message>
    </relocation>
  </distributionManagement>
</project>
EOF

echo "🔏 Signing POM"
GPG_ARGS=(--armor --detach-sign --output "$POM_FILE.asc")
if [ -n "$SIGNING_KEY_ID" ]; then
  GPG_ARGS=(--local-user "$SIGNING_KEY_ID" "${GPG_ARGS[@]}")
fi
gpg "${GPG_ARGS[@]}" "$POM_FILE"

echo "🧮 Writing checksums"
# Signature files (.asc) are exempt from the checksum requirement — only the POM needs them.
if command -v md5sum >/dev/null; then
  md5sum "$POM_FILE" | cut -d' ' -f1 > "$POM_FILE.md5"
  sha1sum "$POM_FILE" | cut -d' ' -f1 > "$POM_FILE.sha1"
else
  md5 -q "$POM_FILE" > "$POM_FILE.md5"          # macOS
  shasum -a 1 "$POM_FILE" | cut -d' ' -f1 > "$POM_FILE.sha1"
fi

echo "📦 Creating bundle"
rm -f "$BUNDLE"
(cd "$WORK_DIR" && zip -qr "$BUNDLE" com)
echo "   $BUNDLE"

if [ -n "${MAVEN_CENTRAL_USERNAME:-}" ] && [ -n "${MAVEN_CENTRAL_PASSWORD:-}" ]; then
  echo "🚀 Uploading to Central Portal (USER_MANAGED — release it in the Portal UI)"
  # tr guards against GNU base64's 76-char line wrapping on Linux
  TOKEN=$(printf '%s:%s' "$MAVEN_CENTRAL_USERNAME" "$MAVEN_CENTRAL_PASSWORD" | base64 | tr -d '\n')
  DEPLOYMENT_ID=$(curl --fail --silent --show-error \
    --request POST \
    --header "Authorization: Bearer $TOKEN" \
    --form "bundle=@$BUNDLE" \
    "https://central.sonatype.com/api/v1/publisher/upload?name=$OLD_ARTIFACT_ID-$RELOCATION_VERSION-relocation&publishingType=USER_MANAGED")
  echo "   Deployment ID: $DEPLOYMENT_ID"
  echo "   Review and publish at: https://central.sonatype.com/publishing/deployments"
else
  echo "ℹ️  MAVEN_CENTRAL_USERNAME/PASSWORD not set — skipping upload."
  echo "   Upload the bundle manually: central.sonatype.com -> Publish -> Upload Component,"
  echo "   or re-run with credentials set."
fi
