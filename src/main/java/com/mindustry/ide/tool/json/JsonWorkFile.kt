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
            val field = cb.getFieldByName(key) ?: continue
            val fb = FieldBuild(field, parser, ownerClassName = cb.name)
            applyJsonToFieldBuild(fb, element, field)
            cb.addFieldBuild { fb }
        }
        return cb
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
