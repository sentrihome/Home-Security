import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

type LivePlayerProps = {
  url: string;
  onError?: (message: string) => void;
};

/**
 * Renders MediaMTX's built-in WebRTC player page (`http://host:8889/cam`).
 * Native WHEP can replace this later if WebView proves flaky over Tailscale.
 */
export function LivePlayer({ url, onError }: LivePlayerProps) {
  return (
    <View style={styles.frame}>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        onError={(event) => {
          onError?.(event.nativeEvent.description || 'WebView failed to load stream');
        }}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= 400) {
            onError?.(`Stream page HTTP ${event.nativeEvent.statusCode}`);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 240,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});
