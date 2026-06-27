package com.mindustry.ide.tool.json

import arc.struct.ObjectMap
import kotlinx.serialization.Serializable
import kotlinx.serialization.InternalSerializationApi
import mindustry.mod.ClassMap
import java.io.File
import java.lang.reflect.Modifier

@OptIn(InternalSerializationApi::class)
@Serializable
data class FieldMeta(val name: String, val type: String, val defaultValue: String, val notes: String)

@OptIn(InternalSerializationApi::class)
@Serializable
data class TypeMeta(val type: String, val parentType: String, val fields: List<FieldMeta>)

/**
 * JSON 解析器接口
 * 提供类元数据和字段信息的查询功能
 */
interface IJsonParser {
    // 类映射
    val classMap: ObjectMap<String?, Class<*>?>?
    
    // 字段默认值
    fun getFieldDefaultValue(className: String, fieldName: String): String
    fun getFieldDefaultValue(fieldName: String): List<String>
    
    // 字段文档
    fun getFieldDoc(className: String, fieldName: String): String
    
    // 类文档
    fun getClassDoc(className: String): String
    
    // 所有字段
    fun getAllFields(className: String): List<FieldMeta>

    // 所有类
    fun getAllClasses(): List<String>

    // 按父类过滤所有类（含父类自身）
    fun getAllClassesByParent(parentClass: String): List<String>

    // 运行时类
    fun getClassByName(className: String): Class<*>?
    
    // 父类
    fun getParentType(className: String): String
    
    // 加载文件
    fun load(路径: File): kotlinx.serialization.json.JsonElement?
}

open class JsonParser : IJsonParser {
    // 类&字段 文档
    val classDocs = mutableMapOf<String, TypeMeta>()
    val fieldDocs = mutableMapOf<String, MutableMap<String, FieldMeta>>()
    // 自定义字段（AddField API 添加）
    val customFields = mutableMapOf<String, MutableMap<String, FieldMeta>>()
    
    // 类映射（getter 延迟加载；在无 Mindustry 环境下安全返回 null）
    override val classMap: ObjectMap<String?, Class<*>?>?
        get() = try { ClassMap.classes } catch (_: NoClassDefFoundError) { null }

    companion object {
        // JSON 格式
        val jsonFormat = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }

        fun normalizeClassName(className: String): String {
            return className.trim()
                .substringAfterLast('.')
                .substringAfterLast('$')
        }
    }

    private fun classKeys(className: String): Set<String> {
        val raw = className.trim()
        val simple = normalizeClassName(raw)
        return listOf(raw, simple).filter { it.isNotBlank() }.toSet()
    }

    private fun fieldKey(className: String): String {
        return normalizeClassName(className)
    }

    private fun classMeta(className: String): TypeMeta? {
        return classKeys(className).firstNotNullOfOrNull { classDocs[it] }
    }

    private fun fieldMetaInHierarchy(
        className: String,
        fieldName: String,
        visited: MutableSet<String> = mutableSetOf()
    ): FieldMeta? {
        val meta = classMeta(className) ?: return null
        val key = normalizeClassName(meta.type)
        if (!visited.add(key)) return null

        classKeys(className).firstNotNullOfOrNull { currentKey ->
            fieldDocs[fieldKey(currentKey)]?.get(fieldName)
        }?.let { return it }

        val parentType = meta.parentType.trim()
        if (parentType.isBlank()) return null
        return fieldMetaInHierarchy(parentType, fieldName, visited)
    }

    private fun allDocFields(
        className: String,
        visited: MutableSet<String> = mutableSetOf()
    ): List<FieldMeta>? {
        val meta = classMeta(className) ?: return null
        val key = normalizeClassName(meta.type)
        if (!visited.add(key)) return emptyList()

        val fieldsByName = linkedMapOf<String, FieldMeta>()
        val parentType = meta.parentType.trim()
        if (parentType.isNotBlank()) {
            allDocFields(parentType, visited).orEmpty().forEach { field ->
                fieldsByName[field.name] = field
            }
        }
        meta.fields.forEach { field ->
            fieldsByName[field.name] = field
        }
        return fieldsByName.values.toList()
    }

    // 字段默认值
    override fun getFieldDefaultValue(className: String, fieldName: String): String {
        return fieldMetaInHierarchy(className, fieldName)?.defaultValue ?: "null"
    }

    override fun getFieldDefaultValue(fieldName: String): List<String> {
        val ret = mutableListOf<String>()
        fieldDocs.forEach { (className, fieldMap) ->
            fieldMap.filter {
                it.value.name == fieldName
            }.forEach { ret += getFieldDefaultValue(className, it.key) }
        }
        if (ret.isEmpty()) ret += "null"
        return ret
    }

    override fun getFieldDoc(className: String, fieldName: String): String {
        return fieldMetaInHierarchy(className, fieldName)?.notes ?: ""
    }

    // 类文档
    override fun getClassDoc(className: String): String {
        val meta = classMeta(className) ?: return ""
        return "Type: ${meta.type}\nParent: ${meta.parentType}\nFields: ${meta.fields.size}"
    }

    // 所有字段
    override fun getAllFields(className: String): List<FieldMeta> {
        val fieldsByName = linkedMapOf<String, FieldMeta>()

        // 运行时反射字段
        getClassByName(className)?.fields
            ?.filter { it.isJsonVisibleField() }
            ?.forEach { field ->
                fieldsByName[field.name] = FieldMeta(field.name, field.type.canonicalName ?: field.type.name, "", "")
            }

        // 自定义字段（AddField API）
        customFields[fieldKey(className)]?.forEach { (name, field) ->
            fieldsByName[name] = field
        }

        // 回退：反射字段为空时，从文档字段获取
        if (fieldsByName.isEmpty()) return allDocFields(className) ?: emptyList()

        return fieldsByName.values.toList()
    }

    fun addField(className: String, fieldName: String, fieldType: String, defaultValue: String, notes: String, applyToSubclasses: Boolean): List<String> {
        val affectedClasses = mutableListOf<String>()

        addFieldToClass(className, fieldName, fieldType, defaultValue, notes)
        affectedClasses.add(className)

        if (applyToSubclasses) {
            val subclasses = getAllClassesByParent(className).filter { it != className }
            for (sub in subclasses) {
                addFieldToClass(sub, fieldName, fieldType, defaultValue, notes)
                affectedClasses.add(sub)
            }
        }

        return affectedClasses
    }

    private fun addFieldToClass(className: String, fieldName: String, fieldType: String, defaultValue: String, notes: String) {
        val key = fieldKey(className)
        val fieldMap = customFields.getOrPut(key) { mutableMapOf() }
        fieldMap[fieldName] = FieldMeta(fieldName, fieldType, defaultValue, notes)
    }

    // 所有类
    override fun getAllClasses(): List<String> {
        val runtimeClasses = classMap?.mapNotNull { it.key }?.sorted().orEmpty()
        if (runtimeClasses.isNotEmpty()) return runtimeClasses

        return classDocs.values
            .distinctBy { normalizeClassName(it.type) }
            .map { normalizeClassName(it.type) }
            .sorted()
    }

    private fun isSubclassOf(childName: String, parentName: String): Boolean {
        val parentKeys = classKeys(parentName)
        if (classKeys(childName).any { it in parentKeys }) return true

        val childClass = getClassByName(childName)
        val parentClass = getClassByName(parentName)
        if (childClass != null && parentClass != null) {
            return parentClass.isAssignableFrom(childClass)
        }

        val meta = classMeta(childName) ?: return false
        val parentType = meta.parentType.trim()
        if (parentType.isBlank()) return false
        return isSubclassOf(parentType, parentName)
    }

    override fun getAllClassesByParent(parentClass: String): List<String> {
        val all = getAllClasses()
        val matched = all.filter { isSubclassOf(it, parentClass) }.toMutableList()
        val parentKeys = classKeys(parentClass)
        if (all.none { it in parentKeys }) {
            matched.add(0, parentClass.trim())
        }
        return matched.distinct().sorted()
    }

    override fun getClassByName(className: String): Class<*>? {
        val keys = classKeys(className)
        return classMap?.let { map ->
            keys.firstNotNullOfOrNull { key -> map.get(key) }
                ?: map.firstNotNullOfOrNull { entry ->
                    val key = entry.key ?: return@firstNotNullOfOrNull null
                    if (key in keys || normalizeClassName(key) in keys) entry.value else null
                }
        }
    }
    
    // 父类
    override fun getParentType(className: String): String {
        return classMeta(className)?.parentType ?: ""
    }
    
    /**
     * 解析 JSON 字符串为 TypeMeta
     */
    fun parseJsonToMeta(json: String): TypeMeta? {
        return try {
            jsonFormat.decodeFromString(TypeMeta.serializer(), json)
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * 索引类元数据
     */
    fun indexClassMeta(meta: TypeMeta) {
        classKeys(meta.type).forEach { key ->
            classDocs[key] = meta
            val fieldMap = fieldDocs.getOrPut(fieldKey(key)) { mutableMapOf() }
            meta.fields.forEach { field ->
                fieldMap[field.name] = field
            }
        }
    }

    fun loadDocs(docPath: File): Int {
        if (!docPath.exists()) return 0

        classDocs.clear()
        fieldDocs.clear()

        val docFiles = if (docPath.isFile) {
            listOf(docPath)
        } else {
            docPath.walkTopDown()
                .filter { it.isFile && it.extension.equals("json", ignoreCase = true) }
                .toList()
        }

        return docFiles.count { load(it) != null }
    }

    override fun load(路径: File): kotlinx.serialization.json.JsonElement? {
        if (!路径.exists()) return null
        if (路径.isDirectory) {
            loadDocs(路径)
            return null
        }

        return try {
            val content = 路径.readText(Charsets.UTF_8)
            val element = jsonFormat.parseToJsonElement(content)
            val meta = parseJsonToMeta(content) ?: return null
            indexClassMeta(meta)
            element
        } catch (e: Exception) {
            null
        }
    }
}

private fun java.lang.reflect.Field.isJsonVisibleField(): Boolean {
    return !Modifier.isStatic(modifiers) &&
        !Modifier.isTransient(modifiers) &&
        !Modifier.isFinal(modifiers) &&
        !isSynthetic
}
