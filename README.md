# domesticGEO

前台基于 `https://www.geokeji.com/` 镜像资源托管，后台为可管理系统（文章、表单、品牌配置）。

## 本地启动

```bash
npm install
npm start
```

启动后：

- 前台站点：`http://localhost:3000`
- 后台入口：`http://localhost:3000/admin`

默认后台密码：`admin123456`

## 环境变量

- `PORT`：服务端口，默认 `3000`
- `ADMIN_PASSWORD`：后台登录密码，默认 `admin123456`
- `SESSION_SECRET`：会话密钥，默认开发值
- `DATA_FILE`：数据文件路径，默认 `data/site-data.json`
- `APP_NAME`：PM2 进程名，默认 `domestic-geo`

生产环境建议从示例复制：

```bash
cp .env.production.example .env.production
```

## 后台功能

- 品牌配置（logo、公司名、电话、地址等）
- 文章发布（草稿/发布、slug、封面、正文）
- 表单线索收集（联系页提交入库）
- 官网已有文章同步展示（后台“文章管理”可见）
- 静态文章一键导入后台接管编辑
- 前台博客列表与后台文章统一（发布后直接显示）

## 方案一：仓库推送自动部署（GitHub Actions + 宝塔）

### 1. 宝塔服务器一次性初始化

```bash
# 1) 首次部署代码
cd /www/wwwroot
git clone <你的仓库地址> domesticGEO
cd domesticGEO

# 2) 生产环境变量
cp .env.production.example .env.production
# 编辑 .env.production，至少修改 ADMIN_PASSWORD / SESSION_SECRET

# 3) 初始化并启动
chmod +x deploy.sh
APP_DIR=/www/wwwroot/domesticGEO BRANCH=main DATA_DIR=/www/wwwroot/domesticGEO-data ./deploy.sh
```

说明：

- `deploy.sh` 会自动 `git pull`、安装依赖、启动/重启 PM2。
- 生产数据会放在仓库外：`/www/wwwroot/domesticGEO-data/site-data.json`，避免代码更新覆盖文章/线索数据。

### 2. 配置 GitHub 仓库 Secrets

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 新增：

- `DEPLOY_HOST`：服务器 IP 或域名
- `DEPLOY_PORT`：SSH 端口（例如 `22`）
- `DEPLOY_USER`：SSH 用户（例如 `root`）
- `DEPLOY_PASSWORD`：SSH 登录密码（新手推荐，先用这个）
- `DEPLOY_SSH_KEY`：私钥内容（可选，后续可替换密码方式）

### 3. 自动部署触发

工作流文件已内置：`.github/workflows/deploy.yml`

- 当你 push 到 `main` 分支时自动部署
- 也支持在 Actions 页面手动触发（`workflow_dispatch`）

### 4. 宝塔反向代理

宝塔网站配置反代到：

- 目标：`http://127.0.0.1:3000`

Node 服务由 PM2 托管，不需要每次手动上传压缩包。

## 紧急手动发布命令

如果 CI 临时不可用，可直接 SSH 执行：

```bash
cd /www/wwwroot/domesticGEO
APP_DIR=/www/wwwroot/domesticGEO BRANCH=main DATA_DIR=/www/wwwroot/domesticGEO-data ./deploy.sh
```

## 数据备份

只需备份一个文件：

`/www/wwwroot/domesticGEO-data/site-data.json`
