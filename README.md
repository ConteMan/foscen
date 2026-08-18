# Foscen

> Focus + Scene — A focused, keyboard-first desktop container for web scenes.

Foscen 是一个 macOS-first 的 Electron 桌面应用。它不是 Chrome 替代品；它把单个网页作为漂亮、低干扰、近似原生的桌面场景呈现，并让主要操作优先通过键盘完成。

## 当前可验证版本

`0.2.0` 是首个可用预览版：

- 单窗口 `BaseWindow + WebContentsView`，可信控制面与不受信任网页隔离；
- HTTPS 导航、持久网页会话、窗口与当前场景恢复；
- 按需控制面、场景保存/打开/删除和完整键盘入口；
- 当前可见网页截图，排他保存到 `图片/Foscen`；
- 仅接受用户动作触发且完整重定向链均为 HTTPS 的下载，经可信 UI 审批后保存到 `下载/Foscen`；
- 摄像头、麦克风、位置、通知和剪贴板写入按来源提示，可选择一次、本次会话或持久决定并随时撤销；
- universal macOS 应用、DMG、升级 ZIP、Developer ID 签名、公证和 GitHub Release 流水线；
- 默认拒绝未知权限、设备/屏幕捕获、新窗口、外部协议和非 HTTPS 导航。

这是早期预览，不是通用浏览器。正式分发的签名、公证与跨版本自动升级仍需仓库配置 Apple 凭据后验证。

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

本地生成未签名的 universal macOS 安装制品：

```bash
pnpm run make:mac
pnpm run verify:package
```

正式发布要求 Developer ID 与 App Store Connect API 凭据，详见[发布文档](docs/release.md)。

## 键盘入口

| 操作       | macOS       | 其他平台        |
| ---------- | ----------- | --------------- |
| 地址       | `⌘ L`       | `Ctrl L`        |
| 命令面板   | `⌘ ⇧ P`     | `Ctrl Shift P`  |
| 保存场景   | `⌘ S`       | `Ctrl S`        |
| 截图       | `⌘ ⇧ S`     | `Ctrl Shift S`  |
| 权限       | `⌘ ,`       | `Ctrl ,`        |
| 下载       | `⌘ J`       | `Ctrl J`        |
| 升级       | `⌘ U`       | `Ctrl U`        |
| 刷新       | `⌘ R`       | `Ctrl R`        |
| 前进/后退  | `⌥ → / ⌥ ←` | `Alt → / Alt ←` |
| 返回到网页 | `Esc`       | `Esc`           |

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
- [发布](docs/release.md)
- [路线图](docs/roadmap.md)
- [架构决策](docs/adr/README.md)
- [贡献约定](CONTRIBUTING.md)
- [变更记录](CHANGELOG.md)

## 许可证

[MIT](LICENSE) © 2026 ConteMan。
