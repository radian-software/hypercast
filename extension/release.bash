#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

ver="$(grep '^##' CHANGELOG.md | head -n1 | tr -d '# ')"

echo >&2 "Generating release for Hypercast browser extension v${ver}"
echo >&2

chrome_zip="hypercast-extension-chrome-${ver}.zip"
files=(
    content-script.js
    manifest.json
    options.css
    options.html
    options.js
)

echo >&2 "Packaging browser extension for Chrome"
rm -f "${chrome_zip}"
zip "${chrome_zip}" "${files[@]}"
echo >&2 "Created artifact ${chrome_zip}"

notes="$(sed '/^##/,$!d' CHANGELOG.md | tail -n+2 | sed -n '/^##/q;p')"
echo >&2
echo >&2 "Using the following release notes:"
sed 's/^/  /' >&2 <<<"${notes}"
echo >&2

if [[ "${1:-}" != --publish ]]; then
    echo >&2 "Stopping here as --publish was not passed."
    exit 0
fi

echo >&2 "Verifying that required tools and configuration are setup"
gh --version
gh api user -t $'gh authenticated as @{{ .login }}\n'
echo >&2

if [[ "${2:-}" != --dangerously-skip-confirmation ]]; then
    read -r -p "Confirm publishing this release publicly (yes/no): " ans
    if [[ "${ans}" != yes ]]; then
        exit 1
    fi
else
    echo >&2 "Publishing this release since --dangerously-skip-confirmation was passed"
fi

tag="extension-v${ver}"

echo >&2
echo >&2 "Pushing tag ${tag}"
git tag "${tag}" HEAD --force
git push origin "${tag}" --force-with-lease

echo >&2
echo >&2 "Deleting GitHub Release if it already exists"
gh release delete "${tag}" --yes || :

echo >&2
echo >&2 "Creating GitHub Release"
gh release create "${tag}" -t "Hypercast browser extension v${ver}" -F - "${chrome_zip}" <<<"${notes}"
