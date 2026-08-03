package com.example.esp32pairingapp.pairing

import kotlin.random.Random

object OtpGenerator {

    /**
     * Generates a random 8-digit numeric OTP.
     * Range: 10000000..99999999 (always 8 digits, no leading zero)
     */
    fun generate(): String {
        return Random.nextInt(10000000, 99999999).toString()
    }
}