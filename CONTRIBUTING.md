# Contributing to Capture360

Thanks for your interest in contributing! This document will guide you through the process.

## Code of Conduct

Please read our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — we're committed to providing a welcoming, inclusive environment.

## Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR-USERNAME/capture360.git
cd capture360
npm install
```

### 2. Create a Branch

```bash
git checkout -b fix/your-issue-name
# or
git checkout -b feature/your-feature-name
```

Use descriptive branch names:
- `fix/` for bug fixes
- `feat/` for new features
- `docs/` for documentation
- `refactor/` for code cleanup
- `test/` for adding tests

### 3. Make Your Changes

- Follow the existing code style
- Add tests for new functionality
- Update docs if needed
- Keep commits atomic and descriptive

### 4. Run Tests & Linting

```bash
npm run lint        # Check code style
npm test            # Run all tests
npm test:coverage   # Check coverage
npx tsc --noEmit    # TypeScript check
```

All checks must pass before submitting a PR.

### 5. Commit & Push

```bash
git add .
git commit -m "fix: brief description of change"
git push origin fix/your-issue-name
```

Use conventional commits:
- `fix:` for bug fixes
- `feat:` for new features
- `docs:` for documentation
- `refactor:` for refactoring
- `test:` for tests
- `ci:` for CI/CD changes

### 6. Open a Pull Request

On GitHub:
1. Go to your fork
2. Click "New Pull Request"
3. Compare your branch to `main`
4. Fill out the PR template
5. Link related issues

## PR Requirements

Before your PR will be accepted:

- ✅ All CI checks pass (lint, tests, builds)
- ✅ Code coverage does not decrease
- ✅ Tests included for new functionality
- ✅ Documentation updated if needed
- ✅ Commit messages follow conventions
- ✅ No breaking changes without discussion

## Development Workflow

### Example: Fixing a Bug

```bash
# Start from main
git checkout main
git pull origin main

# Create fix branch
git checkout -b fix/gyro-not-working

# Make changes
# ... edit src/hooks/useAttitude.ts ...

# Add tests
# ... edit __tests__/hooks/useAttitude.test.ts ...

# Run tests
npm test -- __tests__/hooks/useAttitude.test.ts

# Lint and build
npm run lint
npm run prepare

# Commit
git add .
git commit -m "fix: useAttitude hook not subscribing to motion events"

# Push and create PR
git push origin fix/gyro-not-working
```

### Example: Adding a Feature

```bash
# Create feature branch
git checkout -b feat/livestream-panorama

# Implement feature
# ... add src/components/LivePanorama.tsx ...

# Add comprehensive tests
# ... add __tests__/components/LivePanorama.test.tsx ...

# Update README with example
# ... edit README.md ...

# Run full test suite
npm test
npm run lint
npm run prepare

# Commit
git add .
git commit -m "feat: add livestream panorama capture component"
git push origin feat/livestream-panorama
```

## Testing

### Writing Tests

1. **Hooks** → Use `renderHook` from `@testing-library/react-native`
2. **Components** → Use `render` from `@testing-library/react-native`
3. **Utils** → Standard Jest test cases

Example hook test:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useAttitude } from '../../src/hooks/useAttitude';

describe('useAttitude', () => {
  it('should return heading, pitch, roll', () => {
    const { result } = renderHook(() => useAttitude());

    expect(result.current).toHaveProperty('heading');
    expect(result.current).toHaveProperty('pitch');
    expect(result.current).toHaveProperty('roll');
  });
});
```

### Running Tests

```bash
npm test                    # Run all tests once
npm test -- --watch         # Watch mode
npm test -- --coverage      # With coverage report
npm test -- --testNamePattern="useAttitude"  # Specific test
```

## Code Style

### TypeScript

- Use strict mode
- Annotate function parameters and returns
- Use interfaces, not types (except for unions/primitives)
- Use meaningful variable names

```typescript
// ✅ Good
interface AttitudeData {
  heading: number;
  pitch: number;
  roll: number;
}

export function useAttitude(): AttitudeData {
  const [attitude, setAttitude] = useState<AttitudeData>(/* ... */);
  return attitude;
}

// ❌ Bad
export function useAttitude(): any {
  const att = useState(null);
  return att[0];
}
```

### Components

- Use functional components with hooks
- Keep components focused and single-purpose
- Pass props as interfaces
- Use ref forwarding when needed

```typescript
// ✅ Good
interface SphereViewerProps {
  source: ImageSourcePropType;
  enableGyro?: boolean;
  onPitch?: (pitch: number) => void;
}

const SphereViewer = forwardRef<SphereViewerRef, SphereViewerProps>(
  ({ source, enableGyro = true, onPitch }, ref) => {
    // implementation
  }
);

// ❌ Bad
const SphereViewer = ({ source, ...props }: any) => {
  // implementation
};
```

### Formatting

- Use Prettier (auto-formats on commit)
- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line objects

## Documentation

### Updating README

- Keep it concise but comprehensive
- Include code examples
- Update API reference if you change signatures
- Add your feature to the table of contents

### Adding JSDoc Comments

```typescript
/**
 * Capture a single panorama frame from the camera
 * @param quality - Image quality 0-100 (default: 95)
 * @returns Path to captured frame file
 * @throws Error if camera permission denied
 */
export async function captureFrame(quality: number = 95): Promise<string> {
  // implementation
}
```

## Issues & Discussions

### Reporting a Bug

Use the bug report template:

```markdown
**Describe the bug**
A clear description of what the bug is.

**Steps to reproduce**
1. Go to...
2. Click on...
3. See error...

**Expected behavior**
What should have happened.

**Actual behavior**
What actually happened.

**Environment**
- Device: iPhone 14 Pro / Samsung Galaxy S23
- OS: iOS 16 / Android 13
- Capture360 version: 1.0.10
```

### Requesting a Feature

Use the feature request template:

```markdown
**Is your feature related to a problem?**
Describe the problem.

**Describe the solution you'd like**
Clear description of what you want.

**Describe alternatives you've considered**
Other approaches explored.

**Additional context**
Any other context.
```

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Run full test suite
4. Create git tag: `git tag v1.0.X`
5. Push tag: `git push origin v1.0.X`
6. Publish to npm: `npm publish`
7. Create GitHub Release

## Getting Help

- 💬 Open a Discussion for questions
- 🐛 Open an Issue for bugs
- 📖 Check [README.md](README.md) and [INSTALLATION.md](INSTALLATION.md)
- 💭 Check closed issues/PRs for similar questions

## Recognition

Contributors are recognized in:
- [README.md](README.md) - Notable contributors
- Release notes - All PR authors
- GitHub - Automatically via commits/PRs

Thank you for contributing! 🎉
