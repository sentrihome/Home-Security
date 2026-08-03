package com.example.esp32pairingapp.pairing

import kotlin.random.Random

object PasswordGenerator {

    private const val DEFAULT_LENGTH = 16

    // A-Z + a-z + 0-9
    private const val CHARSET =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

    /**

    Generates a random alphanumeric password.
    WPA2 requires 8..63 chars; default is 16.*/
    fun generate(length: Int = DEFAULT_LENGTH): String {
        require(length in 8..63) {"Password length must be between 8 and 63 (WPA2 requirement)."}
        return (1..length).map { CHARSET[Random.nextInt(CHARSET.length)] }.joinToString("")}
}