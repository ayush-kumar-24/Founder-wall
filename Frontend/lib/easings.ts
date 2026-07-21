// The four easing personalities. Never invent a fifth without a fight.

// SUNRISE — very slow in, gentle out. For light and camera.
export function sunrise(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * c * (c * (c * 6 - 15) + 10); // smootherstep
}

// PAPER SETTLE — ease-out with a ~2% overshoot, then rest. For notes.
// Arrive, exceed by a breath, relax back. Never a bounce — an exhale.
export function paperSettle(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  const c1 = 0.35; // tuned for ≈2% overshoot. Never more.
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
}

// BREATH — long sine loop. For ambience. Phase in, amplitude out.
export function breath(time: number, period: number, amplitude: number): number {
  return Math.sin((time * Math.PI * 2) / period) * amplitude;
}

// THROW — anticipation, confident cruise, decelerating approach.
export function throwEase(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  if (c < 0.14) {
    // wind-up: nearly still, gathering itself
    return 0.03 * (c / 0.14) * (c / 0.14);
  }
  const k = (c - 0.14) / 0.86;
  // decelerating cruise
  return 0.03 + 0.97 * (1 - Math.pow(1 - k, 2.6));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// frame-rate independent damping
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// A gentle underdamped spring — paper has mass, and a hand lets go.
// Returns [nextValue, nextVelocity]. Tuned for ~3-4% overshoot.
export function spring(
  current: number,
  velocity: number,
  target: number,
  dt: number,
  stiffness = 52,
  dampingC = 9.5
): [number, number] {
  const clamped = Math.min(dt, 1 / 30); // stability under frame hitches
  const a = (target - current) * stiffness - velocity * dampingC;
  const v = velocity + a * clamped;
  return [current + v * clamped, v];
}
