# DAN.AI NocoBase — source-build image for this fork.
# The upstream docker/nocobase/Dockerfile builds from published npm packages and cannot include
# this fork's custom plugins (plugin-ai markdown knowledge, workflow-approval, branding), so this
# image builds the monorepo from source.
#
# Build from the repo root:
#   podman build \
#     --ignorefile docker/danai/build/build.ignore \
#     -f docker/danai/build/Dockerfile \
#     --build-arg COMMIT_HASH=$(git rev-parse --short HEAD) \
#     -t danai-nocobase:$(git rev-parse --short HEAD) .
#
# Node must stay on v22 (Node >=23 removed SlowBuffer, which crashes buffer-equal-constant-time
# under the compiled prod server). engines.node is >=22 and .node-version is 22.

FROM node:22-bookworm-slim AS builder

ENV NODE_OPTIONS=--max-old-space-size=6144

WORKDIR /app

# Full source, filtered by build.ignore (~660MB; node_modules/.git/storage/docs stripped).
# A manifest-only cache layer is not possible: yarn 1 workspaces --frozen-lockfile validation
# requires every workspace package.json to be present, so the source must be copied first.
COPY . .

RUN yarn install --frozen-lockfile --network-timeout 600000

# Remove npm-registry copies of @nocobase/* that yarn nests under plugin directories. devDeps
# declared as "2.x" do not match the prerelease workspace version (2.3.0-beta.8), so yarn fetches
# published 2.2.x builds (e.g. @nocobase/actions@2.2.7 under plugin-workflow-approval). Those
# shadow the workspace packages, giving TypeScript two distinct Database/Model class identities
# and failing declaration builds. Deleting the real copies (symlinks to workspace packages are
# kept) restores single-identity resolution — verified against a full local `yarn build`.
RUN find packages -type d -path "*/node_modules/@nocobase" | while read -r nm; do \
      for p in "$nm"/*; do \
        if [ -e "$p" ] && [ ! -L "$p" ]; then \
          echo "removing npm copy shadowing workspace package: $p"; \
          rm -rf "$p"; \
        fi; \
      done; \
    done

RUN APP_ENV=production yarn build

FROM node:22-bookworm-slim

ARG INSTALL_NGINX=1
ARG NGINX_VERSION=1.30.1-1~bookworm
ARG COMMIT_HASH=unknown

ENV NOCOBASE_RUNNING_IN_DOCKER=true \
    NB_SKIP_STARTUP_UPDATE=1 \
    APP_ENV=production \
    DISABLE_PKG_DOWNLOAD=true

# nginx (install block taken from the official docker/nocobase/Dockerfile) serves the SPA on :80
# and proxies /api to the app on APP_PORT (default 13000). postgresql-client comes from PGDG and
# MUST match the deployed postgres major (18): the backups plugin shells out to pg_dump/pg_restore
# in PATH, and a 15.x client hard-fails restoring an 18.x dump mid-flow (leaving an emptied DB).
RUN set -eux; \
  if [ "${INSTALL_NGINX}" = "1" ]; then \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates gnupg wget; \
    wget -qO /tmp/nginx_signing.key https://nginx.org/keys/nginx_signing.key; \
    gpg --batch --yes --dearmor -o /usr/share/keyrings/nginx-archive-keyring.gpg /tmp/nginx_signing.key; \
    printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] https://nginx.org/packages/debian bookworm nginx' \
      > /etc/apt/sources.list.d/nginx.list; \
    wget -qO /tmp/pgdg_signing.key https://www.postgresql.org/media/keys/ACCC4CF8.asc; \
    gpg --batch --yes --dearmor -o /usr/share/keyrings/pgdg-archive-keyring.gpg /tmp/pgdg_signing.key; \
    printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/pgdg-archive-keyring.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends "nginx=${NGINX_VERSION}" libaio1 postgresql-client-18; \
    pg_dump --version; \
    apt-get purge -y --auto-remove wget gnupg; \
    rm -rf /etc/nginx/conf.d/default.conf; \
  fi; \
  rm -rf \
    /etc/apt/sources.list.d/nginx.list \
    /etc/apt/sources.list.d/pgdg.list \
    /tmp/nginx_signing.key \
    /tmp/pgdg_signing.key \
    /usr/share/keyrings/nginx-archive-keyring.gpg \
    /usr/share/keyrings/pgdg-archive-keyring.gpg \
    /var/lib/apt/lists/*

WORKDIR /app/nocobase

COPY --from=builder /app /app/nocobase
COPY docker/nocobase/cleanup-node-modules.sh /usr/local/bin/cleanup-node-modules.sh

# cleanup strips *.map / non-@nocobase docs from node_modules (it also removes yarn.lock, which
# the runtime never needs — the entrypoint only runs nocobase-v1 commands, no installs).
RUN chmod +x /usr/local/bin/cleanup-node-modules.sh \
  && cleanup-node-modules.sh /app/nocobase \
  && rm -f /app/nocobase/.env \
  && mkdir -p storage/uploads node_modules/@nocobase/app/dist/client \
  && touch node_modules/@nocobase/app/dist/client/index.html \
  && echo "${COMMIT_HASH}" > /app/commit_hash.txt

COPY docker/danai/build/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.APP_PORT||13000)+'/api/app:getInfo').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/app/docker-entrypoint.sh"]
