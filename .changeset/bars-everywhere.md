---
"@schmooky/zvuk": patch
---

Spectrum bars on every interactive docs demo (was: time-domain oscilloscope), plus a `bars-stereo` variant for the SpatialPanner.

Bars read better than the oscilloscope across the whole site — pulses with the music, makes filter sweeps and pitch shifts visibly obvious, looks consistent. The 13 non-spatial demos (`BusFader`, `CompressorPlayground`, `CrossfadeDemo`, `MixerDashboard`, `ParameterModulator`, `PitchStretch`, `ReverbWet`, `SlotReel`, `SnapshotCrossfade`, `SoundCard`, `VoiceJitter`, `VoiceLimit`, `CrossfadeDemo`) all use the standard mono spectrum.

`SpatialPanner` is the one demo where the mono sum hides what's happening — pan all the way left and the summed spectrum is identical to centred. So the panner now uses a new `bars-stereo` variant: `<Waveform>` splits the source through a `ChannelSplitterNode` and runs an analyser per channel, rendering L and R spectra side-by-side with a hairline divider. As you drag the puck, you watch the L bars grow while the R bars shrink, which is the actual demo.

No public API change; docs-site polish only.
