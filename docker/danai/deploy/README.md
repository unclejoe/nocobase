# DAN.AI NocoBase 云端部署指南

部署分两条路径，云端服务器侧的首次部署/升级/备份步骤完全一致：

| | 方式 A：云端构建（推荐） | 方式 B：离线镜像 |
|---|---|---|
| 本机执行 | `docker/danai/ship-source.sh user@host` | `docker/danai/ship.sh user@host` |
| 网络传输量 | **纯源码 ~190MB**（压缩后更小） | 整镜像 tar ~3.6GB（rsync -z 后约 1.4GB） |
| 构建位置 | 云端（35–40 分钟） | 本机 |
| 云端额外要求 | podman ≥4.7、可访问 npmmirror / deb.debian.org / nginx.org | 无（tar 内含全部所需） |

两条路径都会自动生成 `.env` 密钥、启动 compose 并验证；下面按收到交付物后手动操作的场景写。

## 云端前置条件

- Podman ≥ 4.7（方式 A 需 `--ignorefile`；`podman compose` 子命令可用，它会自动调用
  docker-compose 或 podman-compose 作为 provider，需要 `systemctl --user start podman.socket`）
- 磁盘 ≥ 10GB（镜像约 3.8GB + 数据增长空间）
- 放行入站端口 13000（或在反代/安全组后自定义映射端口）
- 方式 A 收到：`src/`（纯源码）与 `deploy/` 目录；方式 B 收到：
  `danai-nocobase-<tag>.tar`（含 app 镜像 + postgres:18）与 `deploy/` 目录

## 首次部署（方式 A：云端构建，手动等价流程）

```bash
# 0. 若 docker.io 不可达，先在本机流式送一次构建基础镜像（233MB，一次性）：
#    podman save node:22-bookworm-slim | gzip -1 | ssh user@host 'gunzip | podman load'
# 1. 构建（src/ 即 ship-source.sh 同步过去的纯源码，仓库根有 Dockerfile 相关文件）
cd ~/danai/src && podman build \
  --ignorefile docker/danai/build/build.ignore \
  -f docker/danai/build/Dockerfile \
  --build-arg COMMIT_HASH=<tag> \
  -t danai-nocobase:<tag> -t danai-nocobase:latest .
# 2. 起服务（回到 ~/danai，.env 就绪后）
cd ~/danai && TAG=<tag> podman compose up -d
```

## 首次部署（方式 B：离线镜像）

```bash
# 1. 导入镜像（tar 内含 danai-nocobase:<tag> 和 postgres:18，云端无需联网拉取）
podman load -i danai-nocobase-<tag>.tar

# 2. 准备部署目录
mkdir -p ~/danai && cd ~/danai        # 把 deploy/ 内容放在这里
cp .env.example .env

# 3. 生成必填密钥并填入 .env（APP_KEY、ENCRYPTION_FIELD_KEY 两行）
openssl rand -base64 32
openssl rand -base64 32
vi .env                               # 同时设置 DB_PASSWORD（postgres 容器同用此密码）

# 4. 启动（TAG 必须与 tar 中镜像 tag 一致）
TAG=<tag> podman compose up -d
```

首次启动流程：等待 postgres 健康 → nginx 起动 → 应用检测到空库**自动建表并初始化**
（约 1–2 分钟）。查看进度：

```bash
podman compose logs -f app
```

验证：

```bash
curl http://127.0.0.1:13000/api/app:getInfo   # 返回 {"data":{"version":"2.3.0-beta.8",...}}
```

浏览器访问 `http://<服务器IP>:13000` 出现初始化/登录页面即部署成功。

## 日常运维

```bash
podman compose ps                      # 状态
podman compose logs -f app             # 应用日志（nginx 在同容器内）
podman compose restart app             # 重启应用
podman compose down                    # 停止（数据保留）
```

## 升级到新版本

方式 A（云端构建）：在本机提交新代码后重跑 `docker/danai/ship-source.sh user@host`
（同步新源码 → 云端重建镜像 → 换 tag 起）；手动等价流程：

```bash
# 同步新源码后（src/ 已是新版本）
cd ~/danai/src && podman build \
  --ignorefile docker/danai/build/build.ignore -f docker/danai/build/Dockerfile \
  --build-arg COMMIT_HASH=<newtag> -t danai-nocobase:<newtag> -t danai-nocobase:latest .
cd ~/danai && TAG=<newtag> podman compose up -d
podman image rm danai-nocobase:<oldtag>     # 确认新版正常后清理旧镜像
```

方式 B（离线镜像）：

```bash
podman load -i danai-nocobase-<newtag>.tar
TAG=<newtag> podman compose up -d      # 容器换用新镜像重建
podman image rm danai-nocobase:<oldtag>   # 确认新版正常后清理旧镜像
```

应用启动时会自动比对版本并同步数据库结构（无需手工跑迁移）。`./storage` 目录持久化
了上传文件与运行数据，升级不受影响。回滚 = `TAG=<oldtag> podman compose up -d`。

## 备份与恢复

```bash
# 备份（写入 ./storage/db/postgres/backups/，即容器内 /backups）
podman exec danai-app-1 pg_dump -h postgres -U nocobase -d nocobase > backup-$(date +%F).sql
# 同时归档 ./storage 目录（上传文件 + .license/instance-id）

# 恢复
podman compose down
rm -rf ./storage/db/postgres && mkdir -p ./storage/db/postgres   # 清空后重建
podman compose up -d postgres && sleep 10
cat backup-YYYY-MM-DD.sql | podman compose exec -T postgres psql -U nocobase -d nocobase
TAG=<tag> podman compose up -d
```

## 目录说明

```
~/danai/
├── .env                  # 密钥与数据库配置（勿泄露、勿改密钥）
├── docker-compose.yml
└── storage/              # 全部持久化数据
    ├── db/postgres/       #   PostgreSQL 18 数据（PG18 嵌套布局在 18/docker/ 子目录，升级保留）
    └── uploads/          #   上传文件（升级保留）
```

## 常见问题

| 现象 | 处理 |
|---|---|
| app 容器反复重启，日志 `database ... not ready after 120s` | postgres 未起来：`podman compose logs postgres`，多为 .env 中 DB_PASSWORD 与 POSTGRES_PASSWORD 不一致（两者同一变量）或 5432 被占用 |
| 首启后访问 `/api/app:getInfo` 404 | 应用还在自动建库，等 1–2 分钟再看 `logs -f app` |
| 磁盘不足 | `podman system df` 查看镜像占用，删除旧 tag |
| 忘记 admin 密码 | 通过 `.env` 的 INIT_ROOT_* 只在首装生效；用已有账号或数据库层面重置 |
