#!/usr/bin/env bash
# Brief: Returns the latest release for the provided NPM package
# Arg: <NPM-package>, default: current package

npm view "${1:-"$(npm view . name)"}" version
