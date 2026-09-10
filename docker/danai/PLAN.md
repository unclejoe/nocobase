# 计划：从源码构建 NocoBase Docker 镜像 + 团队部署 Compose

> 状态：**已实施（2026-09-10）**，并升级为 Podman 离线 tar 云端部署方案。实际落地的文件以
> `docker/danai/build/`（Dockerfile、build.ignore、docker-entrypoint.sh）、`docker/danai/deploy/`
> （compose、.env.example、README）与 `docker/danai/ship.sh`（一键构建/导出/远端部署）为准。
> 本文档保留原始调研结论；与实现的差异：Node 基础镜像与 engines 现为 v22（原文写 >=18）；
> 根 `.dockerignore` 不足以排除 node_modules/.git/storage/docs，实际用 `podman build
> --ignorefile` + 专用 build.ignore；`db:auth` 缺失的结论已验证并按此实现（等待循环替代）。
> 日期：2026-07-07
> 适用分支：`feat/ai-employee-markdown-kb`

## 目标

- 从当前仓库源码（含 `feat/ai-employee-markdown-kb` 分支自定义代码）构建 Docker 镜像，**不发布到 registry、不用 verdaccio、不用 create-nocobase-app**。
- 镜像 `docker save` 导出 tar，团队拷贝后 `docker load`，配合 compose 直接 `up -d` 启动。
- 配置锁定：**PostgreSQL + 镜像内置 nginx（与官方一致）+ 离线 docker save/load 分发**。
- **所有新增文件统一放在 `docker/danai/` 下，分两个子目录**：
  - `docker/danai/build/` — 镜像构建相关
  - `docker/danai/deploy/` — 团队部署相关

## 目录结构（待创建）

```
docker/danai/
├── PLAN.md                          # 本文档（已存在）
├── build/
│   ├── Dockerfile                   # 多阶段源码构建（待创建）
│   └── docker-entrypoint.sh         # 自定义入口，去掉官方的 db:auth（待创建）
└── deploy/
    ├── docker-compose.yml           # 团队部署用 app + postgres（待创建）
    ├── .env.example                 # 部署必填环境变量模板（待创建）
    └── README.md                    # 构建/导出/加载/部署一站式说明（待创建）
```

## 关键调研结论（决定方案走向）

调研时所有路径基于仓库根 `/home/dan/Workspace/nocobase/`。

### 1. 构建命令

`yarn install` → `APP_ENV=production yarn build`（=`nocobase-v1 build`）。

- 入口：`package.json` 第 27 行 `"build": "nocobase-v1 build"`。
- 实现：`packages/core/cli-v1/src/commands/build.js` → `@nocobase/build`（`packages/core/build/src/build.ts` 的 `build()`）。
- 原地构建整个 monorepo：各包 `lib/`（CJS）+ 声明文件、`packages/core/app/dist/client/`（前端 SPA v1+v2）。
- 无需 lerna version / `release:force`（那些只为灌 registry）。

### 2. Node 版本

`.node-version`=22，统一用 `node:22-bookworm-slim`（与官方两个 Dockerfile 一致）。`engines.node` 是宽松下限 `>=18`，以 `.node-version` 为准。

### 3. nginx 路径不匹配（已解决）

- 官方 `create-nginx-conf`（`packages/core/cli-v1/src/commands/create-nginx-conf.js`）+ 模板 `packages/core/cli-v1/nocobase.conf.tpl` 把 `root`/`alias` 写死成 `{{cwd}}/node_modules/@nocobase/app/dist/client`。
- 源码构建下 `generateAppDir()`（`packages/core/cli-v1/src/util.js` 第 284-301 行）解析 `@nocobase/app/src/index.ts`，`APP_PACKAGE_ROOT` 是 `packages/core/app`。
- **但** yarn classic workspaces 会在 `node_modules/@nocobase/app` 建符号链接指向 `packages/core/app`（包名 `@nocobase/app` 命中 workspace glob `packages/*/*`，确定行为）。
- 因此 nginx 模板路径经符号链接即等于 `packages/core/app/dist/client`，**官方入口脚本和 nginx 模板无需改动**。
- entrypoint 里加一行 fallback 校验双保险（非符号链接则手动 `ln -s ../../packages/core/app`）。

### 4. `db:auth` 会崩

- 官方 `docker-entrypoint.sh` 第 49 行 `yarn nocobase db:auth`。
- `db:auth` 只在新 `@nocobase/cli`（`nb`）注册，**未在 `nocobase-v1`（cli-v1）注册**（`packages/core/cli-v1/src/commands/index.js` 的命令列表确认无此项）。
- Commander 遇未知命令报错，配合 `set -e` 会让容器退出。
- **自定义 entrypoint 跳过 `db:auth`**，DB 初始化由 `start --quickstart`（`packages/core/cli-v1/src/commands/start.js` 第 58-60 行 `downloadPro()`，以及服务端 db install/sync 流程）兜底。

### 5. 持久化卷

挂 `/app/nocobase/storage`。

- storage 解析见 `packages/core/cli-v1/src/util.js` 第 526-539 行 `resolveStorageRoot`（Docker 里 = `process.cwd()/storage` = `/app/nocobase/storage`）。
- 内含：上传文件、生成的 nginx 配置、logs、插件存储、`.license/instance-id`、sqlite 数据库（如用 sqlite）、`storage/scripts/*.sh` 启动钩子。
- `NOCOBASE_RUNNING_IN_DOCKER=true` 会把 gateway socket + PM2 home 重路由到 `~/.nocobase/`（util.js 第 547-571 行），避免落在 bind-mount 卷里。
- PostgreSQL 数据挂 pg 容器自己的卷。

### 6. 必填环境变量

- `APP_KEY`、`ENCRYPTION_FIELD_KEY`（生成后不可改，否则加密字段无法解密）。
- `DB_DIALECT=postgres`、`DB_HOST/PORT/DATABASE/USER/PASSWORD`。
- 镜像内置：`NOCOBASE_RUNNING_IN_DOCKER=true`、`NB_SKIP_STARTUP_UPDATE=1`、`APP_ENV=production`。
- `APP_PORT` 默认 13000（gateway 内部端口）；nginx 监听 80，compose 映射 `13000:80`。

### 7. 运行时文件系统布局（镜像需提供）

```
/app/commit_hash.txt
/app/docker-entrypoint.sh
/app/nocobase/                      (WORKDIR)
  package.json                      (entrypoint 校验)
  node_modules/
    @nocobase/app/dist/client/      (nginx doc root，需存在)
  storage/                          (持久化卷，bind-mount)
/etc/nginx/conf.d/nocobase.conf     (启动时软链到 storage/nocobase.conf)
```

### 8. 复用官方脚本

`docker/nocobase/cleanup-node-modules.sh` 用于瘦身（剥离 `*.map`、`*.md`、`bower.json` 等，保留 `@nocobase/*` 内容和 `.d.ts`）。COPY 进镜像执行，不修改源文件。

### 9. `.dockerignore`（仓库根）

已排除 `storage/app-dev`、`**/.umi`、`**/.umi-production`、`packages/*/*/{lib,esm,es,dist,node_modules}`、`.vscode`、`.idea`、`*.sqlite`、`/uploads`。因此 `COPY . .` 不会把开发产物带进构建，但仍需在容器内 `yarn install` 重建 node_modules。

## 各文件内容要点（待创建）

### `docker/danai/build/Dockerfile`

多阶段：

**builder**（`node:22-bookworm-slim`）：
- 先 `COPY package.json yarn.lock lerna.json ./` 再 `yarn install --frozen-lockfile`（分层缓存命中）
- `COPY . .`（依赖根 `.dockerignore` 排除开发产物）
- `APP_ENV=production yarn build`（构建所有包 + 前端到 `packages/core/app/dist/client`）

**runtime**（`node:22-bookworm-slim`）：
- 装 nginx 1.30.1 bookworm + postgresql-client（照搬官方 `docker/nocobase/Dockerfile` 第 29-43 行的 nginx 安装段，删 `/etc/nginx/conf.d/default.conf`）
- `COPY --from=builder /app /app/nocobase`
- COPY 官方 `docker/nocobase/cleanup-node-modules.sh` 进来执行瘦身（不修改源文件）
- `mkdir -p storage/uploads node_modules/@nocobase/app/dist/client` + `touch .../index.html`（复刻官方 `Dockerfile-full` 第 199-201 行安全网）
- `RUN rm -f /app/nocobase/.env`（避免开发用 .env 打进镜像）
- 写 commit hash（`ARG COMMIT_HASH`）
- COPY 本目录的 `docker-entrypoint.sh` + 设环境变量（`NOCOBASE_RUNNING_IN_DOCKER=true`、`NB_SKIP_STARTUP_UPDATE=1`、`APP_ENV=production`）+ `WORKDIR /app/nocobase` + `CMD ["/app/docker-entrypoint.sh"]`

注：构建上下文是**仓库根**（`docker build -f docker/danai/build/Dockerfile .`），这样才能 `COPY` 整个 monorepo 源码 + 官方 cleanup 脚本。

### `docker/danai/build/docker-entrypoint.sh`

基于官方 `docker/nocobase/docker-entrypoint.sh` 改写，**去掉 `db:auth`**，流程：

1. 打印 commit hash（`cat /app/commit_hash.txt`）
2. 校验 `package.json` 存在
3. **符号链接双保险**：若 `node_modules/@nocobase/app` 非符号链接，手动 `ln -s ../../packages/core/app`
4. `yarn nocobase postinstall`（patch-package + 插件符号链接，快速无编译）
5. `yarn nocobase generate-instance-id`
6. `yarn nocobase create-nginx-conf` → 生成 `storage/nocobase.conf`
7. 启动 nginx + 软链 `/etc/nginx/conf.d/nocobase.conf`
8. 跑 `storage/scripts/*.sh`（保留官方启动钩子）
9. `yarn start --quickstart`（前台主进程）

### `docker/danai/deploy/docker-compose.yml`

基于官方 `docker/app-postgres/docker-compose.yml` 改写，适配源码构建：

- `app`：`image: team-nocobase:latest`（离线分发固定名）、`ports: 13000:80`、`volumes: ./storage:/app/nocobase/storage`、`env_file: ./.env`、`depends_on: [postgres]`、`restart: unless-stopped`、`init: true`
- `postgres`：`image: postgres:16`（官方示例的 10 偏老，升 16）、`command: postgres -c wal_level=logical`、`./storage/db/postgres:/var/lib/postgresql/data`、账号密码环境变量

### `docker/danai/deploy/.env.example`

部署必填项模板：

```
APP_KEY=                    # 必填，随机 32 位（openssl rand -base64 32）
ENCRYPTION_FIELD_KEY=       # 必填，随机串，生成后不可改！
DB_DIALECT=postgres
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=nocobase
DB_USER=nocobase
DB_PASSWORD=                # 必填，与 postgres 服务一致
```

### `docker/danai/deploy/README.md`

一站式说明：

1. **构建**（仓库根执行）：`docker build -t team-nocobase:latest -f docker/danai/build/Dockerfile .`
2. **导出**：`docker save team-nocobase:latest -o team-nocobase.tar`
3. **加载**（同事）：`docker load -i team-nocobase.tar`
4. **改 `.env`**：`cp docker/danai/deploy/.env.example docker/danai/deploy/.env` 并填值
5. **启动**：`docker compose -f docker/danai/deploy/docker-compose.yml up -d`
6. **访问**：`http://<host>:13000`

## 不改动任何现有文件

所有新增文件都在 `docker/danai/` 的两个子目录下。现有 `Dockerfile`、根 `docker-compose.yml`、`docker/nocobase/*`、`docker/app-*/` 全部保持原样。复用官方 `cleanup-node-modules.sh`（COPY 进镜像，不修改）。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| nginx 符号链接假设（依赖 yarn workspaces 行为） | entrypoint 里 fallback 校验：非符号链接则手动 `ln -s` |
| `db:auth` 缺失导致容器退出 | 自定义 entrypoint 跳过，靠 `start --quickstart` 兜底 |
| 构建耗时长（`yarn build` 全量首次约 10-20 分钟） | README 提示；分层缓存提升后续构建 |
| `.env` 泄露（开发用 .env 被 COPY 进 builder） | runtime 阶段 `rm -f .env` |
| 镜像体积（约 1.5-2.5GB） | cleanup 脚本瘦身；README 提及可选的 production-only 重装进一步瘦身 |

## 验证方式（实施后）

1. `docker build -t team-nocobase:latest -f docker/danai/build/Dockerfile .` 构建成功
2. `docker compose -f docker/danai/deploy/docker-compose.yml up` 容器不退出（entrypoint 跑通）
3. `curl http://localhost:13000` 返回前端 SPA（200 + index.html）
4. 浏览器访问 `http://localhost:13000` 出现初始化向导，DB 连接成功

注：实际构建/运行验证需在目标机器执行（构建耗时长）。首次构建若遇符号链接/路径问题，据此微调 Dockerfile / entrypoint。
