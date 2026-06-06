package com.mindustry.ide.tool.json.libs

import com.mindustry.ide.tool.json.IJsonParser

class TypeMap(private val parser: IJsonParser) {
    val types: MutableMap<String, Class<*>> = mutableMapOf()

    init {
        types.apply {
            put("String", String::class.java)
            put("Boolean", Boolean::class.java)
            put("Number", Int::class.java)
            put("Number", Float::class.java)
            put("Number", Double::class.java)
            put("Number", Long::class.java)
            put("Number", Short::class.java)
            parser.classMap?.forEach { entry ->
                put(entry.key ?: "", entry.value ?: Class.forName("java.lang.Object"))
            }
        }
    }
}
