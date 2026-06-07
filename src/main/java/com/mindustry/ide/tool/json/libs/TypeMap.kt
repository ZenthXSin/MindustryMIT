package com.mindustry.ide.tool.json.libs

import com.mindustry.ide.tool.json.IJsonParser

class TypeMap(private val parser: IJsonParser) {
    val types: MutableMap<String, Class<*>> = mutableMapOf()

    init {
        types.apply {
            put("String", String::class.java)
            put("Boolean", Boolean::class.java)
            put("Int", Int::class.java)
            put("Float", Float::class.java)
            put("Double", Double::class.java)
            put("Long", Long::class.java)
            put("Short", Short::class.java)
            put("Number", Double::class.java)
            parser.classMap?.forEach { entry ->
                put(entry.key ?: "", entry.value ?: Class.forName("java.lang.Object"))
            }
        }
    }
}
