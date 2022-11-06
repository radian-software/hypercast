#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

ver="$(grep '^##' CHANGELOG.md | head -n1 | tr -d '# ')"

echo >&2 "Generating release for Hypercast server v${ver}"

echo >&2
echo >&2 "Ensuring manifest version number is up to date"
sed -E "s/^  \"version\": .+/  \"version\": \"${ver}\",/" "package.json" >"package.json.tmp"
mv "package.json.tmp" "package.json"
npm install

docker() {
    if [[ "${OSTYPE:-}" != darwin* ]] && [[ "${EUID}" != 0 ]]; then
        sudo -E env docker "$@"
    else
        docker "$@"
    fi
}

echo >&2
echo >&2 "Verifying that required tools and configuration are setup"
docker version -f 'Docker Server {{.Server.Version}}, Client {{.Client.Version}}'
username="$(jq '.auths["https://index.docker.io/v1/"].auth' -r <~/.docker/config.json | base64 -d | grep -Eo '^[^:]+')"
if [[ -z "${username}" ]]; then
    echo >&2 "Not logged in to Docker Hub"
    exit 1
fi
echo "Logged in to Docker Hub as ${username}"

echo >&2
docker build . -t "radiansoftware/hypercast:v${ver}"
docker tag "radiansoftware/hypercast:v${ver}" "radiansoftware/hypercast:latest"

notes="$(sed '/^##/,$!d' CHANGELOG.md | tail -n+2 | sed -n '/^##/q;p')"
echo >&2
echo >&2 "Using the following release notes:"
sed 's/^/  /' >&2 <<<"${notes}"
echo >&2

if ! git diff --quiet ./package.json ./package-lock.json; then
    echo >&2 "Updated manifest version should be commmitted before publishing"
    exit 1
fi

if [[ "${1:-}" != --publish ]]; then
    echo >&2 "Stopping here as --publish was not passed."
    exit 0
fi

if [[ "${2:-}" != --dangerously-skip-confirmation ]]; then
    read -r -p "Confirm publishing this release publicly (yes/no): " ans
    if [[ "${ans}" != yes ]]; then
        exit 1
    fi
else
    echo >&2 "Publishing this release since --dangerously-skip-confirmation was passed"
fi

tag="server-v${ver}"

echo >&2
echo >&2 "Pushing tag ${tag}"
git tag "${tag}" HEAD --force
git push origin "${tag}" --force

echo >&2
echo >&2 "Deleting GitHub Release if it already exists"
gh release delete "${tag}" --yes || :

echo >&2
echo >&2 "Creating GitHub Release"
gh release create "${tag}" -t "Hypercast server v${ver}" -F - <<<"${notes}"

echo >&2
echo >&2 "Publishing to Docker Hub"
docker push "radiansoftware/hypercast:v${ver}"
docker push "radiansoftware/hypercast:latest"
