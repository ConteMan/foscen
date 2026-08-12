# Foscen

> Focus + Scene — A focused, keyboard-first desktop container for web scenes.

Foscen 是一个 macOS-first 的 Electron 桌面应用。它不是 Chrome 替代品；它把单个网页作为漂亮、低干扰、近似原生的桌面场景呈现，并让主要操作优先通过键盘完成。

## 当前可验证版本

`0.1.0` 建立了可运行的安全骨架：

- `BaseWindow + WebContentsView` 单窗口组合；
- 可信应用 UI 与不受信任网页使用独立 View 和 Session；
- `⌘L` / `Ctrl+L` 唤起按需浮现的 HTTPS 导航栏；
- `⌘R` / `Ctrl+R` 刷新，`⌥←` / `⌥→` 前进后退；
- 持久网页会话 `persist:foscen-scenes`；
- 默认拒绝权限、新窗口、外部协议、非 HTTPS 导航；
- 单元测试、构建和真实 Electron 启动 smoke。

这只是工程与安全边界的首个切片，不代表 MVP 已完成。

## 开发与验证

要求：macOS、Node.js 24.x、Corepack。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build
pnpm start
```

运行与 CI 相同的一键门禁：

```bash
./scripts/selftest.sh
```

门禁覆盖依赖锁定、格式、Lint、类型检查、单元测试、构建和 Electron 启动 smoke。

## MVP 方向

- 单窗口与 URL 导航；
- 前进、后退、刷新与持久会话；
- 按需浮现 UI、命令面板和全键盘操作；
- 无边框网页截图；
- 场景保存与恢复；
- 下载和按来源授权的基本权限。

## 非目标

- Chrome 扩展生态；
- 密码管理器和浏览器同步；
- 多用户 Profile；
- 完整书签与历史系统；
- 首期全平台支持。

## 项目资料

- [文档索引](docs/README.md)
- [架构](docs/architecture.md)
- [安全边界](docs/security.md)
- [路线图](docs/roadmap.md)
- [架构决策](docs/adr/README.md)
- [贡献约定](CONTRIBUTING.md)
- [变更记录](CHANGELOG.md)

## 许可证

尚未选择开源许可证。仓库公开不等于授予使用、复制或再分发许可；在维护者明确决定前，`package.json` 标记为 `UNLICENSED`。
