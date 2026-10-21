#!/usr/bin/env bash
# Linux x86_64 cloud bootstrap. Local Windows/macOS setup: README.md in this directory.
set -euo pipefail

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'This bootstrap requires Linux x86_64; use the local setup guide on other platforms.' >&2
  exit 1
fi
for command in node npm python3 curl tar sha256sum; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done
node -e 'const [m,n]=process.versions.node.split(".").map(Number); if (!(m>=24 || m===22 && n>=13)) process.exit(1)'

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
export AE2WEB_WORKSPACE="${AE2WEB_WORKSPACE:-/workspace}"
if [[ "$AE2WEB_WORKSPACE" != /* ]]; then
  echo 'AE2WEB_WORKSPACE must be an absolute path to a dedicated cloud workspace.' >&2
  exit 1
fi
export GRADLE_USER_HOME="$AE2WEB_WORKSPACE/.cache/gradle"
export PLAYWRIGHT_BROWSERS_PATH="$AE2WEB_WORKSPACE/.cache/ms-playwright"
export npm_config_cache="$AE2WEB_WORKSPACE/.cache/npm"
mkdir -p "$AE2WEB_WORKSPACE/.cache/downloads" "$AE2WEB_WORKSPACE/.cache/java-home" \
  "$GRADLE_USER_HOME" "$AE2WEB_WORKSPACE/.toolchains"

for spec in '25 25.0.2+10 25.0.2_10' '21 21.0.10+7 21.0.10_7' '17 17.0.18+8 17.0.18_8'; do
  read -r major tag ver <<< "$spec"
  if [[ ! -x "$AE2WEB_WORKSPACE/.toolchains/jdk-$major/bin/java" ]]; then
    archive="OpenJDK${major}U-jdk_x64_linux_hotspot_${ver}.tar.gz"
    base="https://github.com/adoptium/temurin${major}-binaries/releases/download/jdk-${tag/+/%2B}"
    curl -fsSL "$base/$archive" -o "$AE2WEB_WORKSPACE/.cache/downloads/$archive"
    curl -fsSL "$base/$archive.sha256.txt" -o "$AE2WEB_WORKSPACE/.cache/downloads/$archive.sha256.txt"
    (cd "$AE2WEB_WORKSPACE/.cache/downloads" && sha256sum -c "$archive.sha256.txt")
    mkdir -p "$AE2WEB_WORKSPACE/.toolchains/jdk-$major"
    tar -xzf "$AE2WEB_WORKSPACE/.cache/downloads/$archive" \
      -C "$AE2WEB_WORKSPACE/.toolchains/jdk-$major" --strip-components=1
  fi
done
export JAVA_HOME="$AE2WEB_WORKSPACE/.toolchains/jdk-25"
export PATH="$JAVA_HOME/bin:$PATH"

# Keep cloud proxy/CA configuration out of the repository and out of the user's normal Gradle home.
python3 - <<'PY'
import os
import urllib.parse
from pathlib import Path

workspace = Path(os.environ['AE2WEB_WORKSPACE'])
proxy = urllib.parse.urlparse(os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy', ''))
props = {
    'org.gradle.java.installations.paths': ','.join(
        str(workspace / f'.toolchains/jdk-{major}') for major in (17, 21, 25)
    ),
    'systemProp.user.home': str(workspace / '.cache/java-home'),
    'org.gradle.java.installations.auto-detect': 'false',
    'org.gradle.workers.max': '4',
    'systemProp.javax.net.ssl.trustStore': '/etc/ssl/certs/java/cacerts',
}
if proxy.hostname:
    if proxy.username or proxy.password:
        raise SystemExit('Authenticated proxy needs supported platform Java configuration; do not save credentials.')
    for scheme in ('http', 'https'):
        props[f'systemProp.{scheme}.proxyHost'] = proxy.hostname
        props[f'systemProp.{scheme}.proxyPort'] = str(proxy.port or 8080)
    props['systemProp.http.nonProxyHosts'] = 'localhost|127.*|[::1]'
config = Path(os.environ['GRADLE_USER_HOME']) / 'gradle.properties'
lines = config.read_text().splitlines() if config.exists() else []
lines = [line for line in lines if line.partition('=')[0].strip() not in props]
config.write_text('\n'.join(lines + [f'{key}={value}' for key, value in props.items()]) + '\n')
PY

cd "$repo_root"
npm ci --include=dev --no-audit --no-fund
npm run build
npm run build:theme-example
npm --prefix tools/ui-tests ci --include=dev --no-audit --no-fund
npm --prefix tools/name-localization ci --ignore-scripts --no-audit --no-fund
bash gradlew --version
npm --prefix tools/ui-tests exec -- playwright install chromium
