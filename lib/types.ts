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

export interface Instrument {
  id: string;
  name: string;
  oscillator: Oscillator;
  filter: Filter;
  envelope: Envelope;
  maxVoices?: number; // Maximum number of simultaneous voices (optional, defaults to 16)
  volume: number; // 0 to 1
  pan: number; // -1 to 1
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
  const range = PARAMETER_RANGES[parameterId as keyof typeof PARAMETER_RANGES];
  if (!range) return value;

  // Handle enum types
  if ("values" in range && typeof range.fromNormalized === "function") {
    return range.fromNormalized(value / 255);
  }

  // Handle numeric ranges
  if ("min" in range && "max" in range) {
    return (value / 255) * (range.max - range.min) + range.min;
  }

  return value;
}
