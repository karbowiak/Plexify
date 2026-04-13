//! DSP processing chain.
//!
//! Blocks are processed in order: preamp → equalizer → postgain → limiter → volume.
//! Each block can be independently enabled/disabled.

pub mod biquad;
pub mod equalizer;
pub mod limiter;
pub mod postgain;
pub mod preamp;
pub mod traits;
pub mod volume;

use self::equalizer::{Equalizer, NUM_BANDS};
use self::limiter::Limiter;
use self::postgain::Postgain;
use self::preamp::Preamp;
use self::volume::Volume;

/// The complete DSP chain for the audio engine.
///
/// Unlike the JS engine which uses a dynamic list of DSPBlock trait objects,
/// we use concrete types here for zero-cost abstraction — the audio thread
/// processes these per-sample and they must be as fast as possible.
pub struct DspChain {
    pub preamp: Preamp,
    pub equalizer: Equalizer,
    pub postgain: Postgain,
    pub limiter: Limiter,
    pub volume: Volume,
}

impl DspChain {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            preamp: Preamp::new(),
            equalizer: Equalizer::new(sample_rate),
            postgain: Postgain::new(),
            limiter: Limiter::new(sample_rate),
            volume: Volume::new(),
        }
    }

    /// Process a buffer of interleaved f32 samples through the entire chain.
    pub fn process(&mut self, samples: &mut [f32], sample_rate: u32, channels: u16) {
        use traits::DspBlock;
        self.preamp.process(samples, sample_rate, channels);
        self.equalizer.process(samples, sample_rate, channels);
        self.postgain.process(samples, sample_rate, channels);
        self.limiter.process(samples, sample_rate, channels);
        self.volume.process(samples, sample_rate, channels);
    }

    /// Update sample rate on all blocks that need it.
    pub fn set_sample_rate(&mut self, rate: u32) {
        self.equalizer.set_sample_rate(rate);
        self.limiter.set_sample_rate(rate);
    }

    /// Reset all stateful blocks (call on seek / track change).
    pub fn reset(&mut self) {
        self.equalizer.reset();
    }

    // -- Convenience setters that match the JS engine API --

    pub fn set_preamp_db(&mut self, db: f32) {
        self.preamp.set_gain_db(db);
    }

    pub fn set_eq_enabled(&mut self, enabled: bool) {
        use traits::DspBlock;
        self.equalizer.set_enabled(enabled);
    }

    pub fn set_eq_gains(&mut self, gains_db: &[f32; NUM_BANDS]) {
        self.equalizer.set_gains(gains_db);
    }

    pub fn set_postgain_db(&mut self, db: f32) {
        self.postgain.set_gain_db(db);
    }

    pub fn set_volume(&mut self, gain: f32) {
        self.volume.set_gain(gain);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_chain_passthrough_at_defaults() {
        let mut chain = DspChain::new(44100);
        let mut samples = vec![0.5f32, -0.5, 0.3, -0.3, 0.1, -0.1];
        let orig = samples.clone();
        chain.process(&mut samples, 44100, 2);
        // At defaults (all flat, EQ disabled), output should equal input
        assert_eq!(samples, orig);
    }

    #[test]
    fn volume_at_half_halves_output() {
        let mut chain = DspChain::new(44100);
        chain.set_volume(0.5);
        let mut samples = vec![1.0f32, -1.0];
        chain.process(&mut samples, 44100, 2);
        assert!((samples[0] - 0.5).abs() < 1e-5);
        assert!((samples[1] - -0.5).abs() < 1e-5);
    }

    #[test]
    fn volume_at_zero_silences() {
        let mut chain = DspChain::new(44100);
        chain.set_volume(0.0);
        let mut samples = vec![1.0f32, -1.0, 0.5, -0.5];
        chain.process(&mut samples, 44100, 2);
        for s in &samples {
            assert_eq!(*s, 0.0);
        }
    }
}
