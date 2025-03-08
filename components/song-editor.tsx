"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Play, Square, ArrowUp, ArrowDown } from "lucide-react"
import type { Pattern } from "@/lib/types"
import type { AudioEngine } from "@/lib/audio-engine"

interface SongEditorProps {
  patterns: Pattern[]
  song: string[][]
  onUpdateSong: (song: string[][]) => void
  audioEngine: AudioEngine
}

export default function SongEditor({ patterns, song, onUpdateSong, audioEngine }: SongEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSequence, setCurrentSequence] = useState(-1)

  const addSequence = () => {
    onUpdateSong([...song, []])
  }

  const removeSequence = (index: number) => {
    const newSong = [...song]
    newSong.splice(index, 1)
    onUpdateSong(newSong)
  }

  const moveSequence = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === song.length - 1)) {
      return
    }

    const newSong = [...song]
    const newIndex = direction === "up" ? index - 1 : index + 1
    const temp = newSong[index]
    newSong[index] = newSong[newIndex]
    newSong[newIndex] = temp
    onUpdateSong(newSong)
  }

  const addPatternToSequence = (sequenceIndex: number, patternId: string) => {
    const newSong = [...song]
    newSong[sequenceIndex] = [...newSong[sequenceIndex], patternId]
    onUpdateSong(newSong)
  }

  const removePatternFromSequence = (sequenceIndex: number, patternIndex: number) => {
    const newSong = [...song]
    newSong[sequenceIndex] = newSong[sequenceIndex].filter((_, i) => i !== patternIndex)
    onUpdateSong(newSong)
  }

  const playSong = () => {
    if (isPlaying) {
      audioEngine.stop()
      setIsPlaying(false)
    } else {
      audioEngine.setSong(song, patterns)
      audioEngine.play()
      setIsPlaying(true)

      // Set up listener for when playback stops
      const handlePlaybackStop = () => {
        setIsPlaying(false)
        setCurrentSequence(-1)
        audioEngine.off("playStop", handlePlaybackStop)
      }

      audioEngine.on("playStop", handlePlaybackStop)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Song Editor</h2>
        <div className="flex gap-2">
          <Button onClick={addSequence}>
            <Plus className="mr-2 h-4 w-4" />
            Add Sequence
          </Button>
          <Button variant={isPlaying ? "destructive" : "default"} onClick={playSong} disabled={song.length === 0}>
            {isPlaying ? (
              <>
                <Square className="mr-2 h-4 w-4" /> Stop
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Play Song
              </>
            )}
          </Button>
        </div>
      </div>

      {song.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">No sequences. Click "Add Sequence" to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {song.map((sequence, sequenceIndex) => (
            <Card key={sequenceIndex} className={sequenceIndex === currentSequence ? "border-blue-500" : ""}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle>Sequence {sequenceIndex + 1}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveSequence(sequenceIndex, "up")}
                    disabled={sequenceIndex === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveSequence(sequenceIndex, "down")}
                    disabled={sequenceIndex === song.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeSequence(sequenceIndex)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sequence.length === 0 ? (
                    <p className="text-sm text-gray-400">No patterns in this sequence</p>
                  ) : (
                    <div className="space-y-1">
                      {sequence.map((patternId, patternIndex) => {
                        const pattern = patterns.find((p) => p.id === patternId)
                        return (
                          <div key={patternIndex} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                            <span>{pattern ? pattern.name : `Unknown (${patternId})`}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePatternFromSequence(sequenceIndex, patternIndex)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="pt-2">
                    <select
                      className="w-full p-2 bg-gray-700 rounded"
                      onChange={(e) => {
                        if (e.target.value) {
                          addPatternToSequence(sequenceIndex, e.target.value)
                          e.target.value = ""
                        }
                      }}
                      value=""
                    >
                      <option value="">Add pattern...</option>
                      {patterns.map((pattern) => (
                        <option key={pattern.id} value={pattern.id}>
                          {pattern.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

