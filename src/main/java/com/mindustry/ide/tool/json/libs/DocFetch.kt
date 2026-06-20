package com.mindustry.ide.tool.json.libs


import com.mindustry.ide.tool.json.FieldMeta
import com.mindustry.ide.tool.json.TypeMeta
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Semaphore
import kotlinx.serialization.InternalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URI
import java.net.URL
import java.util.concurrent.atomic.AtomicInteger

@OptIn(InternalSerializationApi::class)
@Serializable
data class WikiSearchResult(val docs: List<WikiDoc>)

@OptIn(InternalSerializationApi::class)
@Serializable
data class WikiDoc(val location: String, val text: String, val title: String)

data class DocFetchConfig(
    val asyncLimit: Int = DocFetch.ASYNC_LIMIT,
    val onlyTypes: List<String> = DocFetch.ONLY_TYPES,
    val baseUrl: String = DocFetch.BASE_URL,
    val connectTimeoutMs: Int = DocFetch.CONNECT_TIMEOUT_MS,
    val readTimeoutMs: Int = DocFetch.READ_TIMEOUT_MS,
    val maxRetries: Int = DocFetch.MAX_RETRIES,
    val retryDelayMs: Long = DocFetch.RETRY_DELAY_MS,
    val proxy: Proxy? = if (DocFetch.USE_PROXY) {
        Proxy(Proxy.Type.HTTP, InetSocketAddress(DocFetch.PROXY_HOST, DocFetch.PROXY_PORT))
    } else {
        null
    }
)

open class DocFetch(private val config: DocFetchConfig = DocFetchConfig()) {
    companion object {
        var ASYNC_LIMIT = 12 // 并发数量
        const val ESTIMATE_TIME_MS = 500L // 预估单次请求时间（毫秒）
        var TEST_AMOUNT = -1 // 测试数量，-1表示全部
        var ONLY_TYPES = listOf<String>() // 仅获取指定类型，空列表表示全部
        const val BASE_URL = "https://mindustrygame.github.io/wiki/" // 基础URL
        var CONNECT_TIMEOUT_MS = 60000 // 连接超时时间（毫秒）
        var READ_TIMEOUT_MS = 60000 // 读取超时时间（毫秒）
        var MAX_RETRIES = 5 // 最大重试次数
        var RETRY_DELAY_MS = 3000L // 重试间隔时间（毫秒）
        var USE_PROXY = false // 是否使用代理
        var PROXY_HOST = "127.0.0.1" // 代理主机
        var PROXY_PORT = 10090 // 代理端口
    }

    protected var progressCallback: ((Int, Int, Int, Int) -> Unit)? = null

    open suspend fun execute(): List<TypeMeta> {
        val allDocs = fetchModdingDocs().distinctBy { it.title }

        val fetchDocs = if (config.onlyTypes.isNotEmpty()) {
            allDocs.filter { it.title in config.onlyTypes }
        } else {
            allDocs
        }

        if (fetchDocs.isEmpty()) {
            println("No docs needed to fetch meta.")
            return emptyList()
        }

        println("Found ${fetchDocs.size} modding docs.")
        println("Concurrency: ${config.asyncLimit}")
        println()

        val results = fetchAllMeta(fetchDocs)
        val successResults = results.filterNotNull()

        successResults.forEach { meta ->
            saveTypeMeta(meta)
        }

        val failedCount = results.count { it == null }

        println("\n\nDone. Success: ${successResults.size}, Failed: $failedCount")

        return successResults
    }

    protected open fun saveTypeMeta(meta: TypeMeta) {
        // 默认不落盘，由调用方覆盖保存策略。
//        val filePath = "./out/types/${meta.type}.json"
//        val file = File(filePath)
//        file.parentFile?.mkdirs()
//        file.writeText(kotlinx.serialization.json.Json {
//            prettyPrint = true
//            ignoreUnknownKeys = true
//        }.encodeToString(TypeMeta.serializer(), meta))
    }

    protected open suspend fun fetchAllMeta(docs: List<WikiDoc>): List<TypeMeta?> {
        val semaphore = Semaphore(config.asyncLimit.coerceAtLeast(1))
        val completed = AtomicInteger()
        val successCount = AtomicInteger()
        val failedCount = AtomicInteger()
        val total = docs.size

        updateProgress(0, total, 0, 0)

        return coroutineScope {
            docs.map { doc ->
                async {
                    semaphore.acquire()
                    try {
                        val meta = fetchTypeMeta(doc)
                        if (meta != null) {
                            successCount.incrementAndGet()
                        } else {
                            failedCount.incrementAndGet()
                        }
                        val current = completed.incrementAndGet()
                        updateProgress(current, total, successCount.get(), failedCount.get())
                        meta
                    } catch (e: Exception) {
                        val failed = failedCount.incrementAndGet()
                        val current = completed.incrementAndGet()
                        updateProgress(current, total, successCount.get(), failed)
                        null
                    } finally {
                        semaphore.release()
                    }
                }
            }.awaitAll()
        }
    }
    /**
     * 更新进度并生成进度条显示信息
     *
     * @return 包含进度信息的字符串列表，按顺序为：
     *
     *         - [0]: 完成百分比（整数形式）
     *         - [1]: 成功数量
     *         - [2]: 失败数量
     *         - [3]: 进度条字符串（由 █ 和 ░ 组成）
     */
    protected open fun updateProgress(current: Int, total: Int, success: Int, failed: Int): List<String> {
        progressCallback?.invoke(current, total, success, failed)

        val percentage = if (total <= 0) 100 else (current.toFloat() / total * 100).toInt()
        val barLength = 30
        val filled = if (total <= 0) barLength else (barLength * current / total).coerceIn(0, barLength)
        val empty = barLength - filled
        val bar = "█".repeat(filled) + "░".repeat(empty)
        print("\r Progress: [$bar] ${percentage}% | $current/$total | Success: $success | Failed: $failed")
        System.out.flush()
        return listOf(percentage.toString(), success.toString(), failed.toString(), bar)
    }



    protected open suspend fun fetchWithRetry(url: URL, retries: Int = config.maxRetries): String? {
        repeat(retries) { attempt ->
            try {
                val body = withContext(Dispatchers.IO) {
                    val connection = (config.proxy?.let { url.openConnection(it) } ?: url.openConnection()) as HttpURLConnection
                    try {
                        connection.apply {
                            connectTimeout = config.connectTimeoutMs
                            readTimeout = config.readTimeoutMs
                            setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                            setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                            setRequestProperty("Connection", "close")
                            instanceFollowRedirects = true
                        }

                        if (connection.responseCode == 200) {
                            connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                        } else {
                            null
                        }
                    } finally {
                        connection.disconnect()
                    }
                }
                if (body != null) return body
            } catch (e: Exception) {
                if (attempt < retries - 1) {
                    delay(config.retryDelayMs)
                }
            }
        }
        return null
    }

    protected open suspend fun fetchTypeMeta(doc: WikiDoc): TypeMeta? {
        return try {
            val response = fetchWithRetry(URI(config.baseUrl).resolve(doc.location).toURL()) ?: return null
            val dom = Jsoup.parse(response)

            val extendElem = dom.selectFirst("em a") ?: return null
            val table = dom.selectFirst("table") ?: return null

            TypeMeta(
                type = doc.title,
                parentType = extendElem.text(),
                fields = parseTable(table)
            )
        } catch (e: Exception) {
            null
        }
    }

    protected open suspend fun fetchModdingDocs(): List<WikiDoc> {
        return try {
            val response = fetchWithRetry(URI(config.baseUrl).resolve("search/search_index.json").toURL()) ?: return emptyList()
            val json = Json {
                ignoreUnknownKeys = true
            }
            val result = json.decodeFromString<WikiSearchResult>(response)
            result.docs.filter { it.location.contains("Modding") }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    protected open fun parseTable(table: Element): List<FieldMeta> {
        return table.select("tr").drop(1).mapNotNull { row ->
            val cells = row.select("td, th")
            if (cells.size < 4) null
            else FieldMeta(
                name = cells[0].text().trim(),
                type = cells[1].text().trim(),
                defaultValue = cells[2].text().trim(),
                notes = cells[3].text().trim()
            )
        }
    }

}
