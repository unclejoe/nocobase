#!/usr/bin/env bash
# 云端构建部署（推荐路径）：rsync 纯项目源码（git 跟踪文件，约 190MB）到云端，
# 在云端用同一个 Dockerfile podman build 出镜像，再 compose up。
# 3.82GB 的镜像永远不出本机——网络传输量只有压缩后的纯源码。
#
# 用法（仓库根执行）:
#   docker/danai/ship-source.sh user@cloud-host
#   docker/danai/ship-source.sh user@cloud-host -p 2222          # 自定义 ssh 端口
#   docker/danai/ship-source.sh user@cloud-host --remote-dir /srv/danai
#
# 云端前提: podman ≥4.7（--ignorefile）、podman compose 可用（需 podman.socket）、
# 可访问 registry.npmmirror.com / deb.debian.org / nginx.org；node:22-bookworm-slim
# 若无法从 docker.io 拉取，本脚本会自动把本机的基础镜像流式送过去（+233MB 一次性）。
# 备选路径：docker/danai/ship.sh（本机构建 + 离线 tar 传输整镜像）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE_NAME="danai-nocobase"
BASE_IMAGE="docker.io/library/node:22-bookworm-slim"
REMOTE_DIR="~/danai"
REMOTE=""
SSH_PORT=22

while [ $# -gt 0 ]; do
  case "$1" in
    -p) SSH_PORT="$2"; shift 2 ;;
    --remote-dir) REMOTE_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) REMOTE="$1"; shift ;;
  esac
done

if [ -z "$REMOTE" ]; then
  echo "usage: $0 user@cloud-host [-p port] [--remote-dir dir]" >&2
  exit 1
fi

cd "$REPO_ROOT"

# rsync 按 git ls-files 清单传的是工作区当前内容，而 TAG 取自 HEAD——工作区不干净时
# 镜像内容与 tag 对不上且无法追溯，必须先提交（.zcode/ 是本机 AI 会话产物，放行）。
if [ -n "$(git status --porcelain | grep -v '^?? \.zcode/' || true)" ]; then
  echo "工作区有未提交改动（如下），先提交再发货，保证镜像 tag 与源码一致:" >&2
  git status --porcelain | grep -v '^?? \.zcode/' | head -20 >&2
  exit 1
fi

TAG="$(git rev-parse --short HEAD)"
SRC_SIZE="$(git ls-files -z | du -ch --files0-from=- 2>/dev/null | tail -1 | cut -f1)"
ssh_remote() { ssh -p "$SSH_PORT" "$REMOTE" "$@"; }

echo "==> [1/6] rsync 纯源码（git 跟踪 $(git ls-files | wc -l) 个文件，${SRC_SIZE}）→ ${REMOTE}:${REMOTE_DIR}/src/"
ssh_remote "mkdir -p ${REMOTE_DIR}"
# 每次整目录重建，避免上轮被删文件残留破坏构建；190MB 增量 rsync 很快
ssh_remote "rm -rf ${REMOTE_DIR}/src && mkdir -p ${REMOTE_DIR}/src"
git ls-files -z | rsync -0 -az --info=progress2 --files-from=- --from0 "${REPO_ROOT}/" "${REMOTE}:${REMOTE_DIR}/src/"

echo "==> [2/6] 确保云端有构建基础镜像 ${BASE_IMAGE}..."
if ! ssh_remote "podman image exists ${BASE_IMAGE}" >/dev/null 2>&1; then
  if ssh_remote "podman pull ${BASE_IMAGE}" >/dev/null 2>&1; then
    echo "    云端已拉取基础镜像"
  else
    echo "    云端拉取失败（docker.io 不可达），从本机流式传输基础镜像（233MB，一次性）..."
    podman save "$BASE_IMAGE" | gzip -1 | ssh -p "$SSH_PORT" "$REMOTE" "gunzip | podman load"
  fi
fi

echo "==> [3/6] 同步部署配置（compose + .env 模板）..."
rsync -az -e "ssh -p ${SSH_PORT}" "${REPO_ROOT}/docker/danai/deploy/" "${REMOTE}:${REMOTE_DIR}/"
ssh_remote "cd ${REMOTE_DIR} && if [ ! -f .env ]; then \
  cp .env.example .env && \
  sed -i \"s|^APP_KEY=.*|APP_KEY=\$(openssl rand -base64 32)|\" .env && \
  sed -i \"s|^ENCRYPTION_FIELD_KEY=.*|ENCRYPTION_FIELD_KEY=\$(openssl rand -base64 32)|\" .env && \
  sed -i \"s|^DB_PASSWORD=.*|DB_PASSWORD=\$(openssl rand -base64 24 | tr -d '/+=')|\" .env && \
  echo '    .env created with generated keys (首次部署后请妥善保管)'; \
else echo '    .env exists, kept as-is'; fi"

echo "==> [4/6] 云端 podman build（约 35-40 分钟，日志直出，请勿中断 ssh 会话）..."
ssh_remote "cd ${REMOTE_DIR}/src && podman build \
  --ignorefile docker/danai/build/build.ignore \
  -f docker/danai/build/Dockerfile \
  --build-arg COMMIT_HASH=${TAG} \
  -t ${IMAGE_NAME}:${TAG} \
  -t ${IMAGE_NAME}:latest ."

echo "==> [5/6] 启动 compose（app + postgres:18）..."
ssh_remote "cd ${REMOTE_DIR} && TAG=${TAG} podman compose up -d"

echo "==> [6/6] 等待应用就绪（首启自动建库 1-2 分钟）..."
for i in $(seq 1 40); do
  if ssh_remote "curl -sS -o /dev/null -m 5 http://127.0.0.1:13000/api/app:getInfo" 2>/dev/null; then
    echo "==> DEPLOYED: http://${REMOTE#*@}:13000 (image ${IMAGE_NAME}:${TAG})"
    exit 0
  fi
  sleep 5
done
echo "==> app not answering yet; check with: ssh -p ${SSH_PORT} ${REMOTE} 'cd ${REMOTE_DIR} && podman compose logs --tail 50 app'" >&2
exit 1
