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

## 正式发布

`.github/workflows/release.yml` 只响应 `v*` tag。独立质量任务先在只读权限、无 Apple 凭据的环境运行完整门禁；发布任务再进入受保护的 `macos-release` environment，先安装与构建，之后才导入临时 keychain/P8，完成 Developer ID 签名、Apple notarytool 公证和制品验证。资产上传期间 Release 保持 draft，全部上传成功后才切换为公开、非 prerelease。

发布固定使用显式的 arm64 runner 标签 `macos-15-xlarge`，而不是可能随默认架构漂移的 `macos-15` 别名；产物只包含 arm64，不再合并 x86_64。

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
