# Foscen Agent Rules

## 入口

开始工作前先读：

1. 本文件；
2. [README.md](README.md)；
3. [架构](docs/architecture.md)与[安全边界](docs/security.md)；
4. 与变更相关的 [ADR](docs/adr/README.md)。

证据优先级：本文件与父级 `AGENTS.md` > 统一工程规范 > 已合入的近期项目惯例 > 合理默认值。以实际文件、Git 状态和可重复验证为准。

## 硬规则

- Foscen 是特殊网页桌面容器，不扩展成通用浏览器。
- 不受信任网页只能进入 scene View；禁止 preload、Node.js 集成和直接 IPC。
- 可信 UI 必须保持 `contextIsolation: true`、`sandbox: true`、最小 preload、逐项 IPC 白名单、发送方与参数校验。
- 不得放宽 `webSecurity`、外部协议、新窗口、导航和权限策略来绕过问题。
- `BaseWindow` 关闭或移除 View 时必须显式关闭对应 `webContents`。
- 禁止提交 secrets、Cookie、私钥、生产凭据、`.env` 与本地运行数据。
- Node 固定 24.x；包管理器固定 pnpm 11.13.1；依赖精确锁版本并提交 `pnpm-lock.yaml`。
- 长期事实写入 README/docs/ADR；任务进度留在 Issue/PR，不复制成文档状态。

## 工作流

- 默认分支为 `main`。除空仓库初始化首提外，不直接在 `main` 开发。
- 分支使用 `feature/`、`fix/`、`docs/`、`chore/`、`release/`，不加 `codex/`。
- Commit 与 PR 标题使用 `<type>(<scope>): <中文主题>`，一个提交/PR 只解决一个目标。
- PR 说明必须包含依据、变更范围、验证证据、文档同步、风险与回滚。
- 发布遵循 SemVer，以根 `package.json.version` 为唯一版本事实源，并同步 `CHANGELOG.md`。

## 验证

完整门禁只有一个入口：

```bash
./scripts/selftest.sh
```

变更必须运行与风险相称的验证；交付前必须运行完整门禁并检查 `git diff`、`git status`。安全边界变化必须同步 `docs/security.md`，重要架构变化必须新增或更新 ADR。
