import type { Instrument, Envelope } from "../types";
import { midiToFrequency } from "../utils";

export class InstrumentNode {
  private context: AudioContext;
  private output: GainNode;
  private gainNode: GainNode;
  private instrument: Instrument;
  public sampleBuffer: AudioBuffer | null = null;

  // Voice pool structure
  private voicePool: {
    oscillator: OscillatorNode | AudioBufferSourceNode | null;
    gain: GainNode;
    voiceFilter: BiquadFilterNode;
    pan: StereoPannerNode;
    filterEnvelope: GainNode;
    filterModSource: ConstantSourceNode;
    midiNote: number | null;
    startTime: number;
    isActive: boolean;
    cleanupTimeout: number | null; // Track cleanup timeout ID
  }[] = [];

  constructor(context: AudioContext, output: GainNode, instrument: Instrument) {
    this.context = context;
    this.output = output;
    this.instrument = instrument;

    // Create master gain node for instrument volume
    this.gainNode = context.createGain();
    this.gainNode.gain.value = isFinite(instrument.volume)
      ? instrument.volume
      : 1;
    this.gainNode.connect(this.output);

    console.log("[InstrumentNode] Created with initial settings:", {
      volume: instrument.volume,
      maxVoices: instrument.maxVoices ?? 16,
    });

    // Initialize voice pool with maximum voices
    this.initializeVoicePool();
  }

  private initializeVoicePool() {
    // Clear existing pool
    this.voicePool.forEach((voice) => {
      if (voice.oscillator) {
        try {
          voice.oscillator.stop();
          voice.oscillator.disconnect();
        } catch (e) {
          console.warn("[InstrumentNode] Error cleaning up oscillator:", e);
        }
      }

      // Cleanup all audio nodes
      try {
        voice.gain.disconnect();
        voice.voiceFilter.disconnect();
        voice.filterEnvelope.disconnect();
        voice.filterModSource.stop();
        voice.filterModSource.disconnect();
      } catch (e) {
        console.warn("[InstrumentNode] Error cleaning up voice nodes:", e);
      }

      // Clear references
      voice.oscillator = null;
      voice.midiNote = null;
      voice.isActive = false;
    });

    this.voicePool = [];

    // Create new voices
    const maxVoices = this.instrument.maxVoices ?? 16;
    console.log("[InstrumentNode] Initializing voice pool:", { maxVoices });
    for (let i = 0; i < maxVoices; i++) {
      const voice = this.createVoice();
      this.voicePool.push(voice);
    }
  }

  private createVoice() {
    // Create voice filter (replaces main filter)
    const voiceFilter = this.context.createBiquadFilter();
    voiceFilter.type = this.instrument.filter.type;
    voiceFilter.frequency.value = this.instrument.filter.frequency;
    voiceFilter.Q.value = this.instrument.filter.resonance;

    // Create voice gain (for amplitude envelope)
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, this.context.currentTime); // Start muted

    // Create voice pan
    const pan = this.context.createStereoPanner();
    pan.pan.value = isFinite(this.instrument.pan) ? this.instrument.pan : 0;

    // Create filter envelope
    const filterEnvelope = this.context.createGain();
    filterEnvelope.gain.setValueAtTime(0, this.context.currentTime);

    // Create filter modulation source
    const filterModSource = this.context.createConstantSource();
    filterModSource.offset.value = 1; // Base value for modulation

    // Set up voice routing:
    // OSC -> FILTER (+FLT ENV MOD) -> VOICE_GAIN * (AMP ENV MOD) -> VOICE PAN -> MASTER GAIN -> OUTPUT
    filterModSource.connect(filterEnvelope);
    filterEnvelope.connect(voiceFilter.frequency);
    voiceFilter.connect(gain);
    gain.connect(pan);
    pan.connect(this.gainNode);
    filterModSource.start();

    console.log("[InstrumentNode] Created voice with routing:", {
      routing: "OSC -> FILTER(+ENV) -> GAIN(+ENV) -> PAN -> MASTER -> OUT",
    });

    return {
      oscillator: null as any,
      gain,
      voiceFilter,
      pan,
      filterEnvelope,
      filterModSource,
      midiNote: null,
      startTime: 0,
      isActive: false,
      cleanupTimeout: null,
    };
  }

  private initializeVoice(
    voice: (typeof this.voicePool)[0],
    midiNote: number,
    time: number
  ): OscillatorNode | AudioBufferSourceNode {
    // Cancel any pending cleanup
    if (voice.cleanupTimeout !== null) {
      clearTimeout(voice.cleanupTimeout);
      voice.cleanupTimeout = null;
    }

    // 0. Ensure voice is muted
    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setValueAtTime(0, time);

    // 1. Create and tune oscillator
    if (voice.oscillator instanceof OscillatorNode) {
      voice.oscillator.frequency.value = midiToFrequency(midiNote);
    } else {
      const newOscillator = this.createOscillator(midiNote);
      newOscillator.connect(voice.voiceFilter);
      voice.oscillator = newOscillator;
    }

    // 2. Reset filter envelope
    voice.filterEnvelope.gain.cancelScheduledValues(time);
    voice.filterEnvelope.gain.setValueAtTime(0, time);

    // Set base filter frequency and calculate modulation range
    const baseFreq = this.instrument.filter.frequency;
    const maxModulation = 10000; // Maximum modulation in Hz
    const modulationRange =
      this.instrument.filter.envelopeAmount * maxModulation;

    // Set initial filter frequency and modulation source
    voice.voiceFilter.frequency.setValueAtTime(baseFreq, time);
    voice.filterModSource.offset.setValueAtTime(modulationRange, time);

    // Update voice state
    voice.midiNote = midiNote;
    voice.startTime = this.context.currentTime;
    voice.isActive = true;

    console.log("[InstrumentNode] Initialized voice:", {
      midiNote,
      frequency:
        voice.oscillator instanceof OscillatorNode
          ? voice.oscillator.frequency.value
          : "N/A",
      baseFilterFreq: baseFreq,
      modulationRange,
      envelopeAmount: this.instrument.filter.envelopeAmount,
    });

    return voice.oscillator;
  }

  // Set sample buffer for sampler oscillator type
  setSampleBuffer(buffer: AudioBuffer) {
    this.sampleBuffer = buffer;
  }

  // Get sample buffer for waveform visualization
  getSampleBuffer(): AudioBuffer | null {
    return this.sampleBuffer;
  }

  // Get current instrument state
  getInstrument(): Instrument {
    return this.instrument;
  }

  // Apply envelope to a parameter
  private applyEnvelope(
    param: AudioParam,
    envelope: Envelope,
    baseValue: number,
    amount: number,
    time: number = this.context.currentTime
  ) {
    const now = time;

    // For filter envelope, baseValue is 0 and amount controls the modulation depth
    param.cancelScheduledValues(now);
    param.setValueAtTime(baseValue, now);

    console.log("[InstrumentNode] Applying envelope:", {
      type: envelope.type,
      baseValue,
      amount,
      time: now,
    });

    switch (envelope.type) {
      case "ad":
        // Attack - go to full modulation
        param.linearRampToValueAtTime(1.0, now + envelope.attack);
        // Decay - back to zero
        param.linearRampToValueAtTime(
          0,
          now + envelope.attack + envelope.decay
        );
        break;

      case "ar":
        // Attack - go to full modulation
        param.linearRampToValueAtTime(1.0, now + envelope.attack);
        // Release - back to zero
        param.linearRampToValueAtTime(
          0,
          now + envelope.attack + envelope.release
        );
        break;

      case "adsr":
        // Attack - go to full modulation
        param.linearRampToValueAtTime(1.0, now + envelope.attack);
        // Decay to sustain level
        param.linearRampToValueAtTime(
          envelope.sustain,
          now + envelope.attack + envelope.decay
        );
        break;
    }

    return param;
  }

  // Apply amplitude envelope with velocity
  private applyAmplitudeEnvelope(
    gainNode: GainNode,
    velocity: number,
    time: number = this.context.currentTime
  ) {
    const envelope = this.instrument.envelope;
    const now = time;

    // Calculate velocity-scaled amplitude (0-1 range)
    const normalizedVelocity = velocity; // MIDI velocity is 0-127 but we have it 0-1
    const velocityGain = normalizedVelocity * this.instrument.volume;

    console.log("[InstrumentNode] Applying amplitude envelope:", {
      velocity,
      normalizedVelocity,
      instrumentVolume: this.instrument.volume,
      finalGain: velocityGain,
      time: now,
      envelopeType: envelope.type,
    });

    // Cancel any previously scheduled values and reset
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);

    // Small offset to ensure proper envelope triggering
    const epsilon = 0.001;

    switch (envelope.type) {
      case "ad":
        // Attack phase
        gainNode.gain.linearRampToValueAtTime(
          velocityGain,
          now + envelope.attack
        );
        // Decay phase - add small time offset to ensure proper sequencing
        gainNode.gain.linearRampToValueAtTime(
          0,
          now + envelope.attack + envelope.decay + epsilon
        );
        break;

      case "ar":
        // Attack phase
        gainNode.gain.linearRampToValueAtTime(
          velocityGain,
          now + envelope.attack
        );
        // Release phase - add small time offset
        gainNode.gain.linearRampToValueAtTime(
          0,
          now + envelope.attack + envelope.release + epsilon
        );
        break;

      case "adsr":
        // Attack phase
        gainNode.gain.linearRampToValueAtTime(
          velocityGain,
          now + envelope.attack
        );
        // Decay to sustain level
        const sustainLevel = velocityGain * envelope.sustain;
        gainNode.gain.linearRampToValueAtTime(
          sustainLevel,
          now + envelope.attack + envelope.decay + epsilon
        );
        break;
    }

    console.log("[InstrumentNode] Envelope scheduled:", {
      type: envelope.type,
      attackTime: now + envelope.attack,
      attackValue: velocityGain,
      decayEndTime:
        envelope.type !== "ar" ? now + envelope.attack + envelope.decay : null,
      sustainLevel:
        envelope.type === "adsr" ? velocityGain * envelope.sustain : null,
    });
  }

  // Update instrument parameters
  updateInstrument(instrument: Instrument) {
    const oldMaxVoices = this.instrument.maxVoices ?? 16;
    const newMaxVoices = instrument.maxVoices ?? 16;
    const oldVolume = this.instrument.volume;

    this.instrument = instrument;

    // Update master gain
    this.gainNode.gain.value = isFinite(instrument.volume)
      ? instrument.volume
      : 1;

    // Update voice filters
    this.voicePool.forEach((voice) => {
      voice.voiceFilter.type = instrument.filter.type;
      voice.voiceFilter.frequency.setValueAtTime(
        instrument.filter.frequency,
        this.context.currentTime
      );
      voice.voiceFilter.Q.setValueAtTime(
        instrument.filter.resonance,
        this.context.currentTime
      );
    });

    // If volume changed, update all active voices
    if (oldVolume !== instrument.volume) {
      this.voicePool.forEach((voice) => {
        if (voice.isActive) {
          const currentGain = voice.gain.gain.value;
          const scaledGain = (currentGain / oldVolume) * instrument.volume;
          voice.gain.gain.setValueAtTime(scaledGain, this.context.currentTime);
        }
      });
    }

    // Update sample buffer for sampler instrument
    if (
      instrument.oscillator.type === "sampler" &&
      instrument.oscillator.sample?.buffer
    ) {
      this.setSampleBuffer(instrument.oscillator.sample.buffer as AudioBuffer);
    }

    // If max voices changed or oscillator type changed, reinitialize pool
    if (
      oldMaxVoices !== newMaxVoices ||
      this.voicePool[0]?.oscillator instanceof OscillatorNode !==
        (instrument.oscillator.type !== "sampler" &&
          instrument.oscillator.type !== "noise")
    ) {
      this.initializeVoicePool();
    } else {
      // Update existing oscillators
      this.voicePool.forEach((voice) => {
        if (voice.isActive && voice.oscillator instanceof OscillatorNode) {
          if (
            voice.oscillator.type !== instrument.oscillator.type &&
            instrument.oscillator.type !== "noise" &&
            instrument.oscillator.type !== "sampler"
          ) {
            voice.oscillator.type = instrument.oscillator
              .type as OscillatorType;
          }
          voice.oscillator.detune.setValueAtTime(
            instrument.oscillator.detune,
            this.context.currentTime
          );
        }
      });
    }
  }

  // Find available voice or steal oldest one
  private getVoice(midiNote: number): (typeof this.voicePool)[0] {
    // First, try to find the same note (for retrigger)
    const existingVoice = this.voicePool.find((v) => v.midiNote === midiNote);
    if (existingVoice) {
      console.log("[InstrumentNode] Reusing voice for same note:", {
        midiNote,
      });
      return existingVoice;
    }

    // Then, try to find an inactive voice
    const inactiveVoice = this.voicePool.find((v) => !v.isActive);
    if (inactiveVoice) {
      console.log("[InstrumentNode] Using inactive voice for note:", {
        midiNote,
      });
      return inactiveVoice;
    }

    // Finally, steal the oldest voice
    const oldestVoice = this.voicePool.reduce((oldest, current) =>
      current.startTime < oldest.startTime ? current : oldest
    );
    console.log("[InstrumentNode] Stealing oldest voice for note:", {
      midiNote,
      oldNote: oldestVoice.midiNote,
      oldStartTime: oldestVoice.startTime,
    });
    return oldestVoice;
  }

  // Trigger note on
  noteOn(midiNote: number, velocity: number, time = 0) {
    console.log("[InstrumentNode] Note ON:", { midiNote, velocity, time });

    // Get a voice from the pool
    const voice = this.getVoice(midiNote);

    // If voice is active, stop it immediately
    if (voice.isActive) {
      this.stopVoice(voice, time, true);
    }

    // Initialize voice with new note
    const oscillator = this.initializeVoice(voice, midiNote, time);

    // Start envelopes
    this.applyEnvelope(
      voice.filterEnvelope.gain,
      this.instrument.filter.envelope,
      0,
      1,
      time
    );
    this.applyAmplitudeEnvelope(voice.gain, velocity, time);

    // Start the oscillator
    oscillator.start(time);
  }

  // Stop a specific voice
  private stopVoice(
    voice: (typeof this.voicePool)[0],
    time: number,
    immediate = false
  ) {
    if (!voice.isActive) return;

    // Cancel any pending cleanup
    if (voice.cleanupTimeout !== null) {
      clearTimeout(voice.cleanupTimeout);
      voice.cleanupTimeout = null;
    }

    console.log("[InstrumentNode] Stopping voice:", {
      midiNote: voice.midiNote,
      immediate,
      time,
      currentGain: voice.gain.gain.value,
    });

    // Always cancel scheduled values first
    voice.gain.gain.cancelScheduledValues(time);
    voice.filterEnvelope.gain.cancelScheduledValues(time);
    voice.filterModSource.offset.cancelScheduledValues(time);

    if (immediate) {
      // Set immediate values
      voice.gain.gain.setValueAtTime(0, time);
      voice.filterEnvelope.gain.setValueAtTime(0, time);
      voice.filterModSource.offset.setValueAtTime(0, time);

      if (voice.oscillator) {
        try {
          voice.oscillator.stop(time);
          voice.oscillator.disconnect();
        } catch (e) {
          console.warn("[InstrumentNode] Error stopping oscillator:", e);
        }
        voice.oscillator = null;
      }

      voice.isActive = false;
      voice.midiNote = null;
      return;
    }

    const releaseTime =
      this.instrument.envelope.type === "adsr" ||
      this.instrument.envelope.type === "ar"
        ? this.instrument.envelope.release
        : 0.01;

    // Get current gain value before applying release
    const currentGain = voice.gain.gain.value;
    voice.gain.gain.setValueAtTime(currentGain, time);
    voice.gain.gain.linearRampToValueAtTime(0, time + releaseTime);

    // Apply filter envelope release
    if (this.instrument.filter.envelope.type === "adsr") {
      const currentFilterEnv = voice.filterEnvelope.gain.value;
      voice.filterEnvelope.gain.setValueAtTime(currentFilterEnv, time);
      voice.filterEnvelope.gain.linearRampToValueAtTime(
        0,
        time + this.instrument.filter.envelope.release
      );
    }

    // Schedule cleanup with precise timing
    const cleanupTime = time + releaseTime;
    const timeoutDelay = (cleanupTime - this.context.currentTime) * 1000;

    voice.cleanupTimeout = setTimeout(() => {
      if (voice.oscillator) {
        try {
          voice.oscillator.stop(cleanupTime);
          voice.oscillator.disconnect();
        } catch (e) {
          console.warn("[InstrumentNode] Error cleaning up oscillator:", e);
        }
      }
      voice.isActive = false;
      voice.midiNote = null;
      voice.oscillator = null;
      voice.cleanupTimeout = null;
    }, timeoutDelay) as unknown as number;
  }

  // Trigger note off
  noteOff(midiNote: number, time = 0, immediate = false) {
    const voice = this.voicePool.find(
      (v) => v.midiNote === midiNote && v.isActive
    );
    if (voice) {
      this.stopVoice(voice, time, immediate);
    }
  }

  // Release all notes
  releaseAll() {
    const now = this.context.currentTime;
    this.voicePool.forEach((voice) => {
      if (voice.isActive) {
        this.stopVoice(voice, now);
      }
    });
  }

  // Create noise source
  private createNoiseSource(): AudioBufferSourceNode {
    const bufferSize = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(
      1,
      bufferSize,
      this.context.sampleRate
    );
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.loop = true;

    return node;
  }

  // Create oscillator based on instrument type
  private createOscillator(
    midiNote: number
  ): OscillatorNode | AudioBufferSourceNode {
    if (this.instrument.oscillator.type === "noise") {
      return this.createNoiseSource();
    } else if (this.instrument.oscillator.type === "sampler") {
      console.log("[InstrumentNode] Creating sampler oscillator", this);
      if (!this.sampleBuffer) {
        if (this.instrument.oscillator.sample) {
          this.sampleBuffer = this.instrument.oscillator.sample
            .buffer as AudioBuffer;
        } else {
          console.warn(
            "No sample or sample data loaded for sampler instrument"
          );
          // Fall back to a sine wave as a placeholder
          const osc = this.context.createOscillator();
          osc.type = "sine";
          osc.frequency.value = midiToFrequency(midiNote);
          return osc;
        }
      }

      const source = this.context.createBufferSource();
      source.buffer = this.sampleBuffer;

      // Handle sample playback parameters
      if (this.instrument.oscillator.sample) {
        source.loop = this.instrument.oscillator.sample.loopType !== "oneshot";
        source.playbackRate.value = midiToFrequency(midiNote) / 440; // Use A4 (440Hz) as reference

        // Handle loop points if specified
        if (source.loop) {
          const startSample = Math.floor(
            this.instrument.oscillator.sample.startPoint *
              this.sampleBuffer.length
          );
          const endSample = Math.floor(
            this.instrument.oscillator.sample.endPoint *
              this.sampleBuffer.length
          );
          source.loopStart = startSample / this.sampleBuffer.sampleRate;
          source.loopEnd = endSample / this.sampleBuffer.sampleRate;
        }
      }

      return source;
    } else {
      const osc = this.context.createOscillator();
      const validTypes: OscillatorType[] = [
        "sine",
        "square",
        "sawtooth",
        "triangle",
      ];
      const requestedType = this.instrument.oscillator.type as OscillatorType;
      osc.type = validTypes.includes(requestedType) ? requestedType : "square";

      const freq = midiToFrequency(midiNote);
      osc.frequency.value = freq;
      osc.detune.value = this.instrument.oscillator.detune;
      return osc;
    }
  }
}
