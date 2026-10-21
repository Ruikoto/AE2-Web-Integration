# v0.1.0 客户端试用包

此版本缺少资源包元数据，会触发 Forge 加载警告。请改用 [v0.1.1 修复版](../v0.1.1/)，不要继续安装本目录的旧 JAR。

适用的服务端版本：`ae2webintegration-1.2.0-pre-forge-1.20.1.jar`。

- [完整试用 ZIP](ae2web-local-names-0.1.0-mc1.20.1.zip)：包含客户端 JAR、浏览器用户脚本、使用说明和许可证。
- [单独下载客户端 JAR](ae2web-local-names-0.1.0-mc1.20.1-client-only.jar)。
- [SHA-256 校验值](SHA256SUMS)。
- [完整说明与源码入口](../../README.md)。

在 GitHub 打开对应文件，点击 **Download raw file / 下载原始文件**。如果看到 GitHub 的二进制文件预览页，使用页面里的下载按钮。

首次试用：仅将 `client-only.jar` 放进本地「齿轮盛宴」客户端的 `mods/`，使用简体中文进入本地测试世界，背包放几个物品，运行 `/ae2webnames sample`。JSON 会生成在游戏目录的 `ae2webnames/` 下。

已通过编译、5 项 Java 测试、12 项 DOM/jQuery 测试和真实 Chromium 网页验证；尚未在完整「齿轮盛宴」整合包里实测。先验证背包样本，再进行完整导出。
