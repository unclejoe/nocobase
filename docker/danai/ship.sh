#!/usr/bin/env bash
# 一键：构建镜像 → 导出 tar（含 postgres:18）→ rsync 到云端 → 远端 load → compose up。
#
# 用法（仓库根执行）:
#   docker/danai/ship.sh user@cloud-host
#   docker/danai/ship.sh user@cloud-host -p 2222          # 自定义 ssh 端口
#   docker/danai/ship.sh user@cloud-host --remote-dir /srv/danai
#   docker/danai/ship.sh --build-only                      # 只构建不发货（本地验证用）
#
# 前提: 本机 podman ≥ 4.x（需 --ignorefile）、rsync、ssh；远端见 docker/danai/deploy/README.md。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE_NAME="danai-nocobase"
PG_IMAGE="docker.io/library/postgres:18"
REMOTE_DIR="~/danai"
REMOTE=""
SSH_PORT=22
BUILD_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    -p) SSH_PORT="$2"; shift 2 ;;
    --remote-dir) REMOTE_DIR="$2"; shift 2 ;;
    --build-only) BUILD_ONLY=1; shift ;;
    --force-build) FORCE_BUILD=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) REMOTE="$1"; shift ;;
  esac
done

if [ "$BUILD_ONLY" -eq 0 ] && [ -z "$REMOTE" ]; then
  echo "usage: $0 user@cloud-host [-p port] [--remote-dir dir] [--build-only]" >&2
  exit 1
fi

cd "$REPO_ROOT"
TAG="$(git rev-parse --short HEAD)"
TAR_FILE="/tmp/${IMAGE_NAME}-${TAG}.tar"

# An existing local image with the HEAD tag means this exact source was already built — shipping
# it as-is keeps a full 40-minute rebuild off the critical path (pass --force-build to redo).
# Note: `podman image prune` (dangling) deletes the builder-stage cache layer, after which the
# next real build runs from scratch.
if [ "${FORCE_BUILD:-0}" -ne 1 ] && podman image exists "${IMAGE_NAME}:${TAG}"; then
  echo "==> [1/5] ${IMAGE_NAME}:${TAG} already built locally; skipping build (--force-build to rebuild)"
  podman tag "${IMAGE_NAME}:${TAG}" "${IMAGE_NAME}:latest"
else
  echo "==> [1/5] building ${IMAGE_NAME}:${TAG} (source build, 20-40 min)..."
  podman build \
    --ignorefile docker/danai/build/build.ignore \
    -f docker/danai/build/Dockerfile \
    --build-arg "COMMIT_HASH=${TAG}" \
    -t "${IMAGE_NAME}:${TAG}" \
    -t "${IMAGE_NAME}:latest" \
    .
fi

if [ "$BUILD_ONLY" -eq 1 ]; then
  echo "==> build-only: image ${IMAGE_NAME}:${TAG} ready (${TAR_FILE} not created)"
  podman images "${IMAGE_NAME}"
  exit 0
fi

verify_postgres_image() {
  # podman 6.1.x multi-image load has been observed to mis-assign repo tags (the postgres tag
  # ending up on the app image). Both images share the entrypoint name, so probe a postgres-only
  # binary. Keep the major aligned with the local dev database (PG18) so dumps restore either way.
  if ! podman run --rm "$PG_IMAGE" psql --version >/dev/null 2>&1; then
    echo "${PG_IMAGE} does not point at a real postgres image; fix before shipping:" >&2
    echo "  podman rmi ${PG_IMAGE} && podman pull ${PG_IMAGE}" >&2
    return 1
  fi
}

echo "==> [2/5] ensuring ${PG_IMAGE} exists locally (shipped inside the tar)..."
podman image exists "$PG_IMAGE" || podman pull "$PG_IMAGE"
verify_postgres_image

echo "==> [3/5] saving ${IMAGE_NAME}:${TAG} + ${PG_IMAGE} to ${TAR_FILE}..."
podman save -o "$TAR_FILE" "${IMAGE_NAME}:${TAG}" "$PG_IMAGE"

echo "==> [4/5] rsyncing image + deploy/ to ${REMOTE}:${REMOTE_DIR}..."
ssh_remote() { ssh -p "$SSH_PORT" "$REMOTE" "$@"; }
rsync -azP -e "ssh -p ${SSH_PORT}" \
  "$TAR_FILE" "${REMOTE}:${REMOTE_DIR}/"
rsync -azP -e "ssh -p ${SSH_PORT}" \
  --exclude storage/ \
  "${REPO_ROOT}/docker/danai/deploy/" "${REMOTE}:${REMOTE_DIR}/"

echo "==> [5/5] loading image and starting compose on ${REMOTE}..."
ssh_remote "mkdir -p ${REMOTE_DIR} && podman load -i ${REMOTE_DIR}/$(basename "$TAR_FILE")"
# same tag-mixup guard on the remote side after load
if ! ssh_remote "podman run --rm ${PG_IMAGE} psql --version" >/dev/null 2>&1; then
  echo "remote ${PG_IMAGE} tag is wrong after load; fix with:" >&2
  echo "  ssh -p ${SSH_PORT} ${REMOTE} 'podman rmi ${PG_IMAGE} && podman pull ${PG_IMAGE}'" >&2
  exit 1
fi
# 首次部署：生成 .env 并自动填入两把密钥；DB_PASSWORD 云端自行修改
ssh_remote "cd ${REMOTE_DIR} && if [ ! -f .env ]; then \
  cp .env.example .env && \
  sed -i \"s|^APP_KEY=.*|APP_KEY=\$(openssl rand -base64 32)|\" .env && \
  sed -i \"s|^ENCRYPTION_FIELD_KEY=.*|ENCRYPTION_FIELD_KEY=\$(openssl rand -base64 32)|\" .env && \
  sed -i \"s|^DB_PASSWORD=.*|DB_PASSWORD=\$(openssl rand -base64 24 | tr -d '/+=')|\" .env && \
  echo '.env created with generated keys'; \
else echo '.env exists, kept as-is'; fi"
ssh_remote "cd ${REMOTE_DIR} && rm -f $(basename "$TAR_FILE") && TAG=${TAG} podman compose up -d"

echo "==> waiting for app to come up on ${REMOTE} (first boot installs the database, 1-2 min)..."
for i in $(seq 1 40); do
  if ssh_remote "curl -sS -o /dev/null -m 5 http://127.0.0.1:13000/api/app:getInfo" 2>/dev/null; then
    echo "==> DEPLOYED: http://${REMOTE#*@}:13000 (image ${IMAGE_NAME}:${TAG})"
    exit 0
  fi
  sleep 5
done
echo "==> app not answering yet; check with: ssh -p ${SSH_PORT} ${REMOTE} 'cd ${REMOTE_DIR} && podman compose logs --tail 50 app'" >&2
exit 1
