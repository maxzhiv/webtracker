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
import TrackerEvent from "./tracker-event";

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

interface Selection {
  startRow: number;
  startTrack: number;
  endRow: number;
  endTrack: number;
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
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentRow, setCurrentRow] = useState(-1);
  const [caretPosition, setCaretPosition] = useState(0);

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
    // const instrumentIndex = parseInt(note.instrument, 16);
    // const instrument = instruments[instrumentIndex];
    // const instrumentName = instrument ? instrument.name : "Unknown";

    // Get note name
    const noteName = midiNoteToName(note.tone);
    const instrumentColor = [
      "text-red-500",
      "text-orange-500",
      "text-yellow-500",
      "text-green-500",
      "text-teal-500",
      "text-cyan-500",
      "text-blue-500",
      "text-purple-500",
    ][parseInt(note.instrument, 16) % 8];
    const velocityColor = [
      "text-gray-700",
      "text-gray-600",
      "text-gray-500",
      "text-gray-400",
      "text-gray-300",
      "text-gray-200",
      "text-gray-100",
      "text-gray-0",
    ][Math.trunc(note.velocity / 32)];

    return (
      <div className="flex flex-row text-xs">
        <span className="font-monospace">
          <span className={instrumentColor}>{note.instrument}</span>
          <span className={velocityColor}>
            {note.velocity.toString(16).toUpperCase()}
          </span>
          <span className="text-blue-300">{noteName}</span>
          {note.effect.toString(16).toUpperCase().padStart(2, "0")}
          {note.effectValue.toString(16).toUpperCase().padStart(4, "0")}
        </span>
        {/* <span className="opacity-70 truncate">{instrumentName}</span> */}
      </div>
    );
  };

  // Handle navigation in the pattern grid
  const handleNavigate = (direction: "up" | "down" | "left" | "right") => {
    if (!editingCell || !currentPattern) return;

    const { row, track } = editingCell;
    let newRow = row;
    let newTrack = track;

    switch (direction) {
      case "up":
        newRow = row === 0 ? currentPattern.rows - 1 : row - 1;
        break;
      case "down":
        newRow = row === currentPattern.rows - 1 ? 0 : row + 1;
        break;
      case "left":
        if (track === 0) {
          newTrack = currentPattern.tracks - 1;
          newRow = row === 0 ? currentPattern.rows - 1 : row - 1;
        } else {
          newTrack = track - 1;
        }
        break;
      case "right":
        if (track === currentPattern.tracks - 1) {
          newTrack = 0;
          newRow = row === currentPattern.rows - 1 ? 0 : row + 1;
        } else {
          newTrack = track + 1;
        }
        break;
    }

    setEditingCell({ row: newRow, track: newTrack });
  };

  const handleNoteChange = (row: number, track: number, note: Note | null) => {
    if (!currentPattern) return;

    const updatedNotes = currentPattern.notes.filter(
      (n) => !(n.row === row && n.track === track)
    );

    if (note) {
      note.row = row;
      note.track = track;
      updatedNotes.push(note);
    }

    const updatedPattern = {
      ...currentPattern,
      notes: updatedNotes,
    };

    onUpdatePattern(currentPatternIndex, updatedPattern);
  };

  // Handle selection navigation
  const handleSelectionNavigate = (
    direction: "up" | "down" | "left" | "right"
  ) => {
    if (!editingCell || !currentPattern) return;

    // Start new selection if none exists
    if (!selection) {
      setSelection({
        startRow: editingCell.row,
        startTrack: editingCell.track,
        endRow: editingCell.row,
        endTrack: editingCell.track,
      });
    }

    const { row, track } = editingCell;
    let newRow = row;
    let newTrack = track;

    switch (direction) {
      case "up":
        newRow = Math.max(0, row - 1);
        break;
      case "down":
        newRow = Math.min(currentPattern.rows - 1, row + 1);
        break;
      case "left":
        if (track > 0) {
          newTrack = track - 1;
        } else if (row > 0) {
          newTrack = currentPattern.tracks - 1;
          newRow = row - 1;
        }
        break;
      case "right":
        if (track < currentPattern.tracks - 1) {
          newTrack = track + 1;
        } else if (row < currentPattern.rows - 1) {
          newTrack = 0;
          newRow = row + 1;
        }
        break;
    }

    setEditingCell({ row: newRow, track: newTrack });
    setSelection((prev) => ({
      startRow: prev?.startRow ?? newRow,
      startTrack: prev?.startTrack ?? newTrack,
      endRow: newRow,
      endTrack: newTrack,
    }));
  };

  // Handle copy/paste
  const handleCopy = () => {
    if (!selection || !currentPattern) return;

    const { startRow, startTrack, endRow, endTrack } = selection;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minTrack = Math.min(startTrack, endTrack);
    const maxTrack = Math.max(startTrack, endTrack);

    const selectedNotes = currentPattern.notes
      .filter(
        (note) =>
          note.row >= minRow &&
          note.row <= maxRow &&
          note.track >= minTrack &&
          note.track <= maxTrack
      )
      .map((note) => ({
        ...note,
        row: note.row - minRow,
        track: note.track - minTrack,
      }));

    navigator.clipboard.writeText(
      JSON.stringify({
        notes: selectedNotes,
        rows: maxRow - minRow + 1,
        tracks: maxTrack - minTrack + 1,
      })
    );
  };

  const handlePaste = async () => {
    if (!editingCell || !currentPattern) return;

    try {
      const text = await navigator.clipboard.readText();
      const { notes, rows, tracks } = JSON.parse(text);

      const pastedNotes = notes
        .map((note: Note) => ({
          ...note,
          row: note.row + editingCell.row,
          track: note.track + editingCell.track,
        }))
        .filter(
          (note: Note) =>
            note.row < currentPattern.rows && note.track < currentPattern.tracks
        );

      const updatedNotes = [
        ...currentPattern.notes.filter(
          (note) =>
            !pastedNotes.some(
              (pastedNote: Note) =>
                pastedNote.row === note.row && pastedNote.track === note.track
            )
        ),
        ...pastedNotes,
      ];

      onUpdatePattern(currentPatternIndex, {
        ...currentPattern,
        notes: updatedNotes,
      });
    } catch (error) {
      console.error("Failed to paste notes:", error);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            handleSelectionNavigate("up");
            break;
          case "ArrowDown":
            e.preventDefault();
            handleSelectionNavigate("down");
            break;
          case "ArrowLeft":
            e.preventDefault();
            handleSelectionNavigate("left");
            break;
          case "ArrowRight":
            e.preventDefault();
            handleSelectionNavigate("right");
            break;
        }
      } else if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "c":
            e.preventDefault();
            handleCopy();
            break;
          case "v":
            e.preventDefault();
            handlePaste();
            break;
        }
      } else {
        setSelection(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingCell, selection, currentPattern]);

  // Check if a cell is within the current selection
  const isCellSelected = (row: number, track: number) => {
    if (!selection) return false;
    const { startRow, startTrack, endRow, endTrack } = selection;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minTrack = Math.min(startTrack, endTrack);
    const maxTrack = Math.max(startTrack, endTrack);
    return (
      row >= minRow && row <= maxRow && track >= minTrack && track <= maxTrack
    );
  };

  return (
    <div className="h-full flex flex-col">
      {patterns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">
            No patterns. Click "Add Pattern" to create one.
          </p>
          <Button onClick={onAddPattern} disabled={patterns.length >= 255}>
            <Plus className="mr-2 h-4 w-4" />
            Add Pattern
          </Button>
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
            <Button onClick={onAddPattern} disabled={patterns.length >= 255}>
              <Plus className="mr-2 h-4 w-4" />
              Add Pattern
            </Button>
          </div>

          {/* Pattern Editor */}
          {currentPattern && (
            <div className="flex-1 overflow-hidden">
              <Card className="h-full flex flex-col p-0 gap-0 mb-2">
                <div className="p-0">
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
                    <div className="flex items-center gap-0">
                      <div className="flex items-center gap-0">
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
                      <div className="flex items-center gap-0">
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
                      <div className="flex items-center gap-0">
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
                </div>
                <div className="flex-1 overflow-auto p-0">
                  <div className="tracker-grid relative">
                    {/* Header row with track numbers */}
                    <div className="flex border-b border-gray-700">
                      <div className="w-12 p-0 text-center bg-gray-800 border-r border-gray-700">
                        #
                      </div>
                      {Array.from({ length: currentPattern.tracks }).map(
                        (_, trackIndex) => (
                          <div
                            key={trackIndex}
                            className="flex-1 p-0 text-center bg-gray-800 border-r border-gray-700"
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
                          <div className="w-12 p-0 text-center border-r border-gray-700">
                            {rowIndex
                              .toString(16)
                              .padStart(2, "0")
                              .toUpperCase()}
                          </div>
                          {Array.from({ length: currentPattern.tracks }).map(
                            (_, trackIndex) => (
                              <div
                                key={trackIndex}
                                className="flex-1 p-0 border-r border-gray-700 cursor-pointer"
                              >
                                <TrackerEvent
                                  note={
                                    currentPattern.notes.find(
                                      (n) =>
                                        n.row === rowIndex &&
                                        n.track === trackIndex
                                    ) || null
                                  }
                                  isEditing={
                                    editingCell?.row === rowIndex &&
                                    editingCell?.track === trackIndex
                                  }
                                  isSelected={isCellSelected(
                                    rowIndex,
                                    trackIndex
                                  )}
                                  onNoteChange={(note) =>
                                    handleNoteChange(rowIndex, trackIndex, note)
                                  }
                                  onNavigate={handleNavigate}
                                  onStartEdit={(event: React.MouseEvent) => {
                                    setEditingCell({
                                      row: rowIndex,
                                      track: trackIndex,
                                    });
                                    if (!event.shiftKey) setSelection(null);
                                  }}
                                  onFinishEdit={() => setEditingCell(null)}
                                  maxInstruments={instruments.length}
                                  caretPosition={caretPosition}
                                  onCaretPositionChange={setCaretPosition}
                                />
                              </div>
                            )
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
