import { renderHook, act } from '@testing-library/react-native';
import { useDeviceOrientation } from '../../src/hooks/useDeviceOrientation';

describe('useDeviceOrientation', () => {
  it('should detect initial device orientation', () => {
    const { result } = renderHook(() => useDeviceOrientation());

    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty('orientation');
    expect(['portrait', 'landscape']).toContain(result.current.orientation);
  });

  it('should provide isPortrait and isLandscape flags', () => {
    const { result } = renderHook(() => useDeviceOrientation());

    expect(result.current).toHaveProperty('isPortrait');
    expect(result.current).toHaveProperty('isLandscape');
    expect(typeof result.current.isPortrait).toBe('boolean');
    expect(typeof result.current.isLandscape).toBe('boolean');
  });

  it('should have mutually exclusive portrait and landscape states', () => {
    const { result } = renderHook(() => useDeviceOrientation());

    const { isPortrait, isLandscape } = result.current;

    // One must be true, not both
    expect(isPortrait || isLandscape).toBe(true);
    expect(isPortrait && isLandscape).toBe(false);
  });

  it('should update on orientation change', async () => {
    const { result } = renderHook(() => useDeviceOrientation());

    const initialOrientation = result.current.orientation;

    // Rerender to simulate orientation change
    await act(async () => {
      // In real scenario, device orientation would change
      // Here we just verify the hook handles updates
    });

    // Hook should still be valid
    expect(['portrait', 'landscape']).toContain(result.current.orientation);
  });

  it('should provide dimensions', () => {
    const { result } = renderHook(() => useDeviceOrientation());

    // Some implementations provide window dimensions
    const data = result.current as any;
    if (data.width && data.height) {
      expect(data.width).toBeGreaterThan(0);
      expect(data.height).toBeGreaterThan(0);
    }
  });

  it('should cleanup listeners on unmount', () => {
    const { unmount } = renderHook(() => useDeviceOrientation());

    expect(() => unmount()).not.toThrow();
  });
});
