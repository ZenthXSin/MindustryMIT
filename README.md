# MindustryMIT

MindustryMIT 当前后端是一个 Kotlin/JVM 工具库，用于辅助创建、编辑和导出 Mindustry Mod 的 JSON 配置。核心能力包括：

- 读取 Mindustry/Arc 运行时类映射，查询类、字段和文档元数据。
- 从本地文档 JSON 加载 `TypeMeta` / `FieldMeta`。
- 用 `ClassBuild`、`FieldBuild`、`Value` 构建 Mindustry JSON。
- 将已有 JSON 导入为可编辑的构建结构。
- 通过 WebSocket 暴露后端编辑 API。
- 从 Mindustry Wiki 抓取 Modding 类型文档。

本文档只说明后端代码，不包含 `src/main/html` 前端目录。


## WebSocket API

### `JsonApi.ToolData`

`ToolData` 是 WebSocket 后端的主要状态容器。

主要状态：

- `parser: JsonParser`
- `classDataMap: MutableMap<Int, Tool>`
- `classBuildMap: MutableMap<Int, ClassBuild>`
- `registeredClasses: MutableMap<String, Class<*>>`
- `nextId: Int`
- 日志回调：`error`、`info`、`warning`、`debug`

公开方法：

| 方法 | 说明 |
| --- | --- |
| `registerClass(className, clazz)` | 手动注册类名到 `Class<*>`，适合测试或无 Mindustry 运行时的场景。 |
| `newClass(className)` | 创建一个 `ClassBuild` 实例并返回自增 `Class_Id`。 |
| `removeClass(classId)` | 删除对应实例，返回是否删除成功。 |
| `contentParsing(message)` | 解析 `WebSocketData` 请求，执行对应 API，返回序列化后的 `WebSocketData` 响应。 |

内部行为：

- `Init` 会在 `Data_Dir/doc` 下寻找文档 JSON；没有文档时尝试从 classpath 中的 `doc.zip`、`docs.zip` 或 `mindustry-doc.zip` 解压。
- `FetchDoc` 会创建 `DocFetch` 子类，把抓取结果写入 `Data_Dir/doc/<type>.json`。
- 字段路径 `Field_Path` 使用字符串列表表示。字段名表示对象字段，`#数字` 表示数组元素，例如 `["items", "#0", "name"]`。
- `GetFieldValue`、`SetFieldValue`、`AddElement`、`ExportClass` 会捕获异常并在响应里返回 `Success = false` 和 `Message`。
- `NewClass` 当前未包裹异常，类名无法解析时会抛出异常。

### `JsonApiWebSocketHandler`

`JsonApi.ToolData.JsonApiWebSocketHandler` 封装 Java-WebSocket 服务端。

| 方法 | 说明 |
| --- | --- |
| `start()` | 在指定端口启动服务端；如果已启动则只记录日志。 |
| `stop()` | 停止服务端。 |
| `broadcast(message)` | 向所有连接广播消息。 |

服务端收到消息后会：

1. 给当前连接发送 `Echo: <原消息>`。
2. 调用 `toolData.contentParsing(message)`。
3. 把响应广播给所有连接。

### `WebSocketData`

请求和响应统一使用 `WebSocketData`：

```kotlin
@Serializable
data class WebSocketData(
    var wsType: WebSocketDataType,
    var content: String = "",
    var out: Boolean = false,
    var dataList: MutableMap<String, Data> = mutableMapOf()
)
```

规则：

- 入站请求使用 `out = false`。
- 如果 `wsType.input` 非空，构造时会从 `content` 解析对应字段并写入 `dataList`。
- 响应应使用 `WebSocketData.reply(wsType, data)` 创建，此时 `out = true`，不会自动解析 `content`。
- `DataType.Object` 当前仍是 `TODO()`，不要作为入站字段类型使用。

`Data` 字段：

| 字段 | 类型 |
| --- | --- |
| `str` | `String` |
| `int` | `Int` |
| `float` | `Float` |
| `list` | `MutableList<Data>` |
| `boolean` | `Boolean` |
| `obj` | `Data?` |

### 协议类型

| 类型 | 输入 | 输出 |
| --- | --- | --- |
| `Init` | `Data_Dir: String` | `Success: Boolean`, `Doc_Count: Int`, `Message: String` |
| `AllClass` | 无 | `Class_List: List` |
| `AllField` | `Class_Name: String` | `Field_List: List` |
| `FieldDoc` | `Class_Name: String`, `Field_Name: String` | `Field_Doc: String` |
| `FieldDefaultValue` | `Class_Name: String`, `Field_Name: String` | `Default_Value: String` |
| `GetFieldValue` | `Class_Id: Int`, `Field_Path: List` | `Success: Boolean`, `Value: String`, `Message: String` |
| `SetFieldValue` | `Class_Id: Int`, `Field_Path: List`, `Value: String` | `Success: Boolean`, `Value: String`, `Message: String` |
| `AddElement` | `Class_Id: Int`, `Field_Path: List`, `Element_Type: String`, `Value: String` | `Success: Boolean`, `Index: Int`, `Message: String` |
| `ExportClass` | `Class_Id: Int` | `Success: Boolean`, `Content: String`, `Message: String` |
| `NewClass` | `Class_Name: String` | `Class_Id: Int` |
| `RemoveClass` | `Class_Id: Int` | `Success: Boolean` |
| `FetchDoc` | `Data_Dir: String` | `Success: Boolean`, `Doc_Count: Int`, `Message: String` |


## 环境与构建

项目使用 Gradle Kotlin DSL：

- Kotlin JVM：`2.3.21`
- Kotlin serialization plugin：`2.2.10`
- Shadow plugin：`8.3.6`
- JDK：CI 使用 Temurin JDK 21
- 根项目名：`tool`
- Maven 坐标：`com.mindustry.ide:tool:<version>`
- 默认版本：没有传入 `-Pversion` 时为 `0.0.0-SNAPSHOT`

主要依赖：

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| `com.github.Anuken.Mindustry:core` | `v157.4` | Mindustry 类型来源，`compileOnly` |
| `com.github.Anuken.Arc:arc-core` | `v157.4` | Arc 数据结构和注解，`compileOnly` |
| `kotlinx-serialization-json` | `1.11.0` | JSON 序列化 |
| `kotlinx-coroutines-core` | `1.10.2` | 文档抓取并发 |
| `jsoup` | `1.22.2` | Wiki HTML 解析 |
| `Java-WebSocket` | `1.5.4` | WebSocket 服务端/客户端 |

构建命令：

```powershell
.\gradlew.bat shadowJar
.\gradlew.bat build
```

Linux/macOS：

```bash
./gradlew shadowJar
./gradlew build
```

`build` 任务依赖 `shadowJar`。输出位于 `build/libs/`，shadow jar 使用空 classifier，文件名形如 `tool-<version>.jar`。

## 目录结构

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

## 数据模型

### `WorkFileData`

`WorkFileData` 是工作文件的可序列化元数据，字段包括：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fileName` | `String` | 文件名 |
| `creationTime` | `String` | 创建时间 |
| `lastModifiedTime` | `String` | 最后修改时间 |
| `filePath` | `String` | 完整路径 |
| `description` | `String` | 描述 |
| `fileSize` | `Long` | 文件大小 |
| `fileExtension` | `String` | 扩展名 |
| `content` | `String` | 文件内容 |
| `relativePath` | `String` | 相对路径 |
| `isHidden` | `Boolean` | 是否隐藏 |

方法：

- `toString(): String`：把当前 `WorkFileData` 编码为 JSON 字符串。

### `WorkFile`

`WorkFile` 是工作文件基类：

```kotlin
abstract class WorkFile(
    var name: String,
    var data: WorkFileData = WorkFileData()
)
```

方法：

| 方法 | 说明 |
| --- | --- |
| `load(json: String)` | 从 JSON 字符串反序列化 `WorkFileData` 并写入 `data`。 |
| `update()` | 调用 `getContent()`，把返回值写入 `data.content`。 |
| `getContent(): String` | 抽象方法，返回当前文件内容。 |
| `import(content: String)` | 抽象方法，从外部内容导入工作文件状态。 |
| `export(): String` | 抽象方法，导出文件内容。 |
| `init()` | 抽象方法，初始化工作文件。 |

## 文档解析

### `FieldMeta` / `TypeMeta`

位于 `com.mindustry.ide.tool.json`：

```kotlin
data class FieldMeta(
    val name: String,
    val type: String,
    val defaultValue: String,
    val notes: String
)

data class TypeMeta(
    val type: String,
    val parentType: String,
    val fields: List<FieldMeta>
)
```

`JsonParser` 使用这两个类型保存本地文档元数据。

### `IJsonParser`

`IJsonParser` 定义类和字段元数据查询接口：

| 成员 | 说明 |
| --- | --- |
| `classMap` | Mindustry `ClassMap.classes`。普通 JVM 环境缺少 Mindustry 类时可能为 `null`。 |
| `getFieldDefaultValue(className, fieldName)` | 查询指定类字段的默认值，查不到返回 `"null"`。 |
| `getFieldDefaultValue(fieldName)` | 在全部已加载字段中查询同名字段默认值，查不到返回 `listOf("null")`。 |
| `getFieldDoc(className, fieldName)` | 查询字段说明，查不到返回空字符串。 |
| `getClassDoc(className)` | 查询类说明。当前实现返回类型、父类型和字段数量摘要。 |
| `getAllFields(className)` | 查询字段列表；优先使用已加载文档，否则尝试反射运行时类。 |
| `getAllClasses()` | 查询类名列表；优先使用已加载文档，否则使用 Mindustry `classMap`。 |
| `getParentType(className)` | 查询父类型，查不到返回空字符串。 |
| `load(file: File)` | 加载单个文档 JSON 或目录。 |

### `JsonParser`

`JsonParser` 是 `IJsonParser` 的默认实现。

公开属性：

- `classDocs: MutableMap<String, TypeMeta>`：按类名保存类文档。
- `fieldDocs: MutableMap<String, MutableMap<String, FieldMeta>>`：按类名和字段名保存字段文档。
- `classMap`：延迟读取 `mindustry.mod.ClassMap.classes`，捕获 `NoClassDefFoundError` 后返回 `null`。

方法：

| 方法 | 说明 |
| --- | --- |
| `parseJsonToMeta(json: String): TypeMeta?` | 把 JSON 字符串解析成 `TypeMeta`，失败返回 `null`。 |
| `indexClassMeta(meta: TypeMeta)` | 把 `TypeMeta` 写入 `classDocs`，并把字段写入 `fieldDocs`。 |
| `loadDocs(docPath: File): Int` | 加载一个 JSON 文件或递归加载目录下所有 `.json` 文件，返回成功加载数量。加载前会清空当前文档缓存。 |
| `load(file: File): JsonElement?` | 文件不存在返回 `null`；目录会转交 `loadDocs()`；普通文件会解析 JSON、索引 `TypeMeta` 并返回 `JsonElement`。 |

`JsonParser.Companion.jsonFormat` 配置了 `ignoreUnknownKeys = true`。

## JSON 构建

### 扩展方法

`JsonWorkFile.kt` 中定义了几个辅助扩展：

| 方法 | 说明 |
| --- | --- |
| `Field.isSeqOrArrayType()` | 判断字段是否为 `arc.struct.Seq`、Java 数组、`List` 或 `ArrayList`。 |
| `Field.getSeqElementType()` | 解析数组或泛型集合的元素类型，解析失败返回 `null`。 |
| `Field.isLikelyRequired()` | 根据 `transient/static/synthetic/final`、基础类型和 `@Nullable` 粗略判断字段是否可能必填。 |
| `String.isBooleanString()` | 判断字符串是否为 `true` 或 `false`。 |
| `String.isNumber()` | 判断字符串是否能转为 `Double`。 |

### `JsonWorkFile`

`JsonWorkFile` 继承 `WorkFile`，表示一个可导入、可导出的 Mindustry JSON 工作文件。

构造参数：

```kotlin
class JsonWorkFile(
    name: String,
    val parser: IJsonParser
) : WorkFile(name)
```

主要属性：

- `classBuild: ClassBuild`：当前根类型构建对象，默认是 `mindustry.world.Block`。
- `json1`：用于 pretty print 的 JSON 编码器，缩进为 4 个空格。

方法：

| 方法 | 说明 |
| --- | --- |
| `loadClassBuild(run)` | 从 `parser.classMap` 选择并设置根 `ClassBuild`，返回当前 `JsonWorkFile`。 |
| `import(content)` | 把 JSON 对象导入为 `ClassBuild`。根节点必须是 JSON object；非法 JSON 会抛出 `IllegalArgumentException`。 |
| `export()` | 等同于 `getContent()`。 |
| `init()` | 重置为 `Block`，并设置 `WorkFileData(fileName = name, fileExtension = "json")`。 |
| `getContent()` | 调用 `classBuild.toJson()` 并格式化。 |
| `formatJson(json)` | 尝试格式化 JSON；解析失败时返回原字符串。 |
| `toString()` | 把 `classBuild` 的元数据编码为 JSON。 |
| `addFieldBuild(run)` | 使用当前 `classBuild` 创建并追加字段构建。 |

导入行为：

- `"type"` 字段用于解析类名；找不到时使用默认类型。
- 普通 JSON 值写入 `FieldBuild.value.value`。
- JSON object 会递归构建嵌套 `ClassBuild`。
- JSON array 会尝试按字段元素类型构建 `elements`。
- 嵌套数组当前不处理。

### `ClassBuild`

`ClassBuild` 表示一个类型实例或数组元素。

主要属性：

| 属性 | 说明 |
| --- | --- |
| `classData` | 对应的 Java/Kotlin `Class<*>`。 |
| `parser` | 元数据查询器。 |
| `name` | 默认是 `classData.simpleName`，导出时写入 `"type"`。 |
| `doc` | 类文档摘要。 |
| `parentType` | 父类型。 |
| `fieldBuilds` | 已添加字段。 |
| `value` | 叶子值；非空且不为 `"null"` 时会直接导出为 JSON 值。 |

方法：

| 方法 | 说明 |
| --- | --- |
| `removeFieldBuild(fieldName)` | 按字段名删除字段构建，返回是否删除成功。 |
| `toJson()` | 导出 JSON。叶子值优先；没有字段时输出 `null`；有字段时输出包含 `"type"` 的对象。 |
| `getMeta()` | 返回可序列化的 `ClassMeta`。 |
| `getAllFields()` | 返回 `classData.fields`。 |
| `getFieldByName(name)` | 从反射字段中按名称查询。 |
| `getFieldBuildByName(name)` | 从已添加字段中按名称查询。 |
| `addFieldBuild(run)` | 追加一个 `FieldBuild`。 |
| `setFieldBuild(fieldBuild, run)` | 移除同名字段后追加新的字段构建。 |

`ClassMeta` 字段：

- `className`
- `classSimpleName`
- `doc`
- `parentType`
- `fields`
- `value`

### `FieldBuild`

`FieldBuild` 表示一个字段及其值。

构造参数：

```kotlin
class FieldBuild(
    var field: Field,
    val parser: IJsonParser,
    var classData: Class<*> = field.type,
    var doc: String = ""
)
```

初始化行为：

- `doc` 来自 `parser.getFieldDoc(classData.name, field.name)`。
- 如果字段是数组或集合，会创建空 `elements`，并把 `typeValue` 设置为元素类型的 `ClassBuild`。
- 默认值来自 `getDefaultForClass(field.type)`。

方法：

| 方法 | 说明 |
| --- | --- |
| `getMeta()` | 返回可序列化的 `FieldMeta`。 |
| `toJson()` | 导出 `"fieldName": value` 片段。 |
| `getDefaultForClass(clazz)` | 为基础类型返回默认字符串；未知类型返回 `"null"`。 |

当前默认值覆盖：

- `Int`、`Float`、`Double`、`Long`、`Short`、`Byte`：`"0"`
- `Boolean`：`"false"`
- `Char`：`"0"`
- `String`：`""`
- 其他类型：`"null"`

### `Value<T>`

`Value` 保存字段值、嵌套对象或数组元素。

主要属性：

- `value: String`：简单值。
- `typeValue: T`：通常是嵌套的 `ClassBuild`。
- `run: (Value<T>) -> String?`：自定义导出逻辑；返回非空时覆盖默认导出。
- `elements: MutableList<ClassBuild>?`：数组或集合元素。

方法：

| 方法 | 说明 |
| --- | --- |
| `addElement(build)` | 初始化并追加数组元素。 |
| `getMeta()` | 返回 `ValueMeta`。 |
| `toJson()` | 导出 JSON 值。数组优先输出 `[]` 或元素列表；布尔和数字不加引号；普通字符串加引号；复杂类型转交 `ClassBuild.toJson()`。 |
| `getString()` | 返回自定义字符串、简单值或嵌套类型字符串。 |
| `getTypeValueMeta()` | 根据当前值返回元数据；数字目前归类为 `Int`。 |

## 编辑封装

### `JsonEditorTool`

`JsonEditorTool` 是面向编辑流程的抽象封装。使用方必须实现日志方法：

```kotlin
abstract fun error(message: String)
abstract fun info(message: String)
abstract fun warning(message: String)
abstract fun debug(message: String)
```

其他方法：

| 方法 | 说明 |
| --- | --- |
| `getClassByName(name)` | 从 `parser.classMap` 查询类；找不到时记录错误并返回 `Nullable::class.java`。 |
| `getClassBuildByName(name)` | 基于类名创建 `ClassBuild`。 |
| `new(name, chooseClass)` | 创建 `JsonWorkFile`，从候选 `ClassData` 列表中选择根类型。 |
| `addFieldBuild(choose, set)` | 从当前根类型字段候选中选择字段并追加。 |
| `setFieldBuild(name, set)` | 修改已存在字段；字段不存在时记录错误。 |

### `ClassData`

`ClassData` 用于给 `JsonEditorTool.new()` 提供候选类信息：

- `name`
- `parser`
- `doc`
- `classData`

初始化时会从 `parser.classMap` 读取类，失败时使用 `Nullable::class.java`。

### `ClassBuild.addFieldBuild` 扩展

```kotlin
fun ClassBuild.addFieldBuild(
    choose: List<FieldBuild>.() -> FieldBuild,
    set: FieldBuild.() -> FieldBuild
)
```

该扩展会把 `getAllFields()` 转成 `FieldBuild` 候选列表，先执行 `choose`，再执行 `set`，最后追加到当前 `ClassBuild`。

## 文档抓取

### `DocFetch`

`DocFetch` 位于 `com.mindustry.ide.tool.json.libs`，用于从 Mindustry Wiki 抓取 Modding 文档并解析类型字段表。

配置项：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `ASYNC_LIMIT` | `12` | 并发数量 |
| `DELAY_TIME_MS` | `1000L` | 请求间隔配置，当前抓取流程未直接使用 |
| `ESTIMATE_TIME_MS` | `500L` | 单次请求估算时间 |
| `TEST_AMOUNT` | `-1` | 测试数量配置，当前抓取流程未直接使用 |
| `ONLY_TYPES` | `emptyList()` | 非空时只抓取指定类型 |
| `BASE_URL` | `https://mindustrygame.github.io/wiki/` | Wiki 根地址 |
| `CONNECT_TIMEOUT_MS` | `60000` | 连接超时 |
| `READ_TIMEOUT_MS` | `60000` | 读取超时 |
| `MAX_RETRIES` | `5` | 最大重试次数 |
| `RETRY_DELAY_MS` | `3000L` | 重试间隔 |
| `USE_PROXY` | `true` | 是否启用代理 |
| `PROXY_HOST` | `127.0.0.1` | 代理主机 |
| `PROXY_PORT` | `10090` | 代理端口 |

方法：

| 方法 | 说明 |
| --- | --- |
| `execute()` | 抓取 Modding 文档索引、过滤类型、并发解析元数据、调用 `saveTypeMeta()` 保存结果，返回成功的 `TypeMeta` 列表。 |
| `setupProxy()` | 根据 `USE_PROXY` 设置 JVM HTTP/HTTPS 代理。 |
| `saveTypeMeta(meta)` | 保存单个类型元数据。默认实现仍是 `TODO()`，直接使用会抛异常；需要子类覆盖。 |
| `fetchAllMeta(docs)` | 按 `ASYNC_LIMIT` 并发抓取多个文档的 `TypeMeta`。 |
| `updateProgress(current, total, success, failed)` | 更新进度回调并打印进度。 |
| `fetchWithRetry(url, retries)` | 带重试的 HTTP GET，成功返回响应文本，失败返回 `null`。 |
| `fetchTypeMeta(doc)` | 抓取单个 Wiki 文档页面并解析为 `TypeMeta`。 |
| `fetchModdingDocs()` | 读取 `search/search_index.json`，筛选 location 包含 `Modding` 的文档。 |
| `parseTable(table)` | 从 HTML 表格解析字段名、类型、默认值和说明。 |
| `disableSslVerification()` | 禁用默认 SSL 校验。 |

注意：

- 构造 `DocFetch` 时会调用 `disableSslVerification()` 和 `setupProxy()`。
- 默认代理是开启的；不需要代理时应先设置 `DocFetch.USE_PROXY = false`。
- `JsonApi.FetchDoc` 使用匿名子类覆盖了 `saveTypeMeta()`，会把结果写到 `Data_Dir/doc`。

### `TypeMap`

`TypeMap` 根据 `IJsonParser` 建立类型名到 `Class<*>` 的映射：

```kotlin
class TypeMap(private val parser: IJsonParser) {
    val types: MutableMap<String, Class<*>> = mutableMapOf()
}
```

初始化时会加入：

- `String -> String::class.java`
- `Boolean -> Boolean::class.java`
- `Number -> Int/Float/Double/Long/Short`
- `parser.classMap` 中的所有运行时类

注意：`Number` 这个 key 会被连续写入多次，最终保留最后一次写入的类型。

## 示例

### 加载文档元数据

```kotlin
import com.mindustry.ide.tool.json.JsonParser
import java.io.File

val parser = JsonParser()
val count = parser.loadDocs(File("data/doc"))

println("Loaded docs: $count")
println(parser.getAllClasses())
println(parser.getAllFields("Block"))
```

### 创建并导出 JSON

```kotlin
import com.mindustry.ide.tool.json.JsonEditorTool
import com.mindustry.ide.tool.json.JsonParser

val parser = JsonParser()

val editor = object : JsonEditorTool(parser) {
    override fun error(message: String) = println("[ERROR] $message")
    override fun info(message: String) = println("[INFO] $message")
    override fun warning(message: String) = println("[WARN] $message")
    override fun debug(message: String) = println("[DEBUG] $message")
}

val workFile = editor.new("my-block") {
    first { it.name == "Block" }
}

editor.addFieldBuild(
    choose = { first { it.field.name == "health" } },
    set = {
        value.value = "100"
        this
    }
)

println(workFile.export())
```

### 直接调用 WebSocket API 解析方法

```kotlin
import com.mindustry.ide.tool.json.JsonApi
import com.mindustry.ide.tool.json.WebSocketData
import com.mindustry.ide.tool.json.WebSocketDataType
import com.mindustry.ide.tool.json.JsonParser.Companion.jsonFormat

val toolData = JsonApi.ToolData()

val request = jsonFormat.encodeToString(
    WebSocketData.serializer(),
    WebSocketData(
        wsType = WebSocketDataType.AllField,
        content = """{"Class_Name":"Block"}"""
    )
)

val response = toolData.contentParsing(request)
println(response)
```

### 启动 WebSocket 服务

```kotlin
import com.mindustry.ide.tool.json.JsonApi

val toolData = JsonApi.ToolData().apply {
    error = { println("[ERROR] $it") }
    info = { println("[INFO] $it") }
    warning = { println("[WARN] $it") }
    debug = { println("[DEBUG] $it") }
}

val handler = JsonApi.ToolData.JsonApiWebSocketHandler(toolData, 19190)
handler.start()
```

## CI 与发布

仓库包含两个 GitHub Actions workflow：

- `.github/workflows/build.yml`
  - 触发：Pull Request 到 `main`，或手动触发。
  - 行为：使用 JDK 21 执行 `./gradlew shadowJar --no-daemon --stacktrace`，上传 `build/libs/*.jar`。
- `.github/workflows/release.yml`
  - 触发：推送到 `main`，或手动触发。
  - 行为：根据最新 tag 和 `version_bump` 计算版本，构建 shadow jar，创建 GitHub Release，并执行 `./gradlew publish` 发布到 GitHub Packages。

发布到 GitHub Packages 依赖环境变量：

```text
GITHUB_REPOSITORY
GITHUB_ACTOR
GITHUB_TOKEN
```

## 当前限制

- Mindustry 和 Arc 是 `compileOnly` 依赖；普通 JVM 环境没有对应运行时时，`JsonParser.classMap` 可能为 `null`。
- `DataType.Object` 尚未实现，入站 WebSocket 请求使用该类型会触发 `TODO()`。
- `DocFetch.saveTypeMeta()` 默认仍是 `TODO()`，直接调用 `DocFetch.execute()` 前应覆盖保存逻辑。
- `JsonWorkFile.import()` 不处理嵌套数组。
- `FieldBuild.getDefaultForClass()` 只覆盖常见基础类型。
- `Value.getTypeValueMeta()` 对数字字符串统一按 `Int` 生成元数据。
- `JsonApi.ToolData.newClass()` 在类名无法解析时会抛异常；`contentParsing()` 中的 `NewClass` 分支当前未捕获该异常。
