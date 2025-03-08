import type { Pattern, Note } from "../types";
import { EventSystem } from "./event-system";
import { InstrumentNode } from "./instrument-node";
import { PARAMETER_IDS, normalizeParameterValue } from "../types";

export class PlaybackScheduler {
  private audioContext: AudioContext;
  private instruments: Map<string, InstrumentNode>;
  private currentPattern: Pattern | null = null;
  private currentSong: { patterns: Pattern[]; sequence: string[][] } | null =
    null;
  public isPlaying = false;
  private currentRow = 0;
  private currentSequence = 0;
  private nextNoteTime = 0;
  private tempo = 120;
  private timerID: number | null = null;
  private scheduleAheadTime = 0.1;
  private lookahead = 25; // ms
  private events: EventSystem;
  // Keep track of last note per track across rows
  private lastNotePerTrack = new Map<
    number,
    { instrument: string; tone: number }
  >();

  constructor(
    audioContext: AudioContext,
    instruments: Map<string, InstrumentNode>,
    events: EventSystem
  ) {
    this.audioContext = audioContext;
    this.instruments = instruments;
    this.events = events;
  }

  // Set the current pattern to play
  setPattern(pattern: Pattern) {
    const wasPlaying = this.isPlaying;
    const currentTime = this.nextNoteTime;
    const currentRow = this.currentRow;

    this.currentPattern = pattern;
    this.currentSong = null;
    this.tempo = pattern.tempo;

    // Restore playback state if needed
    if (wasPlaying) {
      this.currentRow = currentRow;
      this.nextNoteTime = currentTime;
    }
  }

  // Update pattern in real-time
  updatePattern(pattern: Pattern) {
    if (this.currentPattern?.id === pattern.id) {
      this.currentPattern = pattern;
      this.tempo = pattern.tempo;
    } else if (this.currentSong) {
      // Update pattern in song if it's part of the current song
      const patternIndex = this.currentSong.patterns.findIndex(
        (p) => p.id === pattern.id
      );
      if (patternIndex !== -1) {
        this.currentSong.patterns[patternIndex] = pattern;
        // Update tempo if this is the current pattern in sequence
        const currentSequence = this.currentSong.sequence[this.currentSequence];
        if (currentSequence && currentSequence[0] === pattern.id) {
          this.tempo = pattern.tempo;
        }
      }
    }
  }

  // Set the current song to play
  setSong(songSequence: string[][], patterns: Pattern[]) {
    this.currentSong = {
      patterns,
      sequence: songSequence,
    };
    this.currentPattern = null;
    this.currentSequence = 0;

    // Set tempo from first pattern in first sequence
    if (songSequence.length > 0 && songSequence[0].length > 0) {
      const firstPatternId = songSequence[0][0];
      const firstPattern = patterns.find((p) => p.id === firstPatternId);
      if (firstPattern) {
        this.tempo = firstPattern.tempo;
      }
    }
  }

  // Start playback
  async play() {
    if (!this.audioContext) return;

    if (this.isPlaying) return;

    if (!this.currentPattern && !this.currentSong) {
      console.error("No pattern or song set for playback");
      return;
    }

    this.isPlaying = true;
    this.currentRow = 0;
    this.currentSequence = 0;
    this.nextNoteTime = this.audioContext.currentTime;

    this.events.emit("playStart");
    this.scheduler();
  }

  // Stop playback
  stop() {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    if (this.timerID !== null) {
      window.clearTimeout(this.timerID);
      this.timerID = null;
    }

    // Stop all active notes
    this.instruments.forEach((instrument) => {
      instrument.releaseAll();
    });

    // Clear the last note tracking when stopping
    this.lastNotePerTrack.clear();

    this.events.emit("playStop");
  }

  // Seek to a specific row
  seek(row: number) {
    this.currentRow = row;
  }

  // Scheduler for precise timing
  private scheduler() {
    if (!this.isPlaying || !this.audioContext) return;

    // Schedule notes until the next lookahead boundary
    while (
      this.nextNoteTime <
      this.audioContext.currentTime + this.scheduleAheadTime
    ) {
      this.scheduleNotes();
      this.advancePlayback();
    }

    // Schedule the next scheduler call
    this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  // Schedule notes at the current row
  private scheduleNotes() {
    if (!this.audioContext) return;

    let notesToSchedule: Note[] = [];

    if (this.currentPattern) {
      // Playing a single pattern
      notesToSchedule = this.currentPattern.notes.filter(
        (note) => note.row === this.currentRow
      );
    } else if (this.currentSong) {
      // Playing a song
      const currentSequence = this.currentSong.sequence[this.currentSequence];
      if (!currentSequence) return;

      // Collect notes from all patterns in the current sequence
      currentSequence.forEach((patternId) => {
        const pattern = this.currentSong!.patterns.find(
          (p) => p.id === patternId
        );
        if (pattern) {
          const patternNotes = pattern.notes.filter(
            (note) => note.row === this.currentRow
          );
          notesToSchedule = [...notesToSchedule, ...patternNotes];
        }
      });
    }

    // First pass: Process note-on events
    notesToSchedule.forEach((note) => {
      const instrument = this.instruments.get(note.instrument);
      if (!instrument) {
        console.warn(`[AudioEngine] Instrument ${note.instrument} not found`);
        return;
      }

      // Skip note-off events and parameter control notes in first pass
      if (note.tone === 0x3d || note.effect === 0xff) {
        return;
      }

      // Regular note playback
      if (note.velocity > 0) {
        const velocity = note.velocity / 255;
        instrument.noteOn(note.tone, velocity, this.nextNoteTime);

        // Store this note as the last note played on this track
        this.lastNotePerTrack.set(note.track, {
          instrument: note.instrument,
          tone: note.tone,
        });
      }
    });

    // Second pass: Process note-off events and parameter control notes
    notesToSchedule.forEach((note) => {
      const instrument = this.instruments.get(note.instrument);
      if (!instrument) return;

      // Handle parameter control notes (effect FF)
      if (note.effect === 0xff) {
        const parameterId = (note.effectValue >> 8) & 0xff; // High byte is parameter ID
        const parameterValue = note.effectValue & 0xff; // Low byte is parameter value

        // Get the normalized parameter value
        const normalizedValue = normalizeParameterValue(
          parameterId,
          parameterValue
        );

        // Update the instrument parameter
        const currentInstrument = instrument.getInstrument();
        const updatedInstrument = { ...currentInstrument };

        switch (parameterId) {
          // Oscillator parameters
          case PARAMETER_IDS.OSCILLATOR_TYPE:
            const types = [
              "sine",
              "square",
              "sawtooth",
              "triangle",
              "noise",
              "sampler",
            ];
            updatedInstrument.oscillator.type =
              types[Math.min(parameterValue, types.length - 1)];
            break;
          case PARAMETER_IDS.OSCILLATOR_DETUNE:
            updatedInstrument.oscillator.detune = normalizedValue;
            break;

          // Filter parameters
          case PARAMETER_IDS.FILTER_TYPE:
            updatedInstrument.filter.type =
              parameterValue === 0 ? "lowpass" : "highpass";
            break;
          case PARAMETER_IDS.FILTER_FREQUENCY:
            updatedInstrument.filter.frequency = normalizedValue;
            break;
          case PARAMETER_IDS.FILTER_RESONANCE:
            updatedInstrument.filter.resonance = normalizedValue;
            break;
          case PARAMETER_IDS.FILTER_ENVELOPE_AMOUNT:
            updatedInstrument.filter.envelopeAmount = normalizedValue;
            break;

          // Filter envelope parameters
          case PARAMETER_IDS.FILTER_ENVELOPE_TYPE:
            const envTypes = ["ad", "ar", "adsr"];
            updatedInstrument.filter.envelope.type = envTypes[
              Math.min(parameterValue, envTypes.length - 1)
            ] as any;
            break;
          case PARAMETER_IDS.FILTER_ENVELOPE_ATTACK:
            updatedInstrument.filter.envelope.attack = normalizedValue;
            break;
          case PARAMETER_IDS.FILTER_ENVELOPE_DECAY:
            updatedInstrument.filter.envelope.decay = normalizedValue;
            break;
          case PARAMETER_IDS.FILTER_ENVELOPE_SUSTAIN:
            updatedInstrument.filter.envelope.sustain = normalizedValue;
            break;
          case PARAMETER_IDS.FILTER_ENVELOPE_RELEASE:
            updatedInstrument.filter.envelope.release = normalizedValue;
            break;

          // Amplitude envelope parameters
          case PARAMETER_IDS.ENVELOPE_TYPE:
            const ampEnvTypes = ["ad", "ar", "adsr"];
            updatedInstrument.envelope.type = ampEnvTypes[
              Math.min(parameterValue, ampEnvTypes.length - 1)
            ] as any;
            break;
          case PARAMETER_IDS.ENVELOPE_ATTACK:
            updatedInstrument.envelope.attack = normalizedValue;
            break;
          case PARAMETER_IDS.ENVELOPE_DECAY:
            updatedInstrument.envelope.decay = normalizedValue;
            break;
          case PARAMETER_IDS.ENVELOPE_SUSTAIN:
            updatedInstrument.envelope.sustain = normalizedValue;
            break;
          case PARAMETER_IDS.ENVELOPE_RELEASE:
            updatedInstrument.envelope.release = normalizedValue;
            break;

          // Global parameters
          case PARAMETER_IDS.VOLUME:
            updatedInstrument.volume = normalizedValue;
            break;
          case PARAMETER_IDS.PAN:
            updatedInstrument.pan = normalizedValue;
            break;
          case PARAMETER_IDS.MAX_VOICES:
            updatedInstrument.maxVoices = Math.floor(normalizedValue);
            break;
        }

        // Update the instrument
        instrument.updateInstrument(updatedInstrument);
        return;
      }

      // Handle note-off events (tone === 0x3D, which is '=' in ASCII)
      if (note.tone === 0x3d) {
        // Look up the last note played on this track
        const lastNote = this.lastNotePerTrack.get(note.track);
        if (lastNote && lastNote.instrument === note.instrument) {
          const targetInstrument = this.instruments.get(lastNote.instrument);
          if (targetInstrument) {
            // Add a small offset to ensure note-off happens after note-on
            const noteOffTime = this.nextNoteTime + 0.001;
            targetInstrument.noteOff(lastNote.tone, noteOffTime);
            // Clear the last note for this track after stopping it
            this.lastNotePerTrack.delete(note.track);
          }
        } else {
          console.warn(
            `[AudioEngine] No matching note found for note-off event:`,
            {
              track: note.track,
              instrument: note.instrument,
              lastNoteMap: Array.from(this.lastNotePerTrack.entries()),
            }
          );
        }
      }
    });

    // Emit row change event
    this.events.emit("rowChange", this.currentRow);
  }

  // Calculate note duration based on tempo
  private getNoteDuration(): number {
    // Default to 16th notes
    return 60 / this.tempo / 4;
  }

  // Advance to the next row or sequence
  private advancePlayback() {
    // Calculate time for the next note
    this.nextNoteTime += this.getNoteDuration();

    if (this.currentPattern) {
      // Advance within pattern
      this.currentRow = (this.currentRow + 1) % this.currentPattern.rows;
    } else if (this.currentSong) {
      // Advance within song
      const currentSequence = this.currentSong.sequence[this.currentSequence];
      if (!currentSequence) return;

      // Find the pattern with the most rows
      let maxRows = 16; // Default
      currentSequence.forEach((patternId) => {
        const pattern = this.currentSong!.patterns.find(
          (p) => p.id === patternId
        );
        if (pattern && pattern.rows > maxRows) {
          maxRows = pattern.rows;
        }
      });

      this.currentRow = (this.currentRow + 1) % maxRows;

      // If we've reached the end of the current sequence, move to the next
      if (this.currentRow === 0) {
        this.currentSequence =
          (this.currentSequence + 1) % this.currentSong.sequence.length;

        // Update tempo if needed
        if (this.currentSong.sequence[this.currentSequence]?.length > 0) {
          const nextPatternId =
            this.currentSong.sequence[this.currentSequence][0];
          const nextPattern = this.currentSong.patterns.find(
            (p) => p.id === nextPatternId
          );
          if (nextPattern) {
            this.tempo = nextPattern.tempo;
          }
        }
      }
    }
  }
}
