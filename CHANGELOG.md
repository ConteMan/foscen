# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
