package com.mindustry.ide.tool.json

import com.mindustry.ide.tool.json.JsonApi.ToolData.JsonApiWebSocketHandler
import com.mindustry.ide.tool.json.JsonParser.Companion.jsonFormat
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.DefaultSSLWebSocketServerFactory
import org.java_websocket.server.WebSocketServer
import mindustry.content.Blocks
import mindustry.content.Bullets
import mindustry.content.UnitTypes
import java.io.File
import java.io.FileInputStream
import java.net.InetSocketAddress
import java.lang.reflect.Modifier
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.zip.ZipInputStream
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import mindustry.content.Fx
import mindustry.content.Items
import mindustry.content.Liquids
import mindustry.content.Loadouts
import mindustry.content.Planets
import mindustry.content.SectorPresets
import mindustry.content.StatusEffects
import mindustry.content.Weathers
import mindustry.gen.Sounds
import mindustry.type.Category


/**
 * 将JsonEditorTool封装成可调用的api
 * @author ZenXSin
 **/
class JsonApi {

    val toolManagers = mutableMapOf<String, Pair<JsonEditorTool, Tool>>()

    val server = JsonApiWebSocketHandler()

    class Tool(val jet: JsonEditorTool) {

    }

    class ToolData(
        val parser: JsonParser = JsonParser(),
        dataRoot: File = File(System.getProperty("mindustrymit.dataRoot", ".mindustrymit-data")).absoluteFile
    ) {
        val classDataMap: MutableMap<Int, Tool> = ConcurrentHashMap()
        val classBuildMap: MutableMap<Int, ClassBuild> = ConcurrentHashMap()
        var classInstance: MutableMap<String, Any> = ConcurrentHashMap()
        private val registeredClasses: MutableMap<String, Class<*>> = ConcurrentHashMap()
        private val nextId: AtomicInteger = AtomicInteger()
        private val dataRoot: File = dataRoot.absoluteFile
        private val lastAccessMap: ConcurrentHashMap<Int, Long> = ConcurrentHashMap()
        val maxInstances: Int = System.getProperty("mindustrymit.maxInstances", "100").toInt()
        val instanceTtlMs: Long = System.getProperty("mindustrymit.instanceTtlMinutes", "30").toLong() * 60_000
        private var cleanupScheduler: ScheduledExecutorService? = null

        var error: (String) -> Unit = { println("[ERR] $it") }
        var info: (String) -> Unit = { println("[INF] $it") }
        var warning: (String) -> Unit = { println("[WRN] $it") }
        var debug: (String) -> Unit = { println("[DBG] $it") }

        data class InitResult(val success: Boolean, val docCount: Int, val message: String)

        companion object {
            fun defaultDataRoot(): File {
                return File(System.getProperty("mindustrymit.dataRoot", ".mindustrymit-data")).absoluteFile
            }
        }

        fun initialize(dataDirPath: String): InitResult {
            return initBackend(dataDirPath)
        }

        private fun resolveDataDir(dataDirPath: String): File {
            val root = dataRoot.canonicalFile
            val requested = if (dataDirPath.isBlank()) root else File(dataDirPath)
            val target = if (requested.isAbsolute) requested.canonicalFile else File(root, dataDirPath).canonicalFile

            if (target != root && !target.path.startsWith(root.path + File.separator)) {
                fail("Data_Dir 必须位于允许的数据根目录内: ${root.absolutePath}")
            }

            target.mkdirs()
            return target
        }

        private fun initBackend(dataDirPath: String): InitResult {
            initializeClassInstances()

            if (dataDirPath.isBlank()) {
                return InitResult(false, 0, "Data_Dir is empty")
            }

            return try {
                val dataDir = resolveDataDir(dataDirPath)
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
                if (cleanupScheduler == null) startCleanupScheduler()
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

            debug("解压内置文档: ${docDir.absolutePath}")
            return true
        }

        fun registerClass(className: String, clazz: Class<*>) {
            registeredClasses[className] = clazz
            registeredClasses[JsonParser.normalizeClassName(className)] = clazz
            registeredClasses[clazz.name] = clazz
            registeredClasses[clazz.simpleName] = clazz
        }

        private fun initializeClassInstances() {
            classInstance.clear()
            listOf(
                Blocks::class.java,
                UnitTypes::class.java,
                Fx::class.java,
                Bullets::class.java,
                Items::class.java,
                Liquids::class.java,
                Loadouts::class.java,
                Planets::class.java,
                SectorPresets::class.java,
                StatusEffects::class.java,
                Weathers::class.java,
                Category::class.java,
                Sounds::class.java
            ).forEach { source ->
                source.fields
                    .filter { Modifier.isStatic(it.modifiers) }
                    .forEach { field ->
                        val instance = runCatching { field.get(null) }.getOrNull() ?: field.type
                        classInstance["${field.name}"] = instance
                    }
            }
        }

        private fun touch(classId: Int) {
            lastAccessMap[classId] = System.currentTimeMillis()
        }

        private fun classOfInstance(instance: Any): Class<*> {
            return when (instance) {
                is Class<*> -> instance
                else -> instance.javaClass
            }
        }

        private fun classHierarchy(clazz: Class<*>): Sequence<Class<*>> {
            return generateSequence(clazz) { it.superclass }
        }

        private fun resolveClassFromInstances(className: String): Class<*>? {
            val raw = className.trim()
            val simple = JsonParser.normalizeClassName(raw)
            return classInstance.values.asSequence()
                .map { classOfInstance(it) }
                .flatMap { classHierarchy(it) }
                .firstOrNull { candidate ->
                    candidate.name == raw ||
                        candidate.simpleName == raw ||
                        JsonParser.normalizeClassName(candidate.name) == simple ||
                        JsonParser.normalizeClassName(candidate.simpleName) == simple
                }
        }

        private fun resolveClassForInstances(className: String): Class<*> {
            if (classInstance.isEmpty()) {
                initializeClassInstances()
            }
            return runCatching { resolveClass(className) }
                .getOrElse { original -> resolveClassFromInstances(className) ?: throw original }
        }

        fun getClassInstances(className: String): List<String> {
            val targetClass = resolveClassForInstances(className)

            return classInstance.entries.asSequence()
                .filter { (_, instance) -> targetClass.isAssignableFrom(classOfInstance(instance)) }
                .map { (name, _) -> name }
                .sorted()
                .toList()
        }

        fun newClass(className: String): Int {
            if (classBuildMap.size >= maxInstances) {
                fail("实例数已达上限 ($maxInstances)")
            }
            val id = nextId.getAndIncrement()
            val tool = Tool(ApiJsonEditorTool(parser))
            classDataMap[id] = tool
            classBuildMap[id] = ClassBuild(resolveClass(className), parser)
            touch(id)
            debug("+Class $className #$id")
            return id
        }

        fun removeClass(classId: Int): Boolean {
            debug("-Class #$classId ${if (classDataMap.containsKey(classId)) "" else "(不存在)"}")
            classBuildMap.remove(classId)
            lastAccessMap.remove(classId)
            return classDataMap.remove(classId) != null
        }

        private fun resolveClass(className: String): Class<*> {
            return registeredClasses[className]
                ?: registeredClasses[JsonParser.normalizeClassName(className)]
                ?: parser.getClassByName(className)
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
            return FieldBuild(field, parser, ownerClassName = classBuild.name).also { classBuild.addFieldBuild { it } }
        }

        private sealed class PathTarget {
            data class FieldTarget(val field: FieldBuild) : PathTarget()
            data class ElementTarget(val build: ClassBuild) : PathTarget()
        }

        private fun resolvePath(classId: Int, path: List<String>, createMissing: Boolean = true): PathTarget {
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
                    val element = elements[elementIndex]
                    if (isLast) return PathTarget.ElementTarget(element)
                    current = element
                    currentField = null
                } else {
                    val field = if (createMissing) {
                        getOrCreateFieldBuild(current, segment)
                    } else {
                        current.getFieldBuildByName(segment) ?: fail("字段 $segment 尚未创建")
                    }

                    if (isLast) return PathTarget.FieldTarget(field)

                    currentField = field
                    if (!isIndexSegment(path[index + 1])) {
                        field.value.value = ""
                        current = field.value.typeValue
                        currentField = null
                    }
                }
            }

            fail("无法解析 Field_Path: $path")
        }

        private fun setFieldValue(classId: Int, path: List<String>, value: String): String {
            touch(classId)
            return when (val t = resolvePath(classId, path)) {
                is PathTarget.FieldTarget -> {
                    t.field.value.value = value
                    t.field.value.elements = null
                    t.field.toValueJson()
                }

                is PathTarget.ElementTarget -> {
                    t.build.value = value
                    t.build.fieldBuilds.clear()
                    t.build.toJson()
                }
            }
        }

        private fun setFieldValueByBuild(classId: Int, path: List<String>, valueBuild: ClassBuild): String {
            touch(classId)
            return when (val t = resolvePath(classId, path)) {
                is PathTarget.FieldTarget -> {
                    t.field.value.typeValue = valueBuild
                    t.field.value.value = ""
                    t.field.value.elements = null
                    t.field.toValueJson()
                }

                is PathTarget.ElementTarget -> {
                    t.build.classData = valueBuild.classData
                    t.build.name = valueBuild.name
                    t.build.value = valueBuild.value
                    t.build.fieldBuilds.clear()
                    t.build.fieldBuilds.addAll(valueBuild.fieldBuilds)
                    t.build.toJson()
                }
            }
        }

        private fun getFieldValue(classId: Int, path: List<String>): String {
            touch(classId)
            return when (val t = resolvePath(classId, path, createMissing = false)) {
                is PathTarget.FieldTarget -> t.field.toValueJson()
                is PathTarget.ElementTarget -> t.build.toJson()
            }
        }

        private fun removeElement(classId: Int, path: List<String>, index: Int?) {
            touch(classId)
            if (index == null) {
                // 无 Index：从父 ClassBuild 中移除该字段
                if (path.isEmpty()) fail("Field_Path 不能为空")
                val fieldName = path.last()
                val parent: ClassBuild = if (path.size == 1) {
                    getClassBuild(classId)
                } else {
                    val parentPath = path.dropLast(1)
                    when (val t = resolvePath(classId, parentPath, createMissing = false)) {
                        is PathTarget.FieldTarget -> t.field.value.typeValue
                        is PathTarget.ElementTarget -> t.build
                    }
                }
                if (!parent.removeFieldBuild(fieldName)) {
                    fail("字段 $fieldName 不存在或尚未设置")
                }
            } else {
                // 有 Index：从数组字段中删除指定元素
                val target = resolvePath(classId, path)
                val field = (target as? PathTarget.FieldTarget)?.field
                    ?: fail("RemoveElement 目标必须是字段，不能是数组元素")
                val elements = field.value.elements ?: fail("字段 ${field.field.name} 没有元素")
                if (index !in elements.indices) {
                    fail("数组下标 $index 越界，字段 ${field.field.name} 当前长度 ${elements.size}")
                }
                elements.removeAt(index)
            }
        }

        private fun addElement(classId: Int, path: List<String>, elementTypeName: String, value: String): Int {
            touch(classId)
            val target = resolvePath(classId, path)
            val field = (target as? PathTarget.FieldTarget)?.field
                ?: fail("AddElement 目标必须是字段，不能是数组元素")
            if (!field.field.isSeqOrArrayType()) {
                fail("字段 ${field.field.name} 不是数组、Seq 或 List 类型")
            }
            val elements = field.value.elements ?: mutableListOf<ClassBuild>().also { field.value.elements = it }
            val elementClass = if (elementTypeName.isNotBlank()) {
                resolveClass(elementTypeName)
            } else {
                field.field.getSeqElementType() ?: fail("字段 ${field.field.name} 无法推断元素类型，请传入 Element_Type")
            }

            val element = ClassBuild(elementClass, parser)
            if (value.isNotEmpty()) element.value = value
            elements.add(element)
            field.value.value = ""
            return elements.lastIndex
        }

        private fun exportClass(classId: Int): String {
            touch(classId)
            return getClassBuild(classId).toJson()
        }

        private fun safeDocFileName(type: String): String {
            val sanitized = type.replace(Regex("[^A-Za-z0-9_.-]"), "_").trim('_', '.')
            return sanitized.ifBlank { "type" }
        }

        private fun fail(message: String): Nothing {
            throw IllegalArgumentException(message)
        }

        private fun cleanupExpired() {
            val now = System.currentTimeMillis()
            val expired = lastAccessMap.entries
                .filter { now - it.value > instanceTtlMs }
                .map { it.key }
            if (expired.isEmpty()) return
            expired.forEach { id ->
                classDataMap.remove(id)
                classBuildMap.remove(id)
                lastAccessMap.remove(id)
            }
            debug("回收 ${expired.size} 个过期实例")
        }

        private fun startCleanupScheduler() {
            cleanupScheduler = Executors.newSingleThreadScheduledExecutor { r ->
                Thread(r, "mit-cleanup").apply { isDaemon = true }
            }
            cleanupScheduler!!.scheduleAtFixedRate(::cleanupExpired, 5, 5, TimeUnit.MINUTES)
        }

        fun stopCleanupScheduler() {
            cleanupScheduler?.shutdownNow()
            cleanupScheduler = null
        }

        fun errorResponse(message: String, sourceType: WebSocketDataType? = null): String {
            val reply = WebSocketData.reply(
                WebSocketDataType.Error,
                mapOf(
                    "Success" to Data(boolean = false),
                    "Message" to Data(str = message),
                    "Source_Type" to Data(str = sourceType?.name ?: "")
                )
            )
            return jsonFormat.encodeToString(WebSocketData.serializer(), reply)
        }

        private val json1 = Json { prettyPrint = true }

        fun contentParsing(message: String): String {
            val data = try {
                jsonFormat.decodeFromString(WebSocketData.serializer(), message)
            } catch (e: Exception) {
                return errorResponse("请求格式错误: ${e.message ?: e::class.java.name}")
            }

            return try {
                when (data.wsType) {
                    WebSocketDataType.Error -> {
                        errorResponse("Error 请求类型不能作为业务请求", WebSocketDataType.Error)
                    }

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
                        val parentClass = try {
                            val contentJson = Json.parseToJsonElement(data.content).jsonObject
                            contentJson["Parent_Class"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
                        } catch (_: Exception) { null }

                        val classList = if (parentClass != null) {
                            parser.getAllClassesByParent(parentClass)
                        } else {
                            parser.getAllClasses()
                        }
                        val reply = WebSocketData.reply(
                            WebSocketDataType.AllClass,
                            mapOf("Class_List" to Data(list = classList.map { Data(str = it) }.toMutableList()))
                        )
                        jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                    }

                    WebSocketDataType.AllField -> {
                        val className = data.dataList["Class_Name"]?.str ?: ""
                        val fields = parser.getAllFields(className)
                        val reply = WebSocketData.reply(
                            WebSocketDataType.AllField,
                            mapOf("Field_List" to Data(list = fields.map { field ->
                                val meta = JsonTypeRegistry.get(field.type)
                                Data(
                                    str = field.name,
                                    json = field.type,
                                    obj = meta?.let { m ->
                                        Data(
                                            str = m.modes.joinToString(",") { it.name },
                                            json = m.stringSource,
                                            obj = Data(str = m.defaultType)
                                        )
                                    }
                                )
                            }.toMutableList()))
                        )
                        jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                    }

                    WebSocketDataType.TypeParserInfo -> {
                        val typeName = data.dataList["Type_Name"]?.str ?: ""
                        val meta = JsonTypeRegistry.get(typeName)
                        val reply = if (meta != null) {
                            WebSocketData.reply(
                                WebSocketDataType.TypeParserInfo,
                                mapOf(
                                    "Found" to Data(boolean = true),
                                    "Modes" to Data(list = meta.modes.map { Data(str = it.name) }.toMutableList()),
                                    "String_Source" to Data(str = meta.stringSource),
                                    "Default_Type" to Data(str = meta.defaultType)
                                )
                            )
                        } else {
                            WebSocketData.reply(
                                WebSocketDataType.TypeParserInfo,
                                mapOf(
                                    "Found" to Data(boolean = false),
                                    "Modes" to Data(list = mutableListOf()),
                                    "String_Source" to Data(),
                                    "Default_Type" to Data()
                                )
                            )
                        }
                        jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                    }

                    WebSocketDataType.ClassInstance -> {
                        val className = data.dataList["Class_Name"]?.str ?: ""
                        val objects = getClassInstances(className)
                        val reply = WebSocketData.reply(
                            WebSocketDataType.ClassInstance,
                            mapOf("Object_List" to Data(list = objects.map { Data(str = it) }.toMutableList()))
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
                            val valueClassId = data.dataList["Value_Class_Id"]?.int
                            val jsonValue = if (valueClassId != null) {
                                setFieldValueByBuild(classId, parsePath(data), getClassBuild(valueClassId))
                            } else {
                                setFieldValue(classId, parsePath(data), data.dataList["Value"]?.str ?: "")
                            }
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

                    WebSocketDataType.RemoveElement -> {
                        val reply = try {
                            val classId = data.dataList["Class_Id"]?.int ?: fail("Class_Id 不能为空")
                            val index = data.dataList["Index"]?.int
                            removeElement(classId, parsePath(data), index)
                            WebSocketData.reply(
                                WebSocketDataType.RemoveElement,
                                mapOf(
                                    "Success" to Data(boolean = true),
                                    "Message" to Data()
                                )
                            )
                        } catch (e: Exception) {
                            WebSocketData.reply(
                                WebSocketDataType.RemoveElement,
                                mapOf(
                                    "Success" to Data(boolean = false),
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

                    WebSocketDataType.FetchDoc -> {
                        val dataDirPath = data.dataList["Data_Dir"]?.str ?: ""
                        val reply = try {
                            val docDir = File(resolveDataDir(dataDirPath), "doc").canonicalFile
                            docDir.mkdirs()
                            val fetcher = object : com.mindustry.ide.tool.json.libs.DocFetch() {
                                override fun saveTypeMeta(meta: TypeMeta) {
                                    val file = File(docDir, "${safeDocFileName(meta.type)}.json")
                                    file.writeText(
                                        json1
                                            .encodeToString(TypeMeta.serializer(), meta),
                                        Charsets.UTF_8
                                    )
                                }
                            }
                            val results = kotlinx.coroutines.runBlocking { fetcher.execute() }
                            WebSocketData.reply(
                                WebSocketDataType.FetchDoc, mapOf(
                                    "Success" to Data(boolean = results.isNotEmpty()),
                                    "Doc_Count" to Data(int = results.size),
                                    "Message" to Data(str = "Fetched ${results.size} types to ${docDir.absolutePath}")
                                )
                            )
                        } catch (e: Exception) {
                            WebSocketData.reply(
                                WebSocketDataType.FetchDoc, mapOf(
                                    "Success" to Data(boolean = false),
                                    "Doc_Count" to Data(int = 0),
                                    "Message" to Data(str = e.message ?: e::class.java.name)
                                )
                            )
                        }
                        jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                    }

                    WebSocketDataType.AddField -> {
                        val reply = try {
                            val className = data.dataList["Class_Name"]?.str ?: fail("Class_Name 不能为空")
                            val fieldName = data.dataList["Field_Name"]?.str ?: fail("Field_Name 不能为空")
                            val fieldType = data.dataList["Field_Type"]?.str ?: "String"
                            val defaultValue = data.dataList["Default_Value"]?.str ?: ""
                            val notes = data.dataList["Notes"]?.str ?: ""
                            val applyToSubclasses = data.dataList["Apply_To_Subclasses"]?.boolean ?: true

                            val affected = parser.addField(className, fieldName, fieldType, defaultValue, notes, applyToSubclasses)

                            WebSocketData.reply(
                                WebSocketDataType.AddField,
                                mapOf(
                                    "Success" to Data(boolean = true),
                                    "Affected_Classes" to Data(int = affected.size),
                                    "Message" to Data(str = "已添加到 ${affected.joinToString(", ")}")
                                )
                            )
                        } catch (e: Exception) {
                            WebSocketData.reply(
                                WebSocketDataType.AddField,
                                mapOf(
                                    "Success" to Data(boolean = false),
                                    "Affected_Classes" to Data(int = 0),
                                    "Message" to Data(str = e.message ?: e::class.java.name)
                                )
                            )
                        }
                        jsonFormat.encodeToString(WebSocketData.serializer(), reply)
                    }

                }
            } catch (e: Exception) {
                errorResponse(e.message ?: e::class.java.name, data.wsType)
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

        class JsonApiWebSocketHandler(
            val toolData: ToolData = ToolData(),
            var port: Int = 19190,
            private val bindHost: String = System.getProperty("mindustrymit.bindHost", "0.0.0.0"),
            private val token: String? = System.getProperty("mindustrymit.wsToken")?.takeIf { it.isNotBlank() },
            private val allowedOrigins: Set<String> = emptySet(),
            private val useSSL: Boolean = System.getProperty("mindustrymit.useSSL", "false").toBoolean(),
            private val keystorePath: String? = System.getProperty("mindustrymit.keystorePath"),
            private val keystorePassword: String = System.getProperty("mindustrymit.keystorePassword", "mindustrymit")
        ) {
            private var server: Server? = null

            fun start() {
                if (server != null) {
                    toolData.info("服务器已在运行")
                    return
                }
                val s = Server(InetSocketAddress(bindHost, port), this)
                if (useSSL) {
                    s.setWebSocketFactory(DefaultSSLWebSocketServerFactory(buildSSLContext()))
                }
                server = s
                s.start()
                if (!s.startLatch.await(10, TimeUnit.SECONDS)) {
                    server = null
                    throw IllegalStateException("启动超时: $bindHost:$port")
                }
                s.startError?.let {
                    server = null
                    throw IllegalStateException("启动失败: ${it.message}", it)
                }
                val scheme = if (useSSL) "wss" else "ws"
                toolData.info("启动 $scheme://$bindHost:$port")
            }

            private fun buildSSLContext(): SSLContext {
                val ksFile = if (!keystorePath.isNullOrBlank()) {
                    File(keystorePath)
                } else {
                    val defaultKs = File(ToolData.defaultDataRoot(), "mindustrymit.jks")
                    if (!defaultKs.exists()) generateSelfSignedKeystore(defaultKs, keystorePassword)
                    defaultKs
                }
                val ks = KeyStore.getInstance("JKS")
                FileInputStream(ksFile).use { ks.load(it, keystorePassword.toCharArray()) }
                val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
                kmf.init(ks, keystorePassword.toCharArray())
                return SSLContext.getInstance("TLS").also { it.init(kmf.keyManagers, null, null) }
            }

            private fun generateSelfSignedKeystore(file: File, password: String) {
                file.parentFile?.mkdirs()
                val keytool = "${System.getProperty("java.home")}/bin/keytool"
                val proc = ProcessBuilder(
                    keytool, "-genkeypair",
                    "-keyalg", "RSA", "-keysize", "2048",
                    "-validity", "3650",
                    "-dname", "CN=MindustryMIT,O=MindustryMIT,C=CN",
                    "-keystore", file.absolutePath,
                    "-storepass", password,
                    "-keypass", password,
                    "-alias", "mindustrymit"
                ).redirectErrorStream(true).start()
                if (!proc.waitFor(30, TimeUnit.SECONDS)) {
                    proc.destroy()
                    throw IllegalStateException("生成自签名证书超时")
                }
                if (proc.exitValue() != 0) {
                    val output = proc.inputStream.bufferedReader().readText()
                    throw IllegalStateException("生成自签名证书失败: $output")
                }
                toolData.info("自签名证书已生成")
            }

            fun stop() {
                toolData.stopCleanupScheduler()
                server?.let {
                    try {
                        it.stop(1000)
                        toolData.info("服务器已停止")
                    } catch (e: Exception) {
                        toolData.error("停止失败: ${e.message}")
                    } finally {
                        server = null
                    }
                }
            }

            fun broadcast(message: String) {
                server?.broadcast(message)
            }

            private fun isOriginAllowed(handshake: ClientHandshake): Boolean {
                if (allowedOrigins.isEmpty()) return true
                val origin = handshake.getFieldValue("Origin") ?: ""
                return origin in allowedOrigins
            }

            private fun isAuthorized(message: String): Boolean {
                val expected = token ?: return true
                val root = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return false
                val topLevel = root["Token"]?.jsonPrimitive?.contentOrNull
                    ?: root["token"]?.jsonPrimitive?.contentOrNull
                if (topLevel == expected) return true

                val content = root["content"]?.jsonPrimitive?.contentOrNull ?: return false
                val contentToken = runCatching {
                    val contentObject = Json.parseToJsonElement(content).jsonObject
                    contentObject["Token"]?.jsonPrimitive?.contentOrNull
                        ?: contentObject["token"]?.jsonPrimitive?.contentOrNull
                }.getOrNull()
                return contentToken == expected
            }

            class Server(address: InetSocketAddress, private val handler: JsonApiWebSocketHandler) :
                WebSocketServer(address) {
                val startLatch = CountDownLatch(1)

                @Volatile
                var startError: Exception? = null

                override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
                    if (!handler.isOriginAllowed(handshake)) {
                        conn.close(1008, "Origin not allowed")
                        return
                    }
                    handler.toolData.info("+连接 ${conn.remoteSocketAddress}")
                }

                override fun onMessage(conn: WebSocket, message: String) {
                    if (!handler.isAuthorized(message)) {
                        conn.send(handler.toolData.errorResponse("未授权"))
                        return
                    }
                    val response = handler.toolData.contentParsing(message)
                    conn.send(response)
                }

                override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
                    handler.toolData.info("-断开 ${conn.remoteSocketAddress}")
                }

                override fun onError(conn: WebSocket?, ex: Exception) {
                    if (conn == null) {
                        startError = ex
                        startLatch.countDown()
                    }
                    handler.toolData.error("${ex.message}")
                }

                override fun onStart() {
                    handler.toolData.info("服务器已就绪")
                    startLatch.countDown()
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
            val json = try {
                Json.parseToJsonElement(content).jsonObject
            } catch (e: Exception) {
                throw IllegalArgumentException("content 必须是 JSON 对象: ${e.message}", e)
            }

            for (i in wsType.input) {
                val element = json[i.first] ?: continue
                val iData = Data()
                when (i.second) {
                    DataType.String -> {
                        iData.str = element.jsonPrimitive.content
                    }

                    DataType.Int -> {
                        iData.int = element.jsonPrimitive.content.toIntOrNull()
                            ?: throw IllegalArgumentException("${i.first} 必须是 Int")
                    }

                    DataType.Float -> {
                        iData.float = element.jsonPrimitive.content.toFloatOrNull()
                            ?: throw IllegalArgumentException("${i.first} 必须是 Float")
                    }

                    DataType.List -> {
                        val jsonArray = element.jsonArray
                        iData.list = jsonArray.map { Data(str = it.jsonPrimitive.content) }.toMutableList() //[x1,x2]
                    }

                    DataType.Boolean -> {
                        iData.boolean = when (element.jsonPrimitive.content.lowercase()) {
                            "true" -> true
                            "false" -> false
                            else -> throw IllegalArgumentException("${i.first} 必须是 Boolean")
                        }
                    }

                    DataType.Object -> {
                        iData.json = element.toString()
                        iData.obj = Data(str = element.toString(), json = element.toString())
                    }
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
    Error(
        output = listOf(
            "Success" to DataType.Boolean,
            "Message" to DataType.String,
            "Source_Type" to DataType.String
        )
    ),
    Init(
        listOf("Data_Dir" to DataType.String), listOf(
            "Success" to DataType.Boolean, "Doc_Count" to DataType.Int, "Message" to DataType.String
        )
    ),
    AllClass(output = listOf("Class_List" to DataType.List)), AllField(
        listOf("Class_Name" to DataType.String),
        listOf("Field_List" to DataType.List)
    ),
    ClassInstance(
        listOf("Class_Name" to DataType.String),
        listOf("Object_List" to DataType.List)
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
            "Value" to DataType.String,
            "Value_Class_Id" to DataType.Int
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
    RemoveElement(
        listOf(
            "Class_Id" to DataType.Int,
            "Field_Path" to DataType.List,
            "Index" to DataType.Int
        ),
        listOf(
            "Success" to DataType.Boolean,
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
    FetchDoc(
        listOf("Data_Dir" to DataType.String),
        listOf(
            "Success" to DataType.Boolean,
            "Doc_Count" to DataType.Int,
            "Message" to DataType.String
        )
    ),
    TypeParserInfo(
        listOf("Type_Name" to DataType.String),
        listOf(
            "Found" to DataType.Boolean,
            "Modes" to DataType.List,
            "String_Source" to DataType.String,
            "Default_Type" to DataType.String
        )
    ),
    AddField(
        listOf(
            "Class_Name" to DataType.String,
            "Field_Name" to DataType.String,
            "Field_Type" to DataType.String,
            "Default_Value" to DataType.String,
            "Notes" to DataType.String,
            "Apply_To_Subclasses" to DataType.Boolean
        ),
        listOf(
            "Success" to DataType.Boolean,
            "Affected_Classes" to DataType.Int,
            "Message" to DataType.String
        )
    ),
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
    var obj: Data? = null,
    var json: String = ""
)

fun main() {
    val t = JsonApi()
    t.server.start()
}
