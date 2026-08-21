# Foscen 控制面设计（⌘L 及相关入口）

本目录只放设计事实与可点选原型。实现仍等用户审阅后再开 `feature/` 分支。仓库根目录的 `design/` 是 Pencil 工作区，不要改、不要 commit。

| 文件                                             | 内容                                          |
| ------------------------------------------------ | --------------------------------------------- |
| **[omnibar.md](omnibar.md)**                     | **唯一数值事实源**（IA 已锁定，视觉甲/乙/丙） |
| [omnibar-prototype.html](omnibar-prototype.html) | 全状态 + 三套风格 + 窄窗/短窗                 |
| [style-compare.html](style-compare.html)         | 甲乙丙同一「空态 + 三条建议」                 |
| [tokens.json](tokens.json)                       | 机器可读 token                                |
| [brand.md](brand.md)                             | 16px 实测与品牌用法                           |
| [current-assessment.md](current-assessment.md)   | 实地评估                                      |
| [current/](current/)                             | 现状截图                                      |
| [explorations/](explorations/)                   | 生图与 16px 栅格                              |

相关 ADR：[0003](../adr/0003-trusted-window-shell-and-settings.md)、[0004](../adr/0004-on-demand-omnibar.md)（提议，方向 A 已采纳）。
