# Tool Module - Mindustry JSON Editor

这是一个用于编辑 Mindustry 游戏 JSON 配置文件的独立模块。

## 模块结构

```
tool/
├── build.gradle.kts                    # 模块构建配置
└── src/main/java/com/mindustry/ide/tool/
    ├── WorkFile.kt                     # 工作文件基类
    └── json/
        ├── JsonParser.kt               # JSON 解析器接口和实现
        ├── JsonEditorTool.kt           # JSON 编辑器工具
        ├── JsonWorkFile.kt             # JSON 工作文件实现
        └── libs/
            ├── DocFetch.kt             # 文档获取工具
            ├── TypeMap.kt              # 类型映射
            └── DetectingContentParser.kt
```

## 主要功能

### 1. IJsonParser 接口

所有需要访问 Mindustry 类信息的组件都通过 `IJsonParser` 接口进行交互，而不是直接依赖全局变量。

```kotlin
interface IJsonParser {
    val classMap: ObjectMap<String?, Class<*>?>?
    fun getFieldDefaultValue(className: String, fieldName: String): String
    fun getFieldDoc(className: String, fieldName: String): String
    fun getClassDoc(className: String): String
    fun getAllFields(className: String): List<FieldMeta>
    fun getParentType(className: String): String
    fun load(路径: File): kotlinx.serialization.json.JsonElement?
}
```

### 2. 使用示例

#### 创建 JSON 编辑器

```kotlin
// 在 Android 环境中
class MyJsonEditor(parser: IJsonParser) : JsonEditorTool(parser) {
    override fun error(message: String) {
        Log.e("JsonEditor", message)
    }
    
    override fun info(message: String) {
        Log.i("JsonEditor", message)
    }
    
    override fun warning(message: String) {
        Log.w("JsonEditor", message)
    }
}

// 使用
val editor = MyJsonEditor(myParser)
val jsonWorkFile = editor.new("my_block") {
    first { it.name == "ItemTurret" }
}
```

#### 添加字段

```kotlin
editor.addFieldBuild({
    first { it.field.name == "shootY" }
}) {
    value.value = "5"
}
```

#### 导出 JSON

```kotlin
val jsonContent = jsonWorkFile.getContent()
println(jsonContent)
```

## 迁移指南

### 从旧版本迁移

**之前：**
```kotlin
// 直接访问 Vars.parser
val tool = object : JsonEditorTool() { ... }
```

**现在：**
```kotlin
// 传入 parser 实例
val tool = object : JsonEditorTool(parser) { ... }
```

### 在 app 模块中使用

1. 确保在 `build.gradle.kts` 中添加了依赖：
```kotlin
dependencies {
    implementation(project(":tool"))
}
```

2. 实现 `IJsonParser` 接口或继承 `JsonParser`：
```kotlin
class MyParser : JsonParser() {
    override val classMap = /* 你的类映射 */
    
    override fun load(路径: File): JsonElement? {
        // 实现加载逻辑
    }
}
```

3. 将 parser 实例传递给工具类：
```kotlin
val editor = MyJsonEditor(myParser)
```

## 依赖项

- **Mindustry Core** (compileOnly): `com.github.Anuken.Mindustry:core:v157.4`
- **Arc Core** (compileOnly): `com.github.Anuken.Arc:arc-core:v157.4`
- **Kotlin Serialization**: `org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0`
- **Coroutines**: `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2`
- **Jsoup**: `org.jsoup:jsoup:1.22.2`

## 优势

1. **解耦合**: 通过接口注入 parser，不再依赖全局变量
2. **可测试性**: 可以轻松创建 mock parser 进行单元测试
3. **灵活性**: 可以在不同环境（Android、JVM）中使用不同的 parser 实现
4. **模块化**: 独立的 build 配置，便于维护和复用

## 注意事项

- `DetectingContentParser.kt` 目前为空文件，需要根据需求实现
- `JsonWorkFile.import()` 和 `export()` 方法尚未实现
- `JsonParser.load()` 方法需要在子类中实现具体逻辑

## JsonApi的ws服务器规范
