"use client";

import type React from "react";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Play, Square } from "lucide-react";
import type { Pattern, Instrument, Note } from "@/lib/types";
import type { AudioEngine } from "@/lib/audio-engine";
import { midiNoteToName, formatNote, parseNoteString } from "@/lib/utils";

interface PatternEditorProps {
  patterns: Pattern[];
  instruments: Instrument[];
  currentPatternIndex: number;
  setCurrentPatternIndex: (index: number) => void;
  onAddPattern: () => void;
  onUpdatePattern: (index: number, pattern: Pattern) => void;
  onRemovePattern: (index: number) => void;
  audioEngine: AudioEngine;
}

export default function PatternEditor({
  patterns,
  instruments,
  currentPatternIndex,
  setCurrentPatternIndex,
  onAddPattern,
  onUpdatePattern,
  onRemovePattern,
  audioEngine,
}: PatternEditorProps) {
  const [editingCell, setEditingCell] = useState<{
    row: number;
    track: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentRow, setCurrentRow] = useState(-1);

  const currentPattern = patterns[currentPatternIndex] || null;

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  useEffect(() => {
    // Subscribe to playback events
    const handlePlaybackStart = () => setIsPlaying(true);
    const handlePlaybackStop = () => {
      setIsPlaying(false);
      setCurrentRow(-1);
    };
    const handleRowChange = (row: number) => setCurrentRow(row);

    audioEngine.on("playStart", handlePlaybackStart);
    audioEngine.on("playStop", handlePlaybackStop);
    audioEngine.on("rowChange", handleRowChange);

    return () => {
      audioEngine.off("playStart", handlePlaybackStart);
      audioEngine.off("playStop", handlePlaybackStop);
      audioEngine.off("rowChange", handleRowChange);
    };
  }, [audioEngine]);

  const handlePatternChange = (field: string, value: any) => {
    if (!currentPattern) return;

    const updatedPattern = { ...currentPattern, [field]: value };

    // If rows or tracks change, we need to update the notes array
    if (field === "rows" || field === "tracks") {
      updatedPattern.notes = currentPattern.notes.filter(
        (note) =>
          note.row < value &&
          note.track < (field === "tracks" ? value : currentPattern.tracks)
      );
    }

    onUpdatePattern(currentPatternIndex, updatedPattern);
  };

  const handleCellClick = (row: number, track: number) => {
    const existingNote = currentPattern?.notes.find(
      (note) => note.row === row && note.track === track
    );

    setEditingCell({ row, track });
    setEditValue(existingNote ? formatNoteToString(existingNote) : "");
  };

  const handleCellBlur = () => {
    if (!editingCell || !currentPattern) {
      setEditingCell(null);
      return;
    }

    const { row, track } = editingCell;

    // Remove existing note at this position
    const filteredNotes = currentPattern.notes.filter(
      (note) => !(note.row === row && note.track === track)
    );

    // If the edit value is not empty, add the new note
    if (editValue.trim()) {
      try {
        const newNote = parseNote(editValue);
        newNote.row = row;
        newNote.track = track;

        // Validate instrument exists
        const instrumentIndex = parseInt(newNote.instrument, 16);
        if (instrumentIndex >= instruments.length) {
          throw new Error("Invalid instrument");
        }

        const updatedPattern = {
          ...currentPattern,
          notes: [...filteredNotes, newNote],
        };
        onUpdatePattern(currentPatternIndex, updatedPattern);
      } catch (error) {
        console.error("Invalid note format:", error);
      }
    } else {
      // If the cell is now empty, just update with the filtered notes
      const updatedPattern = {
        ...currentPattern,
        notes: filteredNotes,
      };
      onUpdatePattern(currentPatternIndex, updatedPattern);
    }

    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCellBlur();

      // Move to next row
      if (editingCell && currentPattern) {
        const nextRow = (editingCell.row + 1) % currentPattern.rows;
        handleCellClick(nextRow, editingCell.track);
      }
    } else if (e.key === "Escape") {
      setEditingCell(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleCellBlur();

      // Move to next track or wrap to next row
      if (editingCell && currentPattern) {
        const nextTrack = (editingCell.track + 1) % currentPattern.tracks;
        const nextRow =
          nextTrack === 0
            ? (editingCell.row + 1) % currentPattern.rows
            : editingCell.row;
        handleCellClick(nextRow, nextTrack);
      }
    }
  };

  const formatNoteToString = (note: Note): string => {
    return formatNote({
      instrument: note.instrument,
      velocity: note.velocity,
      tone: note.tone,
      effect: note.effect,
      effectValue: note.effectValue,
    });
  };

  const parseNote = (noteStr: string): Note => {
    try {
      const { instrument, velocity, tone, effect, effectValue } =
        parseNoteString(noteStr);
      return {
        row: 0, // Will be set by the caller
        track: 0, // Will be set by the caller
        instrument,
        tone,
        velocity,
        effect,
        effectValue,
      };
    } catch (error) {
      console.error("Invalid note format:", error);
      throw error;
    }
  };

  const playPattern = async () => {
    if (isPlaying) {
      audioEngine.stop();
    } else if (currentPattern) {
      audioEngine.setPattern(currentPattern);
      await audioEngine.play();
    }
  };

  const getCellContent = (row: number, track: number) => {
    if (!currentPattern) return null;

    const note = currentPattern.notes.find(
      (n) => n.row === row && n.track === track
    );

    if (!note) return null;

    // Get instrument name for display
    const instrumentIndex = parseInt(note.instrument, 16);
    const instrument = instruments[instrumentIndex];
    const instrumentName = instrument ? instrument.name : "Unknown";

    // Get note name
    const noteName = midiNoteToName(note.tone);

    return (
      <div className="flex flex-col text-xs">
        <span className="font-bold">{noteName}</span>
        <span className="opacity-70 truncate">{instrumentName}</span>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Pattern Editor</h2>
        <div className="flex gap-2">
          <Button onClick={onAddPattern} disabled={patterns.length >= 255}>
            <Plus className="mr-2 h-4 w-4" />
            Add Pattern
          </Button>
          <Button
            variant={isPlaying ? "destructive" : "default"}
            onClick={playPattern}
            disabled={!currentPattern}
          >
            {isPlaying ? (
              <>
                <Square className="mr-2 h-4 w-4" /> Stop
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Play Pattern
              </>
            )}
          </Button>
        </div>
      </div>

      {patterns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">
            No patterns. Click "Add Pattern" to create one.
          </p>
        </div>
      ) : (
        <div className="flex gap-4 h-full">
          {/* Pattern List */}
          <div className="w-48 bg-gray-800 rounded-lg p-2 overflow-y-auto">
            {patterns.map((pattern, index) => (
              <div
                key={pattern.id}
                className={`p-2 rounded cursor-pointer flex justify-between items-center ${
                  index === currentPatternIndex
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-gray-700"
                }`}
                onClick={() => setCurrentPatternIndex(index)}
              >
                <span className="truncate">{pattern.name}</span>
                <button
                  className="opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePattern(index);
                    if (
                      currentPatternIndex >= index &&
                      currentPatternIndex > 0
                    ) {
                      setCurrentPatternIndex(currentPatternIndex - 1);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Pattern Editor */}
          {currentPattern && (
            <div className="flex-1 overflow-hidden">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle>
                      <Input
                        value={currentPattern.name}
                        onChange={(e) =>
                          handlePatternChange("name", e.target.value)
                        }
                        className="max-w-xs"
                      />
                    </CardTitle>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span>Tempo:</span>
                        <Input
                          type="number"
                          value={currentPattern.tempo}
                          onChange={(e) =>
                            handlePatternChange(
                              "tempo",
                              Number.parseInt(e.target.value)
                            )
                          }
                          className="w-20"
                          min={40}
                          max={300}
                        />
                        <span>BPM</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Tracks:</span>
                        <Select
                          value={currentPattern.tracks.toString()}
                          onValueChange={(value) =>
                            handlePatternChange(
                              "tracks",
                              Number.parseInt(value)
                            )
                          }
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 6, 8, 12, 16].map((num) => (
                              <SelectItem key={num} value={num.toString()}>
                                {num}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Rows:</span>
                        <Select
                          value={currentPattern.rows.toString()}
                          onValueChange={(value) =>
                            handlePatternChange("rows", Number.parseInt(value))
                          }
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[8, 16, 32, 64, 128].map((num) => (
                              <SelectItem key={num} value={num.toString()}>
                                {num}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto p-0">
                  <div className="tracker-grid relative">
                    {/* Header row with track numbers */}
                    <div className="flex border-b border-gray-700">
                      <div className="w-12 p-2 text-center bg-gray-800 border-r border-gray-700">
                        #
                      </div>
                      {Array.from({ length: currentPattern.tracks }).map(
                        (_, trackIndex) => (
                          <div
                            key={trackIndex}
                            className="flex-1 p-2 text-center bg-gray-800 border-r border-gray-700"
                          >
                            {trackIndex + 1}
                          </div>
                        )
                      )}
                    </div>

                    {/* Pattern rows */}
                    {Array.from({ length: currentPattern.rows }).map(
                      (_, rowIndex) => (
                        <div
                          key={rowIndex}
                          className={`flex ${
                            rowIndex === currentRow
                              ? "bg-blue-900"
                              : rowIndex % 4 === 0
                              ? "bg-gray-800"
                              : "bg-gray-900"
                          } hover:bg-gray-700`}
                        >
                          <div className="w-12 p-2 text-center border-r border-gray-700">
                            {rowIndex
                              .toString(16)
                              .padStart(2, "0")
                              .toUpperCase()}
                          </div>
                          {Array.from({ length: currentPattern.tracks }).map(
                            (_, trackIndex) => (
                              <div
                                key={trackIndex}
                                className="flex-1 p-2 border-r border-gray-700 cursor-pointer"
                                onClick={() =>
                                  handleCellClick(rowIndex, trackIndex)
                                }
                              >
                                {editingCell &&
                                editingCell.row === rowIndex &&
                                editingCell.track === trackIndex ? (
                                  <Input
                                    ref={inputRef}
                                    value={editValue}
                                    onChange={(e) =>
                                      setEditValue(e.target.value)
                                    }
                                    onBlur={handleCellBlur}
                                    onKeyDown={handleKeyDown}
                                    className="h-8 p-1 text-xs"
                                    maxLength={12}
                                  />
                                ) : (
                                  getCellContent(rowIndex, trackIndex)
                                )}
                              </div>
                            )
                          )}
                        </div>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
