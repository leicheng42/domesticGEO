# domesticGEO

前台基于 `https://www.geokeji.com/` 完整镜像资源托管，后台为本地可管理系统（文章、表单、品牌配置）。

## 启动

```bash
npm install
npm start
```

启动后：

- 前台站点：`http://localhost:3000`
- 后台入口：`http://localhost:3000/admin`

默认后台密码：

`admin123456`

可通过环境变量覆盖：

- `PORT`（默认 `3000`）
- `ADMIN_PASSWORD`（默认 `admin123456`）
- `SESSION_SECRET`（默认内置开发值）

## 已实现后台功能

- 品牌配置（logo、公司名、电话、地址等）
- 文章发布（草稿/发布、slug、封面、正文）
- 表单线索收集（联系页提交入库）
- 已有官网文章同步（后台“文章管理”自动显示镜像站原有文章）
- 静态文章接管编辑（可在后台一键“导入到后台”再编辑发布）
- 博客页服务端注入后台新增文章（发布后无需依赖前端脚本即可显示）

## 数据存储

数据文件：

`/Users/leicheng/VSCodeProject/SotaWork/test-project/geokeji-web/domesticGEO/data/site-data.json`

可直接备份该文件完成数据迁移。
