package com.example.esp32pairingapp.network

import android.net.Network
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * HTTP client that can make requests through a specific Network.
 * Required for accessing ESP32 web server at 192.168.10.1 through the ESP32 WiFi network.
 */
class EspHttpClient {

    /**
     * Remove leading/trailing whitespace and invisible control characters
     * (e.g., \n, \r) that can sneak in from input fields.
     */
    private fun cleanInput(value: String): String {
        return value
            .trim()
            .replace(Regex("\\p{C}"), "") // removes control chars like \n \r \t etc.
    }

    /**
     * URL-encode so spaces/special chars are transmitted safely.
     */
    private fun encode(value: String): String {
        return URLEncoder.encode(value, "UTF-8")
    }

    /**
     * Performs HTTP GET request
     * @param url The full URL to request
     * @param network Optional network to bind request to (for ESP32 direct connection)
     * @param authToken Optional Bearer token for cloud backend (Authorization: Bearer &lt;token&gt;)
     * @return Response body as String
     */
    @RequiresApi(Build.VERSION_CODES.LOLLIPOP)
    fun get(url: String, network: Network? = null, authToken: String? = null): String {
        Log.d("EspHttpClient", "GET request to: $url")

        val urlObj = URL(url)
        val connection = if (network != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            network.openConnection(urlObj) as HttpURLConnection
        } else {
            urlObj.openConnection() as HttpURLConnection
        }

        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/json")
            if (!authToken.isNullOrBlank()) {
                connection.setRequestProperty("Authorization", "Bearer $authToken")
            }

            val responseCode = connection.responseCode
            Log.d("EspHttpClient", "Response code: $responseCode")

            if (responseCode == HttpURLConnection.HTTP_OK) {
                val reader = BufferedReader(InputStreamReader(connection.inputStream))
                val response = reader.use { it.readText() }
                Log.d("EspHttpClient", "Response: ${response.take(200)}")
                response
            } else {
                throw Exception("HTTP $responseCode: ${connection.responseMessage}")
            }
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Performs HTTP POST request
     * @param url The full URL to request
     * @param body The request body (JSON string)
     * @param contentType Content-Type header (default: application/json)
     * @param network Optional network to bind request to (for ESP32 direct connection)
     * @param authToken Optional Bearer token for cloud backend
     * @return Response body as String
     */
    @RequiresApi(Build.VERSION_CODES.LOLLIPOP)
    fun post(
        url: String,
        body: String = "",
        contentType: String = "application/json",
        network: Network? = null,
        authToken: String? = null
    ): String {
        Log.d("EspHttpClient", "POST request to: $url")
        Log.d("EspHttpClient", "Body: $body")

        val urlObj = URL(url)
        val connection = if (network != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            network.openConnection(urlObj) as HttpURLConnection
        } else {
            urlObj.openConnection() as HttpURLConnection
        }

        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Content-Type", contentType)
            connection.setRequestProperty("Accept", "application/json")
            if (!authToken.isNullOrBlank()) {
                connection.setRequestProperty("Authorization", "Bearer $authToken")
            }
            connection.doOutput = true

            if (body.isNotEmpty()) {
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(body)
                    writer.flush()
                }
            }

            val responseCode = connection.responseCode
            Log.d("EspHttpClient", "Response code: $responseCode")

            if (responseCode in 200..299) {
                BufferedReader(InputStreamReader(connection.inputStream)).use { reader ->
                    reader.readText()
                }
            } else {
                throw Exception("HTTP $responseCode: ${connection.responseMessage}")
            }
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Send SSID to ESP32 in the exact plain-text format required:
     * "SSID=[user ssid]"
     */
    @RequiresApi(Build.VERSION_CODES.LOLLIPOP)
    fun postNewSsid(
        baseUrl: String = "http://192.168.10.1",
        ssid: String,
        network: Network? = null
    ): String {
        val cleaned = cleanInput(ssid)
        val encoded = encode(cleaned)
        val body = "SSID=$encoded"
        return post(
            url = "$baseUrl/api/newssid",
            body = body,
            contentType = "application/x-www-form-urlencoded",
            network = network
        )
    }

    /**
     * Send password to ESP32 in the exact plain-text format required:
     * "pass=[user password]"
     */
    @RequiresApi(Build.VERSION_CODES.LOLLIPOP)
    fun postNewPass(
        baseUrl: String = "http://192.168.10.1",
        password: String,
        network: Network? = null
    ): String {
        val cleaned = cleanInput(password)
        val encoded = encode(cleaned)
        val body = "pass=$encoded"
        return post(
            url = "$baseUrl/api/newpass",
            body = body,
            contentType = "application/x-www-form-urlencoded",
            network = network
        )
    }
}
