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
