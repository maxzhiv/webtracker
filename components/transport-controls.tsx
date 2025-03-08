"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Square, Volume2, SkipBack } from "lucide-react";
import type { AudioEngine } from "@/lib/audio-engine";
import { type Pattern, type Project, defaultProject } from "@/lib/types";

interface TransportControlsProps {
  audioEngine: AudioEngine;
  currentPattern: Pattern | null;
  project: Project;
}

export default function TransportControls({
  audioEngine,
  currentPattern,
  project,
}: TransportControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.75);
  const [currentRow, setCurrentRow] = useState(-1);
  const [playbackMode, setPlaybackMode] = useState<"pattern" | "song">(
    "pattern"
  );
  const [audioInitialized, setAudioInitialized] = useState(false);

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

  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume, audioEngine]);

  const initAudio = () => {
    audioEngine.initAudioContext();
    audioEngine.loadProject(defaultProject);
    setAudioInitialized(true);
  };

  const togglePlay = async () => {
    if (isPlaying) {
      audioEngine.stop();
    } else {
      if (playbackMode === "pattern" && currentPattern) {
        audioEngine.setPattern(currentPattern);
        await audioEngine.play();
      } else if (playbackMode === "song" && project.song.length > 0) {
        audioEngine.setSong(project.song, project.patterns);
        await audioEngine.play();
      }
    }
  };

  return (
    <div className="bg-gray-800 p-2 border-t border-b border-gray-700 flex items-center">
      {!audioInitialized ? (
        <Button variant="default" onClick={initAudio} className="mr-4">
          Initialize Audio
        </Button>
      ) : (
        <>
          <div className="flex items-center gap-2 mr-4">
            <Button
              variant={playbackMode === "pattern" ? "default" : "outline"}
              size="sm"
              onClick={() => setPlaybackMode("pattern")}
            >
              Pattern
            </Button>
            <Button
              variant={playbackMode === "song" ? "default" : "outline"}
              size="sm"
              onClick={() => setPlaybackMode("song")}
            >
              Song
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => audioEngine.seek(0)}
              disabled={!isPlaying}
            >
              <SkipBack className="h-4 w-4" />
            </Button>

            <Button
              variant={isPlaying ? "destructive" : "default"}
              onClick={togglePlay}
              disabled={
                (playbackMode === "pattern" && !currentPattern) ||
                (playbackMode === "song" && project.song.length === 0)
              }
            >
              {isPlaying ? (
                <Square className="mr-2 h-4 w-4" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {isPlaying ? "Stop" : "Play"}
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            <Slider
              className="w-32"
              min={0}
              max={1}
              step={0.01}
              value={[volume]}
              onValueChange={(value) => setVolume(value[0])}
            />
          </div>
        </>
      )}
    </div>
  );
}
