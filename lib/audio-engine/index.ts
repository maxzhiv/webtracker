"use client";

import type { Project, Instrument, Pattern } from "../types";
import { EventSystem } from "./event-system";
import { InstrumentNode } from "./instrument-node";
import { PlaybackScheduler } from "./playback-scheduler";

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private instruments: Map<string, InstrumentNode> = new Map();
  private samples: Map<string, AudioBuffer> = new Map();
  private sampleData: Map<string, string> = new Map(); // Store base64 encoded sample data
  private userHasActivatedAudioContext = false;
  private events: EventSystem;
  private scheduler: PlaybackScheduler | null = null;

  constructor() {
    this.events = new EventSystem();
  }

  public initAudioContext() {
    if (!this.userHasActivatedAudioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.75;
      this.masterGain.connect(this.audioContext.destination);
      this.userHasActivatedAudioContext = true;

      // Initialize scheduler
      this.scheduler = new PlaybackScheduler(
        this.audioContext,
        this.instruments,
        this.events
      );
    } else if (this.audioContext?.state === "suspended") {
      this.audioContext.resume();
    }
  }

  // Update instrument in real-time
  public updateInstrument(instrumentId: string, instrument: Instrument) {
    if (!this.audioContext || !this.userHasActivatedAudioContext) return;

    if (!this.instruments.has(instrumentId)) {
      // Create new instrument if it doesn't exist
      this.instruments.set(
        instrumentId,
        new InstrumentNode(this.audioContext, this.masterGain!, instrument)
      );
    } else {
      // Update existing instrument
      const instrumentNode = this.instruments.get(instrumentId);
      if (instrumentNode) {
        instrumentNode.updateInstrument(instrument);
      }
    }
  }

  // Load project data
  public async loadProject(project: Project) {
    if (!this.userHasActivatedAudioContext) {
      console.log("[AudioEngine] Cannot load project - audio not initialized");
      return;
    }
    if (!this.audioContext) return;

    // Store current playback state
    const wasPlaying = this.scheduler?.isPlaying;
    if (wasPlaying) {
      this.scheduler?.stop();
    }

    // Clear existing samples and sample data
    this.samples.clear();
    this.sampleData.clear();

    // Load sample data first if present
    if (project.sampleData) {
      await this.loadSampleData(project.sampleData);
    }

    // Update or create instrument nodes as needed
    const newInstruments = new Map<string, InstrumentNode>();

    // First pass: create all instrument nodes
    for (const instrument of project.instruments) {
      const node = new InstrumentNode(
        this.audioContext!,
        this.masterGain!,
        instrument
      );

      // If it's a sampler, set its sample buffer
      if (instrument.oscillator.type === "sampler") {
        const sampleBuffer = this.samples.get(instrument.id);
        if (sampleBuffer) {
          node.sampleBuffer = sampleBuffer;
        } else {
          console.warn(
            `[AudioEngine] No sample data found for sampler instrument "${instrument.id}"`
          );
        }
      }

      newInstruments.set(instrument.id, node);
    }

    // Replace instruments map
    this.instruments.clear();
    newInstruments.forEach((node, id) => {
      this.instruments.set(id, node);
    });
    project.instruments = Array.from(newInstruments.values()).map((node) => {
      const instrument = node.getInstrument();
      if (instrument.oscillator.type === "sampler") {
        instrument.oscillator.sample!.buffer = node.sampleBuffer;
      }
      return instrument;
    });

    // Restore playback state if was playing
    if (wasPlaying) {
      this.scheduler?.play();
    }

    this.events.emit("projectLoaded", { project });
  }

  // Convert AudioBuffer to base64 string
  private audioBufferToBase64(audioBuffer: AudioBuffer): string {
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const channelData: Float32Array[] = [];

    // Get data from each channel
    for (let i = 0; i < numChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i));
    }

    // Create binary data
    const wavData = {
      numChannels,
      length,
      sampleRate,
      channelData,
    };

    // Convert to base64
    const jsonStr = JSON.stringify(wavData);
    return btoa(jsonStr);
  }

  // Convert base64 string back to AudioBuffer
  public async base64ToAudioBuffer(base64String: string): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error("AudioContext not initialized");

    // Decode base64
    const jsonStr = atob(base64String);
    const wavData = JSON.parse(jsonStr);

    // Create new AudioBuffer
    const audioBuffer = this.audioContext.createBuffer(
      wavData.numChannels,
      wavData.length,
      wavData.sampleRate
    );

    // Fill channels with data
    for (let i = 0; i < wavData.numChannels; i++) {
      const f32Array = Float32Array.from(Object.values(wavData.channelData[i]));
      audioBuffer.copyToChannel(f32Array, i);
    }

    return audioBuffer;
  }

  // Sample loading
  async loadSample(instrumentId: string, file: File): Promise<void> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
      // Store both AudioBuffer and base64 data
      this.samples.set(instrumentId, audioBuffer);
      const base64Data = this.audioBufferToBase64(audioBuffer);
      this.sampleData.set(instrumentId, base64Data);

      // Set the sample buffer in the instrument node
      const instrumentNode = this.instruments.get(instrumentId);
      if (instrumentNode) {
        instrumentNode.setSampleBuffer(audioBuffer);

        // Update the instrument's sample data
        const instrument = instrumentNode.getInstrument();
        if (instrument.oscillator.type === "sampler") {
          instrument.oscillator.sample = {
            ...(instrument.oscillator.sample || {
              startPoint: 0,
              endPoint: 1,
              gain: 1,
              loopType: "oneshot",
            }),
            buffer: audioBuffer,
            fileName: file.name,
          };
          instrumentNode.updateInstrument(instrument);
        }
      }

      // Emit sample loaded event
      this.events.emit("sampleLoaded", { instrumentId, buffer: audioBuffer });
    } catch (error) {
      console.error(
        `[AudioEngine] Failed to load sample for instrument ${instrumentId}:`,
        error
      );
      throw error;
    }
  }

  // Get serializable sample data for project export
  public getSampleData(
    channels: number = 2,
    sampleRate: number = 44100,
    format: "i8" | "f12" | "f16" | "f32" = "f32"
  ): { [key: string]: string } {
    // Handle mono conversion if requested
    const processBuffer = (buffer: AudioBuffer): AudioBuffer => {
      let processedBuffer = buffer;

      // Convert to mono if requested
      if (channels === 1 && buffer.numberOfChannels > 1) {
        const monoBuffer = this.audioContext!.createBuffer(
          1,
          buffer.length,
          buffer.sampleRate
        );
        const monoData = monoBuffer.getChannelData(0);

        // Mix down to mono
        for (let i = 0; i < buffer.length; i++) {
          let sum = 0;
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            sum += buffer.getChannelData(channel)[i];
          }
          monoData[i] = sum / buffer.numberOfChannels;
        }
        processedBuffer = monoBuffer;
      }

      // Resample if needed
      if (sampleRate < processedBuffer.sampleRate) {
        const ratio = sampleRate / processedBuffer.sampleRate;
        const newLength = Math.floor(processedBuffer.length * ratio);
        const resampledBuffer = this.audioContext!.createBuffer(
          processedBuffer.numberOfChannels,
          newLength,
          sampleRate
        );

        for (
          let channel = 0;
          channel < processedBuffer.numberOfChannels;
          channel++
        ) {
          const inputData = processedBuffer.getChannelData(channel);
          const outputData = resampledBuffer.getChannelData(channel);

          for (let i = 0; i < newLength; i++) {
            const pos = i / ratio;
            const index = Math.floor(pos);
            const fraction = pos - index;

            // Linear interpolation
            const a = inputData[index];
            const b =
              inputData[Math.min(index + 1, processedBuffer.length - 1)];
            outputData[i] = a + fraction * (b - a);
          }
        }
        processedBuffer = resampledBuffer;
      }

      // Convert sample format
      for (
        let channel = 0;
        channel < processedBuffer.numberOfChannels;
        channel++
      ) {
        const data = processedBuffer.getChannelData(channel);

        switch (format) {
          case "i8":
            // Convert to 8-bit integer (-128 to 127)
            for (let i = 0; i < data.length; i++) {
              data[i] = Math.max(-1, Math.min(1, data[i])) * 127;
            }
            break;

          case "f12":
            // Convert to 12-bit float (-1 to 1, quantized)
            for (let i = 0; i < data.length; i++) {
              data[i] = Math.round(data[i] * 2047) / 2047;
            }
            break;

          case "f16":
            // Convert to 16-bit float (-1 to 1, quantized)
            for (let i = 0; i < data.length; i++) {
              data[i] = Math.round(data[i] * 32767) / 32767;
            }
            break;

          case "f32":
            // Already in f32 format
            break;
        }
      }

      return processedBuffer;
    };

    if (channels !== 2 || sampleRate !== 44100 || format !== "f32") {
      this.samples.forEach((audioBuffer, instrumentId) => {
        const processedBuffer = processBuffer(audioBuffer);
        this.samples.set(instrumentId, processedBuffer);
        this.sampleData.set(
          instrumentId,
          this.audioBufferToBase64(processedBuffer)
        );
      });
    }

    const data: { [key: string]: string } = {};
    this.sampleData.forEach((base64Data, instrumentId) => {
      data[instrumentId] = base64Data;
    });
    return data;
  }

  // Load sample data from project import
  public async loadSampleData(data: { [key: string]: string }): Promise<void> {
    if (!this.audioContext) throw new Error("AudioContext not initialized");

    for (const [instrumentId, base64Data] of Object.entries(data)) {
      try {
        const audioBuffer = await this.base64ToAudioBuffer(base64Data);
        this.samples.set(instrumentId, audioBuffer);
        this.sampleData.set(instrumentId, base64Data);

        const instrumentNode = this.instruments.get(instrumentId);
        if (instrumentNode) {
          instrumentNode.setSampleBuffer(audioBuffer);

          // Update the instrument's sample data
          const instrument = instrumentNode.getInstrument();
          if (
            instrument.oscillator.type === "sampler" &&
            instrument.oscillator.sample
          ) {
            instrument.oscillator.sample.buffer = audioBuffer;
            instrumentNode.updateInstrument(instrument);
          }
        }

        this.events.emit("sampleLoaded", {
          instrumentId,
          buffer: audioBuffer,
        });
      } catch (error) {
        console.error(
          `[AudioEngine] Failed to restore sample for instrument ${instrumentId}:`,
          error
        );
      }
    }
  }

  public async updateSample(instrumentId: string, sample: AudioBuffer) {
    this.samples.set(instrumentId, sample);
    this.sampleData.set(instrumentId, this.audioBufferToBase64(sample));
  }

  // Playback control methods
  public play() {
    this.scheduler?.play();
  }

  public stop() {
    this.scheduler?.stop();
  }

  public setPattern(pattern: Pattern) {
    this.scheduler?.setPattern(pattern);
  }

  public updatePattern(pattern: Pattern) {
    this.scheduler?.updatePattern(pattern);
  }

  public setSong(songSequence: string[][], patterns: Pattern[]) {
    this.scheduler?.setSong(songSequence, patterns);
  }

  public seek(row: number) {
    this.scheduler?.seek(row);
  }

  // Event system methods
  public on(event: string, callback: (...args: any[]) => void) {
    this.events.on(event, callback);
  }

  public off(event: string, callback: (...args: any[]) => void) {
    this.events.off(event, callback);
  }

  // Set master volume
  public setVolume(volume: number) {
    if (!this.userHasActivatedAudioContext) return;
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  // Get sample buffer for waveform visualization
  public getSampleBufferForInstrument(
    instrumentId: string
  ): AudioBuffer | null {
    // First try to get from samples map
    const buffer = this.samples.get(instrumentId);
    if (buffer) return buffer;

    // If not found in samples map, try to get from instrument node
    const instrumentNode = this.instruments.get(instrumentId);
    if (instrumentNode) {
      return instrumentNode.getSampleBuffer();
    }

    return null;
  }

  // Get sample data for visualization
  public getSampleDataForVisualization(instrumentId: string): {
    data: Float32Array;
    sampleRate: number;
    length: number;
  } | null {
    const buffer = this.getSampleBufferForInstrument(instrumentId);
    if (!buffer) return null;

    // For visualization, we'll use a mono mix if the sample is stereo
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const data = new Float32Array(length);

    if (channels === 1) {
      // Mono sample - just copy the data
      data.set(buffer.getChannelData(0));
    } else {
      // Mix down to mono
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      for (let i = 0; i < length; i++) {
        data[i] = (left[i] + right[i]) / 2;
      }
    }

    return {
      data,
      sampleRate,
      length,
    };
  }
}

// Singleton instance
let audioEngineInstance: AudioEngine | null = null;

export function useAudioEngine(): AudioEngine {
  if (!audioEngineInstance) {
    audioEngineInstance = new AudioEngine();
  }
  console.log(
    "[AudioEngine] Using audio engine instance:",
    audioEngineInstance
  );
  return audioEngineInstance;
}
