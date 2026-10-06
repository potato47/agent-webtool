# agent-webtool 开发规范

## 项目范围

- 本项目由用户维护，提供网页抓取和多引擎搜索的 SDK、CLI 与 MCP server；不是只读参考仓库。先读 `README.md`、`docs/npm-release.md`、`package.json`、相关源码并检查 Git 状态，保留已有未提交改动和未跟踪文件。
- SDK 入口在 `src/index.ts`，核心在 `src/core/`，CLI/MCP 在 `bin/`；输入 schema 在 `src/schemas.ts`，结果类型在 `src/core/types.ts`。公共行为变化同时核对三个入口及 README，不只修改某个包装层。
- `dist/` 为构建产物，不手工编辑。SDK 面向 Node/Bun 服务端；不要把 DNS/HTTP 依赖引入浏览器包。
- 网页抓取/搜索的通用能力归本仓库，调用方的模型、agent loop、会话持久化及 UI 归应用仓库。同属 workspace 不代表已经接入 FIA 或麻辣烫。

## 实现与验证

- 网络行为修改核对 URL/DNS/私网检查、重定向、响应大小、超时、取消、字符集及代理路径；测试用离线 fixtures 验证确定行为，真实搜索引擎可用性单独记录。
- 来源编号、缓存或并发行为变更需检查调用间及会话间状态。已有未提交实现、历史集成笔记和发布版契约分开描述，不能仅凭 `package.json` 版本号认为内容相同。
- 实现修改按影响执行 `bun run check`、`bun test test/`、`bun run build`；SDK 导出/打包变化再执行 `bun run verify:sdk`，发布前执行 `bun run npm:pack` 验证实际归档及独立 SDK/CLI/MCP 消费。格式使用已有 Oxfmt，只修改任务涉及文件，避免全库格式化覆盖其他工作。
- 仅文档修改核对事实、链接、变更文件格式与 `git diff --check`，不运行无关完整测试、重建产物或真实联网请求。未运行的验收明确写为“未验证”。

## 官网与版本发布

- Semicoder 是统一官网文档入口；workspace 内入口为 `../semicoder/`，内容归属 `content/projects/agent-webtool/`，来源和版本证据记录在网站 `docs/project-sources.md`。路径仅用于维护，不是构建依赖；首次建立页面前先检查实际内容覆盖。
- 每次版本发布必须同步官网介绍、安装、SDK/CLI/MCP 指南、兼容变化及版本证据；没有页面时补齐内容，受阻时明确记录缺口和完成条件。先验证实际 npm 归档与独立消费，再更新默认安装路线，不能将未发布 API 写成已安装可用。
- GitHub PR/main CI 只检查，`v*` 标签触发 `publish-npm.yml` 的独立 OIDC 发布；手动运行只验收归档。发布前执行 `prepublishOnly` 所列检查与归档消费。源码、dist、npm 归档、GitHub/OIDC 配置和网站部署分别核验；流程存在不代表远端已验收。
- 各仓库独立管理提交。普通开发与文档同步不自动授权推送、npm 发布或网站部署；Semicoder `main` 推送会部署。workspace 可用时同时维护根 `docs/agent/`，独立使用本仓库不依赖该知识库。
