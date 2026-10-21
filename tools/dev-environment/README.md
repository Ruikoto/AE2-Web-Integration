# 在本地 Codex 继续开发

主入口在仓库根目录 [README.md](../../README.md)。这里保存详细环境步骤；
云平台发布状态、个人凭据和下载缓存需要在新机器上重新准备。

## 分支与工具链

```sh
git clone --branch core https://github.com/Ruikoto/AE2-Web-Integration.git
cd AE2-Web-Integration
```

中文功能与环境说明已合入默认分支 `core`，可直接在该分支继续开发。
在本地 Codex 中打开仓库根目录，Codex 会读取根目录和工作子目录的 `AGENTS.md`。
中文工具完整说明见 [这里](../name-localization/README.md)。

| 工具                | 要求与用途                                                   |
| ------------------- | ------------------------------------------------------------ |
| Git                 | 拉取和提交；本地 GitHub 登录自行配置                         |
| Node.js / npm       | 推荐 Node 24；支持 22.x 的 22.13+，或 24+                    |
| Python 3            | 来源校验与浏览器测试提取 JAR 网页，命令需可用 `python3` 调用 |
| 完整 Temurin JDK 25 | Wrapper 9.4.0 daemon 使用；仓库已固定，Wrapper 也可自动下载  |
| 完整 JDK 17         | core 与导出器 Java 编译、测试                                |
| 完整 JDK 21         | Forge 导出器的 NeoForm Minecraft 处理工具链                  |
| Chromium            | 由 Playwright 安装，测试本地模拟 API                         |

仅开发浏览器脚本无需 JDK。构建导出器需要完整 JDK，不能缺少 `lib/ct.sym`。
检查 `node --version`、`npm --version`、`python3 --version`、`java -version`。

安装 Temurin 17、21、25，把 `JAVA_HOME` 指向 25，其 `bin` 加入 PATH。
Gradle 通常能发现常见安装路径；找不到时，在个人
`~/.gradle/gradle.properties`（Windows 为 `%USERPROFILE%\.gradle\gradle.properties`）添加：

```properties
# 换为本机实际路径；Windows 使用正斜杠，不加引号。
org.gradle.java.installations.paths=C:/Java/jdk-17,C:/Java/jdk-21,C:/Java/jdk-25
```

Linux/macOS 换成实际绝对路径。个人路径、代理设置不要提交，也不要照搬云端的
`auto-detect=false` 与 `/workspace` 配置。
通过 `bash gradlew --version`、`bash gradlew -q javaToolchains` 检查；
PowerShell 将 `bash gradlew` 换为 `./gradlew.bat`。Forge 构建还会检查 JDK 21。

## 安装与日常检查

从仓库根目录运行，适用于 Bash 和 PowerShell：

```sh
npm ci
npm --prefix tools/name-localization ci --ignore-scripts
npm --prefix tools/ui-tests ci
npm --prefix tools/ui-tests exec -- playwright install chromium
npm --prefix tools/name-localization test
python3 tools/name-localization/test/verify-provenance.py
```

Linux 缺少浏览器系统库时，由有权限的用户执行
`npm --prefix tools/ui-tests exec -- playwright install --with-deps chromium`。
Windows 若只有 `py -3`，需让 `python3` 也能调用 Python，浏览器测试会直接执行该命令。

脚本格式和 lint（PowerShell 对应使用 `./node_modules/.bin/prettier.cmd` 与 `eslint.cmd`）：

```sh
node_modules/.bin/prettier --check tools/name-localization/ae2web-names.user.js tools/name-localization/test/*.cjs tools/name-localization/README.md
node_modules/.bin/eslint --config tools/name-localization/eslint.config.mjs tools/name-localization/ae2web-names.user.js tools/name-localization/test/*.cjs
```

Java 测试与客户端构建（PowerShell 换用 `./gradlew.bat`）：

```sh
bash gradlew -p tools/name-localization/verify-java test
bash gradlew -p tools/name-localization/client build
```

安装产物在 `tools/name-localization/client/build/libs/`，选择 `-client-only.jar`。
`build` 包含发行映射、资源元数据检查；不要安装 `-dev.jar`。

## 原版网页与二进制兼容测试

下载固定官方 JAR 作**测试输入**，不需要装到服务端。
`.local/` 已忽略，适合存放本机测试文件。

Bash：

```sh
mkdir -p .local
curl -fL https://github.com/kuba6000/AE2-Web-Integration/releases/download/1.2.0-pre-forge-1.20.1/ae2webintegration-1.2.0-pre-forge-1.20.1.jar -o .local/released-server.jar
export AE2WEB_RELEASE_JAR="$PWD/.local/released-server.jar"
```

PowerShell：

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
Invoke-WebRequest -Uri 'https://github.com/kuba6000/AE2-Web-Integration/releases/download/1.2.0-pre-forge-1.20.1/ae2webintegration-1.2.0-pre-forge-1.20.1.jar' -OutFile .local/released-server.jar
$env:AE2WEB_RELEASE_JAR = (Resolve-Path .local/released-server.jar).Path
```

两种终端均可执行下面的哈希校验与浏览器测试；预期 SHA-256 来自
[`provenance.json`](../name-localization/provenance.json)：

```sh
node --input-type=commonjs -e "const f=require('node:fs'),c=require('node:crypto'),p=require('./tools/name-localization/provenance.json');if(c.createHash('sha256').update(f.readFileSync(process.env.AE2WEB_RELEASE_JAR)).digest('hex')!==p.releaseJarSha256)throw Error('Release JAR checksum mismatch');console.log('Release JAR checksum OK')"
npm --prefix tools/name-localization run test:browser
```

附加官方二进制稳定键对比：

```sh
# Bash
bash gradlew -p tools/name-localization/verify-java test "-PreleasedJar=$AE2WEB_RELEASE_JAR"
```

```powershell
# PowerShell
./gradlew.bat -p tools/name-localization/verify-java test "-PreleasedJar=$env:AE2WEB_RELEASE_JAR"
```

没有 `AE2WEB_RELEASE_JAR` 时浏览器测试跳过；没有 `-PreleasedJar` 时 Java 二进制对比跳过，
不能当作已验证。浏览器测试仅运行本地模拟 API，不连接用户服务器。
`AE2WEB_SCREENSHOT_DIR` 可指定截图输出目录，建议 `.local/screenshots`。
这些检查不代替相同整合包中的游戏实测。

## 共享 core 与新版网页

仅修改对应代码时需要这些检查，旧版中文工具不使用此网页：

```sh
npm run format:check
npm run lint
npm run typecheck
npm --prefix tools/ui-tests test
bash gradlew build
```

Windows 最后一行用 `./gradlew.bat build`。额外 PHP 与 API 文档检查见
[CI 配置](../../.github/workflows/build-and-test.yml)。

## 云环境复用

[`cloud-setup.sh`](cloud-setup.sh) 来自此前实际使用的 `/workspace/cloud-setup/install.sh`，
增加仓库路径自动定位、工作区参数及平台检查。只适用于 **Linux x86_64** 云镜像，
预装 Node、npm、Python 3、curl、tar、sha256sum；不是 Windows 安装脚本。

```sh
bash tools/dev-environment/cloud-setup.sh
```

默认缓存位于 `/workspace/.cache`，JDK 位于 `/workspace/.toolchains`；
可设置 `AE2WEB_WORKSPACE` 使用另一个专用工作区。
脚本下载并校验固定 Temurin 版本，配置该工作区独立的 Gradle 用户目录，
安装三组 npm 依赖、构建新版前端和主题示例、安装 Chromium，不安装系统浏览器库。
网络受限时通过平台设置开放依赖下载，不关闭 TLS 校验或绕过平台代理。

脚本环境变量仅在其进程内生效；后续云端终端执行构建／测试前设置：

```sh
export JAVA_HOME=/workspace/.toolchains/jdk-25
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME=/workspace/.cache/gradle
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
export npm_config_cache=/workspace/.cache/npm
```

若改过 `AE2WEB_WORKSPACE`，同步修改路径。脚本保留继承的代理，
只在专用 Gradle 用户目录写入无凭据的代理主机／端口及系统 CA 路径。
带用户名或密码的代理需平台支持的 Java 配置，脚本会退出而不保存凭据。

下载涉及 GitHub / release-assets.githubusercontent.com、registry.npmjs.org、
Gradle / Maven 下载站、maven.neoforged.net、maven.minecraftforge.net、modmaven.dev、
launchermeta.mojang.com、piston-meta.mojang.com、piston-data.mojang.com、libraries.minecraft.net，
以及 Playwright 下载站和 storage.googleapis.com；以实际日志和平台策略为准。

不入库：云环境 ID、平台配置快照、认证文件、代理凭据、缓存、JDK、node_modules、
构建日志、游戏存档和用户名称／库存数据。过去云端的网络 403、GitHub 附件上传失败
不代表本地必然存在同样限制；v1.0.0 发行页已提供 tag 固定下载链接。
