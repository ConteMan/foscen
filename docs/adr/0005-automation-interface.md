# ADR-0005：自动化接口采用 URL Scheme、按需命令接口与 Kinvo 动作清单

- 状态：提议（待维护者裁决）
- 日期：2026-09-30
- 关联 Issue：[#33](https://github.com/ConteMan/foscen/issues/33)
- 关联决策：[ADR-0001](0001-electron-view-boundaries.md)、[ADR-0002](0002-trusted-capabilities.md)、[ADR-0003](0003-trusted-window-shell-and-settings.md)、[ADR-0004](0004-on-demand-omnibar.md)
- 外部协议参考：Kinvo [动作清单协议 v0](https://github.com/ConteMan/kinvo/blob/main/docs/protocol/action-manifest.md)、Kinvo [ADR-0003](https://github.com/ConteMan/kinvo/blob/main/docs/adr/0003-hotkeys-and-focus.md)

## 背景

Foscen 在「个人工具组合」中定位为可定制的网页桌面容器（聚焦单个网页、低干扰呈现、键盘优先、独立场景），与 Muxio（数据与状态中心）及 Kinvo（原生全局入口，按动作清单调用）协同工作，同时保持独立可用。

在 Agent（自动化代理）与全局快捷入口（如 Kinvo）驱动桌面应用时，普遍存在**抢占用户前台焦点**的问题：

1. 通用 Computer-Use 类 Agent 依赖全局鼠标/键盘注入（如 `CGEventPostToPid`、辅助功能 AX API），不可避免地打断用户当前在前台工作区中的输入与焦点。
2. 传统应用通过系统激活方式拉起前台窗口，造成屏幕闪烁与上下文切换打扰。

为了支持外部在不抢焦点的前提下驱动 Foscen，Foscen 应将自身核心能力通过规范接口向外部开放，由 Agent 或 Kinvo 经由接口直接调用，而非让 Agent 模拟点击 UI。

## 现状盘点与代码基线

以当前代码实现为基准，对 Issue #33 涉及的能力进行全面盘点：

| 能力维度                         | 当前代码状态 | 具体实现位置 / 现状说明                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **场景管理 (Scenes)**            | **已存在**   | `src/shared/scenes.ts`（数据模型与约束）、`src/main/scene-store.ts`（`userData/scenes.json` 持久化仓库）、`src/main/index.ts:544-580`（`saveScene`、`openScene`、`deleteScene` 实现）。目前仅由可信控制面 IPC 触发，未向外部暴露。                                                |
| **网页导航 (Navigation)**        | **已存在**   | `src/main/url-policy.ts`（`normalizeSceneUrl` 仅允许规范 HTTPS 地址与内置落地页）、`src/main/index.ts:362`（`navigate(target)`）。目前仅支持单个主窗口中的单个 `sceneView`。                                                                                                      |
| **URL 规则引擎 (Rules)**         | **尚不存在** | 代码中仅有针对单次 URL 的协议校验与清理规则（`url-policy.ts`），**不存在**根据 URL 匹配预设场景、样式注入或行为路由的“规则引擎”，需另行设计与定义。                                                                                                                               |
| **打开形式参数 (Open Forms)**    | **尚不存在** | 代码仅有全局持久化的窗口呈现模式（`WindowPresentationMode: 'frame' \| 'minimal'`，见 `src/main/window-layout.ts` 与 `src/shared/ui-state.ts`），**不支持**外部在打开时通过参数指定浮动、尺寸或指定视图形态。                                                                      |
| **宏命令 (Macros)**              | **尚不存在** | 代码中**没有任何**宏模型、存储、解释器或执行环境，需另行设计与定义。                                                                                                                                                                                                              |
| **URL Scheme 注册与处理**        | **尚不存在** | `package.json` 与 `forge.config.cjs` 未配置 `protocols`；未调用 Electron `app.setAsDefaultProtocolClient`；未监听 macOS `app.on('open-url')`。目前仅有单实例锁 `app.requestSingleInstanceLock()` 并在 `second-instance` 事件中无条件激活主窗口（`src/main/index.ts:1032-1034`）。 |
| **Kinvo 动作清单发布**           | **尚不存在** | 代码中没有任何向 `~/Library/Application Support/Kinvo/providers/` 写入 `foscen.json` 的逻辑。                                                                                                                                                                                     |
| **本机命令接口 (Loopback HTTP)** | **尚不存在** | 应用内未启动任何本地 HTTP/WebSocket 监听服务。                                                                                                                                                                                                                                    |

## 决策

### 1. URL Scheme `foscen://` 动作集合与参数

#### 动作规范

注册自定义 URL 协议 `foscen://`，遵循层次化 Path 与 Query 规范：

1. **按规则/指定形式打开页面**：
   - 格式：`foscen://open?url=<encoded_url>[&form=<form>][&rule=<rule>]`
   - 参数约束：
     - `url`（必填）：经过 RFC 3986 百分号编码的地址。主进程必须调用 `normalizeSceneUrl` 严格验证其为无凭据的 HTTPS 地址，长度限制 ≤ 2048 字符；拒绝 `http:`、`file:`、`javascript:`、`data:` 及所有未知协议。
     - `form`（可选，保留扩展）：由于当前打开形式尚未实现，若接收到该参数，首期记录日志并平滑降级为默认呈现模式，不得直接报错崩溃。
     - `rule`（可选，保留扩展）：由于规则引擎尚未实现，首期平滑降级，仅导航至 `url`。
2. **打开已保存场景**：
   - 格式：`foscen://scene/<id>`
   - 参数约束：`<id>` 必须为合法 ID 格式（字母、数字、短横线、UUID），最大长度 64 字符。主进程校验 `sceneStore.get(id)`，若场景不存在，安全 fail-closed（不进行错误导航，通过控制台/日志记录，界面不弹出侵入式弹窗）。
3. **执行预设宏**：
   - 格式：`foscen://macro/<id>`
   - 说明：在宏模型实现前，接收到此类请求时统一返回/记录未实现错误；宏具备返回结果诉求时，推荐优先使用本机命令接口（见决策 2）。

#### 权衡与备选

- **备选方案 A**：纯 Path 格式（如 `foscen://open/<base64_url>`）。
  - _否决理由_：Base64 编码降低可读性与外部排查便利性；标准 Query 参数与 Kinvo 模板引擎（`{{url}}`）天然吻合。
- **备选方案 B**：统一单动作 `foscen://action?type=...`。
  - _否决理由_：分路径设计语义更清晰，契合 RESTful 资源抽象，便于在打包配置与系统分发中清晰呈现。

### 2. macOS 协议注册与 Non-activating（不抢焦点）策略

#### 注册实现手段

1. **打包静态声明**：在 `forge.config.cjs` 中为 `packagerConfig` 添加协议注册，生成 `Info.plist` 中的 `CFBundleURLTypes`：
   ```js
   protocols: [{ name: 'Foscen', schemes: ['foscen'] }]
   ```
2. **运行时声明**：在主进程启动阶段（`app.whenReady()` 之前或之中）调用 `app.setAsDefaultProtocolClient('foscen')`。在开发宿主下处理参数兼容。
3. **事件捕获**：
   - 监听 `app.on('open-url', (event, url) => { event.preventDefault(); dispatchExternalUrl(url); })`。
   - 注意启动时序：若应用未启动，macOS 在 `will-finish-launching` 或更早派发 `open-url`，主进程必须缓存待处理 URL，直至窗口初始化完成再执行回放。

#### 焦点与激活边界评估（严谨评估 Electron 与 macOS 限制）

- **核心承诺（Foscen 能做到的）**：
  - 在响应 `open-url` 事件进行后台导航时，**Foscen 主进程绝不调用 `app.focus()`、`window.focus()` 或 `sceneView.webContents.focus()`**。
  - 若窗口当前处于隐藏或最小化状态：
    - 若调用意图为后台静默加载（例如预热），窗口不主动 `show()`；
    - 若动作要求显示窗口，仅使用 `BaseWindow.showInactive()`（显示但不激活），避免掠夺当前活跃应用的键盘焦点。
  - 调整现有的 `second-instance` 行为：区分命令行唤起与外部调用，非显式前台意图时不盲目执行 `activeWindow?.focus()`。
- **系统限制（Foscen 做不到的，如实界定）**：
  - 当通过 macOS 系统通用入口（如终端 `open foscen://...` 或普通浏览器跳转）打开 URL scheme 时，macOS `LaunchServices` 的默认系统策略是将目标应用程序激活至前台（等同于带前台标志打开）。
  - **关键结论**：在不侵入操作系统核心、不使用原生私有 C 接口的前提下，Foscen 无法在被 macOS 强行带到前台后“将焦点安全退还给未知的上一应用”。
  - **达成真正无焦点打扰的充要条件**：
    - 外部调用者（如 Kinvo）在 macOS 原生层通过 `NSWorkspaceOpenConfiguration` 打开 URL，并显式指定 `configuration.activates = false`；
    - 或者外部通过 Local HTTP 本机命令接口调用（HTTP 网络调用完全绕过系统窗口激活体系）。

### 3. 本机命令接口（Local Command Interface）定位与边界

#### 是否需要与引入节奏

- **权衡分析**：
  - URL Scheme 的本质是单向触发（fire-and-forget），无响应信道，无法返回执行状态、错误细节或数据载荷；且受制于 macOS 的 URL 激活逻辑。
  - 本机命令接口（Loopback HTTP）能提供完整的双向交互，支持获取场景列表、返回宏执行结果（text/list），并原生具备零焦点打扰特性。
- **推荐策略：首版只做 URL Scheme，本机接口后置**。
  - 第 1 期聚焦交付基础 `foscen://` 协议与 Kinvo `foscen.open` 联调，验证核心链路。
  - 第 2 期配合宏命令与结果回传需求，引入轻量 Loopback HTTP 服务。

#### 本机接口安全设计（后置实现基准）

当第 2 期引入本机 HTTP 接口时，必须遵守以下严格安全约束：

1. **地址绑定**：严格监听 `127.0.0.1` 明文 loopback，禁止监听 `0.0.0.0` 或暴露于外网。
2. **同源防御与防 DNS Rebinding**：
   - 防范不受信任的 scene 网页发起 `fetch('http://127.0.0.1:...')` 探测或越权攻击。
   - 严格校验 HTTP 请求头中的 `Origin` 与 `Sec-Fetch-Site`；除受信任的可信控制面外，凡携带跨域或浏览器 Origin 的请求一律直接 403 拒绝。
3. **进程间单次 Token 鉴权**：
   - Foscen 启动时在内存生成高熵安全 Token，并以原子方式落盘至私有权限文件（`0600`）。
   - 所有本机命令请求必须在 Header 中携带 `Authorization: Bearer <token>`。
4. **绝对不开放任意脚本执行**：
   - 接口仅暴露逐项声明的受限动作（如 `POST /v1/actions/open`、`POST /v1/actions/scenes/:id`）。
   - 严禁提供任何接受任意 JavaScript 字符串并在页面执行的接口（如无限制的 `eval`、`executeJavaScript`）。

### 4. Kinvo 动作清单（`foscen.json`）规范与落盘策略

#### 动作清单协议 v0 规范草案

严格符合 Kinvo `kinvo.actions/0` 规范，草案定义如下：

```json
{
  "protocol": "kinvo.actions/0",
  "provider": {
    "id": "foscen",
    "name": "Foscen",
    "app": "com.conteman.foscen"
  },
  "actions": [
    {
      "id": "foscen.open",
      "title": "以 Foscen 打开",
      "description": "按 Foscen 规则打开页面",
      "params": [
        {
          "name": "url",
          "label": "网址",
          "type": "url",
          "required": true
        }
      ],
      "invoke": {
        "type": "url",
        "template": "foscen://open?url={{url}}"
      },
      "needsInput": true,
      "result": "none"
    },
    {
      "id": "foscen.scene",
      "title": "打开 Foscen 场景",
      "description": "按 ID 切换到已保存的场景",
      "params": [
        {
          "name": "id",
          "label": "场景 ID",
          "type": "text",
          "required": true
        }
      ],
      "invoke": {
        "type": "url",
        "template": "foscen://scene/{{id}}"
      },
      "needsInput": true,
      "result": "none"
    }
  ]
}
```

- 动作 ID 符合 `<provider>.<action>` 的点号多段命名规则（`foscen.open`、`foscen.scene`）。
- 首版仅使用 `invoke.type: "url"`，`result: "none"`；未来宏命令扩展为 `invoke.type: "http"`，`result: "text"` 或 `"list"`。

#### 清单写入机制与落盘决策

- **目标路径**：`~/Library/Application Support/Kinvo/providers/foscen.json`。
- **写入安全要求**：
  - 采用临时文件写入 + `fsync` + 原子重命名（原子替换）；
  - 严格限制文件权限为 `0600`，目录权限 `0700`；
  - 仅写入静态模板内容，不将用户网页内容注入清单。
- **落盘决策选项（列为待维护者裁决项）**：
  - **选项 A（推荐）**：由用户在 Foscen 设置面板中的「扩展 / 集成」中显式点击“注册到 Kinvo”后写入，或在 Kinvo 目录已存在时提示用户一键同步；
  - **选项 B**：Foscen 每次启动时静默检测 Kinvo 目录并写入；
  - **选项 C**：Foscen 不主动写外部目录，仅随包或发布脚本提供清单文件，由外部工具或用户手动拷贝。
  - _权衡_：选项 A 最符合 Foscen “克制、可信 UI 明确授权”的原则；选项 B 自动化程度高但拓展了静默落盘边界；选项 C 对用户不够友好。

### 5. 后台执行语义与宏的设计边界

1. **执行载体隔离**：
   - 现存的 `sceneView` 承载用户正在浏览的前台页面。若后台宏任务直接在 `sceneView` 执行，会破坏用户当前的浏览状态。
   - 后台宏若需无感运行，必须在独立的后台隔离环境（例如无窗口绑定的隐藏 `WebContentsView` 或专用 Worker Session）中执行，用完即毁。
2. **返回信道匹配**：
   - 宏任务若需向 Kinvo 返回摘要结果（`result: "text"`）或列表（`result: "list"`），无法通过 URL Scheme 返回，必须依赖第 2 期的本机 HTTP 接口。
3. **设计边界结论**：
   - 宏不在首期 URL Scheme 中混搭交付；首期 URL Scheme 仅处理场景切换与页面导航。宏的抽象模型与后台执行器随第 2 期切片深入设计。

### 6. 与现有安全边界（`docs/security.md`）逐条对照

| `docs/security.md` 既有红线                            | 自动化接口设计中的执行策略                                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **不受信任网页不得进入桌面权限域**                     | 自动化接口由系统层外部（macOS `open-url` 或 127.0.0.1 HTTP）触发，其权限仅限于调用白名单动作，绝不向网页 DOM 暴露调用入口。                    |
| **scene View 隔离、无 preload、无 Node、无 IPC**       | 外部自动化触发导航时，目标网页依旧在沙箱化、隔离 Session、零 preload 的 `sceneView` 中加载，安全边界无任何放宽。                               |
| **导航策略：仅允许无凭据 HTTPS 与内置落地页**          | `foscen://open` 中的 `url` 参数在主进程统一经由 `normalizeSceneUrl` 过滤；拒绝 `http:`、`file:`、`javascript:`、内嵌凭据、非法协议与超长 URL。 |
| **存储边界：仅限 `userData`，业务 API 不接受任意路径** | 外部接口参数绝对不接受文件路径；写入 Kinvo 目录属于受控的专有文件原子落地，路径锁死为固定常量，严防路径穿越。                                  |
| **新窗口与外部协议默认拒绝**                           | 保持 `setWindowOpenHandler` 全部 `deny`；外部触发不赋予 scene 打开新窗口的特权。                                                               |
| **单实例锁与生命周期治理**                             | 维持 `app.requestSingleInstanceLock()`；URL 调度统一收敛在现有单实例生命周期中，防范重复实例冲突。                                             |

## 后果与实现切片

### 优点

1. **焦点解耦**：Kinvo 与 Agent 可通过已声明的结构化动作驱动 Foscen，大幅降低鼠标模拟对用户工作流的打扰。
2. **能力标准化**：以 Kinvo 协议 v0 为基石，动作定义具备自描述能力，便于多工具生态协同。
3. **架构克制**：分期推进，首版不引入重量级本地服务器与复杂的宏执行引擎，架构风险高度收敛。

### 代价与局限

1. **系统级激活限制与跨仓库依赖**：若外部直接以系统标准方式调用 `foscen://`，macOS 会默认将应用前台化。真正的不抢焦点依赖调用方打开 URL 时显式指定不激活（`NSWorkspace.OpenConfiguration.activates = false`）。经排查 Kinvo 当前实现（`Sources/Kinvo/main.swift`）仍使用传统的 `NSWorkspace.shared.open(url)`，尚未配置该非激活参数；这构成跨仓库依赖，已列为 Kinvo 侧后续项（协调者会在 Kinvo 开 Issue 推进）。在 Kinvo 改造前，外部经系统默认路径唤起仍可能导致窗口被带至前台。
2. **存储边界扩张**：向 `~/Library/Application Support/Kinvo/providers/` 写文件打破了纯 `userData` 内部自闭环的既有边界，需要额外的权限管理与清理逻辑。

### 实现切片建议

#### 切片 1：URL Scheme 与动作清单基础（目标里程碑）

- **范围**：
  - `forge.config.cjs` 注册 `foscen` 协议；
  - `src/main/index.ts` 支持 `setAsDefaultProtocolClient`、`open-url` 监听与 URL 安全分发；
  - 落实 non-activating 策略（主进程不主动 focus）；
  - 实现 Kinvo `foscen.json` 的安全写入或导出；
- **跨仓库依赖**：
  - 真正实现“不抢焦点”需要 Kinvo 打开 URL 时使用 `NSWorkspace.OpenConfiguration.activates = false`。经确认 Kinvo 当前实现尚未支持此配置，已作为 Kinvo 侧后续项跟进（协调者会在 Kinvo 开 Issue，不修改 Kinvo 代码）；Foscen 侧切片 1 先确保自身在处理协议时绝不主动索取或抢占焦点。
- **验收要点**：
  - [ ] 终端或浏览器调用 `foscen://open?url=https://example.com` 正确在 Foscen 内加载页面；
  - [ ] 非法 URL（如 `http://`、`file://`、非法协议）被安全拦截并拒绝导航；
  - [ ] 通过 `foscen://scene/<id>` 可切换至已有场景；不存在的 ID 安全 fail-closed；
  - [ ] Foscen 处于后台时被调用，主进程不执行抢焦点操作；
  - [ ] 生成的 `foscen.json` 通过 Kinvo 动作清单协议 v0 校验。

#### 切片 2：本机命令接口与宏执行沙箱（后续演进）

- **范围**：
  - 本地 Loopback HTTP 监听（127.0.0.1、Token 认证、CSRF 防护）；
  - 宏指令定义与后台无头场景执行器；
  - 向 Kinvo 输出 `text` / `list` 响应；
- **验收要点**：
  - [ ] 本机接口严格校验 Token 与 Origin，未经授权拒绝访问；
  - [ ] 宏任务可在独立后台环境中执行，不打乱前台正在浏览的场景；
  - [ ] 返回合规的 JSON `text` 或 `list` 数据，与 Kinvo 交互正常。

## 被否决的方案

1. **直接为 Agent 提供任意脚本执行接口（如 Chrome DevTools Protocol / CDP 或 `executeJavaScript` 接口）**：
   - _否决理由_：严重违反 Foscen 的最小特权原则。开放任意脚本注入将使网页容器变成通用攻击跳板，无法保证安全边界。
2. **在 URL Scheme 中通过长轮询或特定系统回调返回执行数据**：
   - _否决理由_：URL Scheme 不具备双向通信语义；在桌面端生硬模拟长轮询极易产生悬挂句柄、内存泄露与超时失败。
3. **首版直接引入嵌入式 WebSocket / GraphQL 服务器**：
   - _否决理由_：过度设计，急剧增加依赖体积、攻击面与进程管理复杂度，首版仅需 URL Scheme 即可满足核心打开与场景切换需求。

## 待维护者裁决

以下事项超出当前架构预设，提请维护者明确裁决：

1. **跨目录落盘位置**：是否批准 Foscen 主进程在 `~/Library/Application Support/Kinvo/providers/foscen.json` 写入清单文件？若批准，应采用静默自动写入、还是需用户在设置中显式点击授权后写入？
2. **本机接口（Loopback HTTP）的引入节奏**：是否同意本 ADR 建议的“首版仅交付 URL Scheme，本机 HTTP 接口与宏执行延后至切片 2”的分期路径？
3. **宏（Macro）的定位与执行语义**：未来宏是以固定行为配置为主（如预置的无障碍抓取、特定网站格式化），还是允许执行受限的声明式动作流？后台执行是否允许创建后台隐藏的 `webContents` 实例？
4. **macOS 系统级 URL 唤醒行为预期确认**：在调用方未采用 non-activating 方式调用时，macOS LaunchServices 会默认将应用前台化。是否接受该技术边界并在用户文档中予以说明？
