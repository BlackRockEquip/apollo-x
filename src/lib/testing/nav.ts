// 2026-11-12, user request: "at the moment we cater for transmission testing only, move it in a separate menu sidebar under testing
// called Transmissions, then add a menu item for Engines and another for Brakes and another for Torque Converters."
// The Testing sidebar group: one item per kind of component tested. Transmissions is the existing test sheets (its address stays
// /testing-reports so saved links and the job's Testing tab keep working); the other three are not set up yet and open a placeholder page.
// Every item is gated by the same Testing Reports module and Testing view permission.

export type TestingKindKey = "transmissions" | "engines" | "brakes" | "torque-converters";
export type TestingKind = { key: TestingKindKey; label: string; href: string; ready: boolean };

export const TESTING_KINDS: readonly TestingKind[] = [
  { key: "transmissions", label: "Transmissions", href: "/testing-reports", ready: true },
  { key: "engines", label: "Engines", href: "/testing-engines", ready: false },
  { key: "brakes", label: "Brakes", href: "/testing-brakes", ready: false },
  { key: "torque-converters", label: "Torque Converters", href: "/testing-torque-converters", ready: false },
];
