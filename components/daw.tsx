"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InstrumentEditor from "@/components/instrument-editor";
import PatternEditor from "@/components/pattern-editor";
import SongEditor from "@/components/song-editor";
import TransportControls from "@/components/transport-controls";
import { Button } from "@/components/ui/button";
import { Save, Upload } from "lucide-react";
import { useAudioEngine } from "@/lib/audio-engine";
import { defaultProject, type Project, type Instrument } from "@/lib/types";

export default function DAW() {
  const [isLoading, setIsLoading] = useState(true);
  const [project, setProject] = useState<Project>(defaultProject);
  const [activeTab, setActiveTab] = useState("instruments");
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const audioEngine = useAudioEngine();

  const onProjectLoaded = ({ project }: { project: Project }) => {
    console.log("[DAW] Project loaded:", project);
    setProject(project);
    setIsLoading(false);
  };
  audioEngine.on("projectLoaded", onProjectLoaded);

  // Effect for initial setup and instrument registration
  useEffect(() => {
    console.log("[DAW] Initial project load:", {
      instrumentCount: project.instruments.length,
      instruments: project.instruments.map((i) => ({ id: i.id, name: i.name })),
    });
    audioEngine.loadProject(project);
    return () => audioEngine.stop();
  }, [audioEngine]);

  // Effect for keeping instruments in sync
  useEffect(() => {
    let samplersChanged = false;
    console.log("[DAW] Syncing instruments:", {
      instrumentCount: project.instruments.length,
      instruments: project.instruments.map((i) => ({ id: i.id, name: i.name })),
    });
    // Re-register all instruments without stopping playback
    project.instruments.forEach((instrument) => {
      console.log("[DAW] Registering instrument:", {
        id: instrument.id,
        name: instrument.name,
        type: instrument.oscillator.type,
      });
      audioEngine.updateInstrument(instrument.id, instrument);
      if (instrument.oscillator.type === "sampler") {
        samplersChanged = true;
      }
    });
    if (samplersChanged) {
      project.sampleData = audioEngine.getSampleData();
    }
  }, [audioEngine, project.instruments]);

  // Effect for keeping samples in sync
  // useEffect(() => {
  //   for (const [instrumentId, sample] of Object.entries(
  //     project.sampleData ?? {}
  //   )) {
  //     console.log("[DAW] Syncing sample:", {
  //       id: instrumentId,
  //       sample: sample,
  //     });
  //     audioEngine.base64ToAudioBuffer(sample).then((buffer) => {
  //       const instrument = project.instruments.find(
  //         (instrument) => instrument.id === instrumentId
  //       );
  //       if (instrument) {
  //         audioEngine.updateSample(instrumentId, buffer).then(() => {
  //           console.log("[DAW] Updated sample:", {
  //             id: instrumentId,
  //             buffer: buffer,
  //           });
  //           const updatedInstrument = {
  //             ...instrument,
  //             oscillator: {
  //               ...instrument.oscillator,
  //               sample: {
  //                 ...instrument.oscillator.sample,
  //                 fileName:
  //                   instrument.oscillator.sample?.fileName ?? "sample.wav",
  //                 startPoint: instrument.oscillator.sample?.startPoint ?? 0,
  //                 endPoint: instrument.oscillator.sample?.endPoint ?? 1,
  //                 gain: instrument.oscillator.sample?.gain ?? 1,
  //                 loopType: instrument.oscillator.sample?.loopType ?? "oneshot",
  //                 buffer: buffer,
  //               },
  //             },
  //           };
  //           project.instruments = project.instruments.map((inst) =>
  //             inst.id === instrumentId ? updatedInstrument : inst
  //           );
  //           audioEngine.updateInstrument(instrumentId, updatedInstrument);
  //         });
  //       }
  //     });
  //   }
  // }, [audioEngine, project.sampleData]);

  const handleAddInstrument = () => {
    if (project.instruments.length >= 255) return;

    const newInstrumentId = project.instruments.length
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

    console.log("[DAW] Creating new instrument:", { id: newInstrumentId });

    const newInstrument: Instrument = {
      id: newInstrumentId,
      name: `Instrument ${newInstrumentId}`,
      oscillator: {
        type: "square",
        detune: 0,
      },
      filter: {
        type: "lowpass" as BiquadFilterType,
        frequency: 1000,
        resonance: 1,
        envelopeAmount: 0.5,
        envelope: {
          type: "adsr",
          attack: 0.01,
          decay: 0.1,
          sustain: 0.5,
          release: 0.5,
        },
      },
      envelope: {
        type: "adsr",
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.5,
      },
    };

    setProject((prev) => ({
      ...prev,
      instruments: [...prev.instruments, newInstrument],
    }));
  };

  const handleUpdateInstrument = (index: number, updatedInstrument: any) => {
    console.log("[DAW] Updating instrument:", updatedInstrument);

    // Update the audio engine first to maintain playback
    audioEngine.updateInstrument(updatedInstrument.id, updatedInstrument);

    // Then update the UI state without triggering a full project reload
    setProject((prev) => ({
      ...prev,
      instruments: prev.instruments.map((inst, i) =>
        i === index ? updatedInstrument : inst
      ),
    }));
  };

  const handleRemoveInstrument = (index: number) => {
    const instrumentToRemove = project.instruments[index];
    console.log("[DAW] Removing instrument:", {
      index,
      id: instrumentToRemove.id,
      name: instrumentToRemove.name,
    });

    // Update project state
    setProject((prev) => ({
      ...prev,
      instruments: prev.instruments.filter((_, i) => i !== index),
      // Also remove any notes using this instrument from patterns
      patterns: prev.patterns.map((pattern) => ({
        ...pattern,
        notes: pattern.notes.filter(
          (note) => note.instrument !== instrumentToRemove.id
        ),
      })),
    }));
  };

  const handleAddPattern = () => {
    if (project.patterns.length >= 255) return;

    const newPatternId = project.patterns.length
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

    setProject((prev) => ({
      ...prev,
      patterns: [
        ...prev.patterns,
        {
          id: newPatternId,
          name: `Pattern ${newPatternId}`,
          tempo: 120,
          tracks: 4,
          rows: 16,
          notes: [],
        },
      ],
    }));
  };

  const handleUpdatePattern = (index: number, updatedPattern: any) => {
    console.log("[DAW] Updating pattern:", {
      index,
      id: updatedPattern.id,
      noteCount: updatedPattern.notes.length,
      instruments: [
        ...new Set(updatedPattern.notes.map((n: any) => n.instrument)),
      ],
    });

    // Update the audio engine first to maintain playback
    audioEngine.updatePattern(updatedPattern);

    // Then update the UI state
    setProject((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pat, i) =>
        i === index ? updatedPattern : pat
      ),
    }));
  };

  const handleRemovePattern = (index: number) => {
    setProject((prev) => ({
      ...prev,
      patterns: prev.patterns.filter((_, i) => i !== index),
      song: prev.song.filter(
        (sequence) =>
          !sequence.some(
            (patternId) => Number.parseInt(patternId, 16) === index
          )
      ),
    }));
  };

  const handleUpdateSong = (newSong: string[][]) => {
    setProject((prev) => ({
      ...prev,
      song: newSong,
    }));
  };

  const handleExport = () => {
    const projectToExport = {
      ...project,
      instruments: project.instruments.map((instrument) => ({
        ...instrument,
        oscillator: { ...instrument.oscillator, sample: undefined },
      })),
      sampleData: audioEngine.getSampleData(),
    };
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(projectToExport));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${project.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event: any) => {
        try {
          const importedProject = JSON.parse(event.target.result);
          console.log("[DAW] Imported project:", importedProject);

          // First load the project without samples
          const projectWithoutSamples = {
            ...importedProject,
            instruments: importedProject.instruments.map((instrument: any) => ({
              ...instrument,
              volume: instrument.volume ?? 1,
              pan: instrument.pan ?? 0,
              oscillator: {
                ...instrument.oscillator,
                sample:
                  instrument.oscillator.type === "sampler"
                    ? {
                        fileName: instrument.oscillator.sample?.fileName ?? "",
                        startPoint:
                          instrument.oscillator.sample?.startPoint ?? 0,
                        endPoint: instrument.oscillator.sample?.endPoint ?? 1,
                        gain: instrument.oscillator.sample?.gain ?? 1,
                        loopType:
                          instrument.oscillator.sample?.loopType ?? "oneshot",
                        buffer: instrument.oscillator.sample?.buffer ?? null,
                      }
                    : undefined,
              },
            })),
          };

          // Then load the project with samples in audio engine
          await audioEngine.loadProject(projectWithoutSamples);

          // Set project state first
          // setProject(projectWithoutSamples);
        } catch (error) {
          console.error("Failed to parse imported file:", error);
          alert("Invalid project file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-gray-800 px-4 flex justify-between items-center">
        <TransportControls
          audioEngine={audioEngine}
          currentPattern={project.patterns[currentPatternIndex]}
          project={project}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Save className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
        </div>
      </header>

      {/* Transport Controls */}

      {/* Main Content */}
      {isLoading ? (
        <div className="flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            <div className="flex justify-center items-center h-full">
              Click [Initialize Audio] to begin
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="h-full flex flex-col"
          >
            <TabsList className="mx-4 mt-2 justify-start">
              <TabsTrigger value="instruments">Instruments</TabsTrigger>
              <TabsTrigger value="pattern">Pattern Editor</TabsTrigger>
              <TabsTrigger value="song">Song Editor</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-auto p-0">
              <TabsContent value="instruments" className="h-full flex flex-col">
                <PatternEditor
                  patterns={project.patterns}
                  instruments={project.instruments}
                  currentPatternIndex={currentPatternIndex}
                  setCurrentPatternIndex={setCurrentPatternIndex}
                  onAddPattern={handleAddPattern}
                  onUpdatePattern={handleUpdatePattern}
                  onRemovePattern={handleRemovePattern}
                  audioEngine={audioEngine}
                />
                <InstrumentEditor
                  instruments={project.instruments}
                  onAddInstrument={handleAddInstrument}
                  onUpdateInstrument={handleUpdateInstrument}
                  onRemoveInstrument={handleRemoveInstrument}
                />
              </TabsContent>

              <TabsContent value="pattern" className="h-full">
                <PatternEditor
                  patterns={project.patterns}
                  instruments={project.instruments}
                  currentPatternIndex={currentPatternIndex}
                  setCurrentPatternIndex={setCurrentPatternIndex}
                  onAddPattern={handleAddPattern}
                  onUpdatePattern={handleUpdatePattern}
                  onRemovePattern={handleRemovePattern}
                  audioEngine={audioEngine}
                />
              </TabsContent>

              <TabsContent value="song" className="h-full">
                <SongEditor
                  patterns={project.patterns}
                  song={project.song}
                  onUpdateSong={handleUpdateSong}
                  audioEngine={audioEngine}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
}
