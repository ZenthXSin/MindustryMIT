package com.mindustry.ide.tool.json

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import java.net.InetSocketAddress


/**
 * 将JsonEditorTool封装成可调用的api
 * @author ZenXSin
 **/
class JsonApi {

    val toolManagers = mutableMapOf<String, Pair<JsonEditorTool, Tool>>()

    class Tool(val jet: JsonEditorTool) {
        fun getAllClass(): List<String> {
            return jet.parser.classMap?.keys()?.map { it.toString() } ?: listOf("JsonEditorTool列表为空，请先初始化")
        }

        fun getAllField(className: String): List<String> {
            return jet.parser.classMap?.get(className)?.fields?.map { it.name } ?: listOf("类 $className 不存在，请检查")
        }

        fun getFieldDoc(className: String, fieldName: String): String {
            return jet.parser.getFieldDoc(className, fieldName)
        }

        fun getFieldDefaultValue(className: String, fieldName: String): String {
            return jet.parser.getFieldDefaultValue(className, fieldName)
        }


    }

    class ToolData {
        val classDatas: MutableMap<Int, Tool> = mutableMapOf()
        val parser: JsonParser = JsonParser()
        private var nextId: Int = 0

        var error: (String) -> Unit = {}
        var info: (String) -> Unit = {}
        var warning: (String) -> Unit = {}
        var debug: (String) -> Unit = {}

        fun newClass(className: String): Int {
            val id = nextId++
            val tool = Tool(ApiJsonEditorTool(parser))
            classDatas[id] = tool
            debug("----------")
            debug("创建类: $className, ID: $id")
            debug("----------")
            return id
        }

        fun removeClass(classId: Int): Boolean {
            debug("----------")
            if (classDatas.containsKey(classId)) {
                debug("类 $classId 存在")
            } else {
                debug("类 $classId 不存在")
            }
            debug("删除类: $classId")
            debug("----------")
            return classDatas.remove(classId) != null
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

        class JsonApiWebSocketHandler(val toolData: ToolData, val port: Int) {
            private var server: Server? = null

            fun start() {
                if (server != null) {
                    println("WebSocket 服务器已在运行")
                    return
                }
                server = Server(InetSocketAddress(port))
                server?.start()
                println("WebSocket 服务器启动在端口: $port")
            }

            fun stop() {
                server?.let {
                    try {
                        it.stop(1000)
                        println("WebSocket 服务器已停止")
                    } catch (e: Exception) {
                        println("停止服务器失败: ${e.message}")
                    } finally {
                        server = null
                    }
                }
            }

            init {
                toolData.info = {
                    broadcast("")
                }
            }

            fun broadcast(message: String) {
                server?.broadcast(message)
                println("广播消息: $message")
            }

            class Server(address: InetSocketAddress) : WebSocketServer(address) {
                override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
                    println("客户端连接: ${conn.remoteSocketAddress}")
                }

                override fun onMessage(conn: WebSocket, message: String) {
                    println("收到消息: $message")
                    conn.send("Echo: $message")
                }

                override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
                    println("客户端断开: ${conn.remoteSocketAddress}, 原因: $reason")
                }

                override fun onError(conn: WebSocket?, ex: Exception) {
                    println("WebSocket 错误: ${ex.message}")
                }

                override fun onStart() {
                    println("WebSocket 服务器已启动")
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
 * @param strList 接收消息时解析的内容，按照wsType中input的顺序排列
 **/

@Serializable
data class WebSocketData(
    var wsType: WebSocketDataType,
    var content: String,
    var out: Boolean = false,
    var strList: MutableList<String> = mutableListOf()
) {
    init {
        if (!out) {
            val json = Json.parseToJsonElement(content)

            for (i in wsType.input) {
                when (i.second) {
                    DataType.String -> {
                        strList.add(json.jsonObject[i.first]!!.jsonPrimitive.content)
                    }

                    DataType.Int -> {
                        strList.add(json.jsonObject[i.first]!!.jsonPrimitive.content)
                    }

                    DataType.Float -> {
                        strList.add(json.jsonObject[i.first]!!.jsonPrimitive.content)
                    }

                    DataType.List -> {
                        val jsonArray = json.jsonObject[i.first]!!.jsonArray
                        strList.add(jsonArray.toString()) //[x1,x2]
                    }

                    DataType.Boolean -> {
                        strList.add(json.jsonObject[i.first]!!.jsonPrimitive.content)
                    }

                    DataType.Object -> TODO()
                }
            }
        } else {
            //TODO 暂时不知道些什么
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
    val input: List<Pair<String, DataType>> = listOf(),
    val output: List<Pair<String, DataType>> = listOf()
) {
    Log(listOf("text" to DataType.String)),
    AllClass(output = listOf("Class_List" to DataType.List)),
    AllField(listOf("Class_Name" to DataType.String), listOf("Field_List" to DataType.List))
}

enum class DataType {
    String, Int, Float, List, Boolean, Object
}

class InputData {
    var str: String = ""
    var int: Int = 0
    var float: Float = 0f
    var list: MutableList<InputData> = mutableListOf()
    var boolean: Boolean = false
    var obj: () -> Unit = {}
}

//Test
fun main() {

}