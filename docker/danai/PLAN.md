# DAN.AI NocoBase — Podman 源码镜像打包 + 离线云端部署方案（已实施）

> 状态：**已实施并验证（2026-09-10）**。本文档描述实际落地的方案；原始 2026-07-07 调研结论中
> 已过时的部分（Node >=18、postgres:16、`.dockerignore` 足够可用等）均已按实现修正。
> 实施提交：`4b1efeba54`（打包主体）、`536a11b4a9`（构建类型修复）、`db101eff77`（load 标签
> 错挂防护）、`e6345d3261`（postgres 版本对齐）。

## 目标

- 从**本仓库源码**构建生产镜像（官方 Dockerfile 从 npm 发布包构建，不含本 fork 的自定义
  插件 plugin-ai / plugin-workflow-approval / 品牌定制，故不可用）。
- **离线 tar 分发**到云端：`podman save` → rsync → 远端 `podman load`，不依赖任何镜像仓库
  （本机网络 Docker Hub 不可达）。云端数据库为 **compose 内置 PostgreSQL 18**，与本地
  dev/prod 数据库（`nocobase-postgres-saved`，PG 18.6）同版本，pg_dump 双向可恢复。
- 一键化：`docker/danai/ship.sh user@云端IP` 完成构建→导出→传输→远端加载→起服务→验证。

## 文件清单

```
docker/danai/
├── PLAN.md                     # 本文档
├── ship.sh                     # 一键发货脚本（本机执行）
├── build/
│   ├── Dockerfile              # 多阶段源码构建
│   ├── build.ignore            # podman build --ignorefile 专用排除表
│   └── docker-entrypoint.sh    # 官方 entrypoint 改写（去 db:auth，加 DB 等待）
└── deploy/
    ├── docker-compose.yml      # app + postgres:18
    ├── .env.example            # 必填密钥模板
    └── README.md               # 云端部署/升级/备份一站式说明
```

不改动仓库任何既有文件；`docker/nocobase/cleanup-node-modules.sh` 原样 COPY 进镜像复用。

## 构建（build/Dockerfile）

命令（仓库根执行，ship.sh 已封装）：

```bash
podman build \
  --ignorefile docker/danai/build/build.ignore \
  -f docker/danai/build/Dockerfile \
  --build-arg COMMIT_HASH=$(git rev-parse --short HEAD) \
  -t danai-nocobase:$(git rev-parse --short HEAD) .
```

**builder 阶段**（`node:22-bookworm-slim`）：

- Node 必须 v22：Node ≥23 移除 `SlowBuffer`，编译产物在 `buffer-equal-constant-time`
  处崩溃（见 `.agents/skills/nocobase-prod-start`）；与 `.node-version`=22、官方镜像一致。
- `COPY . .` 后一次 `yarn install --frozen-lockfile --network-timeout 600000` +
  `APP_ENV=production yarn build`。**不做**"先拷 manifest 再 install"的分层缓存：yarn 1
  workspace 的 lockfile 校验要求所有子包 package.json 在场。源码未变时 podman 层缓存全命中，
  重跑只付上下文传输（~660MB）；源码一变则全量重跑（实测约 35–40 分钟）。
- `yarn.lock` 的 resolved 大多指向 `registry.npmmirror.com`，构建机需可达（公网镜像，免登录）。

**workspace 遮蔽清理**（构建成败关键）：`plugin-workflow-approval` 等 pro 插件的
devDependencies 写 `"2.x"`，而 workspace 版本 `2.3.0-beta.8` 是预发布版不满足该 semver
范围，全新 install 时 yarn 会从 npmmirror 拉 npm 稳定版 `2.2.7` 测试链，把
`@nocobase/actions@2.2.7` 等真实拷贝嵌套进插件目录，遮蔽 workspace 包，造成 `Database`
类型双身份，声明构建必挂。Dockerfile 在 install 后用 find 删除 `packages/` 下所有
`*/node_modules/@nocobase/*` 的**非符号链接**拷贝（符号链接指向 workspace，保留）。
验证构建中实际清理了 16 个。

**runtime 阶段**（`node:22-bookworm-slim`）：

- nginx `1.30.1-1~bookworm`（nginx.org 官方源，安装段照搬官方 Dockerfile，本机网络可达）
  + `postgresql-client`（bookworm 自带，供 entrypoint 的 pg_isready 等待循环）。
- `COPY --from=builder /app /app/nocobase` → 跑官方 cleanup-node-modules.sh 瘦身（剥离
  `*.map`、非 `@nocobase` 的 md）→ `rm -f .env` → `mkdir storage/uploads` +
  `node_modules/@nocobase/app/dist/client` 并 touch index.html（nginx docroot 安全网，
  防镜像传输丢符号链接时 404）→ 写 `/app/commit_hash.txt`。
- 固化环境变量：`NOCOBASE_RUNNING_IN_DOCKER=true`、`NB_SKIP_STARTUP_UPDATE=1`、
  `APP_ENV=production`、`DISABLE_PKG_DOWNLOAD=true`（静默跳过 pro 包下载）。
- `HEALTHCHECK`：node fetch `/api/app:getInfo`（start-period 300s，首装建库慢）。
- `EXPOSE 80`；nginx 服务 SPA 并反代 `/api` 到 `APP_PORT`（默认 13000）；compose 发布
  `13000:80`。镜像实测 **3.82 GB**。

**build.ignore**（不是根 `.dockerignore`）：根 `.dockerignore` 不排根 `node_modules`
(2.9G)、`.git`(409M)、`storage`(277M)、`docs`(89M)，上下文会到 ~4GB。排除上述 +
`benchmark`、`examples`、`.agents`、`.zcode`、`.claude`、`docker/danai/deploy`、`*.log`。
**只排除真实 `.env`**（唯一含密钥）：`*.env.example` 系列必须留在上下文——cli-v1 的
`p-test.js:25` 在模块加载期 `readFileSync('.env.e2e.example')`，缺文件 install 直接崩。
`docker/danai/build` 自身不能排除（runtime 阶段要从上下文 COPY entrypoint）。

## entrypoint（build/docker-entrypoint.sh）

官方脚本的差异：去掉本 fork cli-v1 未注册、`set -e` 下必崩的 `yarn nocobase db:auth`；
去掉不使用的 `NOCOBASE_EXTRACT_CLIENT_ASSETS`/CDN 分支。流程：

1. 打印 `/app/commit_hash.txt`、校验 package.json；
2. `node_modules/@nocobase/app` 非符号链接则手动 `ln -s`（docroot 双保险）；
3. `yarn nocobase postinstall`（patch-package + 插件符号链接）；
4. **等待 DB**（替代 db:auth）：postgres 方言 `pg_isready` 循环、其余 node TCP 探测，
   ≤120s 超时退出。app 先于 DB 启动会陷入最长 ~4 分钟的指数退避重连，必须在此把关；
5. `generate-instance-id` → `create-nginx-conf` → 软链 `/etc/nginx/conf.d/` → 启动 nginx；
6. 跑 `storage/scripts/*.sh` 用户启动钩子；
7. `exec yarn start --quickstart`（空库自动建表+种子，已有库自动做版本升级同步）。

## 部署（deploy/）

- **compose**：`app`（`danai-nocobase:${TAG:-latest}`，`13000:80`，
  `./storage:/app/nocobase/storage:Z`，`env_file .env`，depends_on postgres
  service_healthy，restart unless-stopped，init）+ `postgres:18`（`wal_level=logical`，
  数据落 `./storage/db/postgres`，PG18 嵌套布局在 `18/docker/` 子目录，pg_isready
  healthcheck）。用 `podman compose`（docker-compose provider，需 podman.socket）。
  entrypoint 自带等待循环，健康门控只是加速项而非依赖。
- **.env.example**：必填 `APP_KEY`、`ENCRYPTION_FIELD_KEY`（`openssl rand -base64 32`
  生成，**生成后永不可改**）、`DB_PASSWORD`；默认 DB 指向 compose 内 postgres；可选
  `INIT_ROOT_*`、`APP_BRAND_*`。
- **README.md**：云端前置（podman ≥4.x、磁盘 ≥10G、放行 13000）、首启/升级/回滚/备份
  恢复、常见问题。升级 = load 新 tag 镜像 → `TAG=<new> podman compose up -d`，schema
  自动升级，storage 卷持久；回滚同理换旧 tag。

## ship.sh 一键流程（本机执行）

`docker/danai/ship.sh user@host [-p 端口] [--remote-dir 目录] [--build-only]`

1. `TAG=$(git rev-parse --short HEAD)`，podman build（双 tag：短哈希 + latest）；
2. 确保本地有 `docker.io/library/postgres:18`（走 CN 镜像拉取）；
3. `podman save` 单 tar（app + postgres:18，云端免联网拉取）；
4. rsync tar + `deploy/` 到远端 `~/danai/`；
5. 远端 `podman load` → 首次自动 `cp .env.example .env` 并 openssl 生成两把密钥 +
   DB_PASSWORD → `TAG=<tag> podman compose up -d` → 轮询 curl 验证。

**标签错挂防护**（本地 save 前后各一次）：podman 6.1.x 多镜像 load 实测会把 repo tag
错挂（postgres:16 曾挂到 app 镜像上，真身变悬空镜像），两镜像 entrypoint 同名无法区分，
故用 `podman run --rm $PG_IMAGE psql --version` 探测，失败即报错并给出
`rmi && pull` 修复命令。

## 验证记录（2026-09-10 实测）

- 镜像构建成功（3.82 GB；构建上下文 ~660MB；4 轮迭代后通过）。
- 本地 compose 冒烟：entrypoint 全流程（DB 等待 → instance-id → nginx → PM2）；
  空库自动建 **106 张表**；`/` 返回 SPA（HTTP 200）、`/api/app:getInfo` 返回
  `2.3.0-beta.8`；down → up 重启后用户数据保留、应用恢复。
- save/load 回环：3.6 GB tar 删镜像后 load 恢复成功。

## 实施过程中修复的仓库既有问题

| 问题 | 修复 |
|---|---|
| `plugin-ai` vditor 编辑器 `lang` 为宽泛 `string`，严格声明构建报 TS2322 | `as const` 字面量元组 + 类型守卫收窄为 `keyof II18n` 字面量联合 |
| `plugin-workflow-webhook` 从 `@nocobase/flow-engine` 导入不存在的 `VariableOption` | 改从 `@nocobase/plugin-workflow/client-v2`（实际导出方）导入 |
| pro 插件 devDeps `"2.x"` 拉入 npm 2.2.7 拷贝遮蔽 workspace 包（见上文清理步骤） | Dockerfile install 后清理 + 本地删除遗留嵌套 node_modules |

这三类问题 dev 模式（tsx）全部静默放过，只有 `yarn build`（tsc 声明）会暴露——本地
全量 `yarn build` 通过（815s，0 声明失败）是镜像可构建的前置条件。

## 注意事项

- **镜像 tag 与源码对应**：tag = 构建时 HEAD 短哈希。工作区有未提交改动时构建出的镜像
  与 tag 不严格对应——发货前先提交（`ship.sh` 不会替你检查）。
- 只改 `.env`/compose 配置不需要重建镜像；源码变了必须重建（~40 分钟，无更快路径）。
- 本地开发库数据在匿名卷（容器 `nocobase-postgres`），与镜像无关；重建容器前先备份数据卷。
