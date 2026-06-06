package com.mindustry.ide.tool.json

import arc.struct.ObjectMap
import kotlinx.serialization.Serializable
import kotlinx.serialization.InternalSerializationApi
import mindustry.mod.ClassMap
import java.io.File

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
    
    // 父类
    fun getParentType(className: String): String
    
    // 加载文件
    fun load(路径: File): kotlinx.serialization.json.JsonElement?
}

open class JsonParser : IJsonParser {
    // 类&字段 文档
    val classDocs = mutableMapOf<String, TypeMeta>()
    val fieldDocs = mutableMapOf<String, MutableMap<String, FieldMeta>>()
    
    // 类映射
    override val classMap: ObjectMap<String?, Class<*>?>? = ClassMap.classes

    companion object {
        // JSON 格式
        val jsonFormat = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
    }

    // 字段默认值
    override fun getFieldDefaultValue(className: String, fieldName: String): String {
        return fieldDocs[className]?.get(fieldName)?.defaultValue ?: "null"
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
        return fieldDocs[className]?.get(fieldName)?.notes ?: ""
    }

    // 类文档
    override fun getClassDoc(className: String): String {
        val meta = classDocs[className] ?: return ""
        return "Type: ${meta.type}\nParent: ${meta.parentType}\nFields: ${meta.fields.size}"
    }

    // 所有字段
    override fun getAllFields(className: String): List<FieldMeta> {
        return classDocs[className]?.fields ?: emptyList()
    }
    
    // 父类
    override fun getParentType(className: String): String {
        return classDocs[className]?.parentType ?: ""
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
        classDocs[meta.type] = meta
        val fieldMap = fieldDocs.getOrPut(meta.type) { mutableMapOf() }
        meta.fields.forEach { field ->
            fieldMap[field.name] = field
        }
    }

    override fun load(路径: File): kotlinx.serialization.json.JsonElement? {
        return TODO("提供返回值")
    }
}
