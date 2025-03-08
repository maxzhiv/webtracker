import { useEffect, useRef } from "react";
import { useAudioEngine } from "@/lib/audio-engine";
import { midiToFrequency } from "@/lib/utils";
import type { Instrument } from "@/lib/types";

interface KeyboardProps {
  instrumentId: string;
  instrument: Instrument;
  onChangeParameter: (field: string, value: any) => void;
}

export default function Keyboard({ instrumentId, instrument }: KeyboardProps) {
  const audioEngine = useAudioEngine();
  const keyboardRef = useRef<HTMLDivElement>(null);

  // Define keyboard layout
  const keys = [
    { note: 60, type: "white", label: "C4" },
    { note: 61, type: "black", label: "c4" },
    { note: 62, type: "white", label: "D4" },
    { note: 63, type: "black", label: "d4" },
    { note: 64, type: "white", label: "E4" },
    { note: 65, type: "white", label: "F4" },
    { note: 66, type: "black", label: "f4" },
    { note: 67, type: "white", label: "G4" },
    { note: 68, type: "black", label: "g4" },
    { note: 69, type: "white", label: "A4" },
    { note: 70, type: "black", label: "a4" },
    { note: 71, type: "white", label: "B4" },
    { note: 72, type: "white", label: "C5" },
    { note: 73, type: "black", label: "c5" },
    { note: 74, type: "white", label: "D5" },
    { note: 75, type: "black", label: "d5" },
    { note: 76, type: "white", label: "E5" },
    { note: 77, type: "white", label: "F5" },
    { note: 78, type: "black", label: "f5" },
    { note: 79, type: "white", label: "G5" },
    { note: 80, type: "black", label: "g5" },
    { note: 81, type: "white", label: "A5" },
    { note: 82, type: "black", label: "a5" },
    { note: 83, type: "white", label: "B5" },
    { note: 84, type: "white", label: "C6" },
  ];

  const handleNoteOn = (midiNote: number) => {
    if (audioEngine) {
      audioEngine.updateInstrument(instrumentId, instrument);
      const instrumentNode = (audioEngine as any).instruments.get(instrumentId);
      if (instrumentNode) {
        instrumentNode.noteOn(midiNote, 1.0);
      }
    }
  };

  const handleNoteOff = (midiNote: number) => {
    if (audioEngine) {
      const instrumentNode = (audioEngine as any).instruments.get(instrumentId);
      if (instrumentNode) {
        instrumentNode.noteOff(midiNote);
      }
    }
  };

  return (
    <div className="bg-gray-950 rounded-lg">
      <div className="relative h-12 flex" ref={keyboardRef}>
        {keys.map((key) => (
          <div
            key={key.note}
            className={`
              ${key.type === "white" ? "bg-orange-950" : "bg-orange-700"}
              ${key.type === "white" ? "w-12" : "w-8"}
              ${key.type === "white" ? "h-full" : "h-3/4"}
              ${key.type === "black" ? "-ml-4 -mr-4" : ""}
              relative
              border border-gray-300
              rounded-b
              cursor-pointer
              hover:bg-gray-100
              active:bg-gray-200
              transition-colors
              select-none
            `}
            style={{
              zIndex: key.type === "black" ? 1 : 0,
            }}
            onMouseDown={() => handleNoteOn(key.note)}
            onMouseUp={() => handleNoteOff(key.note)}
            onMouseLeave={() => handleNoteOff(key.note)}
          >
            <span
              className={`
                absolute
                bottom-0
                left-1/2
                transform
                -translate-x-1/2
                text-xs
                ${key.type === "white" ? "text-yellow-400" : "text-yellow-500"}
              `}
            >
              {key.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
