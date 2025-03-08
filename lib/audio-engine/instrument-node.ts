import type { Instrument, Envelope } from "../types";
import { midiToFrequency } from "../utils";

export class InstrumentNode {
  private context: AudioContext;
  private output: GainNode;
  private oscillator: OscillatorNode | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode;
  private gainNode: GainNode;
  private instrument: Instrument;
  public sampleBuffer: AudioBuffer | null = null;
  private activeNotes: Map<
    number,
    {
      oscillator: OscillatorNode | AudioBufferSourceNode;
      gain: GainNode;
      filterEnvelope?: GainNode;
    }
  > = new Map();

  constructor(context: AudioContext, output: GainNode, instrument: Instrument) {
    this.context = context;
    this.output = output;
    this.instrument = instrument;

    // Create filter
    this.filter = context.createBiquadFilter();
    this.filter.type = instrument.filter.type;
    this.filter.frequency.value = instrument.filter.frequency;
    this.filter.Q.value = instrument.filter.resonance;

    // Create gain node
    this.gainNode = context.createGain();
    this.gainNode.gain.value = 1;

    // Connect nodes
    this.filter.connect(this.gainNode);
    this.gainNode.connect(this.output);
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

    // Calculate the modulation range based on the amount parameter
    const modRange = baseValue * amount;

    console.log("[Filter Envelope] Starting envelope application:", {
      baseValue,
      amount,
      modRange,
      envelopeType: envelope.type,
      currentTime: now,
    });

    // Set initial value
    param.setValueAtTime(baseValue, now);
    console.log("[Filter Envelope] Set initial value:", baseValue);

    // Apply envelope based on type
    switch (envelope.type) {
      case "ad":
        console.log("[Filter Envelope] Applying AD envelope");
        // Attack
        const adAttackValue = baseValue + modRange;
        param.linearRampToValueAtTime(adAttackValue, now + envelope.attack);
        console.log("[Filter Envelope] Attack phase:", {
          targetValue: adAttackValue,
          duration: envelope.attack,
        });

        // Decay
        param.linearRampToValueAtTime(
          baseValue,
          now + envelope.attack + envelope.decay
        );
        console.log("[Filter Envelope] Decay phase:", {
          targetValue: baseValue,
          duration: envelope.decay,
        });
        break;

      case "ar":
        console.log("[Filter Envelope] Applying AR envelope");
        // Attack
        const arAttackValue = baseValue + modRange;
        param.linearRampToValueAtTime(arAttackValue, now + envelope.attack);
        console.log("[Filter Envelope] Attack phase:", {
          targetValue: arAttackValue,
          duration: envelope.attack,
        });

        // Release
        param.linearRampToValueAtTime(
          baseValue,
          now + envelope.attack + envelope.release
        );
        console.log("[Filter Envelope] Release phase:", {
          targetValue: baseValue,
          duration: envelope.release,
        });
        break;

      case "adsr":
        console.log("[Filter Envelope] Applying ADSR envelope");
        // Attack
        const adsrAttackValue = baseValue + modRange;
        param.linearRampToValueAtTime(adsrAttackValue, now + envelope.attack);
        console.log("[Filter Envelope] Attack phase:", {
          targetValue: adsrAttackValue,
          duration: envelope.attack,
        });

        // Decay to sustain level
        const sustainValue = baseValue + modRange * envelope.sustain;
        param.linearRampToValueAtTime(
          sustainValue,
          now + envelope.attack + envelope.decay
        );
        console.log("[Filter Envelope] Decay to sustain phase:", {
          sustainValue,
          duration: envelope.decay,
        });
        break;
    }

    return param;
  }

  // Apply amplitude envelope
  private applyAmplitudeEnvelope(
    gainNode: GainNode,
    time: number = this.context.currentTime
  ) {
    const envelope = this.instrument.envelope;
    const now = time;

    gainNode.gain.setValueAtTime(0, now);

    switch (envelope.type) {
      case "ad":
        gainNode.gain.linearRampToValueAtTime(1, now + envelope.attack);
        gainNode.gain.linearRampToValueAtTime(
          0,
          now + envelope.attack + envelope.decay
        );
        break;

      case "ar":
        gainNode.gain.linearRampToValueAtTime(1, now + envelope.attack);
        gainNode.gain.linearRampToValueAtTime(
          0,
          now + envelope.attack + envelope.release
        );
        break;

      case "adsr":
        gainNode.gain.linearRampToValueAtTime(1, now + envelope.attack);
        gainNode.gain.linearRampToValueAtTime(
          envelope.sustain,
          now + envelope.attack + envelope.decay
        );
        break;
    }
  }

  // Update instrument parameters
  updateInstrument(instrument: Instrument) {
    this.instrument = instrument;

    // Update filter parameters in real-time
    this.filter.type = instrument.filter.type;
    this.filter.frequency.setValueAtTime(
      instrument.filter.frequency,
      this.context.currentTime
    );
    this.filter.Q.setValueAtTime(
      instrument.filter.resonance,
      this.context.currentTime
    );

    // Update sample buffer for sampler instrument
    if (
      instrument.oscillator.type === "sampler" &&
      instrument.oscillator.sample?.buffer
    ) {
      this.setSampleBuffer(instrument.oscillator.sample.buffer as AudioBuffer);
    }

    // Update oscillator parameters for all active notes
    this.activeNotes.forEach((note, midiNote) => {
      if (note.oscillator instanceof OscillatorNode) {
        if (
          note.oscillator.type !== instrument.oscillator.type &&
          instrument.oscillator.type !== "noise"
        ) {
          note.oscillator.type = instrument.oscillator.type as OscillatorType;
        }
        note.oscillator.detune.setValueAtTime(
          instrument.oscillator.detune,
          this.context.currentTime
        );
      }
    });
  }

  // Trigger note on
  noteOn(midiNote: number, velocity: number, time = 0) {
    console.log("[Filter Envelope] Note ON:", {
      midiNote,
      baseFreq: this.instrument.filter.frequency,
      envelopeAmount: this.instrument.filter.envelopeAmount,
    });

    // Create oscillator
    const oscillator = this.createOscillator(midiNote);

    // Create gain node for this note
    const noteGain = this.context.createGain();
    noteGain.gain.setValueAtTime(0, this.context.currentTime);

    // Create filter envelope modulation
    const filterEnvelope = this.context.createGain();
    filterEnvelope.gain.setValueAtTime(this.instrument.filter.frequency, time);
    console.log(
      "[Filter Envelope] Created modulation gain node with initial frequency:",
      this.instrument.filter.frequency
    );

    // Connect oscillator to note gain to filter
    oscillator.connect(noteGain);
    noteGain.connect(this.filter);

    // Calculate modulation amount in Hz
    const maxModulation = 10000; // Maximum modulation range in Hz
    const scaledAmount = this.instrument.filter.envelopeAmount * maxModulation;

    console.log("[Filter Envelope] Applying envelope modulation:", {
      baseFrequency: this.instrument.filter.frequency,
      envelopeAmount: this.instrument.filter.envelopeAmount,
      scaledModulation: scaledAmount,
    });

    // Apply filter envelope modulation
    this.applyEnvelope(
      filterEnvelope.gain,
      this.instrument.filter.envelope,
      this.instrument.filter.frequency,
      scaledAmount,
      time
    );

    // Connect filter envelope to filter frequency
    filterEnvelope.connect(this.filter.frequency);

    // Apply amplitude envelope
    this.applyAmplitudeEnvelope(noteGain, time);

    // Start oscillator
    oscillator.start(time);

    // Store active note
    this.activeNotes.set(midiNote, {
      oscillator,
      gain: noteGain,
      filterEnvelope,
    });
  }

  // Trigger note off
  noteOff(midiNote: number, time = 0) {
    const note = this.activeNotes.get(midiNote);
    if (!note) return;

    console.log("[Filter Envelope] Note OFF:", { midiNote, time });

    const releaseTime =
      this.instrument.envelope.type === "adsr"
        ? this.instrument.envelope.release
        : 0.01;

    // Apply release stage
    note.gain.gain.setValueAtTime(note.gain.gain.value, time);
    note.gain.gain.linearRampToValueAtTime(0, time + releaseTime);

    // Apply filter envelope release if it exists
    if (
      note.filterEnvelope &&
      this.instrument.filter.envelope.type === "adsr"
    ) {
      const currentValue = note.filterEnvelope.gain.value;
      console.log("[Filter Envelope] Starting release phase:", {
        currentValue,
        targetValue: this.instrument.filter.frequency,
        duration: this.instrument.filter.envelope.release,
      });

      note.filterEnvelope.gain.setValueAtTime(currentValue, time);
      note.filterEnvelope.gain.linearRampToValueAtTime(
        this.instrument.filter.frequency,
        time + this.instrument.filter.envelope.release
      );
    }

    // Schedule cleanup
    setTimeout(() => {
      note.oscillator.stop();
      note.oscillator.disconnect();
      note.gain.disconnect();
      if (note.filterEnvelope) {
        note.filterEnvelope.disconnect();
      }
      this.activeNotes.delete(midiNote);
      console.log("[Filter Envelope] Cleaned up note:", midiNote);
    }, (time - this.context.currentTime + releaseTime) * 1000);
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

  // Release all notes
  releaseAll() {
    const now = this.context.currentTime;
    this.activeNotes.forEach((note, midiNote) => {
      this.noteOff(midiNote, now);
    });
  }
}
