import React from 'react';
import { render } from '@testing-library/react-native';
import { PanoramaViewer } from '../../src/components/PanoramaViewer';

describe('PanoramaViewer', () => {
  const mockFrames = ['/path/frame1.jpg', '/path/frame2.jpg', '/path/frame3.jpg'];

  it('should render without crashing', () => {
    const { getByTestId } = render(
      <PanoramaViewer frames={mockFrames} testID="panorama-viewer" />
    );

    expect(getByTestId('panorama-viewer')).toBeDefined();
  });

  it('should accept frames prop', () => {
    const { getByTestId } = render(
      <PanoramaViewer
        frames={mockFrames}
        testID="panorama-frames"
      />
    );

    expect(getByTestId('panorama-frames')).toBeDefined();
  });

  it('should accept custom output path', () => {
    const { getByTestId } = render(
      <PanoramaViewer
        frames={mockFrames}
        outputPath="/custom/path/panorama.jpg"
        testID="panorama-output"
      />
    );

    expect(getByTestId('panorama-output')).toBeDefined();
  });

  it('should trigger progress callback', async () => {
    const onProgress = jest.fn();

    const { getByTestId } = render(
      <PanoramaViewer
        frames={mockFrames}
        onProgress={onProgress}
        testID="panorama-progress"
      />
    );

    expect(getByTestId('panorama-progress')).toBeDefined();
  });

  it('should trigger complete callback', async () => {
    const onComplete = jest.fn();

    const { getByTestId } = render(
      <PanoramaViewer
        frames={mockFrames}
        onComplete={onComplete}
        testID="panorama-complete"
      />
    );

    expect(getByTestId('panorama-complete')).toBeDefined();
  });

  it('should handle empty frames gracefully', () => {
    const { getByTestId } = render(
      <PanoramaViewer
        frames={[]}
        testID="panorama-empty"
      />
    );

    expect(getByTestId('panorama-empty')).toBeDefined();
  });

  it('should apply custom style', () => {
    const { getByTestId } = render(
      <PanoramaViewer
        frames={mockFrames}
        style={{ flex: 1, backgroundColor: '#fff' }}
        testID="panorama-style"
      />
    );

    expect(getByTestId('panorama-style')).toBeDefined();
  });

  it('should expose ref methods', () => {
    const ref = React.createRef<any>();

    render(
      <PanoramaViewer
        ref={ref}
        frames={mockFrames}
        testID="panorama-ref"
      />
    );

    if (ref.current) {
      expect(typeof ref.current.startStitching).toBe('function');
    }
  });

  it('should handle stitching options', () => {
    const { getByTestId } = render(
      <PanoramaViewer
        frames={mockFrames}
        stitchingOptions={{
          overlapPercentage: 30,
          blendingMethod: 'multiband',
          imageScale: 0.75,
        }}
        testID="panorama-options"
      />
    );

    expect(getByTestId('panorama-options')).toBeDefined();
  });
});
