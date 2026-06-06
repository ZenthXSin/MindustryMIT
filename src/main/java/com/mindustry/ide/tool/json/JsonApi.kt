package com.mindustry.ide.tool.json

import com.mindustry.ide.tool.json.JsonParser.Companion.jsonFormat
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.java_websocket.WebSocket
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.handshake.ServerHandshake
import org.java_websocket.server.WebSocketServer
import java.io.File
import java.net.InetSocketAddress
import java.net.URI
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream


/**
 * 将JsonEditorTool封装成可调用的api
 * @author ZenXSin
 **/
class JsonApi {

    val toolManagers = mutableMapOf<String, Pair<JsonEditorTool, Tool>>()

    class Tool(val jet: JsonEditorTool) {

    }

    class ToolData(val parser: JsonParser = JsonParser()) {
        val classDataMap: MutableMap<Int, Tool> = mutableMapOf()
        private var nextId: Int = 0

        var error: (String) -> Unit = {}
        var info: (String) -> Unit = {}
        var warning: (String) -> Unit = {}
        var debug: (String) -> Unit = {}

        private data class InitResult(val success: Boolean, val docCount: Int, val message: String)

        private fun initBackend(dataDirPath: String): InitResult {
            if (dataDirPath.isBlank()) {
                return InitResult(false, 0, "Data_Dir is empty")
            }

            return try {
                val dataDir = File(dataDirPath).absoluteFile
                val docDir = File(dataDir, "doc")
                val markerFile = File(dataDir, ".mindustrymit-initialized")

                dataDir.mkdirs()

                if (!hasDocFiles(docDir)) {
                    docDir.mkdirs()
                    if (!extractBundledDocs(docDir) && !hasDocFiles(docDir)) {
                        return InitResult(
                            false, 0, "No bundled doc zip found and no doc files exist in ${docDir.absolutePath}"
                        )
                    }
                }

                val docCount = parser.loadDocs(docDir)
                if (docCount <= 0) {
                    return InitResult(false, 0, "No doc files loaded from ${docDir.absolutePath}")
                }

                markerFile.writeText("docDir=${docDir.absolutePath}\ndocCount=$docCount\n", Charsets.UTF_8)
                InitResult(true, docCount, "Initialized from ${docDir.absolutePath}")
            } catch (e: Exception) {
                InitResult(false, 0, e.message ?: e::class.java.name)
            }
        }

        private fun hasDocFiles(docDir: File): Boolean {
            return docDir.exists() && docDir.walkTopDown()
                .any { it.isFile && it.extension.equals("json", ignoreCase = true) }
        }

        private fun extractBundledDocs(docDir: File): Boolean {
            val resourceNames = listOf("doc.zip", "docs.zip", "mindustry-doc.zip")
            val bundledDoc = resourceNames.firstNotNullOfOrNull { resourceName ->
                val input = Thread.currentThread().contextClassLoader?.getResourceAsStream(resourceName)
                    ?: JsonApi::class.java.classLoader?.getResourceAsStream(resourceName)
                input?.let { resourceName to it }
            } ?: return false

            bundledDoc.second.use { input ->
                ZipInputStream(input).use { zip ->
                    val root = docDir.canonicalFile
                    var entry = zip.nextEntry
                    while (entry != null) {
                        val target = File(docDir, entry.name).canonicalFile
                        if (target != root && !target.path.startsWith(root.path + File.separator)) {
                            throw IllegalArgumentException("Illegal zip entry: ${entry.name}")
                        }

                        if (entry.isDirectory) {
                            target.mkdirs()
                        } else {
                            target.parentFile?.mkdirs()
                            target.outputStream().use { output -> zip.copyTo(output) }
                        }

                        zip.closeEntry()
                        entry = zip.nextEntry
                    }
                }
            }

            debug("Extracted bundled docs: ${bundledDoc.first} -> ${docDir.absolutePath}")
            return true
        }

        fun newClass(className: String): Int {
            val id = nextId++
            val tool = Tool(ApiJsonEditorTool(parser))
            classDataMap[id] = tool
            debug("----------")
            debug("创建类: $className, ID: $id")
            debug("----------")
            return id
        }

        fun removeClass(classId: Int): Boolean {
            debug("----------")
            if (classDataMap.containsKey(classId)) {
                debug("类 $classId 存在")
            } else {
                debug("类 $classId 不存在")
            }
            debug("删除类: $classId")
            debug("----------")
            return classDataMap.remove(classId) != null
        }

        fun contentParsing(message: String): String {
            val data = jsonFormat.decodeFromString(WebSocketData.serializer(), message)
            return when (data.wsType) {
                WebSocketDataType.Init -> {
                    val dataDir = data.dataList["Data_Dir"]?.str ?: ""
                    val result = initBackend(dataDir)
                    val reply = WebSocketData.reply(
                        WebSocketDataType.Init, mapOf(
                            "Success" to Data(boolean = result.success),
                            "Doc_Count" to Data(int = result.docCount),
                            "Message" to Data(str = result.message)
                        )
                    )
                    jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                }

                WebSocketDataType.AllClass -> {
                    val classList = parser.getAllClasses()
                    val reply = WebSocketData.reply(
                        WebSocketDataType.AllClass,
                        mapOf("Class_List" to Data(list = classList.map { Data(str = it) }.toMutableList()))
                    )
                    jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                }

                WebSocketDataType.AllField -> {
                    val className = data.dataList["Class_Name"]?.str ?: ""
                    val fields = parser.getAllFields(className).map { it.name }
                    val reply = WebSocketData.reply(
                        WebSocketDataType.AllField,
                        mapOf("Field_List" to Data(list = fields.map { Data(str = it) }.toMutableList()))
                    )
                    jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                }

                WebSocketDataType.FieldDoc -> {
                    val className = data.dataList["Class_Name"]?.str ?: ""
                    val fieldName = data.dataList["Field_Name"]?.str ?: ""
                    val fieldDoc = parser.getFieldDoc(className, fieldName)
                    val reply = WebSocketData.reply(
                        WebSocketDataType.FieldDoc,
                        mapOf("Field_Doc" to Data(str = fieldDoc))
                    )
                    jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                }

                WebSocketDataType.FieldDefaultValue -> {
                    val className = data.dataList["Class_Name"]?.str ?: ""
                    val fieldName = data.dataList["Field_Name"]?.str ?: ""
                    val defaultValue = parser.getFieldDefaultValue(className, fieldName)
                    val reply = WebSocketData.reply(
                        WebSocketDataType.FieldDefaultValue,
                        mapOf("Default_Value" to Data(str = defaultValue))
                    )
                    jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                }

                WebSocketDataType.NewClass -> {
                    val className = data.dataList["Class_Name"]?.str ?: ""
                    val classId = newClass(className)

                    jsonFormat.encodeToString(
                        WebSocketData.serializer(), WebSocketData.reply(
                            WebSocketDataType.NewClass, mapOf("Class_Id" to Data(int = classId))
                        )
                    )
                }

                WebSocketDataType.RemoveClass -> {
                    val classId = data.dataList["Class_Id"]?.int
                    val success = classId != null && removeClass(classId)

                    jsonFormat.encodeToString(
                        WebSocketData.serializer(), WebSocketData.reply(
                            WebSocketDataType.RemoveClass, mapOf("Success" to Data(boolean = success))
                        )
                    )
                }
            }
        }

        inner class ApiJsonEditorTool(parser: JsonParser) : JsonEditorTool(parser) {
            override fun error(message: String) {
                this@ToolData.error(message)
            }

            override fun info(message: String) {
                this@ToolData.info(message)
            }

            override fun warning(message: String) {
                this@ToolData.warning(message)
            }

            override fun debug(message: String) {
                this@ToolData.debug(message)
            }
        }

        class JsonApiWebSocketHandler(val toolData: ToolData, val port: Int) {
            private var server: Server? = null

            fun start() {
                if (server != null) {
                    toolData.info("WebSocket 服务器已在运行")
                    return
                }
                server = Server(InetSocketAddress(port), this)
                server?.start()
                toolData.info("WebSocket 服务器启动在端口: $port")
            }

            fun stop() {
                server?.let {
                    try {
                        it.stop(1000)
                        toolData.info("WebSocket 服务器已停止")
                    } catch (e: Exception) {
                        toolData.error("停止服务器失败: ${e.message}")
                    } finally {
                        server = null
                    }
                }
            }

            fun broadcast(message: String) {
                server?.broadcast(message)
                toolData.debug("广播消息: $message")
            }

            class Server(address: InetSocketAddress, private val handler: JsonApiWebSocketHandler) :
                WebSocketServer(address) {
                override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
                    handler.toolData.info("客户端连接: ${conn.remoteSocketAddress}")
                }

                override fun onMessage(conn: WebSocket, message: String) {
                    handler.toolData.debug("收到消息: $message")
                    conn.send("Echo: $message")
                    handler.broadcast(handler.toolData.contentParsing(message))
                }

                override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
                    handler.toolData.info("客户端断开: ${conn.remoteSocketAddress}, 原因: $reason")
                }

                override fun onError(conn: WebSocket?, ex: Exception) {
                    handler.toolData.error("WebSocket 错误: ${ex.message}")
                }

                override fun onStart() {
                    handler.toolData.info("WebSocket 服务器已启动")
                }
            }
        }
    }
}

/**
 * 规范化的Api接口
 * @author ZenXSin
 * @param content 内容
 * @param wsType 内容类型
 * @param out 推送还是接收，默认为接收
 * @param dataList 自动将收/发消息进行序列化/反序列化操作
 **/

@Serializable
data class WebSocketData(
    var wsType: WebSocketDataType,
    var content: String = "",
    var out: Boolean = false,
    var dataList: MutableMap<String, Data> = mutableMapOf()
) {
    init {
        if (!out && wsType.input.isNotEmpty()) {
            val json = Json.parseToJsonElement(content)

            for (i in wsType.input) {
                val iData = Data()
                when (i.second) {
                    DataType.String -> {
                        iData.str = json.jsonObject[i.first]!!.jsonPrimitive.content
                    }

                    DataType.Int -> {
                        iData.int = json.jsonObject[i.first]!!.jsonPrimitive.content.toInt()
                    }

                    DataType.Float -> {
                        iData.float = json.jsonObject[i.first]!!.jsonPrimitive.content.toFloat()
                    }

                    DataType.List -> {
                        val jsonArray = json.jsonObject[i.first]!!.jsonArray
                        iData.list = jsonArray.map { Data(str = it.jsonPrimitive.content) }.toMutableList() //[x1,x2]
                    }

                    DataType.Boolean -> {
                        iData.boolean = json.jsonObject[i.first]!!.jsonPrimitive.content.toBoolean()
                    }

                    DataType.Object -> TODO()
                }
                dataList[i.first] = iData
            }
        }
        // out=true 时由调用方通过 reply() 工厂方法填充 dataList，不在 init 里自动处理
    }

    companion object {
        /** 构造回复消息，data 的 key 需与 wsType.output 中的字段名对应 */
        fun reply(wsType: WebSocketDataType, data: Map<String, Data> = emptyMap()): WebSocketData {
            return WebSocketData(wsType = wsType, out = true).also { it.dataList.putAll(data) }
        }
    }
}

/**
 * WebSocket推送消息的类型
 * @author ZenXSin
 * @param input 外部推送接收的内容
 * @param output 内部推送发送的内容
 **/
enum class WebSocketDataType(
    val input: List<Pair<String, DataType>> = listOf(), val output: List<Pair<String, DataType>> = listOf()
) {
    Init(
        listOf("Data_Dir" to DataType.String), listOf(
            "Success" to DataType.Boolean, "Doc_Count" to DataType.Int, "Message" to DataType.String
        )
    ),
    AllClass(output = listOf("Class_List" to DataType.List)), AllField(
        listOf("Class_Name" to DataType.String),
        listOf("Field_List" to DataType.List)
    ),
    FieldDoc(
        listOf(
            "Class_Name" to DataType.String,
            "Field_Name" to DataType.String
        ),
        listOf("Field_Doc" to DataType.String)
    ),
    FieldDefaultValue(
        listOf(
            "Class_Name" to DataType.String,
            "Field_Name" to DataType.String
        ),
        listOf("Default_Value" to DataType.String)
    ),
    NewClass(
        listOf("Class_Name" to DataType.String),
        listOf("Class_Id" to DataType.Int)
    ),
    RemoveClass(listOf("Class_Id" to DataType.Int), listOf("Success" to DataType.Boolean)),
}

enum class DataType {
    String, Int, Float, List, Boolean, Object
}

@Serializable
data class Data(
    var str: String = "",
    var int: Int = 0,
    var float: Float = 0f,
    var list: MutableList<Data> = mutableListOf(),
    var boolean: Boolean = false,
    var obj: Data? = null
)


//Test
fun main() {

}
