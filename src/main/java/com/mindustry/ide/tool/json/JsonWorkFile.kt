package com.mindustry.ide.tool.json

import arc.struct.ObjectMap
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import arc.util.Nullable
import mindustry.world.Block
import java.lang.reflect.Field
import java.lang.reflect.Modifier
import kotlin.jvm.java


//TODO 数列的适配
/**
 * 判断字段是否为 Seq/Array 类型
 * 支持：
 * - arc.struct.Seq<T>
 * - T[] (Java 数组)
 * - java.util.List<T>
 */
fun Field.isSeqOrArrayType(): Boolean {
    val typeName = type.name
    return typeName == "arc.struct.Seq" || 
           typeName.startsWith("[") || // Java 数组以 [ 开头
           typeName == "java.util.List" ||
           typeName == "java.util.ArrayList"
}

/**
 * 解析 Seq/Array 的元素类型
 * 例如：Seq<Block> -> Block, int[] -> int
 */
fun Field.getSeqElementType(): Class<*>? {
    if (!isSeqOrArrayType()) return null
    
    // 处理 Java 数组
    if (type.isArray) {
        return type.componentType
    }
    
    // 处理泛型类型（需要通过反射获取泛型参数）
    try {
        val genericType = genericType
        if (genericType is java.lang.reflect.ParameterizedType) {
            val actualTypeArgs = genericType.actualTypeArguments
            if (actualTypeArgs.isNotEmpty() && actualTypeArgs[0] is Class<*>) {
                return actualTypeArgs[0] as Class<*>
            }
        }
    } catch (e: Exception) {
        // 泛型信息在运行时可能被擦除
    }
    
    return null
}

/**
 * 判断字段在 JSON 里是否"大概率必须写"
 *
 * 依据：
 * - 基本类型：有零值，默认不写一般安全 → optional
 * - 引用类型且标注了 @Nullable：null 是允许的 → optional
 * - 引用类型无 @Nullable：null 可能导致 NPE → required
 *
 * 注意：这只是静态推断，不是绝对规则。
 * 实际是否必须取决于下游业务逻辑。
 */
fun Field.isLikelyRequired(): Boolean {
    if (Modifier.isTransient(modifiers)) return false
    if (Modifier.isStatic(modifiers)) return false
    if (isSynthetic) return false
    if (Modifier.isFinal(modifiers)) return false

    // 基本类型有零值，不需要 JSON 显式提供
    if (type.isPrimitive) return false

    // 有 @Nullable 注解，说明 null 是允许的
    if (isAnnotationPresent(Nullable::class.java)) return false

    // 引用类型且无 @Nullable → JSON 不写就是 null → 可能 NPE
    return true
}

fun String.isBooleanString(): Boolean {
    return this.equals("true", ignoreCase = true) ||
            this.equals("false", ignoreCase = true)
}

fun String.isNumber(): Boolean {
    return this.toDoubleOrNull() != null
}

val json = Json { prettyPrint = true }

fun Field.isJsonEditableField(): Boolean {
    return !Modifier.isTransient(modifiers) &&
        !Modifier.isStatic(modifiers) &&
        !Modifier.isFinal(modifiers) &&
        !isSynthetic
}

private fun Class<*>.isStringLike(): Boolean {
    return this == String::class.java || this == Char::class.java || name == "java.lang.Character"
}

private fun Class<*>.isBooleanLike(): Boolean {
    return this == Boolean::class.java || name == "java.lang.Boolean"
}

private fun Class<*>.isIntegerLike(): Boolean {
    return this == Int::class.java ||
        this == Long::class.java ||
        this == Short::class.java ||
        this == Byte::class.java ||
        name in setOf("java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte")
}

private fun Class<*>.isFloatingLike(): Boolean {
    return this == Float::class.java ||
        this == Double::class.java ||
        name in setOf("java.lang.Float", "java.lang.Double")
}

private fun primitiveJsonFor(type: Class<*>, rawValue: String): JsonElement {
    if (rawValue == "null" && !type.isStringLike()) return JsonNull

    return when {
        type.isStringLike() -> JsonPrimitive(rawValue)
        type.isBooleanLike() -> when (rawValue.lowercase()) {
            "true" -> JsonPrimitive(true)
            "false" -> JsonPrimitive(false)
            "" -> JsonPrimitive(false)
            else -> throw IllegalArgumentException("字段类型 ${type.name} 需要 Boolean 值，实际为 $rawValue")
        }
        type.isIntegerLike() -> JsonPrimitive(rawValue.toLongOrNull() ?: 0L)
        type.isFloatingLike() -> JsonPrimitive(rawValue.toDoubleOrNull() ?: 0.0)
        rawValue.isEmpty() -> JsonNull
        else -> JsonPrimitive(rawValue)
    }
}

/**
 * 特殊字段解析器接口
 * 用于处理 ContentParser 中有专门分支的字段（如 consumes、requirements 等）
 */
interface SpecialFieldHandler {
    /**
     * 检查是否能处理该字段
     */
    fun canHandle(fieldName: String): Boolean
    
    /**
     * 处理特殊字段，返回处理后的 ClassBuild 或 null
     * @param element JSON 元素
     * @param parser JSON 解析器
     * @param ownerClassName 所有者类名
     * @return 处理后的 ClassBuild，如果无法处理返回 null
     */
    fun handle(element: JsonElement, parser: IJsonParser, ownerClassName: String): ClassBuild?
}

/**
 * 消耗器字段处理器
 * 处理 Block 的 consumes 字段
 */
class ConsumeFieldHandler : SpecialFieldHandler {
    override fun canHandle(fieldName: String): Boolean = fieldName == "consumes"
    
    override fun handle(element: JsonElement, parser: IJsonParser, ownerClassName: String): ClassBuild? {
        if (element !is JsonObject) return null
        
        // 创建一个虚拟的 Consume 类构建
        // 实际上 consumes 是一个包含多个子字段的对象
        // 每个子字段（如 power、items、liquid）对应一个具体的 Consume 类型
        val consumeBuild = ClassBuild(Block::class.java, parser)
        consumeBuild.name = "consumes"
        
        for ((key, value) in element) {
            // 为每个子字段创建 FieldBuild
            // 这里需要根据 key 映射到具体的 Consume 类型
            val consumeType = mapConsumeType(key)
            if (consumeType != null) {
                // 创建一个临时字段来存储这个 Consume
                val tempField = createTempField(key, consumeType)
                val fb = FieldBuild(tempField, parser, ownerClassName = ownerClassName)
                applyJsonToFieldBuild(fb, value, tempField)
                consumeBuild.addFieldBuild { fb }
            }
        }
        
        return consumeBuild
    }
    
    private fun mapConsumeType(key: String): Class<*>? {
        return when (key) {
            "item" -> try { Class.forName("mindustry.world.consumers.ConsumeItem") } catch (_: Exception) { null }
            "items" -> try { Class.forName("mindustry.world.consumers.ConsumeItems") } catch (_: Exception) { null }
            "liquid" -> try { Class.forName("mindustry.world.consumers.ConsumeLiquid") } catch (_: Exception) { null }
            "liquids" -> try { Class.forName("mindustry.world.consumers.ConsumeLiquids") } catch (_: Exception) { null }
            "power" -> try { Class.forName("mindustry.world.consumers.ConsumePower") } catch (_: Exception) { null }
            "powerBuffered" -> try { Class.forName("mindustry.world.consumers.ConsumePower") } catch (_: Exception) { null }
            "coolant" -> try { Class.forName("mindustry.world.consumers.ConsumeCoolant") } catch (_: Exception) { null }
            else -> null
        }
    }
    
    private fun createTempField(name: String, type: Class<*>): Field {
        // 创建一个临时的 Field 对象用于存储
        // 这是一个简化实现，实际可能需要更复杂的处理
        return TempField(name, type)
    }
    
    /**
     * 临时字段实现，用于存储特殊字段
     */
    private class TempField(
        private val fieldName: String,
        private val fieldType: Class<*>
    ) : Field(null, 0, null, null) {
        override fun getName(): String = fieldName
        override fun getType(): Class<*> = fieldType
        // 其他方法使用默认实现
    }
}

/**
 * 需求字段处理器
 * 处理 UnitType 的 requirements 字段
 */
class RequirementsFieldHandler : SpecialFieldHandler {
    override fun canHandle(fieldName: String): Boolean = fieldName == "requirements"
    
    override fun handle(element: JsonElement, parser: IJsonParser, ownerClassName: String): ClassBuild? {
        // requirements 字段需要特殊处理，因为它关联到 UnitFactory/Reconstructor
        // 这里简化处理，将其作为普通对象
        if (element !is JsonObject) return null
        
        val reqBuild = ClassBuild(Block::class.java, parser)
        reqBuild.name = "requirements"
        
        for ((key, value) in element) {
            val tempField = createTempField(key, Any::class.java)
            val fb = FieldBuild(tempField, parser, ownerClassName = ownerClassName)
            applyJsonToFieldBuild(fb, value, tempField)
            reqBuild.addFieldBuild { fb }
        }
        
        return reqBuild
    }
    
    private fun createTempField(name: String, type: Class<*>): Field {
        return TempField(name, type)
    }
    
    private class TempField(
        private val fieldName: String,
        private val fieldType: Class<*>
    ) : Field(null, 0, null, null) {
        override fun getName(): String = fieldName
        override fun getType(): Class<*> = fieldType
    }
}

/**
 * 特殊字段处理器注册表
 */
object SpecialFieldRegistry {
    private val handlers = mutableListOf<SpecialFieldHandler>()
    
    init {
        // 注册内置处理器
        register(ConsumeFieldHandler())
        register(RequirementsFieldHandler())
    }
    
    fun register(handler: SpecialFieldHandler) {
        handlers.add(handler)
    }
    
    fun getHandler(fieldName: String): SpecialFieldHandler? {
        return handlers.find { it.canHandle(fieldName) }
    }
}

class JsonWorkFile(
    name: String,
    val parser: IJsonParser
) : com.mindustry.ide.tool.WorkFile(name) {
    var classBuild: ClassBuild = ClassBuild(Block::class.java, parser)

    val json1 = Json {
        prettyPrint = true
        prettyPrintIndent = "    "
    }

    fun loadClassBuild(run: ObjectMap<String?, Class<*>?>?.() -> ClassBuild): JsonWorkFile {
        classBuild = run(parser.classMap)
        return this
    }

    override fun import(content: String) {
        val root = try {
            Json.parseToJsonElement(content)
        } catch (e: Exception) {
            throw IllegalArgumentException("import: 非法 JSON: ${e.message}", e)
        }
        if (root !is JsonObject) {
            throw IllegalArgumentException("import: 根元素必须是 JSON 对象")
        }
        classBuild = buildClassBuildFromJson(root, defaultType = Block::class.java)
    }

    private fun buildClassBuildFromJson(obj: JsonObject, defaultType: Class<*>): ClassBuild {
        val typeName = (obj["type"] as? JsonPrimitive)?.contentOrNull
        val cls = typeName?.let { parser.getClassByName(it) } ?: defaultType
        val cb = ClassBuild(cls, parser)
        for ((key, element) in obj) {
            if (key == "type") continue
            
            // 优先检查特殊字段处理器
            val specialHandler = SpecialFieldRegistry.getHandler(key)
            if (specialHandler != null) {
                val specialBuild = specialHandler.handle(element, parser, cb.name)
                if (specialBuild != null) {
                    // 特殊字段处理成功，添加到 fieldBuilds
                    // 注意：这里需要特殊处理，因为 consumes 等字段不是普通的 Field
                    // 我们将其存储为特殊的 FieldBuild
                    val tempField = createTempField(key, Block::class.java)
                    val fb = FieldBuild(tempField, parser, ownerClassName = cb.name)
                    fb.value.typeValue = specialBuild
                    fb.value.value = ""
                    cb.addFieldBuild { fb }
                    continue
                }
            }
            
            // 普通字段处理
            val field = cb.getFieldByName(key) ?: continue
            val fb = FieldBuild(field, parser, ownerClassName = cb.name)
            applyJsonToFieldBuild(fb, element, field)
            cb.addFieldBuild { fb }
        }
        return cb
    }
    
    private fun createTempField(name: String, type: Class<*>): Field {
        return TempField(name, type)
    }
    
    /**
     * 临时字段实现，用于存储特殊字段
     */
    private class TempField(
        private val fieldName: String,
        private val fieldType: Class<*>
    ) : Field(null, 0, null, null) {
        override fun getName(): String = fieldName
        override fun getType(): Class<*> = fieldType
    }

    private fun applyJsonToFieldBuild(fb: FieldBuild, element: JsonElement, field: Field) {
        when (element) {
            is JsonPrimitive -> {
                fb.value.value = element.contentOrNull ?: ""
                fb.value.elements = null
            }
            is JsonObject -> {
                val nested = buildClassBuildFromJson(element, defaultType = field.type)
                fb.value.value = ""
                fb.value.typeValue = nested
                fb.value.elements = null
            }
            is JsonArray -> {
                val elemType = field.getSeqElementType() ?: Any::class.java
                val list = mutableListOf<ClassBuild>()
                for (item in element) {
                    when (item) {
                        is JsonObject -> list.add(buildClassBuildFromJson(item, defaultType = elemType))
                        is JsonPrimitive -> {
                            val leaf = ClassBuild(elemType, parser)
                            leaf.value = item.contentOrNull ?: ""
                            list.add(leaf)
                        }
                        else -> { /* 嵌套数组暂不支持 */ }
                    }
                }
                fb.value.value = ""
                fb.value.elements = list
            }
        }
    }

    override fun export(): String = getContent()

    override fun init() {
        classBuild = ClassBuild(Block::class.java, parser)
        data = com.mindustry.ide.tool.WorkFileData(fileName = name, fileExtension = "json")
    }

    override fun getContent(): String {
        return json1.encodeToString(classBuild.toJsonElement())
    }

    fun formatJson(json: String): String {
        return try {
            // 使用 Json.parseToJsonElement 扩展函数
            val jsonElement: JsonElement = Json.parseToJsonElement(json)
            json1.encodeToString(jsonElement)
        } catch (e: Exception) {
            json
        }
    }



    override fun toString(): String {
        return json.encodeToString(classBuild.getMeta())
    }

    fun addFieldBuild(run: (data: ClassBuild) -> FieldBuild) {
        classBuild.addFieldBuild { run(classBuild) }
    }
}

class ClassBuild(
    var classData: Class<*>,
    val parser: IJsonParser,
    var name: String = classData.simpleName,
    var doc: String = "",
    var parentType: String = "",
    var fieldBuilds: MutableList<FieldBuild> = mutableListOf(),
    var value: String = ""
) {
    init {
        doc = parser.getClassDoc(classData.name)
        parentType = parser.getParentType(classData.name)
        if (value.isEmpty()) {
            value = parser.getFieldDefaultValue(classData.simpleName).firstOrNull() ?: "null"
        }
    }

    @Serializable
    data class ClassMeta(
        var className: String,
        var classSimpleName: String,
        var doc: String,
        var parentType: String,
        var fields: List<FieldBuild.FieldMeta>,
        var value: String = ""
    )

    override fun toString(): String {
        return json.encodeToString(getMeta())
    }

    fun removeFieldBuild(fieldName: String): Boolean {
        return fieldBuilds.removeIf { it.field.name == fieldName }
    }

    fun toJsonElement(): JsonElement {
        if (fieldBuilds.isEmpty()) {
            val primitive = primitiveJsonFor(classData, value)
            return if (primitive == JsonNull) JsonPrimitive(classData.simpleName) else primitive
        }

        return buildJsonObject {
            put("type", name)
            fieldBuilds.forEach { fieldBuild ->
                put(fieldBuild.field.name, fieldBuild.toJsonElement())
            }
        }
    }

    fun toJson(): String = json.encodeToString(toJsonElement())

    fun getMeta(): ClassMeta {
        return ClassMeta(classData.name, name, doc, parentType, fieldBuilds.map { it.getMeta() }, value)
    }

    fun getAllFields(): List<Field> = classData.fields.filter { it.isJsonEditableField() }

    fun getFieldByName(name: String): Field? {
        return getAllFields().firstOrNull { it.name == name }
    }

    fun getFieldBuildByName(name: String): FieldBuild? {
        return fieldBuilds.firstOrNull { it.field.name == name }
    }

    fun addFieldBuild(run: () -> FieldBuild) {
        fieldBuilds.add(run())
    }

    fun setFieldBuild(fieldBuild: FieldBuild, run: (FieldBuild) -> FieldBuild) {
        fieldBuilds.removeIf { it.field.name == fieldBuild.field.name }
        fieldBuilds.add(run(fieldBuild))
    }
}

class FieldBuild(
    var field: Field,
    val parser: IJsonParser,
    var classData: Class<*> = field.type,
    var ownerClassName: String = field.declaringClass.simpleName,
    var doc: String = ""
) {
    var value = Value(getDefaultForClass(field.type), ClassBuild(field.type, parser))

    init {
        doc = parser.getFieldDoc(ownerClassName, field.name)
        if (field.isSeqOrArrayType()) {
            val elemType = field.getSeqElementType()
            if (elemType != null) {
                value.elements = mutableListOf()
                value.typeValue = ClassBuild(elemType, parser)
                value.value = ""
            }
        }
    }

    @Serializable
    data class FieldMeta(var fieldName: String, var className: String, var doc: String, var value: ClassBuild.ClassMeta)

    override fun toString(): String {
        return json.encodeToString(getMeta())
    }

    fun getMeta(): FieldMeta {
        return FieldMeta(field.name, classData.name, doc, value.getTypeValueMeta())
    }

    fun toJsonElement(): JsonElement = value.toJsonElement(field.type)

    fun toJson(): String {
        return json.encodeToString(buildJsonObject { put(field.name, toJsonElement()) })
            .removePrefix("{")
            .removeSuffix("}")
    }

    companion object {
        val defaultValues = mapOf(
            Int::class.java to { "0" },
            Float::class.java to { "0" },
            Double::class.java to { "0" },
            Boolean::class.java to { "false" },
            Long::class.java to { "0" },
            Short::class.java to { "0" },
            Byte::class.java to { "0" },
            Char::class.java to { "0" },
            String::class.java to { "" },
            //TODO 更多待补充
        )

        fun getDefaultForClass(clazz: Class<*>): String {
            return defaultValues[clazz]?.invoke() ?: "null"
        }
    }
}

class Value<T>(var value: String, var typeValue: T, var run: (Value<T>) -> String? = { null }) {
    var elements: MutableList<ClassBuild>? = null

    fun addElement(build: ClassBuild) {
        if (elements == null) elements = mutableListOf()
        elements!!.add(build)
    }

    @Serializable
    data class ValueMeta(var value: String, var typeValue: ClassBuild.ClassMeta)

    fun getMeta(): ValueMeta {
        return ValueMeta(value, getTypeValueMeta())
    }

    fun toJsonElement(targetType: Class<*>): JsonElement {
        run(this)?.let { raw ->
            return runCatching { Json.parseToJsonElement(raw) }
                .getOrElse { primitiveJsonFor(targetType, raw) }
        }

        elements?.let { list ->
            return buildJsonArray {
                list.forEach { add(it.toJsonElement()) }
            }
        }

        if (value.isNotEmpty() || targetType.isStringLike()) {
            return primitiveJsonFor(targetType, value)
        }

        if (typeValue is ClassBuild) {
            return (typeValue as ClassBuild).toJsonElement()
        }

        return typeValue?.let { JsonPrimitive(it.toString()) } ?: JsonNull
    }

    fun toJson(): String = json.encodeToString(toJsonElement(String::class.java))

    fun getString(): String {
        return run(this) ?: when {
            value.isNotEmpty() -> value
            typeValue is ClassBuild -> {
                if ((typeValue as ClassBuild).classData == String::class.java) {
                    value
                } else {
                    (typeValue as ClassBuild).toString()
                }
            }
            else -> typeValue?.toString() ?: "null"
        }
    }

    fun getTypeValueMeta(): ClassBuild.ClassMeta {
        val classType = if (value.isBooleanString()) {
            Boolean::class.java
        } else if (value.isNumber()) {
            Int::class.java
        } else {
            String::class.java
        }
        return when {
            value.isNotEmpty() -> ClassBuild.ClassMeta(
                classType.name,
                classType.simpleName,
                "可能为其他类型转为字符串",
                "",
                listOf(),
                value
            )

            typeValue is ClassBuild -> (typeValue as ClassBuild).getMeta()
            else -> ClassBuild.ClassMeta(
                Nullable::class.java.name,
                Nullable::class.java.simpleName,
                "",
                "",
                listOf(),
                "null"
            )
        }
    }
}
