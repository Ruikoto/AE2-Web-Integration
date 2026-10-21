# Codex 接手说明

先阅读 [AI_POLICY.md](AI_POLICY.md)。本地安装入口在根目录 [README.md](README.md)，
完整环境步骤见 [开发环境说明](tools/dev-environment/README.md)。

## 当前工作与结构

- 当前工作分支为 `codex/chinese-item-names-client`，不是默认 `core`。
- 用户使用 Minecraft 1.20.1 Forge、齿轮盛宴整合包、
  `ae2webintegration-1.2.0-pre-forge-1.20.1.jar`，要求尽量不改服务端。
- 本分支交付的是 `tools/name-localization/` 中独立的客户端名称导出器与浏览器脚本；
  先阅读该目录的 `AGENTS.md` 与 README。
- `src/main/java/` 是共享 core，不是完整 Forge Mod。不要把 core 构建产物当服务端 Mod 安装。
- `src/main/typescript/` 与 `src/main/resources/assets/web/` 是当前 core 新版网页，
  与已发布的 1.2.0-pre 旧版 jQuery 网页不同。
- `tools/ui-tests/` 测试新版网页；旧版兼容测试在名称工具自己的 `test/`。

## 开发与验证

- Node.js 推荐 24；22.x 至少为 22.13。依赖按已提交 lockfile 安装。
- Wrapper 固定为 Gradle 9.4.0，daemon 固定为 Temurin 25。
  Java 编译使用完整 JDK 17；Forge 导出器的 Minecraft 处理还需完整 JDK 21。
- 修改旧版工具：运行其 `npm test`，按改动运行 ESLint、Prettier、旧版浏览器测试。
  具体命令及固定官方测试 JAR 的下载、校验见开发环境说明。
- 修改新版网页：运行根目录格式检查、lint、typecheck 及相应 `tools/ui-tests` 测试。
- 修改 Java core：通过 Wrapper 运行相关测试，完整检查为 `bash gradlew build`。
- 仅修改文档：验证链接、命令及 `git diff --check`，不必重跑游戏构建。
- 区分历史验证与本次验证。缺少官方 JAR 时旧版浏览器测试会跳过，不能报告通过。

## 文件与操作边界

- 保留原作者署名、许可证及已发布目录；不要覆盖既有发行文件。
- 不提交缓存、JDK、node_modules、游戏目录、用户名称表／库存、凭据或个人配置。
- 不在真实服务器测试登录、注册、合成、取消或写入；浏览器测试使用本地模拟 API。
- 通用构建配置中不写入 `/workspace`、云代理或云端证书路径；本地使用自己的工具链与凭据。
- 提交前检查差异与工作区；推送、发行、部署按当前用户授权范围执行。
