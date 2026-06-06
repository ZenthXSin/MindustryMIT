package com.mindustry.ide.tool.json.libs

import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Semaphore
import kotlinx.serialization.InternalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

@OptIn(InternalSerializationApi::class)
@Serializable
data class WikiSearchResult(val docs: List<WikiDoc>)

@OptIn(InternalSerializationApi::class)
@Serializable
data class WikiDoc(val location: String, val text: String, val title: String)

@OptIn(InternalSerializationApi::class)
@Serializable
data class FieldMeta(val name: String, val type: String, val defaultValue: String, val notes: String)

@OptIn(InternalSerializationApi::class)
@Serializable
data class TypeMeta(val type: String, val parentType: String, val fields: List<FieldMeta>)

open class DocFetch {
    companion object {
        var ASYNC_LIMIT = 5 // 并发数量
        var DELAY_TIME_MS = 1000L // 请求间隔时间（毫秒）
        const val ESTIMATE_TIME_MS = 500L // 预估单次请求时间（毫秒）
        var TEST_AMOUNT = -1 // 测试数量，-1表示全部
        var ONLY_TYPES = listOf<String>() // 仅获取指定类型，空列表表示全部
        const val BASE_URL = "https://mindustrygame.github.io/wiki/" // 基础URL
        var CONNECT_TIMEOUT_MS = 60000 // 连接超时时间（毫秒）
        var READ_TIMEOUT_MS = 60000 // 读取超时时间（毫秒）
        var MAX_RETRIES = 5 // 最大重试次数
        var RETRY_DELAY_MS = 3000L // 重试间隔时间（毫秒）
        var USE_PROXY = true // 是否使用代理
        var PROXY_HOST = "127.0.0.1" // 代理主机
        var PROXY_PORT = 10090 // 代理端口
    }


    protected var progressCallback: ((Int, Int, Int, Int) -> Unit)? = null

    init {
        disableSslVerification()
        setupProxy()
    }

    protected open fun setupProxy() {
        if (USE_PROXY) {
            System.setProperty("https.proxyHost", PROXY_HOST)
            System.setProperty("https.proxyPort", PROXY_PORT.toString())
            System.setProperty("http.proxyHost", PROXY_HOST)
            System.setProperty("http.proxyPort", PROXY_PORT.toString())
        }
    }

    open suspend fun execute(): List<TypeMeta> {
        val allDocs = fetchModdingDocs().distinctBy { it.title }

        val fetchDocs = if (ONLY_TYPES.isNotEmpty()) {
            allDocs.filter { it.title in ONLY_TYPES }
        } else {
            allDocs
        }

        if (fetchDocs.isEmpty()) {
            println("No docs needed to fetch meta.")
            return emptyList()
        }

        println("Found ${fetchDocs.size} modding docs.")
        println("Concurrency: $ASYNC_LIMIT")
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
        TODO("对于Android的适配")
//        val filePath = "./out/types/${meta.type}.json"
//        val file = File(filePath)
//        file.parentFile?.mkdirs()
//        file.writeText(kotlinx.serialization.json.Json {
//            prettyPrint = true
//            ignoreUnknownKeys = true
//        }.encodeToString(TypeMeta.serializer(), meta))
    }

    protected open suspend fun fetchAllMeta(docs: List<WikiDoc>): List<TypeMeta?> {
        val semaphore = Semaphore(ASYNC_LIMIT)
        var completed = 0
        var successCount = 0
        var failedCount = 0
        val total = docs.size

        updateProgress(0, total, 0, 0)

        return coroutineScope {
            docs.map { doc ->
                async {
                    semaphore.acquire()
                    try {
                        val meta = fetchTypeMeta(doc)
                        if (meta != null) {
                            successCount++
                        } else {
                            failedCount++
                        }
                        completed++
                        updateProgress(completed, total, successCount, failedCount)
                        meta
                    } catch (e: Exception) {
                        failedCount++
                        completed++
                        updateProgress(completed, total, successCount, failedCount)
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

        val percentage = (current.toFloat() / total * 100).toInt()
        val barLength = 30
        val filled = (barLength * current / total).toInt()
        val empty = barLength - filled
        val bar = "█".repeat(filled) + "░".repeat(empty)
        print("\r Progress: [$bar] ${percentage}% | $current/$total | Success: $success | Failed: $failed")
        System.out.flush()
        return listOf(percentage.toString(), success.toString(), failed.toString(), bar)
    }



    protected open fun fetchWithRetry(url: URL, retries: Int = MAX_RETRIES): String? {
        repeat(retries) { attempt ->
            try {
                val connection = url.openConnection() as HttpURLConnection
                connection.apply {
                    connectTimeout = CONNECT_TIMEOUT_MS
                    readTimeout = READ_TIMEOUT_MS
                    setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    setRequestProperty("Connection", "close")
                    instanceFollowRedirects = true
                }

                if (connection.responseCode == 200) {
                    return connection.inputStream.bufferedReader().readText()
                }
                connection.disconnect()
            } catch (e: Exception) {
                if (attempt < retries - 1) {
                    Thread.sleep(RETRY_DELAY_MS)
                }
            }
        }
        return null
    }

    protected open fun fetchTypeMeta(doc: WikiDoc): TypeMeta? {
        return try {
            val response = fetchWithRetry(URL(URL(BASE_URL), doc.location)) ?: return null
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

    protected open fun fetchModdingDocs(): List<WikiDoc> {
        return try {
            val response = fetchWithRetry(URL(URL(BASE_URL), "search/search_index.json")) ?: return emptyList()
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

    protected open fun disableSslVerification() {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate>? = null
            override fun checkClientTrusted(certs: Array<X509Certificate>, authType: String) {}
            override fun checkServerTrusted(certs: Array<X509Certificate>, authType: String) {}
        })

        val sc = SSLContext.getInstance("SSL")
        sc.init(null, trustAllCerts, SecureRandom())
        HttpsURLConnection.setDefaultSSLSocketFactory(sc.socketFactory)
        HttpsURLConnection.setDefaultHostnameVerifier { _, _ -> true }
    }
}
