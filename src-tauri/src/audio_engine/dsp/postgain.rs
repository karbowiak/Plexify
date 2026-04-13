//! Postgain — makeup gain applied after the EQ chain.

use super::traits::DspBlock;

pub struct Postgain {
    enabled: bool,
    gain_linear: f32,
}

impl Postgain {
    pub fn new() -> Self {
        Self {
            enabled: true,
            gain_linear: 1.0,
        }
    }

    pub fn set_gain_db(&mut self, db: f32) {
        self.gain_linear = 10.0_f32.powf(db / 20.0);
    }
}

impl DspBlock for Postgain {
    fn set_enabled(&mut self, enabled: bool) { self.enabled = enabled; }

    fn process(&mut self, samples: &mut [f32], _sample_rate: u32, _channels: u16) {
        if !self.enabled || (self.gain_linear - 1.0).abs() < 1e-7 {
            return;
        }
        for s in samples.iter_mut() {
            *s *= self.gain_linear;
        }
    }
}
