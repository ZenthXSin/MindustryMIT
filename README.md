# Mindustry MIT 工具后端 API 文档

## 概述

`JsonApi` 是一个基于 WebSocket 的后端服务，为 [Mindustry](https://mindustrygame.github.io/) 游戏的数据编辑提供反射式 JSON 操作能力。它允许客户端远程创建游戏数据类的实例、读取/修改字段值、管理数组元素，并支持文档自动抓取与字段注释查询。

**主要特性**：
- 通过 WebSocket 协议通信（默认端口 `19190`）
- 支持动态创建游戏数据类实例（如 `Blocks`, `UnitTypes` 等）
- 使用 JSON 路径表达式访问嵌套字段和数组元素
- 内置文档提取（`FetchDoc`）与字段文档查询
- 可选的 Token 认证与来源域校验

---

## 快速开始

### 1. 运行环境

- JDK 11 或更高版本
- Kotlin 1.9+ 运行时（项目已包含所需依赖）
- 依赖库：`kotlinx-serialization`, `java-websocket`, `Java HTTP Server`

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

其中 `Data` 结构：

```typescript
interface Data {
    str?: string;
    int?: number;
    float?: number;
    list?: Data[];
    boolean?: boolean;
    obj?: Data;
    json?: string;
}
```

### 消息类型 (`WebSocketDataType`)

| 类型 | 方向 | 说明 |
|------|------|------|
| `Init` | 客户端→服务器 | 初始化数据目录，加载文档 |
| `AllClass` | 客户端→服务器 | 获取所有已注册的类名列表 |
| `AllField` | 客户端→服务器 | 获取某个类的所有字段名 |
| `ClassInstance` | 客户端→服务器 | 获取指定类的预定义实例（如 Blocks.copper） |
| `FieldDoc` | 客户端→服务器 | 获取字段的文档注释 |
| `FieldDefaultValue` | 客户端→服务器 | 获取字段的默认值字符串 |
| `GetFieldValue` | 客户端→服务器 | 读取指定路径的字段值 |
| `SetFieldValue` | 客户端→服务器 | 设置指定路径的字段值 |
| `AddElement` | 客户端→服务器 | 向数组/列表字段添加元素 |
| `ExportClass` | 客户端→服务器 | 导出整个类实例的 JSON 表示 |
| `NewClass` | 客户端→服务器 | 创建新的类实例（返回 Class_Id） |
| `RemoveClass` | 客户端→服务器 | 删除已创建的类实例 |
| `FetchDoc` | 客户端→服务器 | 从 Mindustry 源码提取文档并保存 |
| `Error` | 服务器→客户端 | 错误响应 |

---

## 详细接口说明

### 通用约定

- **路径语法 (`Field_Path`)**  
  使用字符串数组表示嵌套字段路径。例如访问 `content.buildings[0].health`：  
  `["content", "buildings", "#0", "health"]`  
  其中 `#0` 表示数组索引 0。

- **Class_Id**  
  通过 `NewClass` 创建实例后获得，后续操作需携带该 ID。

- **响应中的 `Success` 字段**  
  表示操作是否成功，失败时 `Message` 字段包含错误信息。

---

### 1. 初始化 `Init`

加载指定目录下的 JSON 文档文件（字段注释等）。必须先调用此接口才能使用其他需要文档的功能。

#### 请求

```json
{
    "wsType": "Init",
    "content": "{\"Data_Dir\":\"mindustry_docs\"}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Data_Dir` | string | 文档子目录名（相对于数据根目录），留空则使用默认 |

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

#### 请求

```json
{ "wsType": "AllClass" }
```

#### 响应

```json
{
    "wsType": "AllClass",
    "out": true,
    "dataList": {
        "Class_List": {
            "list": [
                { "str": "Blocks" },
                { "str": "UnitTypes" },
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
    "content": "{\"Class_Name\":\"Blocks\"}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Class_Name` | string | 类名（例如 `Blocks`） |

#### 响应

```json
{
    "wsType": "AllField",
    "out": true,
    "dataList": {
        "Field_List": {
            "list": [
                { "str": "copperWall" },
                { "str": "coreShard" },
                ...
            ]
        }
    }
}
```

---

### 4. 创建类实例 `NewClass`

创建一个新的空实例（所有字段为默认值）。

#### 请求

```json
{
    "wsType": "NewClass",
    "content": "{\"Class_Name\":\"Blocks\"}"
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

之后使用该 `Class_Id` 进行读写操作。

---

### 5. 读取字段值 `GetFieldValue`

#### 请求

```json
{
    "wsType": "GetFieldValue",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"copperWall\",\"health\"]}"
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
        "Value": { "str": "{\"value\":120}" },
        "Message": { "str": "" }
    }
}
```

> `Value` 字段返回的是该字段值的 JSON 字符串表示（例如数字、对象或数组）。

---

### 6. 设置字段值 `SetFieldValue`

#### 请求

```json
{
    "wsType": "SetFieldValue",
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"copperWall\",\"health\"],\"Value\":\"250\"}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Value` | string | 新值的 JSON 字符串（数字、对象等） |

#### 响应

```json
{
    "wsType": "SetFieldValue",
    "out": true,
    "dataList": {
        "Success": { "boolean": true },
        "Value": { "str": "{\"value\":250}" },
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
    "content": "{\"Class_Id\":1,\"Field_Path\":[\"copperWall\",\"requirements\"],\"Element_Type\":\"ItemStack\",\"Value\":\"{\\\"item\\\":\\\"copper\\\",\\\"amount\\\":10}\"}"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `Element_Type` | string | 元素类型类名（如果字段为泛型集合，可省略让系统推断） |
| `Value` | string | 元素值的 JSON 字符串 |

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

新添加的元素索引在 `Index` 字段返回。

---

### 8. 导出实例 `ExportClass`

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
        "Content": { "str": "{\"copperWall\":{\"health\":250,...}, ...}" },
        "Message": { "str": "" }
    }
}
```

---

### 9. 删除实例 `RemoveClass`

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

### 10. 获取字段文档 `FieldDoc`

#### 请求

```json
{
    "wsType": "FieldDoc",
    "content": "{\"Class_Name\":\"Blocks\",\"Field_Name\":\"copperWall\"}"
}
```

#### 响应

```json
{
    "wsType": "FieldDoc",
    "out": true,
    "dataList": {
        "Field_Doc": { "str": "A basic defensive wall made of copper." }
    }
}
```

---

### 11. 获取预定义实例列表 `ClassInstance`

某些类（如 `Blocks`）包含预定义的静态实例，此接口返回可用的实例名称。

#### 请求

```json
{
    "wsType": "ClassInstance",
    "content": "{\"Class_Name\":\"Blocks\"}"
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

### 12. 抓取文档 `FetchDoc`

从 Mindustry 源码中提取类型文档并保存到 `doc/` 子目录。

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

以下示例使用伪代码演示如何创建一个 `Blocks` 实例、修改其字段并导出。

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
                // 2. 创建 Blocks 实例
                ws.send(JSON.stringify({
                    wsType: 'NewClass',
                    content: JSON.stringify({ Class_Name: 'Blocks' })
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
                    Field_Path: ['copperWall', 'health'],
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

5. **反射风险**：`NewClass` 只能创建预先注册的类（`Blocks`, `UnitTypes` 等白名单），不会加载任意外部类。

---

## 常见问题

**Q: 启动时端口被占用怎么办？**  
A: 修改 `JsonApiWebSocketHandler` 构造函数的 `port` 参数（默认 19190）。

**Q: 文档目录没有内容怎么办？**  
A: 首次使用需调用 `FetchDoc` 抓取文档，或手动将 `doc.zip` 解压到数据根目录下的 `doc/` 文件夹。

**Q: 数组下标 `#-1` 是否支持？**  
A: 不支持。只支持非负整数索引。

**Q: 能否直接修改 Java 基本类型包装类的字段？**  
A: 支持，但需注意 `Value` 必须是合法的 JSON 字面量（如 `"10"`、`"true"`）。

**Q: 多个客户端同时操作同一 Class_Id 会冲突吗？**  
A: 当前实现未加锁，并发写可能导致数据损坏。建议每个客户端使用独立的 Class_Id 或通过应用层加锁。

---

## 附录：支持的类白名单

以下静态类中的字段会被注册为可创建的实例：

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

如需扩展其他类，需修改 `ToolData.initializeClassInstances()` 方法。

---

## 许可证

本文档对应代码为项目内部使用，无特殊许可证说明。使用前请确保遵守 Mindustry 相关许可。
