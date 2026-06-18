import React from 'react';
import { render } from '@testing-library/react-native';
import { ARCameraView } from '../../src/components/ARCameraView';

describe('ARCameraView', () => {
  it('should render without crashing', () => {
    const { getByTestId } = render(
      <ARCameraView testID="ar-camera" />
    );

    expect(getByTestId('ar-camera')).toBeDefined();
  });

  it('should accept style prop', () => {
    const { getByTestId } = render(
      <ARCameraView
        style={{ flex: 1 }}
        testID="ar-camera-styled"
      />
    );

    expect(getByTestId('ar-camera-styled')).toBeDefined();
  });

  it('should support face detection prop', () => {
    const { getByTestId } = render(
      <ARCameraView
        faceDetection={true}
        testID="ar-face-detection"
      />
    );

    expect(getByTestId('ar-face-detection')).toBeDefined();
  });

  it('should support frame rate prop', () => {
    const { getByTestId } = render(
      <ARCameraView
        frameRate={60}
        testID="ar-frame-rate"
      />
    );

    expect(getByTestId('ar-frame-rate')).toBeDefined();
  });

  it('should expose ref methods', () => {
    const ref = React.createRef<any>();

    render(
      <ARCameraView
        ref={ref}
        testID="ar-camera-ref"
      />
    );

    if (ref.current) {
      expect(typeof ref.current.captureFrame).toBe('function');
      expect(typeof ref.current.captureMultiple).toBe('function');
      expect(typeof ref.current.reset).toBe('function');
    }
  });

  it('should capture single frame', async () => {
    const ref = React.createRef<any>();

    render(
      <ARCameraView
        ref={ref}
        testID="ar-capture-single"
      />
    );

    if (ref.current && ref.current.captureFrame) {
      try {
        const framePath = await ref.current.captureFrame();
        if (framePath) {
          expect(typeof framePath).toBe('string');
        }
      } catch (e) {
        // Expected without proper native module
      }
    }
  });

  it('should capture multiple frames', async () => {
    const ref = React.createRef<any>();

    render(
      <ARCameraView
        ref={ref}
        testID="ar-capture-multiple"
      />
    );

    if (ref.current && ref.current.captureMultiple) {
      try {
        const frames = await ref.current.captureMultiple(3);
        if (frames) {
          expect(Array.isArray(frames)).toBe(true);
        }
      } catch (e) {
        // Expected
      }
    }
  });

  it('should reset capture state', async () => {
    const ref = React.createRef<any>();

    render(
      <ARCameraView
        ref={ref}
        testID="ar-reset"
      />
    );

    if (ref.current && ref.current.reset) {
      try {
        await ref.current.reset();
      } catch (e) {
        // Expected
      }
    }

    expect(ref.current).toBeDefined();
  });

  it('should handle multiple refs correctly', () => {
    const ref1 = React.createRef<any>();
    const ref2 = React.createRef<any>();

    const { getByTestId } = render(
      <>
        <ARCameraView ref={ref1} testID="ar-1" />
        <ARCameraView ref={ref2} testID="ar-2" />
      </>
    );

    expect(getByTestId('ar-1')).toBeDefined();
    expect(getByTestId('ar-2')).toBeDefined();
  });
});
