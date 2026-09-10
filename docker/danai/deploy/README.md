# DAN.AI NocoBase 云端部署指南

镜像在本机从源码构建（见 `docker/danai/ship.sh` 与 `docker/danai/PLAN.md`），以离线 tar
分发到云端，不依赖任何镜像仓库。本文面向在云端服务器上操作的人。

## 云端前置条件

- Podman ≥ 4.x（`podman compose` 子命令可用；它会自动调用 docker-compose 或 podman-compose 作为 provider）
- 磁盘 ≥ 10GB（镜像约 3–4GB + 数据增长空间）
- 放行入站端口 13000（或在反代/安全组后自定义映射端口）
- 已收到两个文件：`danai-nocobase-<tag>.tar`（含 app 镜像 + postgres:16）与 `deploy/` 目录

## 首次部署

```bash
# 1. 导入镜像（tar 内含 danai-nocobase:<tag> 和 postgres:16，云端无需联网拉取）
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
    ├── db/postgresql/    #   PostgreSQL 数据（升级保留）
    └── uploads/          #   上传文件（升级保留）
```

## 常见问题

| 现象 | 处理 |
|---|---|
| app 容器反复重启，日志 `database ... not ready after 120s` | postgres 未起来：`podman compose logs postgres`，多为 .env 中 DB_PASSWORD 与 POSTGRES_PASSWORD 不一致（两者同一变量）或 5432 被占用 |
| 首启后访问 `/api/app:getInfo` 404 | 应用还在自动建库，等 1–2 分钟再看 `logs -f app` |
| 磁盘不足 | `podman system df` 查看镜像占用，删除旧 tag |
| 忘记 admin 密码 | 通过 `.env` 的 INIT_ROOT_* 只在首装生效；用已有账号或数据库层面重置 |
