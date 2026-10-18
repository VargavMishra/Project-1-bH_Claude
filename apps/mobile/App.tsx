import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type RefAttributes,
} from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import { webUrl } from './src/config';

// react-native-webview 14.0.1 declares `class WebView<P = undefined>` with props
// `WebViewProps & P`. `X & undefined` is `never`, so no prop would type-check.
// Re-type the component with the props it really accepts; remove when fixed upstream.
const TypedWebView = WebView as unknown as ComponentType<WebViewProps & RefAttributes<WebView>>;

/**
 * Stage 2 shell: full-screen WebView showing the deployed website, Android back button
 * mapped to browser history, and a retry screen when the site cannot load.
 * Stage 6 adds the OAuth system-browser handoff and deep-link handling.
 */
export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Android hardware back: go back inside the website first; exit the app only at the start.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const retry = useCallback(() => {
    setLoadError(null);
    webViewRef.current?.reload();
  }, []);

  if (!webUrl) {
    return (
      <Message
        title="App not configured"
        body="EXPO_PUBLIC_WEB_URL was not set when this app was built."
      />
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <TypedWebView
        ref={webViewRef}
        source={{ uri: webUrl.toString() }}
        style={styles.webview}
        // localStorage must persist so the Supabase session survives app restarts.
        domStorageEnabled
        javaScriptEnabled
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onError={({ nativeEvent }) => setLoadError(nativeEvent.description)}
        onHttpError={({ nativeEvent }) =>
          setLoadError(`The website responded with HTTP ${nativeEvent.statusCode}.`)
        }
      />
      {loadError && (
        <View style={StyleSheet.absoluteFill}>
          <Message title="Can't reach ProfileSync" body={loadError} onRetry={retry} />
        </View>
      )}
    </View>
  );
}

function Message({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <View style={styles.message}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {onRetry && (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  webview: { flex: 1 },
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f6f7fb',
  },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8, color: '#161b26' },
  body: { fontSize: 15, textAlign: 'center', color: '#5a6275', marginBottom: 20 },
  button: {
    backgroundColor: '#1f4fd1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: { color: '#ffffff', fontWeight: '600' },
});
