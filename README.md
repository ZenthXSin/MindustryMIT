# MindustryMIT

Mindustry 可视化模组编辑器 —— 通过 WebSocket API + Web UI 远程创建、编辑、导出 Mindustry Mod JSON 内容。

## 特性

- **WebSocket API**：18 种消息类型，支持反射式 JSON 操作（创建实例、读写字段、数组管理、自定义 class/field、导出）
- **Web UI**：Vue 3 + Tailwind CSS 构建的可视化编辑器，支持桌面和移动端，内置语言包/权重包管理
- **Android App**：前台服务运行后端，内置控制台终端显示启动日志，服务就绪后自动打开浏览器
- **文档系统**：自动从 Mindustry Wiki 抓取 Modding 文档，支持字段注释和默认值查询
- **静态实例缓存**：内置 Blocks、Items、UnitTypes 等内容容器的实例名查询
- **自定义扩展**：运行时动态添加字段、定义全新 class，支持继承链查询

## 快速开始

### 方式一：桌面端（JAR）

```bash
# 构建
./gradlew shadowJar

# 运行（默认端口 19190）
java -jar build/libs/tool-*.jar
```

打开 `src/main/web/index.html` 即可使用 Web 编辑器。

### 方式二：Android App

从 [Releases](../../releases) 下载 `mindustrymit-release.apk`，安装后启动，自动打开浏览器访问编辑器。

### 方式三：GitHub Actions 自动构建

Push 到 `main` 分支自动触发 Release 工作流，构建并发布：
- `tool-*.jar` — 桌面端可执行 JAR
- `web.html` — Web 编辑器页面
- `mindustrymit-release.apk` — Android 安装包

## 项目结构

```
MindustryMIT/
├── src/main/java/com/mindustry/ide/tool/
│   ├── Main.kt                 # 桌面入口
│   ├── WorkFile.kt             # 工作文件数据模型
│   └── json/
│       ├── JsonApi.kt          # WebSocket API 核心
│       ├── JsonParser.kt       # 文档解析器
│       ├── JsonEditorTool.kt   # 编辑器工具抽象
│       ├── JsonWorkFile.kt     # JSON 工作文件
│       ├── JsonTypeRegistry.kt # 类型注册表
│       └── libs/
│           ├── DocFetch.kt     # Wiki 文档抓取
│           └── TypeMap.kt      # 类型映射
├── src/main/web/
│   └── index.html              # 桌面 Web 编辑器
├── mindustrymit/               # Android 模块
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── assets/web.html     # 移动端 Web 编辑器
│   │   └── java/com/example/MMIT/
│   │       ├── MainActivity.kt      # 启动服务 + 打开浏览器
│   │       └── BackendService.kt    # 前台服务（HTTP + WebSocket）
│   └── build.gradle.kts
├── .github/workflows/
│   ├── build.yml               # PR 验证（JAR + APK）
│   └── release.yml             # 自动发布（JAR + APK + web.html）
└── build.gradle.kts            # 根项目配置
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | Kotlin 2.3.21 |
| JVM | JDK 21 |
| 构建 | Gradle 9.3.0 + AGP 9.0.0-alpha06 |
| WebSocket | Java-WebSocket 1.5.4 |
| HTTP (Android) | NanoHTTPD 2.3.1 |
| 序列化 | kotlinx-serialization-json |
| Web 前端 | Vue 3 + Tailwind CSS |
| Mindustry | core v157.4 |

## WebSocket API

默认监听 `ws://0.0.0.0:19190`，支持以下消息类型：

| 类型 | 说明 |
|------|------|
| `Init` | 初始化数据目录，加载文档 |
| `AllClass` | 获取所有可用类名 |
| `AllField` | 获取类的字段列表 |
| `NewClass` | 创建可编辑类型实例 |
| `GetFieldValue` | 读取字段值 |
| `SetFieldValue` | 设置字段值 |
| `AddElement` | 向数组添加元素 |
| `RemoveElement` | 删除数组元素 |
| `ExportClass` | 导出实例为 JSON |
| `RemoveClass` | 删除实例 |
| `ClassInstance` | 查询静态内容实例名 |
| `FieldDoc` | 获取字段文档 |
| `FieldDefaultValue` | 获取字段默认值 |
| `FetchDoc` | 从 Wiki 抓取文档 |
| `TypeParserInfo` | 查询类型解析信息 |
| `AddField` | 动态添加字段（含子类传播） |
| `DefineClass` | 定义自定义 class（不依赖 Mindustry ClassMap） |
| `RemoveCustomClass` | 删除自定义 class |

### 协议格式

所有消息均为 JSON 对象：

```typescript
interface WebSocketData {
    wsType: string;          // 消息类型
    content?: string;        // 请求参数的 JSON 字符串
    out?: boolean;           // true=响应, false=请求
    dataList?: Record<string, Data>;  // 结构化数据
}
```

### 使用示例

```javascript
const ws = new WebSocket('ws://127.0.0.1:19190');

ws.onopen = () => {
    // 初始化
    ws.send(JSON.stringify({
        wsType: 'Init',
        content: JSON.stringify({ Data_Dir: 'mindustry_docs' })
    }));
};

ws.onmessage = (e) => {
    const resp = JSON.parse(e.data);
    console.log('响应:', resp);
};
```

### 详细接口文档

<details>
<summary>点击展开完整 API 文档</summary>

#### 1. Init - 初始化

加载文档目录并刷新静态实例缓存。

```json
{ "wsType": "Init", "content": "{\"Data_Dir\":\"mindustry_docs\"}" }
```

响应：`Success`, `Doc_Count`, `Message`

#### 2. AllClass - 获取所有类

```json
{ "wsType": "AllClass" }
// 或按父类过滤
{ "wsType": "AllClass", "content": "{\"Parent_Class\":\"Block\"}" }
```

响应：`Class_List` (字符串数组)

#### 3. AllField - 获取字段列表

```json
{ "wsType": "AllField", "content": "{\"Class_Name\":\"Block\"}" }
```

响应：`Field_List`，每个元素包含 `str`（字段名）和 `json`（类型名）

#### 4. NewClass - 创建实例

```json
{ "wsType": "NewClass", "content": "{\"Class_Name\":\"Block\"}" }
```

响应：`Class_Id`（后续操作的实例 ID）

#### 5. GetFieldValue - 读取字段

```json
{
    "wsType": "GetFieldValue",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"health\"]}"
}
```

路径语法：`["requirements", "#0", "amount"]`，`#0` 表示数组索引。

#### 6. SetFieldValue - 设置字段

```json
{
    "wsType": "SetFieldValue",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"health\"],\"Value\":\"500\"}"
}
```

支持 `Value_Class_Id` 引用其他实例。

#### 7. AddElement - 添加数组元素

```json
{
    "wsType": "AddElement",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"requirements\"],\"Element_Type\":\"ItemStack\",\"Value\":\"\"}"
}
```

响应：`Index`（新元素索引）

#### 8. RemoveElement - 删除数组元素

```json
{
    "wsType": "RemoveElement",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"requirements\"],\"Index\":0}"
}
```

#### 9. ExportClass - 导出 JSON

```json
{ "wsType": "ExportClass", "content": "{\"Class_Id\":1}" }
```

响应：`Content`（完整 JSON 字符串）

#### 10. RemoveClass - 删除实例

```json
{ "wsType": "RemoveClass", "content": "{\"Class_Id\":1}" }
```

#### 11. ClassInstance - 查询静态实例

```json
{ "wsType": "ClassInstance", "content": "{\"Class_Name\":\"Block\"}" }
```

响应：`Object_List`，如 `["Blocks.copperWall", "Blocks.coreShard", ...]`

#### 12. FieldDoc - 获取字段文档

```json
{ "wsType": "FieldDoc", "content": "{\"Class_Name\":\"Block\",\"Field_Name\":\"health\"}" }
```

#### 13. FieldDefaultValue - 获取默认值

```json
{ "wsType": "FieldDefaultValue", "content": "{\"Class_Name\":\"Block\",\"Field_Name\":\"health\"}" }
```

#### 14. FetchDoc - 抓取 Wiki 文档

```json
{ "wsType": "FetchDoc", "content": "{\"Data_Dir\":\"mindustry_docs\"}" }
```

#### 15. TypeParserInfo - 类型解析信息

```json
{ "wsType": "TypeParserInfo", "content": "{\"Type_Name\":\"Block\"}" }
```

#### 16. AddField - 动态添加字段

```json
{
    "wsType": "AddField",
    "content": "{\"Class_Name\":\"Block\",\"Field_Name\":\"customField\",\"Field_Type\":\"String\",\"Default_Value\":\"\",\"Notes\":\"自定义字段\",\"Apply_To_Subclasses\":true}"
}
```

响应：`Success`, `Affected_Classes`（影响的类数量）, `Message`

#### 17. DefineClass - 定义自定义 class

定义一个不依赖 Mindustry ClassMap 的自定义 class，可被 `AllClass`、`AllField`、`NewClass` 识别。

```json
{
    "wsType": "DefineClass",
    "content": "{\"Class_Name\":\"MyBlock\",\"Parent_Type\":\"Block\",\"Fields\":[{\"name\":\"power\",\"type\":\"float\",\"defaultValue\":\"0\",\"notes\":\"自定义功率\"}]}"
}
```

响应：`Success`, `Message`

#### 18. RemoveCustomClass - 删除自定义 class

```json
{ "wsType": "RemoveCustomClass", "content": "{\"Class_Name\":\"MyBlock\"}" }
```

响应：`Success`

</details>

## 配置

### 系统属性

| 属性 | 说明 | 默认值 |
|------|------|--------|
| `mindustrymit.dataRoot` | 数据根目录 | `.mindustrymit-data` |
| `mindustrymit.wsToken` | WebSocket 认证 Token | 无（不校验） |
| `mindustrymit.bindHost` | 绑定地址 | `0.0.0.0` |
| `mindustrymit.useSSL` | 启用 WSS | `false` |
| `mindustrymit.maxInstances` | 最大实例数 | `100` |
| `mindustrymit.instanceTtlMinutes` | 实例过期时间（分钟） | `30` |

### Android 端口

| 服务 | 端口 |
|------|------|
| HTTP（Web 页面） | 8080 |
| WebSocket | 8317 |

## 构建

```bash
# 桌面 JAR
./gradlew shadowJar

# Debug APK
./gradlew :mindustrymit:assembleDebug

# Release APK（需要签名配置 local.properties）
./gradlew :mindustrymit:assembleRelease
```

## Mod 制作流程

1. 准备 `mod.json` 和 `content/` 目录结构
2. 调用 `Init` 加载文档
3. 调用 `AllClass` 选择内容类型（Block、UnitType、Item 等）
4. 调用 `NewClass` 创建实例
5. 用 `AllField` + `FieldDoc` 查看可用字段
6. 用 `SetFieldValue` / `AddElement` 编辑字段
7. 调用 `ExportClass` 导出 JSON，写入 Mod 文件
8. 放入 Mindustry mods 目录测试

## 许可证

项目内部使用，无特殊许可证说明。使用前请遵守 Mindustry 相关许可。
