# 1.20.1 中文物品名、网页汉化与库存导出

专门针对 `ae2webintegration-1.2.0-pre-forge-1.20.1.jar` 的旧版 jQuery 网页。
这是独立的客户端导出器和浏览器用户脚本，**不需要替换服务端 JAR，不向服务端上传名称表**。

## 下载地址

| 文件／说明           | 版本                     | 下载或查看                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 最新版浏览器脚本     | **v1.3.0**               | [安装／更新油猴脚本](https://github.com/Ruikoto/AE2-Web-Integration/raw/refs/heads/codex/chinese-item-names-client/tools/name-localization/ae2web-names.user.js) · [查看源码](ae2web-names.user.js)                                                                                                                                  |
| 客户端中文名称导出器 | **v1.0.0**               | [直接下载 JAR](https://github.com/Ruikoto/AE2-Web-Integration/raw/refs/tags/name-localization-v1.0.0/tools/name-localization/releases/v1.0.0/ae2web-local-names-1.0.0-mc1.20.1-client-only.jar)                                                                                                                                      |
| v1.0.0 完整发行包    | **v1.0.0**，包含旧版脚本 | [下载 ZIP](https://github.com/Ruikoto/AE2-Web-Integration/raw/refs/tags/name-localization-v1.0.0/tools/name-localization/releases/v1.0.0/ae2web-local-names-1.0.0-mc1.20.1.zip) · [校验值](https://github.com/Ruikoto/AE2-Web-Integration/raw/refs/tags/name-localization-v1.0.0/tools/name-localization/releases/v1.0.0/SHA256SUMS) |
| 发行记录与文件说明   | —                        | [GitHub Release](https://github.com/Ruikoto/AE2-Web-Integration/releases/tag/name-localization-v1.0.0) · [发行目录](releases/v1.0.0/)                                                                                                                                                                                                |

**请优先安装最新版脚本。** v1.3.0 包含网页汉化、全拼／首字母／小鹤双拼搜索、十组可选模糊音和一键导出完整库存 JSON。v1.0.0 ZIP 内没有后续新增的搜索与库存导出功能；下载 ZIP 后仍需单独更新脚本。这里的版本号属于独立工具，不是服务端 AE2WI Mod 的版本号。

脚本直链（可复制到浏览器地址栏打开）：

```text
https://github.com/Ruikoto/AE2-Web-Integration/raw/refs/heads/codex/chinese-item-names-client/tools/name-localization/ae2web-names.user.js
```

如果打开后只显示代码，在 Tampermonkey 中打开现有同名脚本，将全部内容替换为新代码并保存；首次安装则新建脚本后粘贴。不要同时启用多个副本。

## 中文快速使用

| 想使用的功能       | 操作                                                                | 是否需要客户端导出器             |
| ------------------ | ------------------------------------------------------------------- | -------------------------------- |
| 网页界面汉化       | 安装脚本并刷新，默认开启                                            | 不需要                           |
| 中文物品名         | 在相同整合包、简体中文环境导出名称 JSON，网页导入后开启中文名并刷新 | 需要；已有名称表可继续使用       |
| 全拼／小鹤双拼搜索 | “中文显示 → 搜索模式”；模糊音在下方展开并勾选                       | 条目已有中文名即可，无需额外导出 |
| 完整库存 JSON      | 选择网络后，“中文显示 → 导出当前库存 JSON”                          | 不需要；中文名称取决于已有名称表 |

首次导出中文名称的顺序：客户端 `mods/` 放入导出器 JAR → 游戏切换简体中文并进入世界 → `/ae2webnames sample` 测试或 `/ae2webnames export confirm` 完整导出 → 找到游戏目录 `ae2webnames/` 中的 JSON → 网页“中文显示”导入 → 开启中文名并刷新。详细步骤见下文。

脚本已配置终端地址 `http://k.rainplay.cn:34392/`，以及本机 `http://localhost:2324/`、`http://127.0.0.1:2324/`。其他地址需调整脚本头部 `@match` 和公共主机端口限制，不要改成匹配所有网站。名称表和偏好设置按浏览器、站点及路径隔离，换浏览器或更换终端地址后需重新导入名称表。

## 已安装旧脚本：只升级网页汉化

在 Tampermonkey 中[更新现有同名脚本到 v1.3.0](https://github.com/Ruikoto/AE2-Web-Integration/raw/refs/heads/codex/chinese-item-names-client/tools/name-localization/ae2web-names.user.js)，刷新终端网页即可。不要保留两个同时运行的副本。

界面汉化默认开启，覆盖终端菜单、搜索提示、设置、网络选择、合成计划与状态、合成记录、登录注册和已知错误提示。面板默认收起，点击网页右侧“设置”列中的“中文显示”按钮展开；点击“收起”或在面板内按 Esc 关闭，展开状态会保存在当前浏览器。登录页没有设置列时，入口位于屏幕右侧；窄屏终端先展开原网页的“设置”再点击“中文显示”。

面板内的“关闭界面汉化”可独立切换界面语言并保存；已打开的图表需刷新后更新语言。未知提示保留原文。底部作者信息栏默认隐藏，可在面板中点击“显示底部信息栏”恢复，原作者及项目链接保留，显示状态同样记忆。收起面板不关闭汉化。

原有名称 JSON 和中文名开关保持不变，**无需重装客户端 JAR、重新导出或重新导入名称表**。物品名仍由名称表决定；只更新脚本不会自动补全未导出的物品。

客户端 v1.0.0 导出器保留 v0.1.1 的资源元数据修复，全部 8 个类与 v0.1.1 字节一致；旧 v0.1.1 导出器也可继续使用。若替换 JAR，先退出游戏并移除旧版，不要同时保留两个版本。

## 一键导出当前库存 JSON

登录终端并选择网络后，打开“中文显示”，点击 **导出当前库存 JSON**。浏览器会下载 `ae2web-inventory-网络键-时间.json`。

每次点击只发起一次同源库存 GET，重新读取当前网络的完整列表；不使用旧网页缓存，也不受搜索、排序、“已存储／可合成”或“物品／流体”筛选影响。包含接口提供的流体和零库存可合成条目。导出不会切换页面、改动当前筛选、提交合成请求或上传文件，也不会锁定库存或暂停生产。

开启中文名时，按原来的精确身份规则导出中文名称；否则保留服务器名称。导出保留 `serverName`，不会将 HTML 转义文本或拼音搜索别名写进名称。名称取自导出开始时的开关及名称表；身份异常或未匹配的条目继续保留原名。

文件结构示例：

```json
{
    "format": "ae2web-inventory",
    "formatVersion": 1,
    "targetMod": "1.2.0-pre-forge-1.20.1",
    "exportedAt": "2026-10-20T00:00:00.000Z",
    "gridKey": "AAAAAAAAAAAAAAAAAAAAAA",
    "localNamesEnabled": true,
    "itemCount": 1,
    "items": [
        {
            "itemKey": "AAAAAAAAAAAAAAAAAAAAAA",
            "itemid": "minecraft:iron_ingot",
            "itemname": "铁锭",
            "serverName": "Iron Ingot",
            "quantity": "64",
            "craftable": true
        }
    ]
}
```

- `craftable`：原接口的布尔属性，`true` 表示可合成，`false` 表示不可合成；表示网络有对应合成配方，不保证当前材料足够完成某个数量的合成。
- `quantity`：始终是十进制整数字符串，保留接口原单位，避免大数量超过 JavaScript 安全整数范围而丢精度。程序处理时可按需使用 `BigInt(quantity)`，不要直接转成 `Number` 处理超大数量。
- `itemKey`、`itemid`：保留服务器的物品身份和注册 ID；没有物品键时导出 `null`，不构造替代键。接口提供 `identityStatus` 时也会保留。
- `localNamesEnabled`：导出开始时的中文名开关，不表示每条记录都有中文翻译。
- `exportedAt`：生成文件时的 UTC ISO 时间；`itemCount` 是条目数，不是物品总数量。

登录失效、读取失败、缺失可合成属性或导出期间切换网络时，不生成文件，也不会回退到旧缓存。较旧浏览器若无法无损读取超大整数会提示更新，而不是导出四舍五入的数量。库存文件格式独立，不能作为中文名称表重新导入。

## 拼音搜索

打开右侧“中文显示”，在“搜索模式”中选择 **全拼** 或 **小鹤双拼**。默认全拼；切换后立即重新筛选当前库存列表，无需再次输入，也不影响已打开的合成计划、CPU 或记录页。模式和模糊音按终端地址及路径保存在本浏览器，刷新后保留。

全拼模式支持以下输入：

| 显示名称 | 搜索示例              | 匹配方式                               |
| -------- | --------------------- | -------------------------------------- |
| 铁锭     | `tieding`、`tie ding` | 全拼，忽略空格和大小写                 |
| 铁锭     | `td`                  | 首字母                                 |
| 铁锭     | `ding`、`tied`        | 名称中的拼音、末尾拼音前缀             |
| 重型铁锭 | `zhongxtd`            | 全拼与首字母混用，支持字典中的多音读法 |
| 铝锭     | `lvding`、`lüding`    | 支持 `v` 和 `ü` 输入                   |

小鹤双拼模式示例：

| 显示名称   | 搜索示例         | 说明                                                |
| ---------- | ---------------- | --------------------------------------------------- |
| 铁锭       | `tpdk`、`tp dk`  | 小鹤双拼，忽略空格和大小写                          |
| 铁锭       | `tpd`、`td`      | 部分编码、拼音首字母                                |
| 重型       | `vsxk`、`isxk`   | 支持“重”的不同读音                                  |
| 绿宝石     | `lvbcui`         | 小鹤的 `ü` 编码                                     |
| 阿／爱／安 | `aa`／`ai`／`an` | 零声母；也接受 Rime 兼容编码 `ad`（爱）、`aj`（安） |

小鹤编码参考 [Rime 小鹤双拼方案的 speller 规则](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin_flypy.schema.yaml)，字典的 404 个音节已逐一对照检查。小鹤模式仍保留普通拼音首字母，也支持小鹤声母键缩写；完整全拼请切回全拼模式。

展开“模糊音”，可分别勾选以下十组，**默认全部关闭**：

- 声母：`z / zh`、`c / ch`、`s / sh`、`n / l`、`f / h`。
- 韵母：`an / ang`、`en / eng`、`in / ing`、`ian / iang`、`uan / uang`。

规则双向生效，并可组合。例如，开启 `in / ing` 后，“金锭”在全拼模式可输入 `jingding`，小鹤模式可输入 `jkdk`；原本分别为 `jinding` 和 `jbdk`。小鹤的模糊音先按声韵母换算，再转成双拼编码，不直接替换输入按键。没有勾选的模糊音组不会自动开启。末尾仍允许前缀匹配，因此 `tiedin` 本来就能作为 `tieding` 的前缀命中“铁锭”。

原有中文、英文和数字搜索仍然有效；“已存储／可合成”“物品／流体”筛选也继续生效。这里的模糊匹配指部分名称、前缀、缩写和用户勾选的声韵母规则，不包括任意错拼纠正或跨越无关字符的跳字匹配。

拼音来自当前显示的中文名：需要已有名称表并开启“中文名”，或服务端本来就返回中文名称。仅显示英文且没有中文名的条目不会凭空推断中文；关闭界面汉化不影响拼音搜索。未被字典覆盖的字仍可用中文原文查找。

字典直接包含在脚本内，运行时不加载 CDN 或发送搜索请求。匹配结果仅用于本地筛选，不改真实名称、物品键、数量或下单参数；缓存随物品对象释放。字典数据来自 MIT 许可的 [pinyin-match 1.2.10](https://github.com/xmflswood/pinyin-match)，仅使用其简体字典（6,768 个字符），匹配算法独立实现；许可证和固定来源记录位于 [`vendor/`](vendor/)，独立脚本也保留许可证。

## 设计范围

- 导出器只在客户端注册 `/ae2webnames` 命令，不注册网络通道、服务端事件或 Mixin。
- 样本只读取背包中的物品副本；完整导出另外遍历客户端注册表、创造模式物品及流体。
- 文件只写到当前游戏目录的 `ae2webnames/` 中；每次新建文件，不读取服务器配置或存档文件。
- 名称使用当前客户端的简体中文资源和名称逻辑，包括可枚举物品上的脚本改名。
- 完整导出不是对所有 NBT 组合的穷举，也没有接入 JEI/EMI 的全部变体目录。特殊变体可先放进背包，再重新完整导出；新文件也会收集背包中的精确变体。
- 浏览器脚本只在旧版资源 GET 响应上替换 `itemname`，需要完整 `itemKey` 和注册 ID 同时匹配。
- 界面汉化只替换可见文字、提示及对话框；表单字段名、值、选项值和网页内部状态保持原样。玩家名、CPU 名和物品名不按界面词典翻译，图表数据也保持原样。
- 拼音只扩展终端的显示过滤函数，并复用原网页的库存和类型筛选；不会将拼音别名写进物品数据、IndexedDB 名称表或网络请求。
- 请求参数、数量、物品键、CPU 键、权限和合成行为保持原样；未知或身份异常的物品继续显示服务器原名。
- 不做注册 ID 或基础物品键的模糊回退，避免覆盖带 NBT 的自定义改名物品。
- 旧网页把名称拼进 HTML，因此替换名先经过 HTML 转义。

## 第一次只验证背包样本

取得 `ae2web-local-names-1.0.0-mc1.20.1-client-only.jar` 后：

1. **只放进本地「齿轮盛宴」客户端的 `mods/`，不要放到服务器。** 不需要在客户端另装 AE2 Web Integration 服务端 Mod。
2. 使用原整合包和汉化资源，切换游戏语言为简体中文，进入世界。建议先使用本地测试世界；同一整合包、资源和脚本需保持一致。
3. 背包准备几个容易确认的物品：普通铁锭、整合包自定义物品，以及一个带特殊 NBT 或自定义名称的物品；流体可使用装有流体的容器。
4. 在客户端聊天框运行 `/ae2webnames sample`。它是本地客户端命令，无需 OP。
5. 导出完成后，聊天栏会显示生成的 JSON 路径。文件中包含物品身份摘要、注册 ID 和名称，不包含原始 NBT、账号、密码或服务器地址。

## 浏览器导入

1. 安装支持在页面主上下文运行用户脚本的管理器，例如 Tampermonkey。
2. [安装最新版 `ae2web-names.user.js`](https://github.com/Ruikoto/AE2-Web-Integration/raw/refs/heads/codex/chinese-item-names-client/tools/name-localization/ae2web-names.user.js)。脚本已配置 `http://k.rainplay.cn:34392/`，无需手改地址；客户端导出器版本独立，不需要重装。其他站点需调整 `@match` 和对应端口限制，不要设置成匹配所有网站。
3. 安装脚本，打开原有 AE2 Web 页面，在右侧“设置”列点击“中文显示”展开面板。它支持的是 1.2.0-pre 旧网页；登录页可以直接汉化界面，但没有物品接口，中文名开关保持禁用。已登录的终端若仍显示“未检测到旧版网页接口”，请先检查版本和用户脚本执行上下文。
4. 导入样本 JSON，然后点击“开启中文名”，手动刷新网页。名称表保存在这个浏览器的 IndexedDB 中，按终端地址及路径隔离，不上传服务器。导入新表时默认重新关闭。
5. 确认几个样本名称、数量及自定义改名都正确，并确认能用中文搜索。第一轮可以只查看，不提交合成请求。

面板默认隐藏；先找右侧的“中文显示”按钮。若按钮也没有，先在 Tampermonkey 中确认脚本已启用且当前网址能匹配。Chrome/Edge 扩展管理页需要允许 Tampermonkey 访问该网站；若有“允许用户脚本”开关也需开启，部分版本需要开发者模式。刷新网页后再检查。没有入口时还未进入名称表匹配阶段。

无需改变服务端配置。网页原有的退出登录、网络选择、权限校验、库存刷新和合成请求仍由原 Mod 处理。名称导入或存储失败时继续使用原名。

## 样本正确后完整导出

客户端运行 `/ae2webnames export confirm`，完成后导入新的 JSON。完整表替换样本表，不合并旧表；它包含本次背包、注册表和创造模式目录中的可枚举名称。

收集期间可以使用 `/ae2webnames cancel` 取消，切换世界、语言或进入资源加载画面也会中止收集。文件保存阶段会先完成写入，不再接收取消。
集合按客户端 tick 分批读取；仅分离后的字符串交给后台文件写入任务。改过汉化资源、名称脚本或整合包版本后需要重新导出。

## 关闭与回滚

展开“中文显示”后，点击“关闭界面汉化”恢复英文界面；点击“关闭中文名”并刷新恢复服务器返回的物品名。两个开关互不影响。点击“清除名称表”会删除本浏览器中该终端的名称表。面板展开状态、底部信息栏、界面语言、搜索模式及模糊音仅保存在本浏览器的 localStorage 中，名称表仍在原 IndexedDB 中。
也可以禁用或卸载用户脚本。退出客户端后删除 `ae2web-local-names-…-client-only.jar` 即可移除导出器；本地 JSON 可按需删除。
以上操作都不需要改服务器文件或存档。

## 开发验证与构建

当前验证状态：Forge 客户端发行 JAR 已完成 SRG 发布映射，使用 Java 17 字节码；此前 5 项 Java 测试与官方发布 JAR 的 256 组稳定键对比通过，用户已反馈「齿轮盛宴」中文名称导出及网页显示成功。

脚本通过 28 项 DOM/jQuery 测试和 3 项原版网页 Chromium 测试，覆盖实际库存下载、超大数量精度、搜索模式与模糊音、设置保存、名称转义、语言切换、合成及登录注册参数保持不变。浏览器测试使用本地模拟 API，不等同于完整整合包实测；完整导出覆盖率及真实游戏合成仍需实际验证。不要把开发映射 JAR 当成安装包。

从本仓库根目录运行；需要 Node.js 22.13+ / 24+、完整的 Java 17 和 Java 21 工具链，以及可运行仓库 Gradle Wrapper 的 Java 25。NeoForm 使用 Java 21 重新编译 Minecraft，因此精简掉 `lib/ct.sym` 的系统 JDK 不适用：

```sh
npm --prefix tools/name-localization ci --ignore-scripts
npm --prefix tools/name-localization test
node_modules/.bin/eslint --config tools/name-localization/eslint.config.mjs tools/name-localization/ae2web-names.user.js tools/name-localization/test/*.cjs
python3 tools/name-localization/test/verify-provenance.py
bash gradlew -p tools/name-localization/verify-java test
bash gradlew -p tools/name-localization/client build
```

真实浏览器验证（需先在 `tools/ui-tests` 安装锁定的 Playwright 依赖及 Chromium）：

```sh
AE2WEB_RELEASE_JAR=/path/to/ae2webintegration-1.2.0-pre-forge-1.20.1.jar \
  npm --prefix tools/name-localization run test:browser
```

测试从官方 JAR 中提取终端和登录原网页，并像服务端一样填入占位符；jQuery 使用同版本本地副本。字体和图表 CDN 在该测试中不加载，名称数据、合成响应和登录接收端均为本地模拟服务，不连接真实服务器。图表标题与提示的转换另有单元测试，未测试外部 Chart.js 的实际绘图。

最后一条包含发行 JAR 元数据检查，必须成功才会得到可安装的 Forge 发行 JAR，位于 `tools/name-localization/client/build/libs/`。
不要安装 `-dev.jar`，不要使用 `jar` 任务的开发映射产物。

重建时需要访问：`maven.neoforged.net`、`maven.minecraftforge.net`、`modmaven.dev`、`launchermeta.mojang.com`、`piston-meta.mojang.com`、`piston-data.mojang.com` 和 `libraries.minecraft.net`，以及常规 Maven/Gradle 下载站。
Chromium 下载还需要 Playwright 下载站及其 `storage.googleapis.com` 重定向目标。云环境切换为允许所有网络后，下载及构建已实际通过。

身份编码来自官方 1.2.0-pre 的固定提交，仅修改 Java 包名以隔离类，见 [`provenance.json`](provenance.json)。
独立 Java 验证项目无需 Minecraft/Forge，可检查 UTF-8 输出、重复/冲突排除、无效输入和仅新建名称文件。
若要额外运行实际发布 JAR 的稳定键二进制对比，先从官方 GitHub Release 下载同名 JAR，核对 `provenance.json` 中的 SHA-256，再执行：

```sh
bash gradlew -p tools/name-localization/verify-java test -PreleasedJar=/path/to/ae2webintegration-1.2.0-pre-forge-1.20.1.jar
```

未提供发布 JAR 时，该二进制对比测试会明确跳过，不能当作已验证。
受控 API 浏览器测试不等同于完整整合包联调；本工具不保证未枚举 NBT 变体、仅 tooltip 中的文字或其他 Mod 的自定义资源类别全部汉化。
