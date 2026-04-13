/// Trait for a DSP processing block in the audio chain.
///
/// All blocks process interleaved f32 samples in-place.
/// The chain calls each enabled block in order: preamp → EQ → postgain → limiter → volume.
pub trait DspBlock: Send {
    fn set_enabled(&mut self, enabled: bool);

    /// Process interleaved audio samples in-place. `[L, R, L, R, ...]`
    fn process(&mut self, samples: &mut [f32], sample_rate: u32, channels: u16);
}
