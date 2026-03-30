import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // --- Constants ---
  // Exposed via getConstants(), available synchronously after module load
  getConstants(): {
    platform: string;
    appVersion: string;
    buildNumber: string;
  };

  // --- Synchronous method ---
  // Returns a greeting string synchronously (runs on JS thread)
  getDeviceName(): string;

  // --- Async / Promise method ---
  // Returns battery level as a promise (runs on native thread)
  getBatteryLevel(): Promise<number>;

  // --- Method with arguments returning a Promise ---
  // Computes a value on native side and returns it
  multiply(a: number, b: number): Promise<number>;

  // --- Callback method ---
  // Retrieves the device locale via a callback
  getDeviceLocale(callback: (locale: string) => void): void;

  // --- Event emitter support ---
  // Adds a native event listener (used by EventEmitter pattern)
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDeviceInfo');
