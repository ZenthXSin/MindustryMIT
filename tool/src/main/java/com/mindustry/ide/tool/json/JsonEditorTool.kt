package com.mindustry.ide.tool.json

import arc.struct.ObjectMap
import arc.util.Nullable

/**Json编辑工具封装，需实现日志输出*/
abstract class JsonEditorTool(val parser: JsonParser) {
    abstract fun error(message: String)
    abstract fun info(message: String)
    abstract fun warning(message: String)
    abstract fun debug(message: String)

    fun getClassByName(name: String): Class<*> {
        val ret = parser.classMap?.get(name)
        if (ret == null) {
            error("Class不存在: $name")
            return Nullable::class.java
        }
        return ret
    }

    fun getClassBuildByName(name: String): ClassBuild {
        return ClassBuild(getClassByName(name), parser)
    }

    protected lateinit var jsonWorkFile: JsonWorkFile

    /**Json文件创建流程封装
     * @param name 文件名
     * @param chooseClass 返回ClassData, 传入候选列表*/
    fun new(name: String, chooseClass: List<ClassData>.() -> ClassData): JsonWorkFile {
        jsonWorkFile = JsonWorkFile(name, parser).loadClassBuild {
            val classList = parser.classMap?.map {
                if (it.key != null) {
                    ClassData(it.key!!, parser)
                } else {
                    warning("Class不存在，使用Block\n$it")
                    ClassData("Block", parser)
                }
            } ?: listOf()

            if (classList.isEmpty()) {
                error("没有Class存在")
            }

            val classData = chooseClass(classList)

            info("新的Json项目: $name [${classData.name}]")

            ClassBuild(classData.classData, parser)
        }
        return jsonWorkFile
    }

    /**添加Field封装
     * @param choose Field选择
     * @param set 初始化FieldBuild*/
    fun addFieldBuild(choose: List<FieldBuild>.() -> FieldBuild, set: FieldBuild.() -> FieldBuild = { this }) {
        jsonWorkFile.classBuild.addFieldBuild {
            set(
                choose(
                    jsonWorkFile.classBuild.getAllFields().map {
                        FieldBuild(it, parser)
                    })
            )
        }}

    fun setFieldBuild(name: String, set: FieldBuild.() -> Unit) {
        val fieldBuild = jsonWorkFile.classBuild.getFieldBuildByName(name)
        if (fieldBuild != null) {
            fieldBuild.set()
        } else {
            error("Field不存在: $name")
        }
    }
}

class ClassData(var name: String, val parser: IJsonParser, var doc: String = "", var classData: Class<*> = Nullable::class.java) {
    init {
        classData = parser.classMap?.get(name) ?: Nullable::class.java
        doc = parser.getClassDoc(name)
    }

    override fun toString(): String {
        return """
            {
                "name": "$name",
                "doc": "$doc",
                "classData": "${classData.name}"
            }                   
        """.trimIndent()
    }
}


/**addFieldBuild扩展函数
 * @param choose Field选择
 * @param set 添加FieldBuild*/
fun ClassBuild.addFieldBuild(choose: List<FieldBuild>.() -> FieldBuild, set: FieldBuild.() -> FieldBuild) {
    addFieldBuild {
        set(
            choose(
                getAllFields().map {
                    FieldBuild(it, parser)
                })
        )
    }
}
