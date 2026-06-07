package com.mindustry.ide.tool.json

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class ApiTestItem(
    @JvmField var name: String = "",
    @JvmField var amount: Int = 0
)

class ApiTestBlock(
    @JvmField var health: Int = 0,
    @JvmField var name: String = "",
    @JvmField var items: Array<ApiTestItem> = emptyArray()
)

class JsonBackendTest {
    private val format = JsonParser.jsonFormat

    @Test
    fun stringValuesStayStringsAndAreEscaped() {
        val parser = JsonParser()
        val build = ClassBuild(ApiTestBlock::class.java, parser)
        val field = FieldBuild(ApiTestBlock::class.java.getField("name"), parser, ownerClassName = build.name)
        field.value.value = "true \"quoted\"\nline"
        build.addFieldBuild { field }

        val root = Json.parseToJsonElement(build.toJson()).jsonObject

        assertEquals("ApiTestBlock", root["type"]?.jsonPrimitive?.content)
        assertEquals("true \"quoted\"\nline", root["name"]?.jsonPrimitive?.content)
    }

    @Test
    fun numericFieldsUseFieldType() {
        val parser = JsonParser()
        val build = ClassBuild(ApiTestBlock::class.java, parser)
        val field = FieldBuild(ApiTestBlock::class.java.getField("health"), parser, ownerClassName = build.name)
        field.value.value = "123"
        build.addFieldBuild { field }

        val root = Json.parseToJsonElement(build.toJson()).jsonObject

        assertEquals("123", root["health"]?.jsonPrimitive?.content)
    }

    @Test
    fun addElementRejectsNonArrayFields() {
        val toolData = JsonApi.ToolData()
        toolData.registerClass("ApiTestBlock", ApiTestBlock::class.java)
        toolData.registerClass("ApiTestItem", ApiTestItem::class.java)
        val classId = toolData.newClass("ApiTestBlock")

        val reply = request(
            toolData,
            WebSocketDataType.AddElement,
            """{"Class_Id":$classId,"Field_Path":["health"],"Element_Type":"","Value":""}"""
        )

        assertFalse(reply.dataList["Success"]?.boolean ?: true)
    }

    @Test
    fun malformedRequestReturnsErrorReply() {
        val toolData = JsonApi.ToolData()
        val raw = """{"wsType":"AllField","content":"{}","out":false,"dataList":{}}"""

        val reply = format.decodeFromString(WebSocketData.serializer(), toolData.contentParsing(raw))

        assertEquals(WebSocketDataType.Error, reply.wsType)
        assertFalse(reply.dataList["Success"]?.boolean ?: true)
    }

    private fun request(toolData: JsonApi.ToolData, type: WebSocketDataType, content: String): WebSocketData {
        val message = format.encodeToString(
            WebSocketData.serializer(),
            WebSocketData(type, content = content)
        )
        return format.decodeFromString(WebSocketData.serializer(), toolData.contentParsing(message))
    }
}
