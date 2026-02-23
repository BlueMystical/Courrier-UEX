#!/bin/bash
# quick-build.sh - Versión minimalista

read -p "New version (current: $(jq -r .version package.json)): " ver
[ -n "$ver" ] && jq ".version = \"$ver\"" package.json > tmp && mv tmp package.json

npm run build:prod:linux

echo "✓ Done! Check ./release/"