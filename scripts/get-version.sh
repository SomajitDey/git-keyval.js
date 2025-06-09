#!/usr/bin/env bash
# Brief: Get semver from the current project's package.json

npm pkg get version --workspaces=false | tr -d \"
