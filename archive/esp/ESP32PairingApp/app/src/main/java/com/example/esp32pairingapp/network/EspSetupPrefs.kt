package com.example.esp32pairingapp.network

import android.content.Context

object EspSetupPrefs {
    private const val PREFS_NAME = "esp_setup_prefs"
    private const val KEY_RANDOM_PASS = "saved_random_password"

    fun getSavedRandomPassword(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_RANDOM_PASS, null)?.takeIf { it.isNotBlank() }
    }

    fun setSavedRandomPassword(context: Context, password: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_RANDOM_PASS, password).apply()
    }

    fun clearSavedRandomPassword(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(KEY_RANDOM_PASS).apply()
    }
}
