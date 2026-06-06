# MindustryMIT

MindustryMIT 是一个 Kotlin/JVM 工具库，用于辅助创建和编辑 Mindustry Mod 的 JSON 配置。当前代码主要包含 JSON 工作文件封装、Mindustry 类型/字段查询、字段构建、文档元数据解析，以及一个简单的 WebSocket API 封装。

## 当前状态

- 语言与构建：Kotlin/JVM，Gradle Kotlin DSL。
- 目标产物：`tool-<version>.jar`。当前 `shadowJar` 使用空 classifier，`build` 任务会构建 shadow jar。
- Mindustry 与 Arc 依赖是 `compileOnly`，运行时需要由宿主环境或使用方提供。
- `JsonWorkFile.import()` 与 `export()` 已有基础实现，可以导入 JSON 对象并导出格式化 JSON。
- `JsonParser.load()`、`WebSocketData` 的 `DataType.Object`、`DocFetch.saveTypeMeta()` 仍是 `TODO()`。

## 项目结构

```text
src/main/java/com/mindustry/ide/tool/
├── WorkFile.kt
└── json/
    ├── JsonApi.kt
    ├── JsonEditorTool.kt
    ├── JsonParser.kt
    ├── JsonWorkFile.kt
    └── libs/
        ├── DocFetch.kt
        └── TypeMap.kt
```

## 核心模块

### WorkFile

`WorkFile` 是工作文件基类，保存文件元数据并定义导入、导出、更新内容等接口。

```kotlin
abstract class WorkFile(var name: String, var data: WorkFileData = WorkFileData()) {
    open fun load(json: String)
    open fun update()
    abstract fun getContent(): String
    abstract fun import(content: String)
    abstract fun export(): String
    abstract fun init()
}
```

### JsonParser

`JsonParser` 提供 Mindustry 类和字段元数据查询。默认实现会从 `mindustry.mod.ClassMap.classes` 读取类型映射；如果当前运行环境没有 Mindustry 类，会安全返回 `null` 或空列表。

主要能力：

- 查询类列表：`getAllClasses()`
- 查询字段列表：`getAllFields(className)`
- 查询字段文档和默认值：`getFieldDoc()`、`getFieldDefaultValue()`
- 解析并索引文档元数据：`parseJsonToMeta()`、`indexClassMeta()`

### JsonWorkFile

`JsonWorkFile` 负责把类构建信息转换成 Mindustry JSON，也可以从已有 JSON 对象恢复字段结构。

已支持：

- 根 JSON 对象导入。
- 基础值、嵌套对象、数组字段导入。
- `Seq`、Java 数组、`List`、`ArrayList` 的基础识别。
- `export()` 输出格式化 JSON。

当前限制：

- 嵌套数组暂未处理。
- 字段类型默认值只覆盖常见基础类型。

### JsonEditorTool

`JsonEditorTool` 是面向编辑流程的抽象封装，需要使用方实现日志回调。

```kotlin
val editor = object : JsonEditorTool(parser) {
    override fun error(message: String) = println("[ERROR] $message")
    override fun info(message: String) = println("[INFO] $message")
    override fun warning(message: String) = println("[WARN] $message")
    override fun debug(message: String) = println("[DEBUG] $message")
}

val workFile = editor.new("my-block") {
    first { it.name == "Block" }
}

editor.addFieldBuild({
    first { it.field.name == "health" }
}) {
    value.value = "100"
    this
}

println(workFile.export())
```

### JsonApi

`JsonApi` 把 `JsonEditorTool` 包装成可通过 WebSocket 调用的 API。入口类是 `JsonApi.ToolData`，内部通过 `classDataMap` 保存创建出的工具实例。

```kotlin
val toolData = JsonApi.ToolData()
toolData.error = { println("[ERROR] $it") }
toolData.info = { println("[INFO] $it") }
toolData.warning = { println("[WARN] $it") }
toolData.debug = { println("[DEBUG] $it") }

val classId = toolData.newClass("Block")
val removed = toolData.removeClass(classId)

val wsHandler = JsonApi.ToolData.JsonApiWebSocketHandler(toolData, 8887)
wsHandler.start()
```

## WebSocket 协议

消息使用 `WebSocketData` 序列化。`content` 是字符串字段；当消息类型有输入参数时，`content` 必须是对应参数的 JSON 字符串。

当前支持的 `WebSocketDataType`：

| 类型 | 输入 | 输出 |
| --- | --- | --- |
| `AllClass` | 无 | `Class_List: List` |
| `AllField` | `Class_Name: String` | `Field_List: List` |
| `NewClass` | `Class_Name: String` | `Class_Id: Int` |
| `RemoveClass` | `Class_Id: Int` | `Success: Boolean` |

请求示例：

```kotlin
val request = JsonParser.jsonFormat.encodeToString(
    WebSocketData.serializer(),
    WebSocketData(
        wsType = WebSocketDataType.AllField,
        content = """{"Class_Name":"Block"}"""
    )
)
```

服务端收到消息后会先向当前连接发送 `Echo: <原消息>`，再广播 `contentParsing()` 生成的 API 回复。

## DocFetch

`DocFetch` 用于从 Mindustry Wiki 的 Modding 文档页面抓取类型元数据。

默认配置里启用了本地代理：

```kotlin
DocFetch.USE_PROXY = true
DocFetch.PROXY_HOST = "127.0.0.1"
DocFetch.PROXY_PORT = 10090
```

如果不需要代理，需要在执行前关闭：

```kotlin
DocFetch.USE_PROXY = false
```

注意：`saveTypeMeta()` 当前仍是 `TODO()`，抓取结果需要由子类覆盖保存逻辑。

## 构建

Windows：

```powershell
.\gradlew.bat shadowJar
.\gradlew.bat build
```

Linux/macOS：

```bash
./gradlew shadowJar
./gradlew build
```

构建输出位于：

```text
build/libs/
```

`build` 任务依赖 `shadowJar`。

## 发布

项目配置了 GitHub Actions：

- `.github/workflows/build.yml`
  - 触发：Pull Request 到 `main`、手动触发。
  - 行为：执行 `./gradlew shadowJar` 并上传 jar artifact。
- `.github/workflows/release.yml`
  - 触发：推送到 `main`、手动触发。
  - 行为：根据最新 tag 计算下一个版本，构建 shadow jar，创建 GitHub Release，并发布到 GitHub Packages。

本地发布配置使用：

```kotlin
group = "com.mindustry.ide"
artifactId = "tool"
```

GitHub Packages 发布需要环境变量：

```text
GITHUB_REPOSITORY
GITHUB_ACTOR
GITHUB_TOKEN
```

## 依赖

| 依赖 | 作用 | 版本 |
| --- | --- | --- |
| Mindustry Core | Mindustry 类型来源，`compileOnly` | v157.4 |
| Arc Core | Arc 数据结构和注解，`compileOnly` | v157.4 |
| kotlinx-serialization-json | JSON 序列化 | 1.11.0 |
| kotlinx-coroutines-core | 协程 | 1.10.2 |
| Jsoup | HTML 文档解析 | 1.22.2 |
| Java-WebSocket | WebSocket 服务端/客户端 | 1.5.4 |

## 注意事项

- 在普通 JVM 环境中，如果没有 Mindustry 运行时，`JsonParser.classMap` 会返回 `null`，类和字段查询会返回空结果。
- `DataType.Object` 尚未实现，收到该类型输入会触发 `TODO()`。
- `JsonParser.load()` 尚未实现。
- `DocFetch` 默认会禁用 SSL 校验并设置代理，作为正式工具使用前建议重新审视这部分网络逻辑。
