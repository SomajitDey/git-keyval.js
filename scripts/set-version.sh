#!/usr/bin/env bash
# Brief: Set the given semver in the current project's package.json and package-lock.json
# Arg: <semver>, https://semver.org/
# Note: Using npm-version, https://docs.npmjs.com/cli/v7/commands/npm-version 
# Note: npm-version also creates git-commit and tag.
#   To avoid that, removing .git temporarily before invoking npm-version.

mv -f .git .git-backup && npm version "${@}"
mv -f .git-backup .git
