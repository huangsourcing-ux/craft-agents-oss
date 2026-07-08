# AGENTS.md — craft-fork 前端改造规范

> 本文件供 AI 编程助手（Codex / Claude Code / Cursor）阅读。本仓库 fork 自 `lukilabs/craft-agents-oss`，目标是改造成我们自己品牌的跨境电商 AI Agent 桌面客户端。**本仓库的第一原则：改动越少越好、越集中越好**，因为上游项目持续更新，散乱的改动会让未来合并官方更新变成灾难。

---

## 1. 这个仓库是什么、不是什么

**是**：
- 一个 fork，上游是 `lukilabs/craft-agents-oss`（Apache 2.0，Electron 桌面 agent 客户端）
- 我们产品的**前端/客户端**：员工装在电脑上，登录后与部署在客户服务器上的后端对话
- 改造范围：登录流程、隐藏配置界面、中文化、品牌化、预置连接配置

**不是**：
- 不是后端。所有业务逻辑（领星数据、知识库、出图）在另一个仓库 `agent-server` 里，以 MCP 服务形式存在，本仓库只负责显示和交互
- 不是从零开发的项目。上游代码是主体，我们的改动是"薄薄一层定制"

## 2. 上游项目结构速览（改代码前先定位）

```
craft-fork/
├── apps/
│   ├── electron/        # 桌面应用主体（主进程 + renderer，React UI 在这里）
│   └── cli/             # 命令行客户端（我们基本不动）
├── packages/
│   ├── core/            # 会话/agent 核心逻辑（尽量不动）
│   ├── server/          # headless server（部署在客户服务器上的那部分）
│   └── shared/          # 共享代码，含 auth、config（登录改造会触及）
└── ...
```

技术栈：Bun（包管理和运行时，**不是 npm**）、TypeScript、Electron、React。

常用命令：
```bash
bun install
bun run electron:start                      # 起桌面应用
bun run packages/server/src/index.ts        # 起 headless server
```

## 3. 允许改动的范围（白名单）

只有以下四类改动是本仓库的合法工作，其他改动需求先停下来向人类确认：

1. **登录流程改造**：把原生的"API key / OAuth"登录替换为"账号 + 密码"表单。提交目标是我们的 auth-gateway（地址来自构建时配置），由网关完成验证并返回连接信息（server URL + token），客户端拿到后自动连接 headless server。涉及 `packages/shared` 的 auth/config 部分和 `apps/electron` 的登录相关组件
2. **隐藏配置类 UI**：普通用户不应看到 LLM 连接配置、Sources（MCP）管理、Skill 管理、workspace 创建等界面。实现方式优先"条件渲染隐藏"，而不是删除代码——删除会加大与上游的 diff
3. **中文化**：界面文案汉化。优先集中管理（若上游无 i18n 机制，建立一个文案映射层，避免在几百个组件里散落硬编码中文）
4. **品牌化**：应用名称、图标、logo、启动画面、主题色。资源集中在构建配置和 assets 目录。**必须移除上游商标元素**（代码可用，商标不可用）

## 4. 禁止改动的范围（红线）

- **禁止修改 agent 核心逻辑**（`packages/core` 的会话管理、pi/Claude SDK 集成、MCP 客户端实现）。这些是上游维护的主体，我们没有能力也没有必要维护自己的分叉版本
- **禁止在客户端存储或硬编码任何密钥**：CRAFT_SERVER_TOKEN、模型 API key、领星 token 一律不出现在本仓库代码和构建产物中。客户端唯一知道的敏感信息是用户自己输入的账号密码，且只在提交给 auth-gateway 的一次请求中使用
- **禁止让客户端直连模型 API 或任何业务数据源**。客户端只和 auth-gateway / headless server 通信
- **禁止引入后端业务逻辑**（数据查询、图片生成调用等属于 agent-server 仓库）
- **禁止大规模重构、格式化、"顺手优化"上游代码**——任何非必要 diff 都是未来合并的负担

## 5. 改动方式的纪律（为了未来能合并上游更新）

1. **每一处对上游文件的修改，都在改动处附近加注释标记**：`// [FORK] 原因简述`，便于日后 merge 冲突时快速识别哪些是我们的改动
2. **能新增文件解决的，不修改原文件**（例如新的登录组件写成新文件，在原入口处做最小改动引用它）
3. **维护 `FORK_CHANGES.md`**（仓库根目录）：每完成一类改造，追加一条记录（改了什么、动了哪些文件、为什么）。这份清单是未来合并上游时的对照表，也是新协作者的入门文档
4. Git remote 约定：`origin` = 我们自己的 fork 仓库（日常 push 目标）；`upstream` = 官方仓库（只 fetch/merge，永不 push）
5. 合并上游更新是**人类发起的专项任务**，AI 助手不得擅自执行 `git merge upstream/main`

## 6. 与后端的接口约定

- 登录：`POST {AUTH_GATEWAY_URL}/login`，body 为 `{ username, password }`，成功返回 `{ token, serverUrl, workspaceId }`，客户端用返回信息连接 headless server
- 用户会话过期（JWT 失效）时，客户端表现为回到登录页，不弹技术性错误
- auth-gateway 地址通过构建时环境变量注入（每个客户的安装包可指向其专属服务器），不写死在源码中
- 图片/视频消息：后端 MCP 工具返回持久 URL，会话流中直接渲染，无需客户端做额外处理

## 7. 构建与交付

- 产物：macOS（.dmg）和 Windows（.exe）安装包，使用仓库自带的 Electron 构建链
- 每个客户可能需要不同的默认 auth-gateway 地址：通过构建参数区分，不通过改源码区分
- 构建产物中不得包含 sourcemap 上传到公开渠道（客户端代码即产品资产）

## 8. 明确禁止的事（汇总）

- 不装 npm，本项目用 Bun
- 不在本仓库写后端逻辑、不装 pi 的包（pi 已是上游依赖，版本跟随上游）
- 不删上游代码（用隐藏/条件渲染替代）
- 不碰 `packages/core` 的核心逻辑
- 不在代码、日志、构建产物中出现任何密钥
- 不擅自合并 upstream
- 对外发布物料中不出现上游商标
