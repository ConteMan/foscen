# 贡献 Foscen

Foscen 当前处于早期阶段。开始实现前，请先确认工作符合 [README](README.md) 的定位与非目标，并阅读 [AGENTS.md](AGENTS.md)。

## 基本流程

1. 从最新 `main` 创建短分支；
2. 保持一个分支、一个目标；
3. 同步代码、测试和长期文档；
4. 运行 `./scripts/selftest.sh`；
5. 使用中文 Conventional Commit；
6. PR 写明依据、范围、验证、风险与回滚。

涉及网页权限、IPC、导航、外部协议、Session、preload 或 Electron 安全选项的变更，必须同步安全文档并增加相应测试。
