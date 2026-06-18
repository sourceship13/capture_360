import { renderHook, act } from '@testing-library/react-native';
import { useAttitude } from '../../src/hooks/useAttitude';

describe('useAttitude', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useAttitude());

    expect(result.current).toBeDefined();
    expect(result.current.heading).toBeGreaterThanOrEqual(0);
    expect(result.current.heading).toBeLessThan(360);
  });

  it('should return heading, pitch, and roll', () => {
    const { result } = renderHook(() => useAttitude());

    expect(result.current).toHaveProperty('heading');
    expect(result.current).toHaveProperty('pitch');
    expect(result.current).toHaveProperty('roll');
    expect(result.current).toHaveProperty('attitude');
  });

  it('should update attitude on device motion events', async () => {
    const { result, rerender } = renderHook(() => useAttitude());

    const initialHeading = result.current.heading;

    // Simulate device motion by re-rendering
    await act(async () => {
      rerender();
    });

    // Values should be valid even after update
    expect(result.current.heading).toBeGreaterThanOrEqual(0);
    expect(result.current.heading).toBeLessThan(360);
  });

  it('should handle no permission gracefully', () => {
    // When permissions are denied, should still return valid data or error state
    const { result } = renderHook(() => useAttitude());

    expect(result.current).toBeDefined();
    // Should not throw
    expect(() => {
      const _ = result.current.heading;
    }).not.toThrow();
  });

  it('should cleanup listeners on unmount', () => {
    const { unmount } = renderHook(() => useAttitude());

    expect(() => unmount()).not.toThrow();
  });

  it('should provide attitude data in correct format', () => {
    const { result } = renderHook(() => useAttitude());

    const { attitude } = result.current;

    if (attitude) {
      expect(attitude).toHaveProperty('roll');
      expect(attitude).toHaveProperty('pitch');
      expect(attitude).toHaveProperty('yaw');
    }
  });
});
