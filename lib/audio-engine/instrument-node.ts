import type { Instrument, Envelope } from "../types";
import { midiToFrequency } from "../utils";
import { PARAMETER_IDS } from "../types";

export class InstrumentNode {
  private context: AudioContext;
  private output: GainNode;
  private gainNode: GainNode;
  private instrument: Instrument;
  public sampleBuffer: AudioBuffer | null = null;

  // LFO nodes
  private lfo1: OscillatorNode;
  private lfo1Gain: GainNode;
  private lfo2: OscillatorNode;
  private lfo2Gain: GainNode;

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

    // Initialize LFOs
    this.lfo1 = context.createOscillator();
    this.lfo1Gain = context.createGain();
    this.lfo2 = context.createOscillator();
    this.lfo2Gain = context.createGain();

    // Initialize voice pool with maximum voices
    this.initializeVoicePool();

    // Set up initial LFO states AFTER voice pool is initialized
    this.initializeLFOs();
  }

  private initializeLFOs() {
    const now = this.context.currentTime;

    // Set up LFO1
    this.lfo1.type = this.instrument.lfo1?.waveform ?? "sine";
    this.lfo1.frequency.setValueAtTime(
      this.instrument.lfo1?.frequency ?? 1,
      now
    );
    const lfo1Range = this.getModulationRange(this.instrument.lfo1.target);
    this.lfo1Gain.gain.setValueAtTime(
      lfo1Range * this.instrument.lfo1.depth,
      now
    );
    this.lfo1.connect(this.lfo1Gain);

    // Set up LFO2
    this.lfo2.type = this.instrument.lfo2?.waveform ?? "sine";
    this.lfo2.frequency.setValueAtTime(
      this.instrument.lfo2?.frequency ?? 1,
      now
    );
    const lfo2Range =
      typeof this.instrument.lfo2.target === "number"
        ? this.getModulationRange(this.instrument.lfo2.target)
        : 1;
    this.lfo2Gain.gain.setValueAtTime(
      lfo2Range * this.instrument.lfo2.depth,
      now
    );
    this.lfo2.connect(this.lfo2Gain);

    // Start LFOs
    this.lfo1.start(now);
    this.lfo2.start(now);

    // Route LFO modulation
    this.routeLFOModulation();
  }

  private getModulationRange(target: number): number {
    switch (target) {
      case PARAMETER_IDS.OSCILLATOR_DETUNE:
        return 1200; // +/- 1200 cents (1 octave)
      case PARAMETER_IDS.FILTER_FREQUENCY:
        return 10000; // +/- 10000 Hz
      case PARAMETER_IDS.FILTER_RESONANCE:
        return 10; // +/- 10 Q
      case PARAMETER_IDS.VOLUME:
        return 1; // +/- 1 (full volume range)
      case PARAMETER_IDS.PAN:
        return 1; // +/- 1 (full pan range)
      default:
        return 1;
    }
  }

  private routeLFOModulation() {
    // Disconnect existing modulation
    this.lfo1Gain.disconnect();
    this.lfo2Gain.disconnect();

    // Set base values for parameters that will be modulated
    const now = this.context.currentTime;

    // Set LFO1 modulation depth and route it
    const lfo1Range = this.getModulationRange(this.instrument.lfo1.target);
    this.lfo1Gain.gain.setValueAtTime(
      lfo1Range * this.instrument.lfo1.depth,
      now
    );

    // Route LFO1
    switch (this.instrument.lfo1.target) {
      case PARAMETER_IDS.OSCILLATOR_DETUNE:
        this.voicePool.forEach((voice, index) => {
          if (voice.oscillator instanceof OscillatorNode) {
            voice.oscillator.detune.setValueAtTime(
              this.instrument.oscillator.detune,
              now
            );
            this.lfo1Gain.connect(voice.oscillator.detune);
          }
        });
        break;
      case PARAMETER_IDS.FILTER_FREQUENCY:
        this.voicePool.forEach((voice, index) => {
          voice.voiceFilter.frequency.setValueAtTime(
            this.instrument.filter.frequency,
            now
          );
          this.lfo1Gain.connect(voice.voiceFilter.frequency);
        });
        break;
      case PARAMETER_IDS.FILTER_RESONANCE:
        this.voicePool.forEach((voice, index) => {
          voice.voiceFilter.Q.setValueAtTime(
            this.instrument.filter.resonance,
            now
          );
          this.lfo1Gain.connect(voice.voiceFilter.Q);
        });
        break;
      case PARAMETER_IDS.VOLUME:
        this.gainNode.gain.setValueAtTime(this.instrument.volume, now);
        this.lfo1Gain.connect(this.gainNode.gain);
        break;
      case PARAMETER_IDS.PAN:
        this.voicePool.forEach((voice, index) => {
          voice.pan.pan.setValueAtTime(this.instrument.pan, now);
          this.lfo1Gain.connect(voice.pan.pan);
        });
        break;
    }

    // Set LFO2 modulation depth and route it
    const lfo2Target = this.instrument.lfo2.target;
    if (typeof lfo2Target === "number") {
      const lfo2Range = this.getModulationRange(lfo2Target);
      this.lfo2Gain.gain.setValueAtTime(
        lfo2Range * this.instrument.lfo2.depth,
        now
      );

      // Handle parameter targets similar to LFO1
      switch (lfo2Target) {
        case PARAMETER_IDS.OSCILLATOR_DETUNE:
          this.voicePool.forEach((voice, index) => {
            if (voice.oscillator instanceof OscillatorNode) {
              voice.oscillator.detune.setValueAtTime(
                this.instrument.oscillator.detune,
                now
              );
              this.lfo2Gain.connect(voice.oscillator.detune);
            }
          });
          break;
        case PARAMETER_IDS.FILTER_FREQUENCY:
          this.voicePool.forEach((voice, index) => {
            voice.voiceFilter.frequency.setValueAtTime(
              this.instrument.filter.frequency,
              now
            );
            this.lfo2Gain.connect(voice.voiceFilter.frequency);
          });
          break;
        case PARAMETER_IDS.FILTER_RESONANCE:
          this.voicePool.forEach((voice, index) => {
            voice.voiceFilter.Q.setValueAtTime(
              this.instrument.filter.resonance,
              now
            );
            this.lfo2Gain.connect(voice.voiceFilter.Q);
          });
          break;
        case PARAMETER_IDS.VOLUME:
          this.gainNode.gain.setValueAtTime(this.instrument.volume, now);
          this.lfo2Gain.connect(this.gainNode.gain);
          break;
        case PARAMETER_IDS.PAN:
          this.voicePool.forEach((voice, index) => {
            voice.pan.pan.setValueAtTime(this.instrument.pan, now);
            this.lfo2Gain.connect(voice.pan.pan);
          });
          break;
      }
    } else {
      // Handle LFO1 modulation targets
      switch (lfo2Target) {
        case "lfo1_frequency":
          // Scale frequency modulation range (0.1 to 20 Hz)
          const freqRange = 20 * this.instrument.lfo2.depth;
          this.lfo2Gain.gain.setValueAtTime(freqRange, now);
          this.lfo1.frequency.setValueAtTime(
            this.instrument.lfo1.frequency,
            now
          );
          this.lfo2Gain.connect(this.lfo1.frequency);
          break;
        case "lfo1_depth":
          // Scale depth modulation range (0 to 1)
          this.lfo2Gain.gain.setValueAtTime(this.instrument.lfo2.depth, now);
          this.lfo1Gain.gain.setValueAtTime(this.instrument.lfo1.depth, now);
          this.lfo2Gain.connect(this.lfo1Gain.gain);
          break;
      }
    }
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
    filterModSource.connect(filterEnvelope);
    filterEnvelope.connect(voiceFilter.frequency);
    voiceFilter.connect(gain);
    gain.connect(pan);
    pan.connect(this.gainNode);
    filterModSource.start();

    const voice = {
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

    return voice;
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
      voice.oscillator.stop();
      voice.oscillator.frequency.value = midiToFrequency(midiNote);
    } else {
      const newOscillator = this.createOscillator(midiNote);
      newOscillator.connect(voice.voiceFilter);
      voice.oscillator = newOscillator;

      // Connect LFO modulation for detune if needed (only for new oscillators)
      if (
        this.instrument.lfo1.target === PARAMETER_IDS.OSCILLATOR_DETUNE &&
        newOscillator instanceof OscillatorNode
      ) {
        this.lfo1Gain.connect(newOscillator.detune);
      }
      if (
        typeof this.instrument.lfo2.target === "number" &&
        this.instrument.lfo2.target === PARAMETER_IDS.OSCILLATOR_DETUNE &&
        newOscillator instanceof OscillatorNode
      ) {
        this.lfo2Gain.connect(newOscillator.detune);
      }
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

    // Connect LFO modulation for filter parameters
    if (this.instrument.lfo1.target === PARAMETER_IDS.FILTER_FREQUENCY) {
      this.lfo1Gain.connect(voice.voiceFilter.frequency);
    } else if (this.instrument.lfo1.target === PARAMETER_IDS.FILTER_RESONANCE) {
      this.lfo1Gain.connect(voice.voiceFilter.Q);
    }

    if (typeof this.instrument.lfo2.target === "number") {
      if (this.instrument.lfo2.target === PARAMETER_IDS.FILTER_FREQUENCY) {
        this.lfo2Gain.connect(voice.voiceFilter.frequency);
      } else if (
        this.instrument.lfo2.target === PARAMETER_IDS.FILTER_RESONANCE
      ) {
        this.lfo2Gain.connect(voice.voiceFilter.Q);
      }
    }

    // Update voice state
    voice.midiNote = midiNote;
    voice.startTime = this.context.currentTime;
    voice.isActive = true;

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
  }

  // Update instrument parameters
  updateInstrument(instrument: Instrument) {
    const oldMaxVoices = this.instrument.maxVoices ?? 16;
    const newMaxVoices = instrument.maxVoices ?? 16;
    const oldVolume = this.instrument.volume;

    // Store old LFO targets for comparison
    const oldLfo1Target = this.instrument.lfo1.target;
    const oldLfo2Target = this.instrument.lfo2.target;
    const oldLfo1Depth = this.instrument.lfo1.depth;
    const oldLfo2Depth = this.instrument.lfo2.depth;

    this.instrument = instrument;

    // Update LFO parameters
    const now = this.context.currentTime;

    // Update LFO1
    if (this.lfo1.type !== instrument.lfo1.waveform) {
      this.lfo1.type = instrument.lfo1.waveform;
    }

    this.lfo1.frequency.setValueAtTime(instrument.lfo1.frequency, now);

    // Update LFO2
    if (this.lfo2.type !== instrument.lfo2.waveform) {
      this.lfo2.type = instrument.lfo2.waveform;
    }

    this.lfo2.frequency.setValueAtTime(instrument.lfo2.frequency, now);

    // Update LFO routing if targets, depths, or frequencies have changed
    if (
      oldLfo1Target !== instrument.lfo1.target ||
      oldLfo2Target !== instrument.lfo2.target ||
      oldLfo1Depth !== instrument.lfo1.depth ||
      oldLfo2Depth !== instrument.lfo2.depth ||
      this.lfo1.frequency.value !== instrument.lfo1.frequency ||
      this.lfo2.frequency.value !== instrument.lfo2.frequency
    ) {
      this.routeLFOModulation();
    }

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
      return existingVoice;
    }

    // Then, try to find an inactive voice
    const inactiveVoice = this.voicePool.find((v) => !v.isActive);
    if (inactiveVoice) {
      return inactiveVoice;
    }

    // Finally, steal the oldest voice that's not in its attack phase
    const now = this.context.currentTime;
    const oldestVoice = this.voicePool.reduce((oldest, current) => {
      // Skip voices in attack phase
      if (current.startTime + this.instrument.envelope.attack > now) {
        return oldest;
      }
      return current.startTime < oldest.startTime ? current : oldest;
    });

    return oldestVoice;
  }

  // Trigger note on
  noteOn(midiNote: number, velocity: number, time = 0) {
    // Get a voice from the pool
    const voice = this.getVoice(midiNote);
    let epsilon = 0;

    // If voice is active, stop it immediately
    if (voice.isActive) {
      this.stopVoice(voice, time, true);
      epsilon = 0.001;
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
    voice.isActive = true;
    oscillator.start(time + epsilon);
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

    // Schedule oscillator to stop after release phase
    if (voice.oscillator) {
      const stopTime = time + releaseTime + 0.01; // Add small buffer after release
      try {
        voice.oscillator.stop(stopTime);
        // Schedule cleanup after oscillator stops
        const timeoutMs = Math.max(
          0,
          (stopTime - this.context.currentTime) * 1000
        );
        voice.cleanupTimeout = window.setTimeout(() => {
          if (voice.oscillator) {
            voice.oscillator.stop();
            voice.oscillator.disconnect();
            voice.oscillator = null;
          }
          voice.isActive = false;
          voice.midiNote = null;
        }, timeoutMs);
      } catch (e) {
        console.warn("[InstrumentNode] Error scheduling oscillator stop:", e);
      }
    }

    // Mark voice as inactive but don't disconnect nodes yet
    // This allows the release phase to continue playing
    voice.midiNote = null;
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
