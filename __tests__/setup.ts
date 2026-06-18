// Test setup file
import '@testing-library/jest-native/extend-expect';

// Mock React Native modules
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  NativeModules: {
    RCTPhotosphereModule: {
      stitchFrames: jest.fn(),
      captureFrame: jest.fn(),
    },
    RCTVideoRecorderModule: {
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
    },
  },
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios,
  },
}));

// Mock device motion
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => ({
  __esModule: true,
  default: class MockNativeEventEmitter {
    addListener = jest.fn(() => jest.fn());
    removeListener = jest.fn();
    removeAllListeners = jest.fn();
  },
}));

// Suppress console warnings in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Cannot find native module') ||
        args[0].includes('ViewPropTypes will be removed'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
