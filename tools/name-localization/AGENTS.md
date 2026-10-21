# 旧版中文工具维护约束

适用目标为 `1.2.0-pre-forge-1.20.1` 旧版 jQuery 网页；不要套用根目录新版 TypeScript API。
使用说明见 [README.md](README.md)，跨平台验证命令见 [开发环境说明](../dev-environment/README.md)。

## 已有交付

- 用户脚本 v1.3.0：中文名称映射、界面汉化、可收起设置、默认隐藏底栏、
  全拼／首字母／小鹤双拼、十组模糊音、完整库存 JSON 导出。
- `client/` 导出器 v1.0.0：Java 17，Forge 47.3.0，AE2 15.4.10，仅装客户端。
  命令为 `/ae2webnames sample`、`/ae2webnames export confirm`、`/ae2webnames cancel`。
- 正式 tag 为 `name-localization-v1.0.0`；包内仍是 v1.0.0 脚本。
  最新脚本直链跟随当前分支，脚本与导出器版本独立。
- 用户已反馈齿轮盛宴名称导出及网页汉化可用，不代表全部 NBT 变体和真实合成都已验证。

## 必须保留的行为

- 只改浏览器呈现和本地搜索，不改真实条目的 key、ID、数量、合成请求或服务端状态。
- 名称按 `itemKey` 与注册 ID 匹配，身份异常则跳过；接入旧网页 `innerHTML` 前转义名称，
  库存 JSON 则输出普通字符串。
- 名称表在 IndexedDB，偏好在 localStorage，按 origin 与路径隔离，不上传名称表。
- 保持 `@match` 与端口限制的窄范围，不匹配任意网站，不随意改变用户脚本身份元数据。
- 离线搜索保留原筛选行为，不为匹配改动真实物品或全局查询数据。
- 保留 `vendor/` 拼音字典的固定来源、哈希、MIT 署名及脚本内许可证。
- 库存导出对当前网络发起一次独立同源库存 GET，包含所有接口条目及零库存可合成资源，
  不受搜索、排序、筛选影响。
- 导出 `quantity` 为精确十进制字符串，不先把不安全整数转为 Number；
  老浏览器无法保留超大整数时明确失败。此 Forge 版本的流体原始单位为 mB，1000 mB = 1 B。
- `craftable` 表示网络存在可用配方，不表示材料一定充足。
- 切换网络或接口失败时沿用已有保护，不下载错误网络或部分结果。
- `client/.../identity/` 来自固定官方提交；保持 `provenance.json` 可验证，
  不用当前 core 身份编码替换旧发布版编码。
- 客户端发行须经过 `reobfJar` 与 `verifyReleaseMetadata`，包含有效 `pack.mcmeta`。
  `-dev.jar` 不可作安装包。
- 已有 `releases/` 文件保持不变；新版本放新目录。不因升级此工具而替换服务端 JAR。

## 验证入口

- `test/userscript.test.cjs`：28 项 DOM/jQuery 测试，覆盖本地存储、搜索、库存精度等。
- `test/released-ui.browser.cjs`：3 项原版网页 Chromium 测试，连接本地模拟 API；
  `AE2WEB_RELEASE_JAR` 必须指向已核对 SHA-256 的官方 JAR，否则会跳过或失败。
- `test/verify-provenance.py`：固定来源编码校验。
- `verify-java/`：不依赖 Minecraft 的 Java 测试；提供 `-PreleasedJar=...` 后额外验证
  官方 JAR 的 256 组稳定键，未提供时该项比较跳过。
- 测试中的合成、注册等写入请求仅针对模拟服务，不能指向真实终端。
