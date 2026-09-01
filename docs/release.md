# macOS 发布

`package.json.version` 是唯一版本事实源。正式发布 tag 必须严格等于 `v<version>`；发布前同步 `CHANGELOG.md`。

## 本地打包

要求 macOS、Node.js 24.x、pnpm 11.13.1。没有 Apple 证书时仍可生成未签名 arm64 应用和安装制品：

```bash
pnpm install --frozen-lockfile
pnpm run verify:config
pnpm run package:mac
pnpm run make:mac
pnpm run verify:package
```

输出位于 `out/`：

- `Foscen.app`：arm64 应用；
- `Foscen-<version>-arm64.dmg`：面向用户安装；
- `Foscen-darwin-arm64-<version>.zip`：GitHub 公共更新服务所需的 macOS 更新载荷。

验证脚本检查 bundle id `com.conteman.foscen`、版本、隐私用途说明、asar、架构、打包应用的可信 UI 启动握手及 DMG/ZIP。正式发布模式还会检查 Developer ID 签名、Gatekeeper 和公证票据。

ZIP 名称符合 Electron 官方更新服务的 macOS 规则：包含 `-darwin`、`-arm64` 且以 `.zip` 结尾。客户端按实际 `darwin-arm64` 请求时会命中该资产；未显式含架构标记的资产会被服务按 `-x64` 处理。

## 实测经验（2026-08-31 首次跑通）

这条链路在 2026-08-31 之前**从未成功执行过**。下面是实际走一遍才暴露的事实，写在这里避免重蹈。

### 公证排队时长不可预测，不要按经验值设超时

同账号、同一天、同一个二进制的实测分布：

| 提交           | 排队时长             | 结果               |
| -------------- | -------------------- | ------------------ |
| 首次提交       | 71 分钟              | Accepted           |
| 随后两次       | 1–2 分钟             | Accepted           |
| 另两次         | 超过 3 小时 / 7 小时 | 长时间 In Progress |
| 最终成功的发布 | **4 小时 1 分**      | Accepted           |

期间 Apple 系统状态页始终显示 Developer ID Notary Service 正常。**新账号首次提交会被送去深度分析，但「跑热后就会稳定变快」是错的**——4 小时那次发生在账号已有多次成功记录之后。

**因此 `release` job 不设 `timeout-minutes`。** GitHub 托管 runner 的 job 默认超时就是 360 分钟，且是硬上限（设更大的值会被截到 360）；公开仓库使用标准 runner 不计费、不限分钟数，等待零成本。曾设过 60 与 120，两次都在公证仍在排队时被取消、丢弃已签名产物。

同类项目（`limboy/crow`、`th-ch/youtube-music`、`marktext/marktext`）的 macOS 构建 job 同样不设这个值。

**不要为此实现「公证与构建分离」的异步架构**：该方案的主要动机是节省 CI 分钟，公开仓库不成立。

### 卡住的提交与客户端是否存活无关

曾假设「CI job 被取消导致 Apple 侧提交卡死」。已被反证：一个 job 仍在正常运行的提交同样排队数小时。诊断时不要用这个理由解释。

排查手段是在本地用凭据直接查 Apple，不依赖 CI 日志：

```bash
xcrun notarytool history --key <p8> --key-id <id> --issuer <uuid>
xcrun notarytool info <submission-id> --key <p8> --key-id <id> --issuer <uuid>
xcrun notarytool log <submission-id> --key <p8> --key-id <id> --issuer <uuid>
```

`log` 在 `In Progress` 期间取不到，只有出结果后才可用。

### `workflow_dispatch` 手动重跑只对「提交里已含修复」的 tag 有效

`workflow_dispatch` 使用 **dispatch ref 上的 workflow 定义**，但 checkout 检出的是**目标 tag 的代码**。若某个脚本修复晚于 tag，新 workflow 传入的环境变量会被 tag 上的旧脚本忽略。

实例：workflow 传 `FOSCEN_RELEASE_TAG=v0.2.3`，而该 tag 提交上的旧 `validate-release.mjs` 优先读 `GITHUB_REF_NAME`（手动触发时是分支名），于是校验报「发布 tag 必须等于 v0.2.3，当前为 main」。

解法是把 tag 移到含修复的提交上重推。

### 未签名版本是自动升级的死胡同

Squirrel.Mac 在应用更新前会校验**当前运行的应用本身**的代码签名，不只是新版本。实测：

| 起点         | 终点         | 结果                            |
| ------------ | ------------ | ------------------------------- |
| 未签名 0.2.1 | 已签名 0.2.2 | ❌ 下载成功后校验失败，版本不变 |
| 已签名 0.2.2 | 已签名 0.2.3 | ✅ 全程通过                     |

未签名版本报错原文：

```
[Error: Code signature at URL .../Foscen.app/ did not pass validation:
 code has no resources but signature indicates they must be present]
{ code: -1, domain: 'SQRLCodeSignatureErrorDomain' }
```

**不要发布未签名的正式版本**——持有者只能手动重装才能回到升级链上。

### 图标不能用 qlmanage 光栅化

`qlmanage -t` 会给 SVG 铺一层不透明白底，生成的 `.icns` 在 Dock 里是「白方块上贴个图标」。本机若无 rsvg-convert / cairosvg / Inkscape，用随包 Electron 光栅化（`scripts/render-svg.mjs`）。改动图标后自查：

```bash
sips -s format png -Z 1024 assets/brand/foscen.icns --out /tmp/i.png
python3 -c "from PIL import Image; print(Image.open('/tmp/i.png').convert('RGBA').getpixel((2,2)))"
```

四角必须是 `(0, 0, 0, 0)`。

### 发布前置检查清单

`scripts/validate-release.mjs` 会拒绝以下情况，提前自查可省一轮：

- `FOSCEN_RELEASE` 未设为 `1`
- 四个 Apple 环境变量任一缺失；`.p8` 文件权限不是 `0600`
- tag 不等于 `v<package.json.version>`，或 HEAD 未带该 tag
- HEAD 未合入 `origin/main`
- `CHANGELOG.md` 缺少该版本标题
- **工作区不干净——包含未跟踪文件**

## 正式发布

`.github/workflows/release.yml` 只响应 `v*` tag。独立质量任务先在只读权限、无 Apple 凭据的环境运行完整门禁；发布任务再进入受保护的 `macos-release` environment，先安装与构建，之后才导入临时 keychain/P8，完成 Developer ID 签名、Apple notarytool 公证和制品验证。资产上传期间 Release 保持 draft，全部上传成功后才切换为公开、非 prerelease。

发布固定使用版本固定的标准 runner 标签 `macos-15`：它本身即 arm64，公开仓库使用免费。不用 `macos-latest`，因为它会随 GitHub 默认系统版本漂移；也不用 `macos-15-xlarge` 等大型 runner，因为大型 runner 即使在公开仓库也单独计费。

`macos-release` environment 的 Actions secrets：

| Secret                | 内容                                                       |
| --------------------- | ---------------------------------------------------------- |
| `MACOS_CERT_P12`      | Developer ID Application 证书与私钥导出的 P12，Base64 编码 |
| `MACOS_CERT_PASSWORD` | P12 导出密码                                               |
| `MACOS_SIGN_IDENTITY` | 完整的 `Developer ID Application: …` 身份名称              |
| `APPLE_API_KEY_P8`    | App Store Connect API 私钥 P8，Base64 编码                 |
| `APPLE_API_KEY_ID`    | API Key ID                                                 |
| `APPLE_API_ISSUER`    | Issuer UUID                                                |

`GITHUB_TOKEN` 由 Actions 自动提供。私钥、证书和密码不得写入仓库、日志或制品；workflow 结束时会删除临时 keychain 和凭据文件。

发布步骤：

1. 更新 `package.json.version` 与 `CHANGELOG.md`，合入 `main` 并通过 selftest；
2. 创建并推送 `v<version>` tag；
3. workflow 先 dry-run 生成并验证制品，再上传到 draft Release，上传完整后才公开；
4. 在 Intel 与 Apple Silicon Mac 上各做一次安装、启动和更新抽查。

不要移动或复用已发布 tag。需要回滚时发布新的 patch 版本；必要时下架有问题的 Release 资产，但保留版本历史。

## 依赖与权限边界

Electron Forge 固定为稳定版 `7.11.2`。其 `@electron/rebuild` 依赖 Electron fork 的 Git commit `06b29aa`；该 commit 是 registry 包 `@electron/node-gyp@10.2.0-electron.2` 的直接父提交，后者只追加版本号。因此 `pnpm-workspace.yaml` 将它覆盖到这个精确 registry 版本，避免 Git 子依赖，同时保留 pnpm 的 exotic 子依赖默认阻断。冻结锁文件和 selftest 负责复验。

Forge 打包需要可直接遍历的 `node_modules`，因此项目在 `pnpm-workspace.yaml` 固定 `nodeLinker: hoisted`；该布局由冻结安装与打包配置门禁共同验证。

主应用只声明 Electron 运行与获批网页场景所需的 JIT、相机、麦克风和位置 entitlement；Renderer、GPU 与通用 Helper 只保留 JIT，Plugin Helper 只保留 Electron 插件运行所需项，避免把主应用设备权限下放。Info.plist 同时说明相机、麦克风、位置、下载目录和图片目录用途。运行时权限仍由 Foscen 的 origin 策略与可信 UI 决定，系统声明不代表自动授权。

macOS 自动升级只能在已签名、公证的安装包中端到端验证；首次验证至少需要连续发布两个递增版本，分别测试“检查、下载、安装、重启”。
