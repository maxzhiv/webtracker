// Utility functions for the tracker DAW

// Convert MIDI note number to note name (e.g. 60 -> C-4)
export function midiNoteToName(note: number): string {
  // Special case for note-off event
  if (note === 0x3d) {
    return "=0";
  }

  const NOTE_NAMES = [
    "C",
    "c",
    "D",
    "d",
    "E",
    "F",
    "f",
    "G",
    "g",
    "A",
    "a",
    "B",
  ];
  const octave = Math.floor(note / 12) - 1;
  const noteName = NOTE_NAMES[note % 12];
  return `${noteName}${octave}`;
}

// Convert note name to MIDI note number (e.g. C-4 -> 60)
export function noteNameToMidi(noteName: string): number {
  // Special case for note-off event
  if (noteName.startsWith("=")) {
    return 0x3d;
  }

  // Handle lowercase notes as sharp of previous note
  const normalized = noteName.replace(/([a-g])/, (m) => {
    const sharpNote = {
      c: "c",
      d: "d",
      f: "f",
      g: "g",
      a: "a",
    }[m.toLowerCase()];
    return sharpNote || m.toUpperCase();
  });

  const note = normalized.slice(0, -1);
  const octave = parseInt(normalized.slice(-1));
  const NOTE_NAMES = [
    "C",
    "c",
    "D",
    "d",
    "E",
    "F",
    "f",
    "G",
    "g",
    "A",
    "a",
    "B",
  ];
  const noteIndex = NOTE_NAMES.indexOf(note);

  if (noteIndex === -1) throw new Error(`Invalid note name: ${noteName}`);

  return (octave + 1) * 12 + noteIndex;
}

// Convert frequency to MIDI note number
export function frequencyToMidi(frequency: number): number {
  return Math.round(12 * Math.log2(frequency / 440) + 69);
}

// Convert MIDI note number to frequency
export function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// Format time in seconds to MM:SS format
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

// Create a unique ID
export function createId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

// Format a note object to string (e.g., { instrument: "00", velocity: 255, tone: 60 } -> "00FFc4000000")
export function formatNote(note: {
  instrument: string;
  velocity: number;
  tone: number;
  effect?: number;
  effectValue?: number;
}): string {
  const velocity = note.velocity.toString(16).padStart(2, "0").toUpperCase();
  const noteName = midiNoteToName(note.tone);
  const effect = (note.effect || 0).toString(16).padStart(2, "0").toUpperCase();
  const effectValue = (note.effectValue || 0)
    .toString(16)
    .padStart(4, "0")
    .toUpperCase();

  return `${note.instrument}${velocity}${noteName}${effect}${effectValue}`;
}

// Parse a note string (e.g., "00FFc4000000" -> { instrument: "00", velocity: 255, tone: 60 })
export function parseNoteString(noteStr: string): {
  instrument: string;
  velocity: number;
  tone: number;
  effect: number;
  effectValue: number;
} {
  const normalized = noteStr.trim();
  if (normalized.length < 4) throw new Error("Note string too short");

  const instrument = normalized.substring(0, 2);
  const velocity = parseInt(normalized.substring(2, 4), 16);
  const noteName = normalized.substring(4, 6);
  const tone = noteNameToMidi(noteName);

  // Parse effect and effect value if present
  const remainingStr = normalized.substring(6);
  const effect =
    remainingStr.length >= 2 ? parseInt(remainingStr.substring(0, 2), 16) : 0;
  const effectValue =
    remainingStr.length >= 6 ? parseInt(remainingStr.substring(2, 6), 16) : 0;

  return {
    instrument,
    velocity,
    tone,
    effect,
    effectValue,
  };
}
