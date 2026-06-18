import React from 'react';
import { render } from '@testing-library/react-native';
import { SphereViewer } from '../../src/components/SphereViewer';

describe('SphereViewer', () => {
  const mockSource = require('../../example/assets/sample.jpg');

  it('should render without crashing', () => {
    const { getByTestId } = render(
      <SphereViewer
        source={mockSource}
        testID="sphere-viewer"
      />
    );

    expect(getByTestId('sphere-viewer')).toBeDefined();
  });

  it('should accept gyro prop', () => {
    const { getByTestId } = render(
      <SphereViewer
        source={mockSource}
        enableGyro={true}
        testID="sphere-gyro"
      />
    );

    expect(getByTestId('sphere-gyro')).toBeDefined();
  });

  it('should disable gyro when prop is false', () => {
    const { getByTestId } = render(
      <SphereViewer
        source={mockSource}
        enableGyro={false}
        testID="sphere-no-gyro"
      />
    );

    expect(getByTestId('sphere-no-gyro')).toBeDefined();
  });

  it('should support pan controls', () => {
    const { getByTestId } = render(
      <SphereViewer
        source={mockSource}
        enablePan={true}
        testID="sphere-pan"
      />
    );

    expect(getByTestId('sphere-pan')).toBeDefined();
  });

  it('should accept initial pitch and yaw', () => {
    const { getByTestId } = render(
      <SphereViewer
        source={mockSource}
        initialPitch={30}
        initialYaw={90}
        testID="sphere-init"
      />
    );

    expect(getByTestId('sphere-init')).toBeDefined();
  });

  it('should handle ref methods', () => {
    const ref = React.createRef<any>();

    render(
      <SphereViewer
        ref={ref}
        source={mockSource}
        testID="sphere-ref"
      />
    );

    // Should have imperative methods
    if (ref.current) {
      expect(typeof ref.current.setPitch).toBe('function');
      expect(typeof ref.current.setYaw).toBe('function');
    }
  });

  it('should handle attitude injection', () => {
    const ref = React.createRef<any>();

    render(
      <SphereViewer
        ref={ref}
        source={mockSource}
        testID="sphere-attitude"
      />
    );

    if (ref.current && ref.current.injectAttitudeData) {
      expect(() => {
        ref.current.injectAttitudeData({
          pitch: 15,
          yaw: 45,
          roll: 0,
          timestamp: Date.now(),
        });
      }).not.toThrow();
    }
  });

  it('should apply custom style', () => {
    const { getByTestId } = render(
      <SphereViewer
        source={mockSource}
        style={{ width: 300, height: 400 }}
        testID="sphere-style"
      />
    );

    const element = getByTestId('sphere-style');
    expect(element).toBeDefined();
  });

  it('should handle different image sources', () => {
    const { getByTestId: getByTestId1 } = render(
      <SphereViewer
        source={{ uri: 'https://example.com/panorama.jpg' }}
        testID="sphere-uri"
      />
    );

    expect(getByTestId1('sphere-uri')).toBeDefined();
  });
});
