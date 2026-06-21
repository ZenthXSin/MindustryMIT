# Mindustry MIT 工具后端 API 文档

## 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [Mod 制作流程参考](#mod-制作流程参考)
- [协议规范](#协议规范)
- [详细接口说明](#详细接口说明)
- [完整使用流程示例](#完整使用流程示例)
- [安全注意事项](#安全注意事项)
- [常见问题](#常见问题)
- [附录：静态实例缓存来源](#附录静态实例缓存来源)
- [许可证](#许可证)

## 概述

`JsonApi` 是一个基于 WebSocket 的后端服务，为 [Mindustry](https://mindustrygame.github.io/) 游戏的数据编辑提供反射式 JSON 操作能力。它允许客户端远程创建游戏数据类的实例、读取/修改字段值、管理数组元素，并支持文档自动抓取与字段注释查询。

**主要特性**：
- 通过 WebSocket 协议通信（默认端口 `19190`）
- 支持动态创建可编辑的 Mindustry 类型实例（如 `Block`, `UnitType`, `ItemStack` 等）
- 支持查询 Mindustry 静态内容实例名（如 `Blocks.copperWall`, `Items.copper`）
- 使用 JSON 路径表达式访问嵌套字段和数组元素
- 内置 Wiki 文档抓取（`FetchDoc`）与字段文档查询
- 可选的 Token 认证与来源域校验

---

## 快速开始

### 1. 运行环境

- JDK 21 或更高版本
- Kotlin/Gradle 运行时由项目构建脚本管理
- 主要依赖：`kotlinx-serialization-json`, `Java-WebSocket`, `Mindustry core`

### 2. 启动服务器

```kotlin
fun main() {
    val api = JsonApi()
    api.server.start()   // 启动 WebSocket 服务器
}
```

启动后服务器监听 `ws://127.0.0.1:19190`。可通过系统属性修改配置：

| 系统属性 | 说明 | 示例 |
|----------|------|------|
| `mindustrymit.dataRoot` | 数据根目录（文档存储位置） | `-Dmindustrymit.dataRoot=/path/to/data` |
| `mindustrymit.wsToken` | WebSocket 认证 Token（可选） | `-Dmindustrymit.wsToken=mySecretToken` |

### 3. 客户端连接示例（JavaScript）

```javascript
const ws = new WebSocket('ws://127.0.0.1:19190');

ws.onopen = () => {
    console.log('已连接');
    // 发送初始化请求
    ws.send(JSON.stringify({
        wsType: 'Init',
        content: JSON.stringify({ Data_Dir: "mindustry_docs" })
    }));
};

ws.onmessage = (e) => {
    const resp = JSON.parse(e.data);
    console.log('收到响应:', resp);
};
```

---

## Mod 制作流程参考

一个 Mindustry Mod 的 JSON 内容通常由 `mod.json` 加上 `content/<类型目录>/*.json` 组成。`JsonApi` 不直接管理文件系统中的 Mod 目录，它负责生成和校验单个内容 JSON；客户端应把 `ExportClass` 的结果写入目标文件。

推荐目录结构：

```text
my-mod/
├── mod.json
└── content/
    ├── blocks/
    │   └── copper-wall-plus.json
    ├── items/
    │   └── refined-copper.json
    └── units/
        └── scout-drone.json
```

推荐制作流程：

1. **准备工作区**
   先准备 `mod.json`，至少包含 `name`、`displayName`、`author`、`version`、`minGameVersion` 等基础字段。客户端侧维护最终文件路径，例如 `content/blocks/copper-wall-plus.json`。

2. **初始化文档和静态实例缓存**
   调用 `Init`，传入 `Data_Dir`。这会加载 `Data_Dir/doc` 下的字段文档，同时刷新 `ClassInstance` 用到的 Mindustry 静态内容实例缓存。

3. **选择内容类型**
   根据要制作的内容选择实际类型名，而不是静态容器名：
   - 方块：`Block`、`Wall`、`Drill`、`Conveyor`、`Turret`
   - 物品：`Item`
   - 液体：`Liquid`
   - 单位：`UnitType`
   - 状态效果：`StatusEffect`
   - 天气：`Weather`
   - 星球：`Planet`

4. **查询字段并展示给编辑器**
   用 `AllField` 获取字段列表，用 `FieldDoc` 和 `FieldDefaultValue` 给 UI 补充说明与默认值。需要引用已有内容时，用 `ClassInstance` 查询候选，例如传入 `Item` 可得到 `Items.copper` 一类静态实例名。

5. **创建可编辑实例**
   调用 `NewClass`，例如 `{ "Class_Name": "Block" }`。返回的 `Class_Id` 是后续编辑会话 ID，不是最终 JSON 文件名。

6. **写入普通字段**
   对简单字段调用 `SetFieldValue`。例如设置方块生命值：

   ```json
   {
       "wsType": "SetFieldValue",
       "content": "{\"Class_Id\":1,\"Field_Path\":[\"health\"],\"Value\":\"500\"}"
   }
   ```

7. **写入数组或列表字段**
   对 `requirements`、`weapons` 等数组字段，先调用 `AddElement` 创建元素，再用 `#索引` 路径写子字段。例如先创建一个 `ItemStack` 元素，再设置数量：

   ```json
   {
       "wsType": "AddElement",
       "content": "{\"Class_Id\":1,\"Field_Path\":[\"requirements\"],\"Element_Type\":\"ItemStack\",\"Value\":\"\"}"
   }
   ```

   ```json
   {
       "wsType": "SetFieldValue",
       "content": "{\"Class_Id\":1,\"Field_Path\":[\"requirements\",\"#0\",\"amount\"],\"Value\":\"80\"}"
   }
   ```

8. **导出并写入 Mod 文件**
   调用 `ExportClass` 得到最终 JSON 字符串。客户端将其写入对应路径，例如 `content/blocks/copper-wall-plus.json`。如果用户继续编辑同一内容，保留 `Class_Id`；如果关闭文件，调用 `RemoveClass` 释放后端状态。

9. **验证和迭代**
   把生成的 Mod 放入 Mindustry 的 mods 目录，用游戏加载检查字段类型、内容引用和运行时行为。若加载报错，回到编辑器根据错误字段重新调用 `SetFieldValue` / `AddElement`，再导出覆盖文件。

注意事项：

- `type` 字段由 `ClassBuild.toJsonElement()` 自动写入，通常不需要通过 `SetFieldValue` 手动设置。
- `ClassInstance` 返回的 `Blocks.xxx` / `Items.xxx` 是候选引用名，不等同于 `NewClass` 的类型名。
- `Data_Dir` 是工具数据目录，不是 Mod 输出目录。Mod 文件写入应由客户端自己控制。
- `SetFieldValue` 接收字符串，最终导出时会根据目标字段类型转换为数字、布尔、字符串、对象或数组。

---

## 协议规范

### 消息格式

所有 WebSocket 消息均为 JSON 对象，序列化/反序列化使用 `WebSocketData` 类定义。

```typescript
interface WebSocketData {
    wsType: string;          // 消息类型，见下方枚举
    content?: string;        // 当 out=false 时，存放请求参数的 JSON 字符串
    out?: boolean;           // true: 响应消息（服务器发出）; false: 请求消息（客户端发出）
    dataList?: Record<string, Data>;  // 结构化字段（响应时使用）
}
```

请求消息中，只要 `wsType` 定义了输入字段，`content` 必须是一个 JSON 对象字符串。服务器会按 `WebSocketDataType.input` 把 `content` 解析到 `dataList`；响应消息由 `WebSocketData.reply(...)` 生成，`out=true`，数据直接放在 `dataList`。

其中 `Data` 结构：

```typescript
interface Data {
    str?: string;
    int?: number;
    float?: number;
    list?: Data[];
    boolean?: boolean;
    obj?: Data;
    json?: string;    // DataType.Object 会保留原始 JSON 字符串
}
```

### 消息类型 (`WebSocketDataType`)

| 类型 | 方向 | 说明 |
|------|------|------|
| `Init` | 客户端→服务器 | 初始化数据目录，加载文档，并刷新静态内容实例缓存 |
| `AllClass` | 客户端→服务器 | 获取运行时类名列表；无运行时类表时回退到已加载文档 |
| `AllField` | 客户端→服务器 | 获取某个类的所有字段名 |
| `ClassInstance` | 客户端→服务器 | 获取指定类型可赋值的静态内容实例名（如 `Block` -> `Blocks.copperWall`） |
| `FieldDoc` | 客户端→服务器 | 获取字段的文档注释 |
| `FieldDefaultValue` | 客户端→服务器 | 获取字段的默认值字符串 |
| `GetFieldValue` | 客户端→服务器 | 读取指定路径的字段值 |
| `SetFieldValue` | 客户端→服务器 | 设置指定路径的字段值 |
| `AddElement` | 客户端→服务器 | 向数组/列表字段添加元素 |
| `RemoveElement` | 客户端→服务器 | 从数组/列表字段删除指定下标的元素 |
| `ExportClass` | 客户端→服务器 | 导出整个类实例的 JSON 表示 |
| `NewClass` | 客户端→服务器 | 创建新的可编辑类型实例（返回 Class_Id） |
| `RemoveClass` | 客户端→服务器 | 删除已创建的类实例 |
| `FetchDoc` | 客户端→服务器 | 从 Mindustry Wiki 抓取 Modding 文档并保存 |
| `Error` | 服务器→客户端 | 错误响应 |

---

## 详细接口说明

### 通用约定

- **路径语法 (`Field_Path`)**
  使用字符串数组表示嵌套字段路径。例如访问 `requirements[0].amount`：
  `["requirements", "#0", "amount"]`
  其中 `#0` 表示数组索引 0。

- **Class_Id**
  通过 `NewClass` 创建可编辑类型实例后获得，后续读写和导出需携带该 ID。

- **类型名和实例名**
  `NewClass` / `AllField` 使用实际类型名，例如 `Block`、`UnitType`、`ItemStack`。`ClassInstance` 返回的是静态内容实例名，例如 `Blocks.copperWall`、`Items.copper`。

- **响应中的 `Success` 字段**
  表示操作是否成功，失败时 `Message` 字段包含错误信息。

---

### 1. 初始化 `Init`

加载指定目录下的 JSON 文档文件（字段注释等），并刷新 `ClassInstance` 使用的 Mindustry 静态内容实例缓存。必须先调用此接口才能使用其他需要文档或静态实例缓存的功能。

#### 请求

```json
{
    "wsType": "Init",
    "content": "{\"Data_Dir\":\"mindustry_docs\"}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Data_Dir` | string | 数据子目录名或数据根目录内路径；当前实现中不能为空 |

#### 响应

```json
{
    "wsType": "Init",
    "out": true,
    "dataList": {
        "Success": { "boolean": true },
        "Doc_Count": { "int": 42 },
        "Message": { "str": "Initialized from /path/to/docs" }
    }
}
```

---

### 2. 获取所有类 `AllClass`

返回运行时 `classMap` 中的游戏类名列表；运行时类表不可用时回退到已加载文档中的类型名。

支持可选的 `Parent_Class` 参数，传入后只返回该父类的子类（含父类自身）。

#### 请求（获取全部类）

```json
{ "wsType": "AllClass" }
```

#### 请求（过滤父类）

```json
{
    "wsType": "AllClass",
    "content": "{\"Parent_Class\":\"Block\"}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Parent_Class` | string（可选） | 父类名（简单名或全限定名）；不传时返回全部类 |

#### 响应

```json
{
    "wsType": "AllClass",
    "out": true,
    "dataList": {
        "Class_List": {
            "list": [
                { "str": "Block" },
                { "str": "UnitType" },
                ...
            ]
        }
    }
}
```

---

### 3. 获取类的字段列表 `AllField`

字段列表优先来自运行时 `classMap` 解析到的真实类反射字段；运行时类不可用时回退到已加载文档字段。

#### 请求

```json
{
    "wsType": "AllField",
    "content": "{\"Class_Name\":\"Block\"}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Class_Name` | string | 类名（例如 `Block`） |

#### 响应

```json
{
    "wsType": "AllField",
    "out": true,
    "dataList": {
        "Field_List": {
            "list": [
                { "str": "health", "json": "float" },
                { "str": "requirements", "json": "mindustry.type.ItemStack[]" },
                ...
            ]
        }
    }
}
```

每个元素的 `str` 是字段名，`json` 是字段的类型名（运行时反射字段使用 `canonicalName`，文档字段使用文档中记录的类型字符串）。

---

### 4. 创建可编辑类型实例 `NewClass`

创建一个新的可编辑类型实例。类名会优先从手动注册类和 Mindustry `ClassMap` 中解析。

#### 请求

```json
{
    "wsType": "NewClass",
    "content": "{\"Class_Name\":\"Block\"}"
}
```

#### 响应

```json
{
    "wsType": "NewClass",
    "out": true,
    "dataList": {
        "Class_Id": { "int": 1 }
    }
}
```

之后使用该 `Class_Id` 进行读写操作。注意这里传入的是实际类型名 `Block`，不是静态内容容器 `Blocks`。

---

### 5. 读取字段值 `GetFieldValue`

#### 请求

```json
{
    "wsType": "GetFieldValue",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"health\"]}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Class_Id` | int | 实例 ID |
| `Field_Path` | string[] | 路径数组 |

#### 响应（成功）

```json
{
    "wsType": "GetFieldValue",
    "out": true,
    "dataList": {
        "Success": { "boolean": true },
        "Value": { "str": "\"health\":120" },
        "Message": { "str": "" }
    }
}
```

> 对普通字段，`Value` 返回 `FieldBuild.toJson()` 生成的字段片段，例如 `"health":120`。如果路径指向数组元素，返回该元素的 JSON 字符串。

---

### 6. 设置字段值 `SetFieldValue`

支持两种方式设置字段值：传字符串或引用已有 `ClassBuild` 实例（通过 `Value_Class_Id`）。

#### 请求（字符串值）

```json
{
    "wsType": "SetFieldValue",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"health\"],\"Value\":\"250\"}"
}
```

#### 请求（引用 ClassBuild 实例）

```json
{
    "wsType": "SetFieldValue",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"bullet\"],\"Value_Class_Id\":2}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Class_Id` | int | 目标实例 ID |
| `Field_Path` | string[] | 路径数组 |
| `Value` | string（可选） | 新值字符串；导出时根据目标字段类型转换为 JSON 值；提供 `Value_Class_Id` 时可省略 |
| `Value_Class_Id` | int（可选） | 要赋值的 ClassBuild 实例 ID；优先于 `Value`，适用于字段类型为复杂对象的场景；不提供时使用 `Value` |

#### 响应

```json
{
    "wsType": "SetFieldValue",
    "out": true,
    "dataList": {
        "Success": { "boolean": true },
        "Value": { "str": "\"health\":250" },
        "Message": { "str": "" }
    }
}
```

---

### 7. 添加数组元素 `AddElement`

向数组/列表字段追加元素（支持 `Array`, `Seq<T>`, `List<T>`）。

#### 请求

```json
{
    "wsType": "AddElement",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"requirements\"],\"Element_Type\":\"ItemStack\",\"Value\":\"\"}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Element_Type` | string | 元素类型类名；留空时尝试从字段的数组或泛型类型推断 |
| `Value` | string | 元素叶子值；对象元素通常留空，再通过 `#索引` 路径设置子字段 |

#### 响应

```json
{
    "wsType": "AddElement",
    "out": true,
    "dataList": {
        "Success": { "boolean": true },
        "Index": { "int": 0 },
        "Message": { "str": "" }
    }
}
```

新添加的元素索引在 `Index` 字段返回。对象型元素通常按两步写入：先 `AddElement` 得到 `Index=0`，再调用 `SetFieldValue` 写 `["requirements", "#0", "amount"]` 等子字段。

---

### 8. 删除数组元素 `RemoveElement`

从数组/列表字段中删除指定下标的元素，下标从 0 开始。删除后，后续元素的下标自动前移。

#### 请求

```json
{
    "wsType": "RemoveElement",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"requirements\"],\"Index\":0}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Class_Id` | int | 实例 ID |
| `Field_Path` | string[] | 指向数组字段的路径（与 `AddElement` 一致，不含 `#索引` 后缀） |
| `Index` | int | 要删除的元素下标（非负整数） |

#### 响应

```json
{
    "wsType": "RemoveElement",
    "out": true,
    "dataList": {
        "Success": { "boolean": true },
        "Message": { "str": "" }
    }
}
```

失败时（例如下标越界、路径不指向数组字段）`Success` 为 `false`，`Message` 包含错误信息。

---

### 9. 导出实例 `ExportClass`

获取整个类实例的完整 JSON 表示。

#### 请求

```json
{
    "wsType": "ExportClass",
    "content": "{\"Class_Id\":1}"
}
```

#### 响应

```json
{
    "wsType": "ExportClass",
    "out": true,
    "dataList": {
        "Success": { "boolean": true },
        "Content": { "str": "{\"type\":\"Block\",\"health\":250}" },
        "Message": { "str": "" }
    }
}
```

---

### 10. 删除实例 `RemoveClass`

#### 请求

```json
{
    "wsType": "RemoveClass",
    "content": "{\"Class_Id\":1}"
}
```

#### 响应

```json
{
    "wsType": "RemoveClass",
    "out": true,
    "dataList": {
        "Success": { "boolean": true }
    }
}
```

---

### 11. 获取字段文档 `FieldDoc`

#### 请求

```json
{
    "wsType": "FieldDoc",
    "content": "{\"Class_Name\":\"Block\",\"Field_Name\":\"health\"}"
}
```

#### 响应

```json
{
    "wsType": "FieldDoc",
    "out": true,
    "dataList": {
        "Field_Doc": { "str": "Field documentation loaded from local docs." }
    }
}
```

---

### 12. 获取字段默认值 `FieldDefaultValue`

#### 请求

```json
{
    "wsType": "FieldDefaultValue",
    "content": "{\"Class_Name\":\"Block\",\"Field_Name\":\"health\"}"
}
```

#### 响应

```json
{
    "wsType": "FieldDefaultValue",
    "out": true,
    "dataList": {
        "Default_Value": { "str": "0" }
    }
}
```

默认值来自已加载文档或运行时类型推断；查不到时通常返回 `"null"`。

---

### 13. 获取预定义实例列表 `ClassInstance`

返回指定类型可赋值的 Mindustry 静态内容实例名。当前实现会从 `Blocks`、`Items`、`Liquids`、`UnitTypes`、`Planets` 等静态内容容器中收集字段值，再用 `targetClass.isAssignableFrom(instanceClass)` 过滤。

#### 请求

```json
{
    "wsType": "ClassInstance",
    "content": "{\"Class_Name\":\"Block\"}"
}
```

#### 响应

```json
{
    "wsType": "ClassInstance",
    "out": true,
    "dataList": {
        "Object_List": {
            "list": [
                { "str": "Blocks.copperWall" },
                { "str": "Blocks.coreShard" },
                ...
            ]
        }
    }
}
```

---

### 14. 抓取文档 `FetchDoc`

从 Mindustry Wiki 的 Modding 文档抓取类型字段表，序列化为 `TypeMeta` JSON，并保存到 `Data_Dir/doc/` 子目录。文件名会经过安全过滤，只保留字母、数字、下划线、点和短横线。

#### 请求

```json
{
    "wsType": "FetchDoc",
    "content": "{\"Data_Dir\":\"mindustry_docs\"}"
}
```

#### 响应

```json
{
    "wsType": "FetchDoc",
    "out": true,
    "dataList": {
        "Success": { "boolean": true },
        "Doc_Count": { "int": 156 },
        "Message": { "str": "Fetched 156 types to /path/to/docs" }
    }
}
```

---

## 完整使用流程示例

以下示例使用伪代码演示如何创建一个 `Block` 类型实例、修改其字段并导出。

```javascript
const ws = new WebSocket('ws://127.0.0.1:19190');
let classId;

ws.onopen = () => {
    // 1. 初始化文档目录
    ws.send(JSON.stringify({
        wsType: 'Init',
        content: JSON.stringify({ Data_Dir: 'mindustry_docs' })
    }));
};

ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.wsType) {
        case 'Init':
            if (msg.dataList.Success.boolean) {
                // 2. 创建 Block 类型实例
                ws.send(JSON.stringify({
                    wsType: 'NewClass',
                    content: JSON.stringify({ Class_Name: 'Block' })
                }));
            }
            break;
        case 'NewClass':
            classId = msg.dataList.Class_Id.int;
            // 3. 设置字段值
            ws.send(JSON.stringify({
                wsType: 'SetFieldValue',
                content: JSON.stringify({
                    Class_Id: classId,
                    Field_Path: ['health'],
                    Value: '500'
                })
            }));
            break;
        case 'SetFieldValue':
            // 4. 导出结果
            ws.send(JSON.stringify({
                wsType: 'ExportClass',
                content: JSON.stringify({ Class_Id: classId })
            }));
            break;
        case 'ExportClass':
            const exported = JSON.parse(msg.dataList.Content.str);
            console.log('最终数据:', exported);
            ws.close();
            break;
        case 'Error':
            console.error('错误:', msg.dataList.Message.str);
            break;
    }
};
```

---

## 安全注意事项

1. **默认认证**：若未设置系统属性 `mindustrymit.wsToken`，服务器接受任何客户端连接。生产环境务必设置 Token。

2. **Token 使用**：每条消息需在顶层或 `content` 对象中包含 `Token` 字段，例如：
   ```json
   {
       "wsType": "SetFieldValue",
       "Token": "mySecretToken",
       "content": "..."
   }
   ```

3. **域白名单**：可通过修改代码中的 `allowedOrigins` 限制 WebSocket 握手时的 Origin 头。

4. **路径遍历防护**：`Data_Dir` 参数会被限制在数据根目录内，但建议不要使用用户可控的绝对路径。

5. **反射范围**：`NewClass` 只从 `registeredClasses` 和 Mindustry `ClassMap` 解析类名，不会通过任意字符串动态加载外部类。`ClassInstance` 只返回内置静态内容容器中已经存在的实例名。

---

## 常见问题

**Q: 启动时端口被占用怎么办？**
A: 修改 `JsonApiWebSocketHandler` 构造函数的 `port` 参数（默认 19190）。

**Q: 文档目录没有内容怎么办？**
A: 调用 `Init` 时会优先使用 `Data_Dir/doc` 下已有 JSON；没有文档时会尝试解压打包在资源里的 `doc.zip` / `docs.zip` / `mindustry-doc.zip`。如果资源包也没有，再调用 `FetchDoc` 从 Mindustry Wiki 抓取。

**Q: 数组下标 `#-1` 是否支持？**
A: 不支持。只支持非负整数索引。

**Q: `Value` 需要写成 JSON 字符串吗？**
A: 当前 API 接收的是字符串，导出时会根据目标字段类型转换。例如整数字段传 `"10"`，布尔字段传 `"true"`，字符串字段会按普通字符串导出。

**Q: 多个客户端同时操作同一 Class_Id 会冲突吗？**
A: 当前实现未加锁，并发写可能导致数据损坏。建议每个客户端使用独立的 Class_Id 或通过应用层加锁。

---

## 附录：静态实例缓存来源

`Init` 和 `ClassInstance` 会从以下 Mindustry 静态内容容器收集字段值，缓存名形如 `Blocks.copperWall`：

- `mindustry.content.Blocks`
- `mindustry.content.UnitTypes`
- `mindustry.content.Fx`
- `mindustry.content.Bullets`
- `mindustry.content.Items`
- `mindustry.content.Liquids`
- `mindustry.content.Loadouts`
- `mindustry.content.Planets`
- `mindustry.content.SectorPresets`
- `mindustry.content.StatusEffects`
- `mindustry.content.Weathers`

如需扩展更多静态内容来源，需修改 `ToolData.initializeClassInstances()` 方法。这个列表只影响 `ClassInstance` 的实例名查询，不等同于 `NewClass` 的可创建类型列表。

---

## 许可证

本文档对应代码为项目内部使用，无特殊许可证说明。使用前请确保遵守 Mindustry 相关许可。
