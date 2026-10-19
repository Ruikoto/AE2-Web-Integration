# 1.20.1 中文物品名与网页界面汉化

专门针对 `ae2webintegration-1.2.0-pre-forge-1.20.1.jar` 的旧版 jQuery 网页。
这是独立的客户端导出器和浏览器用户脚本，**不需要替换服务端 JAR，不向服务端上传名称表**。

正式版 **v1.0.0**：[GitHub Release](https://github.com/Ruikoto/AE2-Web-Integration/releases/tag/name-localization-v1.0.0) · [发行文件](releases/v1.0.0/) · [最新版网页脚本](ae2web-names.user.js)。这是针对旧版 AE2WI 的独立汉化工具版本号，不是服务端 Mod 的版本号。在 GitHub 打开 ZIP 或 JAR 文件后，使用 **Download raw file / 下载原始文件** 下载；SHA-256 校验值位于同目录的 `SHA256SUMS`。

v1.0.0 保留 v0.1.1 的资源元数据修复，客户端导出器的全部 8 个类与 v0.1.1 字节一致；旧 v0.1.1 导出器可继续使用。若替换 JAR，先退出游戏并移除旧版，不要同时保留两个版本。

当前状态：Forge 客户端发行 JAR 已成功编译并完成 SRG 发布映射，使用 Java 17 字节码；此前 5 项 Java 测试与官方发布 JAR 的 256 组稳定键对比通过，用户已反馈「齿轮盛宴」背包样本导出及网页中文名显示成功。
本次脚本通过 16 项 DOM/jQuery 测试和 3 项原版网页 Chromium 测试。浏览器测试使用本地模拟 API，覆盖中文搜索、名称转义、语言切换、合成计划、提交、取消、记录及登录注册表单，检查物品键、CPU 键、数量和账号字段保持不变。完整导出覆盖率及真实游戏合成仍需实际验证；不要把开发映射 JAR 当成安装包。

## 已安装旧脚本：只升级网页汉化

在 Tampermonkey 中将现有同名脚本更新为 [`ae2web-names.user.js`](ae2web-names.user.js) v1.0.0，刷新终端网页即可。不要保留两个同时运行的副本。

界面汉化默认开启，覆盖终端菜单、搜索提示、设置、网络选择、合成计划与状态、合成记录、登录注册和已知错误提示。面板默认收起，点击网页右侧“设置”列中的“中文显示”按钮展开；点击“收起”或在面板内按 Esc 关闭，展开状态会保存在当前浏览器。登录页没有设置列时，入口位于屏幕右侧；窄屏终端先展开原网页的“设置”再点击“中文显示”。

面板内的“关闭界面汉化”可独立切换界面语言并保存；已打开的图表需刷新后更新语言。未知提示保留原文。底部作者信息栏默认隐藏，可在面板中点击“显示底部信息栏”恢复，原作者及项目链接保留，显示状态同样记忆。收起面板不关闭汉化。

原有名称 JSON 和中文名开关保持不变，**无需重装客户端 JAR、重新导出或重新导入名称表**。物品名仍由名称表决定；只更新脚本不会自动补全未导出的物品。

## 设计范围

- 导出器只在客户端注册 `/ae2webnames` 命令，不注册网络通道、服务端事件或 Mixin。
- 样本只读取背包中的物品副本；完整导出另外遍历客户端注册表、创造模式物品及流体。
- 文件只写到当前游戏目录的 `ae2webnames/` 中；每次新建文件，不读取服务器配置或存档文件。
- 名称使用当前客户端的简体中文资源和名称逻辑，包括可枚举物品上的脚本改名。
- 完整导出不是对所有 NBT 组合的穷举，也没有接入 JEI/EMI 的全部变体目录。特殊变体可先放进背包，再重新完整导出；新文件也会收集背包中的精确变体。
- 浏览器脚本只在旧版资源 GET 响应上替换 `itemname`，需要完整 `itemKey` 和注册 ID 同时匹配。
- 界面汉化只替换可见文字、提示及对话框；表单字段名、值、选项值和网页内部状态保持原样。玩家名、CPU 名和物品名不按界面词典翻译，图表数据也保持原样。
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
2. 安装仓库中的最新版 [`ae2web-names.user.js`](ae2web-names.user.js)。脚本已配置 `http://k.rainplay.cn:34392/`，无需手改地址；客户端导出器版本独立，不需要重装。其他站点需调整 `@match` 和对应端口限制，不要设置成匹配所有网站。
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

展开“中文显示”后，点击“关闭界面汉化”恢复英文界面；点击“关闭中文名”并刷新恢复服务器返回的物品名。两个开关互不影响。点击“清除名称表”会删除本浏览器中该终端的名称表。面板展开状态、底部信息栏和界面语言仅保存在本浏览器的 localStorage 中，名称表仍在原 IndexedDB 中。
也可以禁用或卸载用户脚本。退出客户端后删除 `ae2web-local-names-…-client-only.jar` 即可移除导出器；本地 JSON 可按需删除。
以上操作都不需要改服务器文件或存档。

## 开发验证与构建

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
