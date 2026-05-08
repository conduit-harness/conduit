# Clean-machine smoke environment for validating Conduit installs.
#
# This image deliberately ships with NO Conduit packages and NO agent CLIs
# (claude-cli / codex-cli / aider). It is the minimum surface a user would
# encounter on a fresh machine: Node 24 (matches `engines.node >= 24.0.0`),
# git, and ca-certificates. Install Conduit at runtime to validate either a
# published `@next` / `@latest` version or a locally-packed tarball set.
#
# See README.md in this directory for usage.

FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /work

CMD ["bash"]
