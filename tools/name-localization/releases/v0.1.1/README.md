# v0.1.1 客户端试用包

修复 v0.1.0 遗漏 `pack.mcmeta` 引起的“未能加载有效的 ResourcePackInfo”警告，使用 Minecraft 1.20.1 的资源格式 15。导出逻辑和网页脚本保持原样。

- [完整试用 ZIP](ae2web-local-names-0.1.1-mc1.20.1.zip)。
- [单独下载客户端 JAR](ae2web-local-names-0.1.1-mc1.20.1-client-only.jar)。
- [SHA-256 校验值](SHA256SUMS)。
- [完整使用说明](../../README.md)。
- [最新版网页脚本](../../ae2web-names.user.js)：脚本 v0.1.1 已配置 `http://k.rainplay.cn:34392/`。旧 ZIP 内脚本默认匹配本机地址，请在 Tampermonkey 中更新为此脚本；客户端 JAR 无需更换。

升级：退出游戏，删除本地客户端 `mods/` 中的 `ae2web-local-names-0.1.0-mc1.20.1-client-only.jar`，再放入 v0.1.1。不要同时放两个版本。服务端无需修改。

重启后，在中文本地测试世界中运行 `/ae2webnames sample`，生成的 JSON 位于游戏目录的 `ae2webnames/`。客户端构建、5 项 Java 测试及发行 JAR 元数据检查已通过；完整整合包仍需实际验证。
