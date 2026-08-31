# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.3] - 2026-09-01

### Fixed

- 补记 0.2.2 未写入的两项发布链路修复：发布 workflow 因 `release` job 在 job 级 `env` 使用 `runner` 上下文而始终无法通过 GitHub 校验、从未执行过，改为在 step 内写入 `$GITHUB_ENV`（#24）；发布 job 超时由 60 分钟上调至 120 分钟，避免 Apple 公证排队导致已签名产物被丢弃（#26）。

### Notes

- 本版用于验证「已签名 → 已签名」的应用内升级链路（#3）。0.2.2 已确认无法从未签名的 0.2.1 升级：Squirrel.Mac 要求当前运行的应用本身具备有效签名。

## [0.2.2] - 2026-08-31

### Added

- 首个经 Developer ID 签名并通过 Apple 公证的发布，应用内自动升级自此具备可用前提。

### Changed

- 发布产物由 universal 改为仅 arm64：体积从约 207MB 降至约 114MB，自动升级每次下载完整包，减半直接改善升级体验。
- 发布 CI 固定使用版本固定的标准 runner `macos-15`（本身即 arm64、公开仓库免费），不再使用 Intel runner 合并 universal。

### Fixed

- 更新失败不再被整个吞掉：记录真实错误，并按检查 / 下载 / 安装阶段给出对应文案（#16）。
- `selftest` 的 smoke 步骤改用独立 `--user-data-dir`，不再因本机已有实例运行而误报失败（#17）。

## [0.2.1] - 2026-08-28

### Added

- ⌘⇧P 命令面板与 ⌘S / ⌘, / ⌘J / ⌘U 工作面分层，两者查询域不同不再合成单一面板。
- 新增 `chrome:request-size` 通道，渲染层回报建议行数，主进程校验 sender、呈现枚举与行数上限后重算控制面几何。

### Changed

- ⌘L 打开的控制面由 1176×530 多标签面板改为按需地址条：高度 = 90 + 行数 × 40，不预留最大值。
- 地址条按 ARIA 1.2 combobox 实现，焦点留在输入框，高亮走 `aria-activedescendant`。
- 覆盖层配色由品牌绿改为中性黑白灰，取消强调色，层级只由明度承担；错误不靠颜色传达。
- 品牌标重做为「光圈」，并拆成带底板的应用图标与脱板的应用内标两份资产。

### Fixed

- `.icns` 不再带不透明白底：`qlmanage` 不保留 SVG 透明度，改用随包 Electron 光栅化。
- 应用图标画布比例由 89% 收到 80.5%，与实测的系统图标一致。
- Esc 后再按 ⌘L 不显示：`revealTimer` 与状态推送被 `unref`，Electron 在事件循环空闲时不调度。
- 工作面 tabpanel 被程序化聚焦时画出贯通亮线；`querySelector` 的逗号选择器按文档顺序返回导致优先级失效。

### Added

- 加入位于网页下方的可信窗口外框，默认通过顶部外框可靠拖动窗口。
- 控制面顶部可拖动窗口，按钮和输入使用 `app-region: no-drag` 保持正常交互。

### Changed

- 默认边框布局将 scene 从四边等距内缩，避免拖动入口覆盖网页控件；同时预留无常驻拖动层的极简布局语义。
- macOS 原生交通灯在窗口首次显示前默认隐藏，后续由通用设置提供显示开关。

### Security

- window chrome 只加载精确随包本地文档，不配置脚本、preload、Node 或 IPC，并位于 scene 下方拒绝外部导航与新窗口。

## [0.2.0] - 2026-08-19

### Added

- 加入按需浮现的键盘优先控制面、场景保存/恢复与窗口状态持久化。
- 加入当前视口 PNG 截图、下载审批与进度、按 HTTPS origin 的权限交互和撤销。
- 加入 universal macOS 应用、DMG/ZIP、签名、公证、GitHub Release 与自动升级基础设施。
- 加入 MIT 许可证和 Foscen 品牌图标。

### Security

- 下载使用完整 HTTPS 重定向链、用户手势、2 GiB 上限和私有暂存后排他发布。
- 未知权限、跨来源/子 frame 请求、设备选择、屏幕捕获、新窗口和外部协议默认拒绝。
- 场景与权限数据使用固定 `userData` 路径、严格 schema、私有权限与原子写入。
- 应用启用单实例锁，可信 IPC 同时验证 sender、主 frame、固定文档与参数。
- 权限请求采用有界队列和到达时限，导航/崩溃时默认拒绝；客户端证书始终拒绝。
- 发布凭据与质量门禁隔离，Helper entitlement 按进程收敛，包内容使用运行文件白名单。

## [0.1.0] - 2026-08-13

### Added

- 初始化 Electron 43 + TypeScript 6 工程骨架。
- 建立 BaseWindow、可信 chrome View 与隔离 scene View。
- 加入 HTTPS 导航、基础键盘操作和持久 Session。
- 建立安全策略、ADR、GitHub 模板、CI 与统一 selftest。
