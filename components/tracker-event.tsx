import { useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/types";
import { formatNote, parseNoteString } from "@/lib/utils";

interface TrackerEventProps {
  note: Note | null;
  isEditing: boolean;
  onNoteChange: (note: Note | null) => void;
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  maxInstruments: number;
  caretPosition: number;
  onCaretPositionChange: (position: number) => void;
}

export default function TrackerEvent({
  note,
  isEditing,
  onNoteChange,
  onNavigate,
  onStartEdit,
  onFinishEdit,
  maxInstruments,
  caretPosition,
  onCaretPositionChange,
}: TrackerEventProps) {
  const [editValue, setEditValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize edit value when editing starts
  useEffect(() => {
    if (isEditing) {
      const initialValue = note ? formatNote(note) : "000000000000";
      setEditValue(initialValue);
    }
  }, [isEditing, note]);

  // Focus management
  useEffect(() => {
    if (isEditing && containerRef.current) {
      containerRef.current.focus();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isEditing) return;
    e.preventDefault();

    const columnLengths = [2, 2, 1, 1, 2, 4]; // Length of each column
    const columnPositions = [0, 2, 4, 5, 6, 8]; // Starting positions for each column
    const currentColumn = columnPositions.findIndex(
      (pos, i, arr) =>
        caretPosition >= pos &&
        (i === arr.length - 1 || caretPosition < arr[i + 1])
    );

    switch (e.key) {
      case "ArrowUp":
        onNavigate("up");
        break;
      case "ArrowDown":
        onNavigate("down");
        break;
      case "ArrowLeft":
        if (caretPosition === 0) {
          onNavigate("left");
        } else {
          onCaretPositionChange(Math.max(0, caretPosition - 1));
        }
        break;
      case "ArrowRight":
        if (caretPosition === editValue.length) {
          onNavigate("right");
        } else {
          onCaretPositionChange(Math.min(editValue.length, caretPosition + 1));
        }
        break;
      case "Enter":
        handleFinishEdit();
        onNavigate("down");
        break;
      case "Escape":
        onFinishEdit();
        break;
      case "Tab":
        e.preventDefault();
        const nextPos = e.shiftKey
          ? columnPositions[Math.max(0, currentColumn - 1)]
          : columnPositions[
              Math.min(columnPositions.length - 1, currentColumn + 1)
            ];
        onCaretPositionChange(nextPos);
        break;
      case "Backspace":
        if (caretPosition > 0) {
          setEditValue(
            (prev) =>
              prev.slice(0, caretPosition - 1) + "0" + prev.slice(caretPosition)
          );
          onCaretPositionChange(caretPosition - 1);
        }
        break;
      case "Delete":
        if (caretPosition < editValue.length) {
          setEditValue(
            (prev) =>
              prev.slice(0, caretPosition) + "0" + prev.slice(caretPosition + 1)
          );
        }
        break;
      default:
        // Handle character input
        const isValidChar = (char: string, column: number): boolean => {
          const upperChar = char.toUpperCase();
          switch (column) {
            case 0: // Instrument
              return (
                /[0-9A-F]/.test(upperChar) &&
                parseInt(editValue.slice(0, 1) + upperChar, 16) < maxInstruments
              );
            case 1: // Velocity
              return /[0-9A-F]/.test(upperChar);
            case 2: // Note
              return /[A-Ga-g]/.test(char);
            case 3: // Octave
              return /[0-9]/.test(upperChar);
            case 4: // Effect
            case 5: // Effect value
              return /[0-9A-F]/.test(upperChar);
            default:
              return false;
          }
        };

        if (e.key.length === 1 && isValidChar(e.key, currentColumn)) {
          const newValue =
            editValue.slice(0, caretPosition) +
            (currentColumn === 2 ? e.key : e.key.toUpperCase()) +
            editValue.slice(caretPosition + 1);
          setEditValue(newValue);
          onCaretPositionChange(caretPosition + 1);
        }
    }
  };

  const handleFinishEdit = () => {
    try {
      if (editValue.trim() && editValue !== "000000000000") {
        const parsedNote = parseNoteString(editValue);
        console.log("handleFinishEdit", editValue, parsedNote);
        onNoteChange({
          ...parsedNote,
          row: 0,
          track: 0,
        });
      } else {
        onNoteChange(null);
      }
    } catch (error) {
      console.error("Invalid note format:", error);
    }
    onFinishEdit();
  };

  // Render the tracker event with caret
  const renderContent = () => {
    if (!isEditing && !note) {
      return <span className="opacity-50">............</span>;
    }

    const value = isEditing ? editValue : formatNote(note!);
    const parts = [
      { text: value.slice(0, 2), color: "text-red-500" }, // Instrument
      { text: value.slice(2, 4), color: "text-gray-400" }, // Velocity
      { text: value.slice(4, 6), color: "text-blue-300" }, // Note
      { text: value.slice(6, 8), color: "text-purple-400" }, // Effect
      { text: value.slice(8), color: "text-purple-300" }, // Effect value
    ];

    return (
      <>
        {parts.map(({ text, color }, i) => (
          <span key={i} className={color}>
            {text}
          </span>
        ))}
        {isEditing && (
          <span
            className="absolute bg-transparent border border-gray-300 -ml-[1px]"
            style={{
              left: `${(caretPosition + 0.5) * 0.61}em`,
              height: "1.6em",
              width: "0.8em",
              top: "0.2em",
            }}
          />
        )}
      </>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-row text-xs font-mono min-h-[1.5rem] w-full cursor-text select-none p-1"
      onClick={onStartEdit}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {renderContent()}
    </div>
  );
}
