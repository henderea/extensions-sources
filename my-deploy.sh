#!/usr/bin/env bash

echo "yarn bundle"
yarn bundle
name="${1:-$(git rev-parse --abbrev-ref HEAD)}"
echo "sudo rm -rf '/home/henderea/domains/paperback/${name}'"
sudo rm -rf "/home/henderea/domains/paperback/${name}"
echo "sudo cp -r '/home/coder/projects/extensions-sources/bundles' '/home/henderea/domains/paperback/${name}'"
sudo cp -r "/home/coder/projects/extensions-sources/bundles" "/home/henderea/domains/paperback/${name}"
echo "sudo chown -R henderea:henderea /home/henderea/domains"
sudo chown -R henderea:henderea "/home/henderea/domains"
