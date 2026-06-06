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
import java.util.concurrent.LinkedBlockingQueue
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
        val classBuildMap: MutableMap<Int, ClassBuild> = mutableMapOf()
        private val registeredClasses: MutableMap<String, Class<*>> = mutableMapOf()
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

        fun registerClass(className: String, clazz: Class<*>) {
            registeredClasses[className] = clazz
        }

        fun newClass(className: String): Int {
            val id = nextId++
            val tool = Tool(ApiJsonEditorTool(parser))
            classDataMap[id] = tool
            classBuildMap[id] = ClassBuild(resolveClass(className), parser)
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
            classBuildMap.remove(classId)
            return classDataMap.remove(classId) != null
        }

        private fun resolveClass(className: String): Class<*> {
            return registeredClasses[className]
                ?: parser.classMap?.get(className)
                ?: parser.classMap?.find { it.key == className }?.value
                ?: fail("类 $className 不存在，请先初始化或检查类名")
        }

        private fun getClassBuild(classId: Int): ClassBuild {
            return classBuildMap[classId] ?: fail("类实例 $classId 不存在")
        }

        private fun parsePath(data: WebSocketData): List<String> {
            return data.dataList["Field_Path"]?.list?.map { it.str }.orEmpty()
        }

        private fun isIndexSegment(segment: String): Boolean {
            return segment.startsWith("#") && segment.drop(1).toIntOrNull() != null
        }

        private fun segmentIndex(segment: String): Int {
            return segment.drop(1).toInt()
        }

        private fun getOrCreateFieldBuild(classBuild: ClassBuild, fieldName: String): FieldBuild {
            classBuild.getFieldBuildByName(fieldName)?.let { return it }
            val field = classBuild.getFieldByName(fieldName) ?: fail("字段 $fieldName 不存在于 ${classBuild.name}")
            return FieldBuild(field, parser).also { classBuild.addFieldBuild { it } }
        }

        private fun resolveParentField(classId: Int, path: List<String>, createMissing: Boolean = true): FieldBuild {
            if (path.isEmpty()) fail("Field_Path 不能为空")

            var current = getClassBuild(classId)
            var currentField: FieldBuild? = null

            path.forEachIndexed { index, segment ->
                val isLast = index == path.lastIndex
                if (isIndexSegment(segment)) {
                    val field = currentField ?: fail("数组下标 $segment 前面必须是数组字段")
                    val elements = field.value.elements ?: fail("字段 ${field.field.name} 不是数组字段")
                    val elementIndex = segmentIndex(segment)
                    if (elementIndex !in elements.indices) {
                        fail("数组下标 $elementIndex 越界，字段 ${field.field.name} 当前长度 ${elements.size}")
                    }
                    current = elements[elementIndex]
                    currentField = null
                } else {
                    val field = if (createMissing) {
                        getOrCreateFieldBuild(current, segment)
                    } else {
                        current.getFieldBuildByName(segment) ?: fail("字段 $segment 尚未创建")
                    }

                    if (isLast) return field

                    currentField = field
                    if (!isIndexSegment(path[index + 1])) {
                        current = field.value.typeValue
                        currentField = null
                    }
                }
            }

            fail("无法解析 Field_Path: $path")
        }

        private fun setFieldValue(classId: Int, path: List<String>, value: String): String {
            val field = resolveParentField(classId, path)
            field.value.value = value
            field.value.elements = null
            return field.value.toJson()
        }

        private fun getFieldValue(classId: Int, path: List<String>): String {
            val field = resolveParentField(classId, path, createMissing = false)
            return field.value.toJson()
        }

        private fun addElement(classId: Int, path: List<String>, elementTypeName: String, value: String): Int {
            val field = resolveParentField(classId, path)
            val elements = field.value.elements ?: mutableListOf<ClassBuild>().also { field.value.elements = it }
            val elementClass = if (elementTypeName.isNotBlank()) {
                resolveClass(elementTypeName)
            } else {
                field.value.typeValue.classData
            }

            val element = ClassBuild(elementClass, parser)
            if (value.isNotEmpty()) element.value = value
            elements.add(element)
            field.value.value = ""
            return elements.lastIndex
        }

        private fun exportClass(classId: Int): String {
            return getClassBuild(classId).toJson()
        }

        private fun fail(message: String): Nothing {
            throw IllegalArgumentException(message)
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

                WebSocketDataType.GetFieldValue -> {
                    val reply = try {
                        val classId = data.dataList["Class_Id"]?.int ?: fail("Class_Id 不能为空")
                        val value = getFieldValue(classId, parsePath(data))
                        WebSocketData.reply(
                            WebSocketDataType.GetFieldValue,
                            mapOf(
                                "Success" to Data(boolean = true),
                                "Value" to Data(str = value),
                                "Message" to Data()
                            )
                        )
                    } catch (e: Exception) {
                        WebSocketData.reply(
                            WebSocketDataType.GetFieldValue,
                            mapOf(
                                "Success" to Data(boolean = false),
                                "Value" to Data(),
                                "Message" to Data(str = e.message ?: e::class.java.name)
                            )
                        )
                    }
                    jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                }

                WebSocketDataType.SetFieldValue -> {
                    val reply = try {
                        val classId = data.dataList["Class_Id"]?.int ?: fail("Class_Id 不能为空")
                        val value = data.dataList["Value"]?.str ?: ""
                        val jsonValue = setFieldValue(classId, parsePath(data), value)
                        WebSocketData.reply(
                            WebSocketDataType.SetFieldValue,
                            mapOf(
                                "Success" to Data(boolean = true),
                                "Value" to Data(str = jsonValue),
                                "Message" to Data()
                            )
                        )
                    } catch (e: Exception) {
                        WebSocketData.reply(
                            WebSocketDataType.SetFieldValue,
                            mapOf(
                                "Success" to Data(boolean = false),
                                "Value" to Data(),
                                "Message" to Data(str = e.message ?: e::class.java.name)
                            )
                        )
                    }
                    jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                }

                WebSocketDataType.AddElement -> {
                    val reply = try {
                        val classId = data.dataList["Class_Id"]?.int ?: fail("Class_Id 不能为空")
                        val elementType = data.dataList["Element_Type"]?.str ?: ""
                        val value = data.dataList["Value"]?.str ?: ""
                        val index = addElement(classId, parsePath(data), elementType, value)
                        WebSocketData.reply(
                            WebSocketDataType.AddElement,
                            mapOf(
                                "Success" to Data(boolean = true),
                                "Index" to Data(int = index),
                                "Message" to Data()
                            )
                        )
                    } catch (e: Exception) {
                        WebSocketData.reply(
                            WebSocketDataType.AddElement,
                            mapOf(
                                "Success" to Data(boolean = false),
                                "Index" to Data(int = -1),
                                "Message" to Data(str = e.message ?: e::class.java.name)
                            )
                        )
                    }
                    jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                }

                WebSocketDataType.ExportClass -> {
                    val reply = try {
                        val classId = data.dataList["Class_Id"]?.int ?: fail("Class_Id 不能为空")
                        WebSocketData.reply(
                            WebSocketDataType.ExportClass,
                            mapOf(
                                "Success" to Data(boolean = true),
                                "Content" to Data(str = exportClass(classId)),
                                "Message" to Data()
                            )
                        )
                    } catch (e: Exception) {
                        WebSocketData.reply(
                            WebSocketDataType.ExportClass,
                            mapOf(
                                "Success" to Data(boolean = false),
                                "Content" to Data(),
                                "Message" to Data(str = e.message ?: e::class.java.name)
                            )
                        )
                    }
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
    GetFieldValue(
        listOf(
            "Class_Id" to DataType.Int,
            "Field_Path" to DataType.List
        ),
        listOf(
            "Success" to DataType.Boolean,
            "Value" to DataType.String,
            "Message" to DataType.String
        )
    ),
    SetFieldValue(
        listOf(
            "Class_Id" to DataType.Int,
            "Field_Path" to DataType.List,
            "Value" to DataType.String
        ),
        listOf(
            "Success" to DataType.Boolean,
            "Value" to DataType.String,
            "Message" to DataType.String
        )
    ),
    AddElement(
        listOf(
            "Class_Id" to DataType.Int,
            "Field_Path" to DataType.List,
            "Element_Type" to DataType.String,
            "Value" to DataType.String
        ),
        listOf(
            "Success" to DataType.Boolean,
            "Index" to DataType.Int,
            "Message" to DataType.String
        )
    ),
    ExportClass(
        listOf("Class_Id" to DataType.Int),
        listOf(
            "Success" to DataType.Boolean,
            "Content" to DataType.String,
            "Message" to DataType.String
        )
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


fun main(args: Array<String>) {
    val dataDir = "C:\\Users\\Administrator\\Downloads\\test"
        ?: System.getProperty("mindustrymit.dataDir")
        ?: error("请传入真实数据目录，或设置 -Dmindustrymit.dataDir=<path>")
    val port = args.getOrNull(1)?.toIntOrNull() ?: 19190
    val preferredClassName = args.getOrNull(2)
    val instancePath = args.getOrNull(3)?.split(",")?.filter { it.isNotBlank() }.orEmpty()
    val instanceValue = args.getOrNull(4) ?: "test-value"

    val toolData = JsonApi.ToolData().apply {
        error = { println("[ERROR] $it") }
        info = { println("[INFO] $it") }
        warning = { println("[WARN] $it") }
        debug = { println("[DEBUG] $it") }
    }
    val handler = JsonApi.ToolData.JsonApiWebSocketHandler(toolData, port)
    val replies = LinkedBlockingQueue<String>()

    fun assertTrue(name: String, value: Boolean) {
        if (!value) throw IllegalStateException("测试失败: $name")
        println("PASS: $name")
    }

    fun jsonString(value: String): String {
        return buildString {
            append('"')
            value.forEach { ch ->
                when (ch) {
                    '\\' -> append("\\\\")
                    '"' -> append("\\\"")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> append(ch)
                }
            }
            append('"')
        }
    }

    fun pathJson(path: List<String>): String {
        return path.joinToString(prefix = "[", postfix = "]") { jsonString(it) }
    }

    fun encode(type: WebSocketDataType, content: String = ""): String {
        return jsonFormat.encodeToString(WebSocketData.serializer(), WebSocketData(type, content = content))
    }

    fun listOfData(reply: WebSocketData, key: String): List<String> {
        return reply.dataList[key]?.list?.map { it.str }.orEmpty()
    }

    val client = object : WebSocketClient(URI("ws://localhost:$port")) {
        override fun onOpen(handshakedata: ServerHandshake?) {
            println("[CLIENT] connected")
        }

        override fun onMessage(message: String) {
            if (!message.startsWith("Echo: ")) replies.offer(message)
        }

        override fun onClose(code: Int, reason: String?, remote: Boolean) {
            println("[CLIENT] closed: code=$code, reason=$reason, remote=$remote")
        }

        override fun onError(ex: Exception) {
            println("[CLIENT ERROR] ${ex.message}")
        }
    }

    fun request(type: WebSocketDataType, content: String = ""): WebSocketData {
        replies.clear()
        client.send(encode(type, content))
        val response = replies.poll(5, TimeUnit.SECONDS)
            ?: throw IllegalStateException("等待 $type 回复超时")
        return jsonFormat.decodeFromString(WebSocketData.serializer(), response)
    }

    fun hasRuntimeClass(className: String): Boolean {
        return try {
            toolData.parser.classMap?.get(className) != null ||
                toolData.parser.classMap?.find { it.key == className }?.value != null
        } catch (_: Throwable) {
            false
        }
    }

    handler.start()
    try {
        assertTrue("WebSocket 客户端连接成功", client.connectBlocking(5, TimeUnit.SECONDS))

        val initReply = request(
            WebSocketDataType.Init,
            """{"Data_Dir":${jsonString(File(dataDir).absolutePath)}}"""
        )
        assertTrue("Init 成功", initReply.dataList["Success"]?.boolean == true)
        println("Init message: ${initReply.dataList["Message"]?.str}")

        val allClassReply = request(WebSocketDataType.AllClass)
        val classNames = listOfData(allClassReply, "Class_List")
        assertTrue("AllClass 返回非空列表", classNames.isNotEmpty())

        var selectedClass = preferredClassName?.takeIf { it in classNames }
        var selectedFields = emptyList<String>()
        val candidates = if (selectedClass != null) listOf(selectedClass!!) else classNames
        for (candidate in candidates) {
            val fieldsReply = request(WebSocketDataType.AllField, """{"Class_Name":${jsonString(candidate)}}""")
            val fields = listOfData(fieldsReply, "Field_List")
            if (fields.isNotEmpty()) {
                selectedClass = candidate
                selectedFields = fields
                break
            }
        }
        assertTrue("AllField 返回非空字段列表", selectedClass != null && selectedFields.isNotEmpty())

        val fieldName = selectedFields.first()
        println("Selected class: $selectedClass")
        println("Selected field: $fieldName")

        val fieldDocReply = request(
            WebSocketDataType.FieldDoc,
            """{"Class_Name":${jsonString(selectedClass!!)},"Field_Name":${jsonString(fieldName)}}"""
        )
        assertTrue("FieldDoc 有回复", fieldDocReply.dataList.containsKey("Field_Doc"))

        val defaultReply = request(
            WebSocketDataType.FieldDefaultValue,
            """{"Class_Name":${jsonString(selectedClass!!)},"Field_Name":${jsonString(fieldName)}}"""
        )
        assertTrue("FieldDefaultValue 有回复", defaultReply.dataList.containsKey("Default_Value"))

        if (instancePath.isNotEmpty() && hasRuntimeClass(selectedClass!!)) {
            val newClassReply = request(
                WebSocketDataType.NewClass,
                """{"Class_Name":${jsonString(selectedClass!!)}}"""
            )
            val classId = newClassReply.dataList["Class_Id"]?.int ?: -1
            assertTrue("NewClass 返回有效 Class_Id", classId >= 0)

            val setReply = request(
                WebSocketDataType.SetFieldValue,
                """
                    {
                        "Class_Id": $classId,
                        "Field_Path": ${pathJson(instancePath)},
                        "Value": ${jsonString(instanceValue)}
                    }
                """.trimIndent()
            )
            assertTrue("SetFieldValue 成功", setReply.dataList["Success"]?.boolean == true)

            val getReply = request(
                WebSocketDataType.GetFieldValue,
                """
                    {
                        "Class_Id": $classId,
                        "Field_Path": ${pathJson(instancePath)}
                    }
                """.trimIndent()
            )
            assertTrue("GetFieldValue 成功", getReply.dataList["Success"]?.boolean == true)

            val exportReply = request(WebSocketDataType.ExportClass, """{"Class_Id":$classId}""")
            assertTrue("ExportClass 成功", exportReply.dataList["Success"]?.boolean == true)
        } else {
            println("跳过实例/深层修改测试：未提供 Field_Path，或当前运行时没有真实 Mindustry/Arc 类映射。")
            println("需要测试实例修改时，请用参数：<dataDir> <port> <className> <field,path,#0,...> <value>")
        }

        println("WebSocket 完整数据加载与元数据接口测试通过")
    } finally {
        if (client.isOpen) client.closeBlocking()
        handler.stop()
    }
}
