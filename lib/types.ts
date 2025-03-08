// Core types for the tracker DAW

export type OscillatorType =
  | "sine"
  | "square"
  | "sawtooth"
  | "triangle"
  | "noise"
  | "sampler";

export type LoopType = "oneshot" | "forward" | "pingpong";

export interface SampleData {
  buffer: AudioBuffer | null;
  fileName: string;
  startPoint: number; // 0-1 normalized position
  endPoint: number; // 0-1 normalized position
  gain: number; // 0-1 gain
  loopType: LoopType;
}

export interface Oscillator {
  type: OscillatorType;
  detune: number;
  sample?: SampleData; // Present when type is "sampler"
}

export interface Filter {
  type: BiquadFilterType;
  frequency: number;
  resonance: number;
  envelope: Envelope; // Filter envelope
  envelopeAmount: number; // How much the envelope affects the cutoff frequency [-1, 1]
}

export interface Envelope {
  type: "ad" | "ar" | "adsr";
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export type LFOWaveform = "sine" | "sawtooth" | "triangle" | "square";

export type LFOTarget = number | "lfo1_frequency" | "lfo1_depth";

export interface LFO {
  waveform: LFOWaveform;
  frequency: number; // Hz
  depth: number; // 0-1
  target: number; // Parameter ID from PARAMETER_IDS
}

export interface LFO2 {
  waveform: LFOWaveform;
  frequency: number; // Hz
  depth: number; // 0-1
  target: LFOTarget;
}

export interface Instrument {
  id: string;
  name: string;
  volume: number;
  pan: number;
  maxVoices?: number;
  oscillator: {
    type: OscillatorType | "noise" | "sampler";
    detune: number;
    sample?: {
      buffer?: AudioBuffer;
      fileName?: string;
      startPoint: number;
      endPoint: number;
      gain: number;
      loopType: "oneshot" | "forward" | "pingpong";
    };
  };
  filter: {
    type: BiquadFilterType;
    frequency: number;
    resonance: number;
    envelopeAmount: number;
    envelope: Envelope;
  };
  envelope: Envelope;
  lfo1: LFO;
  lfo2: LFO2;
}

export interface Note {
  row: number;
  track: number;
  instrument: string; // Hex string (00-FF)
  tone: number; // MIDI note number
  velocity: number; // 00-FF
  effect: number; // 00-FF
  effectValue: number; // 0000-FFFF
}

export interface Pattern {
  id: string;
  name: string;
  tempo: number;
  tracks: number;
  rows: number;
  notes: Note[];
}

export interface Project {
  name: string;
  instruments: Instrument[];
  patterns: Pattern[];
  song: string[][]; // Array of sequences, each containing pattern IDs
  sampleData?: { [key: string]: string }; // Base64 encoded sample data for sampler instruments
}

// Parameter IDs for real-time control
export const PARAMETER_IDS = {
  // Oscillator parameters (0x00-0x0F)
  OSCILLATOR_TYPE: 0x00,
  OSCILLATOR_DETUNE: 0x01,

  // Filter parameters (0x10-0x1F)
  FILTER_TYPE: 0x10,
  FILTER_FREQUENCY: 0x11,
  FILTER_RESONANCE: 0x12,
  FILTER_ENVELOPE_AMOUNT: 0x13,

  // Filter envelope parameters (0x20-0x2F)
  FILTER_ENVELOPE_TYPE: 0x20,
  FILTER_ENVELOPE_ATTACK: 0x21,
  FILTER_ENVELOPE_DECAY: 0x22,
  FILTER_ENVELOPE_SUSTAIN: 0x23,
  FILTER_ENVELOPE_RELEASE: 0x24,

  // Amplitude envelope parameters (0x30-0x3F)
  ENVELOPE_TYPE: 0x30,
  ENVELOPE_ATTACK: 0x31,
  ENVELOPE_DECAY: 0x32,
  ENVELOPE_SUSTAIN: 0x33,
  ENVELOPE_RELEASE: 0x34,

  // Global parameters (0x40-0x4F)
  VOLUME: 0x40,
  PAN: 0x41,
  MAX_VOICES: 0x42,

  // LFO1 parameters
  LFO1_WAVEFORM: 0x50,
  LFO1_FREQUENCY: 0x51,
  LFO1_DEPTH: 0x52,
  LFO1_TARGET: 0x53,

  // LFO2 parameters
  LFO2_WAVEFORM: 0x54,
  LFO2_FREQUENCY: 0x55,
  LFO2_DEPTH: 0x56,
  LFO2_TARGET: 0x57,
} as const;

// Parameter value ranges and scaling
export const PARAMETER_RANGES = {
  [PARAMETER_IDS.OSCILLATOR_TYPE]: {
    values: ["sine", "square", "sawtooth", "triangle", "noise", "sampler"],
    fromNormalized: (value: number) => Math.floor(value * 5), // 0-5 for oscillator types
  },
  [PARAMETER_IDS.OSCILLATOR_DETUNE]: {
    min: -1200,
    max: 1200,
    default: 0,
  },
  [PARAMETER_IDS.FILTER_TYPE]: {
    values: ["lowpass", "highpass"],
    fromNormalized: (value: number) => Math.floor(value * 1), // 0-1 for filter types
  },
  [PARAMETER_IDS.FILTER_FREQUENCY]: {
    min: 20,
    max: 20000,
    default: 1000,
    fromNormalized: (value: number) =>
      Math.exp(value * Math.log(20000 / 20)) * 20,
  },
  [PARAMETER_IDS.FILTER_RESONANCE]: {
    min: 0.1,
    max: 20,
    default: 1,
    fromNormalized: (value: number) => value * 19.9 + 0.1,
  },
  [PARAMETER_IDS.FILTER_ENVELOPE_AMOUNT]: {
    min: 0,
    max: 1,
    default: 0.5,
  },
  [PARAMETER_IDS.VOLUME]: {
    min: 0,
    max: 1,
    default: 0.75,
  },
  [PARAMETER_IDS.PAN]: {
    min: -1,
    max: 1,
    default: 0,
  },
  [PARAMETER_IDS.MAX_VOICES]: {
    min: 1,
    max: 32,
    default: 16,
  },
} as const;

// Helper function to convert normalized value (0-255) to parameter range
export function normalizeParameterValue(
  parameterId: number,
  value: number
): number {
  switch (parameterId) {
    // ... existing cases ...

    // LFO frequencies: 0.1 Hz to 20 Hz, exponential scale
    case PARAMETER_IDS.LFO1_FREQUENCY:
    case PARAMETER_IDS.LFO2_FREQUENCY:
      return 0.1 * Math.pow(200, value / 255); // 0.1 Hz to 20 Hz

    // LFO depths: 0 to 1, linear scale
    case PARAMETER_IDS.LFO1_DEPTH:
    case PARAMETER_IDS.LFO2_DEPTH:
      return value / 255;

    default:
      return value;
  }
}

export const defaultProject: Project = {
  name: "New Project",
  instruments: [
    {
      id: "00",
      name: "Square Lead",
      oscillator: {
        type: "square",
        detune: 0,
      },
      filter: {
        type: "lowpass",
        frequency: 2000,
        resonance: 1,
        envelope: {
          type: "adsr",
          attack: 0.01,
          decay: 0.1,
          sustain: 0.8,
          release: 0.2,
        },
        envelopeAmount: 0.5,
      },
      envelope: {
        type: "adsr",
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
      },
      lfo1: {
        waveform: "sine",
        frequency: 1,
        depth: 0,
        target: PARAMETER_IDS.FILTER_FREQUENCY,
      },
      lfo2: {
        waveform: "sine",
        frequency: 1,
        depth: 0,
        target: PARAMETER_IDS.FILTER_FREQUENCY,
      },

      volume: 1,
      pan: 0,
    },
    {
      id: "01",
      name: "Triangle Bass",
      oscillator: {
        type: "triangle",
        detune: 0,
      },
      filter: {
        type: "lowpass",
        frequency: 500,
        resonance: 2,
        envelope: {
          type: "ad",
          attack: 0.05,
          decay: 0.3,
          sustain: 0,
          release: 0,
        },
        envelopeAmount: 0.3,
      },
      envelope: {
        type: "ad",
        attack: 0.05,
        decay: 0.5,
        sustain: 0,
        release: 0,
      },
      lfo1: {
        waveform: "sine",
        frequency: 1,
        depth: 0,
        target: PARAMETER_IDS.FILTER_FREQUENCY,
      },
      lfo2: {
        waveform: "sine",
        frequency: 1,
        depth: 0,
        target: PARAMETER_IDS.FILTER_FREQUENCY,
      },

      volume: 1,
      pan: 0,
    },
    {
      id: "02",
      name: "Sawtooth Lead",
      oscillator: {
        type: "sawtooth",
        detune: 0,
      },
      filter: {
        type: "lowpass",
        frequency: 3000,
        resonance: 4,
        envelope: {
          type: "adsr",
          attack: 0.1,
          decay: 0.2,
          sustain: 0.7,
          release: 0.3,
        },
        envelopeAmount: 0.7,
      },
      envelope: {
        type: "adsr",
        attack: 0.02,
        decay: 0.2,
        sustain: 0.6,
        release: 0.3,
      },
      lfo1: {
        waveform: "sine",
        frequency: 1,
        depth: 0,
        target: PARAMETER_IDS.FILTER_FREQUENCY,
      },
      lfo2: {
        waveform: "sine",
        frequency: 1,
        depth: 0,
        target: PARAMETER_IDS.FILTER_FREQUENCY,
      },
      volume: 1,
      pan: 0,
    },
  ],
  patterns: [
    {
      id: "00",
      name: "Pattern 00",
      tempo: 120,
      tracks: 4,
      rows: 16,
      notes: [],
    },
  ],
  song: [],
};

export function createDefaultInstrument(id: string): Instrument {
  return {
    id,
    name: "New Instrument",
    oscillator: {
      type: "square",
      detune: 0,
    },
    filter: {
      type: "lowpass",
      frequency: 1000,
      resonance: 1,
      envelopeAmount: 0,
      envelope: {
        type: "adsr",
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.1,
      },
    },
    envelope: {
      type: "adsr",
      attack: 0.01,
      decay: 0.1,
      sustain: 0.5,
      release: 0.1,
    },
    volume: 1,
    pan: 0,
    maxVoices: 16,
    lfo1: {
      waveform: "sine",
      frequency: 1,
      depth: 0,
      target: PARAMETER_IDS.FILTER_FREQUENCY,
    },
    lfo2: {
      waveform: "sine",
      frequency: 1,
      depth: 0,
      target: PARAMETER_IDS.OSCILLATOR_DETUNE,
    },
  };
}

export const DEFAULT_INSTRUMENTS: Instrument[] = [
  {
    id: "square-lead",
    name: "Square Lead",
    oscillator: {
      type: "square",
      detune: 0,
    },
    filter: {
      type: "lowpass",
      frequency: 1000,
      resonance: 1,
      envelopeAmount: 0,
      envelope: {
        type: "adsr",
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.1,
      },
    },
    envelope: {
      type: "adsr",
      attack: 0.01,
      decay: 0.1,
      sustain: 0.5,
      release: 0.1,
    },
    volume: 1,
    pan: 0,
    maxVoices: 16,
    lfo1: {
      waveform: "sine",
      frequency: 1,
      depth: 0,
      target: PARAMETER_IDS.FILTER_FREQUENCY,
    },
    lfo2: {
      waveform: "sine",
      frequency: 1,
      depth: 0,
      target: PARAMETER_IDS.OSCILLATOR_DETUNE,
    },
  },
  {
    id: "triangle-pad",
    name: "Triangle Pad",
    oscillator: {
      type: "triangle",
      detune: 0,
    },
    filter: {
      type: "lowpass",
      frequency: 1000,
      resonance: 1,
      envelopeAmount: 0,
      envelope: {
        type: "ad",
        attack: 0.5,
        decay: 1,
        sustain: 0,
        release: 0,
      },
    },
    envelope: {
      type: "ad",
      attack: 0.5,
      decay: 1,
      sustain: 0,
      release: 0,
    },
    volume: 1,
    pan: 0,
    maxVoices: 16,
    lfo1: {
      waveform: "sine",
      frequency: 0.5,
      depth: 0.2,
      target: PARAMETER_IDS.FILTER_FREQUENCY,
    },
    lfo2: {
      waveform: "triangle",
      frequency: 0.25,
      depth: 0.1,
      target: PARAMETER_IDS.PAN,
    },
  },
  {
    id: "sawtooth-bass",
    name: "Sawtooth Bass",
    oscillator: {
      type: "sawtooth",
      detune: 0,
    },
    filter: {
      type: "lowpass",
      frequency: 1000,
      resonance: 1,
      envelopeAmount: 0,
      envelope: {
        type: "adsr",
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.1,
      },
    },
    envelope: {
      type: "adsr",
      attack: 0.01,
      decay: 0.1,
      sustain: 0.5,
      release: 0.1,
    },
    volume: 1,
    pan: 0,
    maxVoices: 16,
    lfo1: {
      waveform: "sine",
      frequency: 6,
      depth: 0.3,
      target: PARAMETER_IDS.FILTER_FREQUENCY,
    },
    lfo2: {
      waveform: "square",
      frequency: 2,
      depth: 0.1,
      target: "lfo1_depth",
    },
  },
];
