package com.example.esp32pairingapp.pairing

sealed class PairingState {

    // App is not pairing
    data object Idle : PairingState()

    // Used when we're waiting for runtime permission (optional but useful)
    data object NeedsLocationPermission : PairingState()

    // Connecting to ESP32 using default credentials
    data class ConnectingDefault(val ssid: String) : PairingState()

    // Checking GET /api/status
    data object CheckingStatus : PairingState()

    // Creating and sending new password to POST /api/changepass
    data object ChangingPassword : PairingState()

    // ESP may reboot / restart AP, so we wait before reconnecting
    data class WaitingForRestart(val secondsRemaining: Int) : PairingState()

    // Reconnecting using the newly saved password
    data class ReconnectingWithNewPassword(val ssid: String) : PairingState()

    // Final check: GET /api/status again after reconnect
    data object VerifyingAfterReconnect : PairingState()

    // Pairing finished successfully
    data class Success(val ssid: String) : PairingState()

    // Something went wrong; show message to user
    data class Error(val message: String) : PairingState()
}