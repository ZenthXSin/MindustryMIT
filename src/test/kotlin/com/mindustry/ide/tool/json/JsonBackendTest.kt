package com.mindustry.ide.tool.json

import kotlin.test.Test
import kotlin.test.assertEquals

open class ApiTestBase

class ApiTestChild : ApiTestBase()

class ApiTestOther

class JsonBackendTest {
    private val format = JsonParser.jsonFormat

    @Test
    fun test() {

    }

    @Test
    fun classInstanceReturnsSubclassInstances() {
        val toolData = JsonApi.ToolData()
        toolData.registerClass("ApiTestBase", ApiTestBase::class.java)
        toolData.registerClass("ApiTestChild", ApiTestChild::class.java)
        toolData.classInstance.clear()
        toolData.classInstance["base-one"] = ApiTestBase()
        toolData.classInstance["child-one"] = ApiTestChild()
        toolData.classInstance["child-type"] = ApiTestChild::class.java
        toolData.classInstance["other-one"] = ApiTestOther()

        val baseReply = request(
            toolData,
            WebSocketDataType.ClassInstance,
            """{"Class_Name":"ApiTestBase"}"""
        )
        val childReply = request(
            toolData,
            WebSocketDataType.ClassInstance,
            """{"Class_Name":"ApiTestChild"}"""
        )

        assertEquals(
            listOf("base-one", "child-one", "child-type"),
            baseReply.dataList["Object_List"]?.list?.map { it.str }
        )
        assertEquals(
            listOf("child-one", "child-type"),
            childReply.dataList["Object_List"]?.list?.map { it.str }
        )
    }

    @Test
    fun classInstanceCanResolveClassFromStoredTypes() {
        val toolData = JsonApi.ToolData()
        toolData.classInstance.clear()
        toolData.classInstance["child-type"] = ApiTestChild::class.java

        val reply = request(
            toolData,
            WebSocketDataType.ClassInstance,
            """{"Class_Name":"ApiTestBase"}"""
        )

        assertEquals(listOf("child-type"), reply.dataList["Object_List"]?.list?.map { it.str })
    }

    private fun request(toolData: JsonApi.ToolData, type: WebSocketDataType, content: String): WebSocketData {
        val message = format.encodeToString(
            WebSocketData.serializer(),
            WebSocketData(type, content = content)
        )
        return format.decodeFromString(WebSocketData.serializer(), toolData.contentParsing(message))
    }
}
