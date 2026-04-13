//! Fade curve generation — equal-power (cos/sin) and linear.

use std::f32::consts::PI;

/// Generate an equal-power fade-out curve (cosine).
/// Values go from `start_gain` down to 0.
pub fn generate_fade_out(steps: usize, start_gain: f32) -> Vec<f32> {
    let steps = steps.max(2);
    let mut curve = Vec::with_capacity(steps);
    for i in 0..steps {
        let t = i as f32 / (steps - 1) as f32;
        curve.push((t * PI / 2.0).cos() * start_gain);
    }
    curve
}

/// Generate an equal-power fade-in curve (sine).
/// Values go from 0 up to `end_gain`.
pub fn generate_fade_in(steps: usize, end_gain: f32) -> Vec<f32> {
    let steps = steps.max(2);
    let mut curve = Vec::with_capacity(steps);
    for i in 0..steps {
        let t = i as f32 / (steps - 1) as f32;
        curve.push((t * PI / 2.0).sin() * end_gain);
    }
    curve
}

/// Generate a linear fade-out curve.
#[cfg(test)]
pub fn generate_linear_fade_out(steps: usize, start_gain: f32) -> Vec<f32> {
    let steps = steps.max(2);
    let mut curve = Vec::with_capacity(steps);
    for i in 0..steps {
        let t = i as f32 / (steps - 1) as f32;
        curve.push((1.0 - t) * start_gain);
    }
    curve
}

/// Compute the number of curve steps for a given duration.
/// Uses 100 control points per second, matching the JS engine.
pub fn steps_for_duration(duration_sec: f32) -> usize {
    (duration_sec * 100.0).ceil().max(2.0) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fade_out_starts_at_one_ends_at_zero() {
        let curve = generate_fade_out(100, 1.0);
        assert!((curve[0] - 1.0).abs() < 1e-5);
        assert!(curve[99].abs() < 1e-5);
    }

    #[test]
    fn fade_in_starts_at_zero_ends_at_one() {
        let curve = generate_fade_in(100, 1.0);
        assert!(curve[0].abs() < 1e-5);
        assert!((curve[99] - 1.0).abs() < 1e-5);
    }

    #[test]
    fn equal_power_property() {
        // For equal-power crossfade, sum of squares should be ~1.0 at each step
        let n = 100;
        let fade_out = generate_fade_out(n, 1.0);
        let fade_in = generate_fade_in(n, 1.0);
        for i in 0..n {
            let sum_sq = fade_out[i] * fade_out[i] + fade_in[i] * fade_in[i];
            assert!(
                (sum_sq - 1.0).abs() < 0.01,
                "sum of squares at step {} should be ~1.0, got {}",
                i, sum_sq
            );
        }
    }

    #[test]
    fn linear_fade_out_at_midpoint() {
        let curve = generate_linear_fade_out(101, 1.0);
        assert!((curve[50] - 0.5).abs() < 0.01);
    }

    #[test]
    fn min_steps_is_two() {
        let curve = generate_fade_out(0, 1.0);
        assert_eq!(curve.len(), 2);
        assert!((curve[0] - 1.0).abs() < 1e-5);
        assert!(curve[1].abs() < 1e-5);
    }

    #[test]
    fn steps_for_duration_values() {
        assert_eq!(steps_for_duration(1.0), 100);
        assert_eq!(steps_for_duration(0.5), 50);
        assert_eq!(steps_for_duration(0.0), 2); // min 2
        assert_eq!(steps_for_duration(4.0), 400);
    }
}
