package com.example.esp32pairingapp.clips

import android.net.Uri
import android.util.Log
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

@Composable
fun HlsPlayerView(playlistUrl: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var playerError by remember(playlistUrl) { mutableStateOf<String?>(null) }
    var isBuffering by remember(playlistUrl) { mutableStateOf(true) }

    // Keyed on playlistUrl so the player is re-created if the URL changes.
    val exoPlayer = remember(playlistUrl) {
        ExoPlayer.Builder(context).build().apply {
            addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    Log.e("HlsPlayerView", "Playback error: ${error.message}", error)
                }
            })
            val mediaItem = MediaItem.Builder()
                .setUri(Uri.parse(playlistUrl))
                .setMimeType(MimeTypes.APPLICATION_M3U8)
                .build()
            setMediaItem(mediaItem)
            prepare()
            playWhenReady = true
        }
    }

    DisposableEffect(playlistUrl) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_BUFFERING -> isBuffering = true
                    Player.STATE_READY     -> { isBuffering = false; playerError = null }
                    Player.STATE_ENDED     -> isBuffering = false
                    Player.STATE_IDLE      -> isBuffering = false
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                isBuffering = false
                playerError = "Stream unavailable: ${error.message}"
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    Box(modifier = modifier) {
        AndroidView(
            factory = { ctx -> PlayerView(ctx).apply { player = exoPlayer } },
            modifier = Modifier.fillMaxSize()
        )
        when {
            playerError != null ->
                Text(
                    text = playerError!!,
                    modifier = Modifier.align(Alignment.Center)
                )
            isBuffering ->
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        }
    }
}
