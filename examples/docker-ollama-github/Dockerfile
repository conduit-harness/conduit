# Build the Conduit core + GitHub tracker + OpenAI-API runner from monorepo source,
# then install all three globally so `conduit`'s dynamic plugin imports resolve.
# Build context is the monorepo root.

FROM node:24-bookworm-slim AS builder
WORKDIR /src
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm -r build
RUN mkdir -p /tarballs && \
    cd packages/conduit && pnpm pack --pack-destination /tarballs && \
    cd ../conduit-tracker-github && pnpm pack --pack-destination /tarballs && \
    cd ../conduit-runner-openai-api && pnpm pack --pack-destination /tarballs

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /tarballs/*.tgz /tmp/tarballs/
RUN npm install -g /tmp/tarballs/*.tgz && rm -rf /tmp/tarballs
WORKDIR /app
COPY examples/docker-ollama-github/WORKFLOW.md /app/WORKFLOW.md
COPY examples/docker-ollama-github/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
