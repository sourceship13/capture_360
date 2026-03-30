/**
 * Bisetka Photosphere — React Native Turbo Module Example
 * Demonstrates every TurboModule pattern: constants, sync methods,
 * async/promise methods, callbacks, and native event emitting.
 *
 * @format
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  NativeEventEmitter,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import NativeDeviceInfo from './tm_specs/NativeDeviceInfo';

// ─── Constants (available synchronously at import time) ───
const constants = NativeDeviceInfo.getConstants();

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent isDarkMode={isDarkMode} />
    </SafeAreaProvider>
  );
}

function AppContent({isDarkMode}: {isDarkMode: boolean}) {
  const insets = useSafeAreaInsets();
  const bg = isDarkMode ? '#1a1a2e' : '#f0f4f8';
  const fg = isDarkMode ? '#e0e0e0' : '#1a1a2e';
  const cardBg = isDarkMode ? '#16213e' : '#ffffff';

  // ─── State for each example ───
  const [deviceName, setDeviceName] = useState<string>('—');
  const [batteryLevel, setBatteryLevel] = useState<string>('—');
  const [multiplyResult, setMultiplyResult] = useState<string>('—');
  const [locale, setLocale] = useState<string>('—');
  const [nativeEvent, setNativeEvent] = useState<string>('Waiting for events…');

  // ─── 1. Sync method ───
  const handleGetDeviceName = useCallback(() => {
    const name = NativeDeviceInfo.getDeviceName();
    setDeviceName(name);
  }, []);

  // ─── 2. Async / Promise method ───
  const handleGetBatteryLevel = useCallback(async () => {
    try {
      const level = await NativeDeviceInfo.getBatteryLevel();
      setBatteryLevel(`${(level * 100).toFixed(1)}%`);
    } catch (e: any) {
      setBatteryLevel(`Error: ${e.message}`);
    }
  }, []);

  // ─── 3. Promise with arguments ───
  const handleMultiply = useCallback(async () => {
    const result = await NativeDeviceInfo.multiply(6, 7);
    setMultiplyResult(`6 × 7 = ${result}`);
  }, []);

  // ─── 4. Callback method ───
  const handleGetLocale = useCallback(() => {
    NativeDeviceInfo.getDeviceLocale((loc: string) => {
      setLocale(loc);
    });
  }, []);

  // ─── 5. NativeEventEmitter listener ───
  useEffect(() => {
    const emitter = new NativeEventEmitter(NativeDeviceInfo);
    const sub = emitter.addListener('onDeviceEvent', (event) => {
      setNativeEvent(JSON.stringify(event));
    });
    return () => sub.remove();
  }, []);

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: bg}]}
      contentContainerStyle={{paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, paddingHorizontal: 20}}>
      <Text style={[styles.title, {color: fg}]}>🔧 TurboModule Examples</Text>
      <Text style={[styles.subtitle, {color: fg}]}>React Native {Platform.constants.reactNativeVersion?.major}.{Platform.constants.reactNativeVersion?.minor}.{Platform.constants.reactNativeVersion?.patch}</Text>

      {/* ─── Constants Card ─── */}
      <View style={[styles.card, {backgroundColor: cardBg}]}>
        <Text style={[styles.cardTitle, {color: fg}]}>📋 Constants (getConstants)</Text>
        <Text style={[styles.mono, {color: fg}]}>platform: {constants.platform}</Text>
        <Text style={[styles.mono, {color: fg}]}>appVersion: {constants.appVersion}</Text>
        <Text style={[styles.mono, {color: fg}]}>buildNumber: {constants.buildNumber}</Text>
      </View>

      {/* ─── Sync Method Card ─── */}
      <View style={[styles.card, {backgroundColor: cardBg}]}>
        <Text style={[styles.cardTitle, {color: fg}]}>⚡ Sync Method (getDeviceName)</Text>
        <Text style={[styles.mono, {color: fg}]}>{deviceName}</Text>
        <TouchableOpacity style={styles.button} onPress={handleGetDeviceName}>
          <Text style={styles.buttonText}>Call getDeviceName()</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Async Promise Card ─── */}
      <View style={[styles.card, {backgroundColor: cardBg}]}>
        <Text style={[styles.cardTitle, {color: fg}]}>🔋 Async Promise (getBatteryLevel)</Text>
        <Text style={[styles.mono, {color: fg}]}>{batteryLevel}</Text>
        <TouchableOpacity style={styles.button} onPress={handleGetBatteryLevel}>
          <Text style={styles.buttonText}>Call getBatteryLevel()</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Promise with Args Card ─── */}
      <View style={[styles.card, {backgroundColor: cardBg}]}>
        <Text style={[styles.cardTitle, {color: fg}]}>🧮 Promise with Args (multiply)</Text>
        <Text style={[styles.mono, {color: fg}]}>{multiplyResult}</Text>
        <TouchableOpacity style={styles.button} onPress={handleMultiply}>
          <Text style={styles.buttonText}>Call multiply(6, 7)</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Callback Card ─── */}
      <View style={[styles.card, {backgroundColor: cardBg}]}>
        <Text style={[styles.cardTitle, {color: fg}]}>📞 Callback (getDeviceLocale)</Text>
        <Text style={[styles.mono, {color: fg}]}>{locale}</Text>
        <TouchableOpacity style={styles.button} onPress={handleGetLocale}>
          <Text style={styles.buttonText}>Call getDeviceLocale()</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Event Emitter Card ─── */}
      <View style={[styles.card, {backgroundColor: cardBg}]}>
        <Text style={[styles.cardTitle, {color: fg}]}>📡 NativeEventEmitter</Text>
        <Text style={[styles.mono, {color: fg}]}>{nativeEvent}</Text>
        <Text style={[styles.hint, {color: fg}]}>
          Listening for "onDeviceEvent" from native side.
          Trigger by calling sendEvent() from native code.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  title: {fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 4},
  subtitle: {fontSize: 14, textAlign: 'center', marginBottom: 24, opacity: 0.6},
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  cardTitle: {fontSize: 16, fontWeight: '700', marginBottom: 12},
  mono: {fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, marginBottom: 4},
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {color: '#fff', fontWeight: '600', fontSize: 14},
  hint: {fontSize: 12, marginTop: 8, opacity: 0.5, fontStyle: 'italic'},
});

export default App;
