import { useMemo, type ComponentType } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

type LivePlayerProps = {
  url: string;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

function hasNativeWebView(): boolean {
  try {
    return (
      TurboModuleRegistry.get('RNCWebViewModule') != null ||
      TurboModuleRegistry.get('RNCWebView') != null
    );
  } catch {
    return false;
  }
}

type WebViewComponent = ComponentType<{
  source: { uri: string };
  style?: StyleProp<ViewStyle>;
  allowsInlineMediaPlayback?: boolean;
  mediaPlaybackRequiresUserAction?: boolean;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  allowsFullscreenVideo?: boolean;
  setSupportMultipleWindows?: boolean;
  originWhitelist?: string[];
  onError?: (event: { nativeEvent: { description?: string } }) => void;
  onHttpError?: (event: { nativeEvent: { statusCode: number } }) => void;
}>;

/**
 * In-app MediaMTX WebRTC box via react-native-webview (after native rebuild).
 * Falls back to browser sheet only if the installed binary lacks WebView.
 */
export function LivePlayer({ url, onError, style }: LivePlayerProps) {
  const WebView = useMemo(() => {
    if (!hasNativeWebView()) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('react-native-webview').WebView as WebViewComponent;
    } catch {
      return null;
    }
  }, []);

  if (WebView) {
    return (
      <View style={[styles.frame, style]}>
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

  return (
    <View style={[styles.frame, styles.fallback, style]}>
      <Text style={styles.title}>Install required for in-app video</Text>
      <Text style={styles.body}>
        Your current app build doesn’t include WebView yet. After `npm run android`
        finishes installing, the live stream appears in this box automatically.
      </Text>
      <Text style={styles.url} numberOfLines={2}>
        {url}
      </Text>
      <PrimaryButton
        label="Open in browser (temporary)"
        onPress={() => {
          void WebBrowser.openBrowserAsync(url, {
            enableBarCollapsing: true,
            showInRecents: true,
          }).catch((error) => {
            onError?.(error instanceof Error ? error.message : String(error));
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 260,
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
  fallback: {
    padding: 20,
    gap: 12,
    justifyContent: 'center',
    overflow: 'visible',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 17,
    fontWeight: '600',
  },
  body: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
  },
  url: {
    color: '#64748b',
    fontSize: 12,
  },
});
