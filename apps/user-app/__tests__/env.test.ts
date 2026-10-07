import { colors } from '../src/theme/tokens';

// Native modules are not available in jest; screens are verified on the emulator.
test('design tokens expose the brand primary colour', () => {
  expect(colors.primary).toMatch(/^#[0-9A-F]{6}$/i);
});
