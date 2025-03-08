"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { Instrument } from "@/lib/types";
import Oscillator from "./instrument/Oscillator";
import Filter from "./instrument/Filter";
import Envelope from "./instrument/Envelope";
import { useAudioEngine } from "@/lib/audio-engine";
import { Knob } from "@/components/ui/knob";
import Keyboard from "./instrument/Keyboard";
interface InstrumentEditorProps {
  instruments: Instrument[];
  onAddInstrument: () => void;
  onUpdateInstrument: (index: number, instrument: Instrument) => void;
  onRemoveInstrument: (index: number) => void;
}

export default function InstrumentEditor({
  instruments,
  onAddInstrument,
  onUpdateInstrument,
  onRemoveInstrument,
}: InstrumentEditorProps) {
  const [selectedInstrumentIndex, setSelectedInstrumentIndex] = useState(0);
  const audioEngine = useAudioEngine();

  type InstrumentKey = keyof Instrument;
  type NestedKeys =
    | "oscillator.type"
    | "oscillator.detune"
    | "filter.type"
    | "filter.frequency"
    | "filter.resonance"
    | "filter.envelope.type"
    | "filter.envelope.attack"
    | "filter.envelope.decay"
    | "filter.envelope.sustain"
    | "filter.envelope.release"
    | "envelope.type"
    | "envelope.attack"
    | "envelope.decay"
    | "envelope.sustain"
    | "envelope.release";

  type ParameterChangeHandler = (
    field: InstrumentKey | NestedKeys,
    value: any
  ) => void;

  const handleChange: ParameterChangeHandler = (field, value) => {
    if (instruments.length === 0) return;

    console.log("[InstrumentEditor] Handling change:", { field, value });

    const updatedInstrument = { ...instruments[selectedInstrumentIndex] };

    // Default envelope values with proper typing
    type EnvelopeType = "ad" | "ar" | "adsr";
    const defaultEnvelopeValues = {
      ad: {
        type: "ad" as const,
        attack: 0.01,
        decay: 0.1,
        sustain: 0,
        release: 0,
      },
      ar: {
        type: "ar" as const,
        attack: 0.01,
        decay: 0,
        sustain: 1,
        release: 0.1,
      },
      adsr: {
        type: "adsr" as const,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.1,
      },
    };

    // Ensure numeric values are valid numbers
    const ensureValidNumber = (val: any, defaultValue: number) => {
      const num = Number(val);
      return isNaN(num) ? defaultValue : num;
    };

    // Get default value for envelope property
    const getEnvelopePropertyDefault = (
      envType: EnvelopeType,
      prop: string
    ): number => {
      const env = defaultEnvelopeValues[envType];
      if (prop === "attack") return env.attack;
      if (prop === "decay") return env.decay;
      if (prop === "sustain") return env.sustain;
      if (prop === "release") return env.release;
      return 0;
    };

    // Handle nested properties
    if (field.includes(".")) {
      const [category, property_, ...property_rest] = field.split(".") as [
        keyof Instrument,
        string,
        ...string[]
      ];
      const property = [property_, ...property_rest].join(".");

      console.log("Cat/prop", category, property);

      // Ensure the category exists with default values
      if (!(category in updatedInstrument)) {
        if (category === "filter") {
          updatedInstrument.filter = {
            type: "lowpass",
            frequency: 1000,
            resonance: 1,
            envelopeAmount: 0,
            envelope: { ...defaultEnvelopeValues.adsr },
          };
        } else if (category === "envelope") {
          updatedInstrument.envelope = { ...defaultEnvelopeValues.adsr };
        } else if (category === "oscillator") {
          updatedInstrument.oscillator = {
            type: "square",
            detune: 0,
          };
        }
      }

      if (property.includes(".")) {
        const [subCategory, subProperty] = property.split(".") as [
          string,
          string
        ];

        // Handle envelope changes
        if (subCategory === "envelope") {
          const currentEnvelope =
            category === "filter"
              ? updatedInstrument.filter.envelope
              : updatedInstrument.envelope;

          // When changing envelope type
          if (subProperty === "type" && value in defaultEnvelopeValues) {
            console.log("Changing envelope type:", value);
            const newEnvelope = {
              ...currentEnvelope,
              ...defaultEnvelopeValues[value as EnvelopeType],
              type: value as EnvelopeType,
            };

            if (category === "filter") {
              updatedInstrument.filter.envelope = newEnvelope;
            } else {
              updatedInstrument.envelope = newEnvelope;
            }
          } else {
            // For other envelope properties
            const currentType = (currentEnvelope?.type ||
              "adsr") as EnvelopeType;
            const defaultValue = getEnvelopePropertyDefault(
              currentType,
              subProperty
            );

            const newEnvelope = {
              ...currentEnvelope,
              [subProperty]: ensureValidNumber(value, defaultValue),
            };

            if (category === "filter") {
              updatedInstrument.filter.envelope = newEnvelope;
            } else {
              updatedInstrument.envelope = newEnvelope;
            }
          }
        }
      } else {
        // Handle direct property updates (like filter.type, oscillator.type)
        if (category === "filter") {
          if (property === "frequency") {
            value = ensureValidNumber(value, 1000);
          } else if (property === "resonance") {
            value = ensureValidNumber(value, 1);
          }
          updatedInstrument.filter = {
            ...updatedInstrument.filter,
            [property]: value,
          };
        } else if (category === "oscillator") {
          if (property === "detune") {
            value = ensureValidNumber(value, 0);
          }
          updatedInstrument.oscillator = {
            ...updatedInstrument.oscillator,
            [property]: value,
          };
        } else if (category === "envelope") {
          updatedInstrument.envelope = {
            ...updatedInstrument.envelope,
            [property]: value,
          };
        }
      }
    } else {
      (updatedInstrument[field as keyof Instrument] as any) = value;
    }

    console.log("[InstrumentEditor] Updated instrument:", updatedInstrument);
    onUpdateInstrument(selectedInstrumentIndex, updatedInstrument);
  };

  // Create a wrapper function that ensures type compatibility
  const handleParameterChange = (field: string, value: any) => {
    handleChange(field as InstrumentKey | NestedKeys, value);
  };

  const handleLoadSample = async (file: File) => {
    if (instruments.length === 0) return;
    const instrumentId = instruments[selectedInstrumentIndex].id;
    await audioEngine.loadSample(instrumentId, file);
    // Update the instrument's sample data
    handleParameterChange("oscillator.sample", {
      buffer: null, // We don't store the buffer in the state
      fileName: file.name,
      startPoint: 0,
      endPoint: 1,
      gain: 1,
      loopType: "oneshot",
    });
  };

  return (
    <div className="h-full flex flex-col">
      {instruments.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">
            No instruments. Click "Add Instrument" to create one.
          </p>
          <Button
            onClick={onAddInstrument}
            disabled={instruments.length >= 255}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Instrument
          </Button>
        </div>
      ) : (
        <div className="flex gap-4 h-full">
          {/* Instrument List */}
          <div className="w-48 bg-gray-800 rounded-lg p-2 overflow-y-auto">
            {instruments.map((instrument, index) => (
              <div
                key={instrument.id}
                className={`p-2 rounded cursor-pointer flex justify-between items-center ${
                  index === selectedInstrumentIndex
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-gray-700"
                }`}
                onClick={() => setSelectedInstrumentIndex(index)}
              >
                <span className="truncate">{instrument.name}</span>
                <button
                  className="opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveInstrument(index);
                    if (
                      selectedInstrumentIndex >= index &&
                      selectedInstrumentIndex > 0
                    ) {
                      setSelectedInstrumentIndex(selectedInstrumentIndex - 1);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              onClick={onAddInstrument}
              disabled={instruments.length >= 255}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Instrument
            </Button>
          </div>

          {/* Instrument Editor */}
          {instruments.length > 0 && (
            <div className="flex-1">
              <Card>
                <CardContent>
                  <div className="flex flex-row gap-2">
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        className="bg-transparent border-none outline-none w-28"
                        value={instruments[selectedInstrumentIndex].name}
                        onChange={(e) =>
                          handleParameterChange("name", e.target.value)
                        }
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-muted-foreground">
                          Voices:
                        </label>
                        <input
                          type="number"
                          className="w-16 bg-background border rounded px-2 py-1"
                          min={1}
                          max={32}
                          value={
                            instruments[selectedInstrumentIndex].maxVoices ?? 16
                          }
                          onChange={(e) =>
                            handleParameterChange(
                              "maxVoices",
                              Math.max(
                                1,
                                Math.min(32, parseInt(e.target.value) || 16)
                              )
                            )
                          }
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center">
                          <label className="text-sm text-muted-foreground">
                            Volume
                          </label>
                          <Knob
                            value={instruments[selectedInstrumentIndex].volume}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(value) =>
                              handleParameterChange("volume", value)
                            }
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <label className="text-sm text-muted-foreground">
                            Pan
                          </label>
                          <Knob
                            value={instruments[selectedInstrumentIndex].pan}
                            min={-1}
                            max={1}
                            step={0.01}
                            onChange={(value) =>
                              handleParameterChange("pan", value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <Oscillator
                        instrumentId={instruments[selectedInstrumentIndex].id}
                        oscillator={
                          instruments[selectedInstrumentIndex].oscillator
                        }
                        onChangeParameter={handleParameterChange}
                        onLoadSample={handleLoadSample}
                      />
                    </div>
                    <div className="space-y-6">
                      <Envelope
                        envelope={instruments[selectedInstrumentIndex].envelope}
                        label="Oscillator Envelope"
                        prefix="envelope"
                        onChangeParameter={handleParameterChange}
                      />
                    </div>
                    <Filter
                      instrument={instruments[selectedInstrumentIndex]}
                      onChangeParameter={handleParameterChange}
                    />
                    <Envelope
                      envelope={
                        instruments[selectedInstrumentIndex].filter.envelope
                      }
                      label="Filter Envelope"
                      prefix="filter.envelope"
                      onChangeParameter={handleParameterChange}
                    />
                  </div>
                  <Keyboard
                    instrumentId={instruments[selectedInstrumentIndex].id}
                    instrument={instruments[selectedInstrumentIndex]}
                    onChangeParameter={handleParameterChange}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
