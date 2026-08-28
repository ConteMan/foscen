# 中文微文案

实现必须用本表字面量，不要在 renderer 里另造近义句。主进程已有的成功/失败句能复用的继续复用。动态插入只用模板里的引号与占位。

`id` 供代码常量命名（如 `COPY.omnibarDialog`）。

## 对话框与输入

| id                   | 表面        | 文案                      | 用途                                      |
| -------------------- | ----------- | ------------------------- | ----------------------------------------- |
| omnibarDialog        | 地址条      | 打开场景                  | `aria-label` on dialog                    |
| paletteDialog        | 命令面板    | 命令                      | `aria-label` on dialog                    |
| surfaceDialog        | 工作面      | Foscen 控制面             | `aria-label` on dialog                    |
| omnibarList          | 地址条      | 建议                      | listbox `aria-label`                      |
| paletteList          | 命令面板    | 命令                      | listbox `aria-label`                      |
| urlLabel             | 地址条      | HTTPS 地址或场景          | visually-hidden label，不只靠 placeholder |
| urlPlaceholder       | 地址条      | 输入 HTTPS 地址或搜索场景 | placeholder                               |
| paletteLabel         | 命令面板    | 搜索命令                  | visually-hidden label                     |
| palettePlaceholder   | 命令面板    | 搜索命令                  | placeholder                               |
| sceneNameLabel       | 工作面/场景 | 场景名称                  | visually-hidden label                     |
| sceneNamePlaceholder | 工作面/场景 | 给当前网页起个名字        | placeholder                               |

## 按钮与控件 aria-label

| id                   | 文案           | 用于                                                        |
| -------------------- | -------------- | ----------------------------------------------------------- |
| close                | 关闭           | 所有 overlay 关闭按钮（不再用「关闭控制面」）               |
| back                 | 后退           | 地址条                                                      |
| forward              | 前进           | 地址条                                                      |
| reload               | 刷新           | 地址条                                                      |
| goRow                | （无独立按钮） | 前往是 option，不是按钮                                     |
| saveScene            | 保存当前场景   | 主按钮                                                      |
| openScene            | 打开           | 场景行                                                      |
| deleteScene          | 删除           | 场景行                                                      |
| approveDownload      | 允许下载       | 下载行                                                      |
| rejectDownload       | 拒绝           | 下载行                                                      |
| permissionOnce       | 允许一次       | 权限                                                        |
| permissionSession    | 本次会话       | 权限                                                        |
| permissionPersistent | 始终允许       | 权限                                                        |
| permissionReject     | 拒绝           | 权限                                                        |
| permissionRevoke     | 撤销           | 权限记录                                                    |
| updateCheck          | 检查升级       | 设置/更新（与现网「检查升级」对齐，不用「检查更新」当按钮） |
| updateInstall        | 重启并安装     | 设置/更新                                                   |

图标 SVG 一律 `aria-hidden="true"`。

## 建议行标题（option 第一行）

| id         | 文案                        |
| ---------- | --------------------------- |
| rowCurrent | 当前场景                    |
| rowGo      | 前往                        |
| rowScene   | （场景 `name`，不另加前缀） |
| rowCommand | 见命令表                    |

option 可访问名 = 标题 + 空格 + 副文（URL 或快捷键）。

## 命令面板（顺序固定）

| id            | 标题     | 快捷键 |
| ------------- | -------- | ------ |
| cmdNavigate   | 打开网页 | ⌘ L    |
| cmdScreenshot | 保存截图 | ⌘ ⇧ S  |
| cmdSaveScene  | 保存场景 | ⌘ S    |
| cmdDownloads  | 下载     | ⌘ J    |
| cmdSettings   | 设置     | ⌘ ,    |
| cmdUpdate     | 检查更新 | ⌘ U    |

注意：列表标题用「检查更新」，按钮用「检查升级」，与现网按钮口径一致、避免两处都叫升级造成「应用升级」海报感。

## 工作面 tab 与标题

| id               | 文案          |
| ---------------- | ------------- |
| tabScenes        | 场景          |
| tabDownloads     | 下载          |
| tabSettings      | 设置          |
| tablist          | 工作面分类    |
| headingScenes    | 场景          |
| headingDownloads | 下载          |
| headingSettings  | 设置          |
| settingsWindow   | 窗口          |
| settingsPrivacy  | 权限          |
| settingsUpdate   | 更新          |
| settingsAbout    | 关于          |
| aboutTagline     | Focus + Scene |
| aboutLicense     | MIT           |

## 空态

| id                 | 文案                                    |
| ------------------ | --------------------------------------- |
| emptyScenesSuggest | 没有匹配的场景。补全 HTTPS 地址后回车。 |
| emptyCommands      | 没有匹配的命令。                        |
| emptySceneList     | 还没有保存场景。                        |
| emptyDownloads     | 当前没有下载。                          |
| emptyPermissions   | 没有已记录的权限。                      |

## 错误与状态（贴输入，不进远离的 header）

| id             | 文案                               | 何时                                                              |
| -------------- | ---------------------------------- | ----------------------------------------------------------------- |
| errHttpsOnly   | 仅支持 HTTPS 网页地址              | 显式 http / 凭据 / 其它协议（主进程默认 `InvalidSceneUrlError`）  |
| errUrlInvalid  | 地址格式无效                       | `new URL` 失败且无场景匹配时，可作 status；有场景匹配则只列出场景 |
| errUrlEmpty    | 地址不能为空且不能超过 2048 个字符 | 主进程；overlay 通常不提交空串                                    |
| errLoad        | 页面加载失败，请检查网络或地址     | `loadURL` 失败                                                    |
| errSceneName   | 请输入场景名称                     | 保存时名称为空                                                    |
| errGeneric     | 操作失败，请重试                   | IPC 异常                                                          |
| liveOpening    | 正在打开网页                       | 导航已接受、load 未完成（status）                                 |
| liveScreenshot | 正在保存截图…                      | 命令面板截图进行中                                                |
| liveReady      | （不显示）                         | 不再用「控制面已就绪」占 header                                   |

主进程其它结果句保持现网，作短时 status（工作面 header 右侧，3 秒淡出）：

| id                  | 文案                                     |
| ------------------- | ---------------------------------------- |
| okSceneSaved        | 当前网页已保存为场景                     |
| errSceneSave        | 当前页面不能保存为场景                   |
| okSceneOpened       | 已打开“{name}”                           |
| errSceneMissing     | 场景不存在或已删除                       |
| errSceneOpen        | 无法打开场景                             |
| okSceneDeleted      | 场景已删除                               |
| errSceneDelete      | 无法删除场景                             |
| okScreenshot        | 当前可见网页已保存为 PNG 截图            |
| errScreenshot       | 截图失败                                 |
| okDownloadAllow     | 下载已允许                               |
| okDownloadDeny      | 下载已拒绝                               |
| errDownloadExpired  | 下载审批无效或已过期                     |
| okPermission        | 权限决定已应用                           |
| errPermission       | 权限回应失败                             |
| okRevoke            | 权限决定已撤销                           |
| errRevoke           | 权限撤销失败                             |
| okUpdateCheck       | 正在检查升级                             |
| errUpdateCheck      | 当前状态不能检查升级                     |
| errUpdateCheckRun   | 无法检查更新，请稍后重试                 |
| errUpdatePrepare    | 新版本下载后未能完成安装准备，请稍后重试 |
| errUpdateInstallRun | 无法安装已下载的新版本，请稍后重试       |
| okUpdateInstall     | 正在重启并安装升级                       |
| errUpdateInstall    | 尚无可安装的升级                         |

删除确认：`删除场景“{name}”？`（现网 `confirm`，保留）。

## 页脚

| id          | 文案          |
| ----------- | ------------- |
| footEsc     | Esc 关闭      |
| footPalette | ⌘⇧P 命令      |
| footHttps   | 仅 HTTPS      |
| footOmnibar | ⌘L 打开地址条 |
| footSurface | Esc 返回网页  |

地址条页脚：`footEsc` · `footPalette` · `footHttps`  
命令面板：`footEsc` · `footOmnibar`  
工作面：`footSurface` · `footOmnibar`（短句：「地址请用 ⌘L」若版面不够，用 `footOmnibar`）

工作面备用短句：

| id             | 文案        |
| -------------- | ----------- |
| footUseOmnibar | 地址请用 ⌘L |

## 下载 / 权限 / 升级（沿用现网）

下载状态：等待审批、下载中、已暂停、已完成、已取消、已中断、已拒绝。

权限：摄像头、麦克风、位置、通知、写入剪贴板；允许、拒绝；一次、本次会话、始终。  
提示标题：`请求{权限}、{权限}`（现 `请求摄像头、麦克风` 这种拼接）。

升级标题：此构建不支持自动升级 / 可以检查新版本 / 正在检查新版本 / 发现新版本 / 新版本已准备好 / 已经是最新版本 / 升级失败。
升级失败正文按阶段：`errUpdateCheckRun`（检查）/ `errUpdatePrepare`（已发现新版本、下载之后的校验或安装准备）/ `errUpdateInstallRun`（已下载、安装）。不要在安装准备失败时说「无法检查更新」。真实错误只写日志，不进界面。  
版本行：`当前 {v}` 或 `当前 {v} · 可用 {w}`。

## 明确不用

| 废止                             | 原因                 |
| -------------------------------- | -------------------- |
| 现在要做什么？                   | 海报标题             |
| 键盘优先                         | eyebrow              |
| 所有桌面能力都由可信控制面发起。 | 说明噪音             |
| 控制面已就绪                     | 无信息               |
| 关闭控制面                       | 改为「关闭」         |
| 管理场景                         | 命令改为「保存场景」 |
| 应用升级（命令名）               | 改为「检查更新」     |
| 前往（独立按钮）                 | 回车即前往           |
| FOCUS + SCENE 作为地址条装饰     | 品牌不进地址条       |

## 实现约定

- 全部 `textContent` / `placeholder` / `aria-label` / `confirm()`。
- 场景名、文件名、origin 是数据，不是文案；拼接用本表模板。
- 不要在甲乙丙之间改用词。
