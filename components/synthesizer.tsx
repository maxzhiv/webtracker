"use client"

import { useState, useEffect, useRef } from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Play, Pause, Volume2, AudioWaveformIcon as Waveform } from "lucide-react"

export default function Synthesizer() {
  // Audio context and nodes
  const audioContextRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const lowPassFilterRef = useRef<BiquadFilterNode | null>(null)
  const highPassFilterRef = useRef<BiquadFilterNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // UI state
  const [isPlaying, setIsPlaying] = useState(false)
  const [waveform, setWaveform] = useState<OscillatorType>("square")
  const [frequency, setFrequency] = useState(440)
  const [volume, setVolume] = useState(0.5)
  const [lowPassFreq, setLowPassFreq] = useState(22000)
  const [lowPassQ, setLowPassQ] = useState(1)
  const [highPassFreq, setHighPassFreq] = useState(0)
  const [highPassQ, setHighPassQ] = useState(1)
  const [activeFilter, setActiveFilter] = useState("lowpass")

  // Initialize audio context on first user interaction
  const initAudio = () => {
    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      audioContextRef.current = new AudioContext()

      // Create analyzer for visualization
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048

      // Create gain node
      gainNodeRef.current = audioContextRef.current.createGain()
      gainNodeRef.current.gain.value = volume

      // Create filters
      lowPassFilterRef.current = audioContextRef.current.createBiquadFilter()
      lowPassFilterRef.current.type = "lowpass"
      lowPassFilterRef.current.frequency.value = lowPassFreq
      lowPassFilterRef.current.Q.value = lowPassQ

      highPassFilterRef.current = audioContextRef.current.createBiquadFilter()
      highPassFilterRef.current.type = "highpass"
      highPassFilterRef.current.frequency.value = highPassFreq
      highPassFilterRef.current.Q.value = highPassQ

      // Connect nodes
      gainNodeRef.current.connect(lowPassFilterRef.current)
      lowPassFilterRef.current.connect(highPassFilterRef.current)
      highPassFilterRef.current.connect(analyserRef.current)
      analyserRef.current.connect(audioContextRef.current.destination)

      // Start visualization
      startVisualization()
    }
  }

  // Toggle play/pause
  const togglePlay = () => {
    initAudio()

    if (isPlaying) {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop()
        oscillatorRef.current = null
      }
    } else {
      const ctx = audioContextRef.current
      if (ctx) {
        // Resume context if suspended
        if (ctx.state === "suspended") {
          ctx.resume()
        }

        // Create and configure oscillator
        oscillatorRef.current = ctx.createOscillator()
        oscillatorRef.current.type = waveform
        oscillatorRef.current.frequency.value = frequency
        oscillatorRef.current.connect(gainNodeRef.current!)
        oscillatorRef.current.start()
      }
    }

    setIsPlaying(!isPlaying)
  }

  // Update oscillator when parameters change
  useEffect(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.type = waveform
    }
  }, [waveform])

  useEffect(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.frequency.value = frequency
    }
  }, [frequency])

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume
    }
  }, [volume])

  useEffect(() => {
    if (lowPassFilterRef.current) {
      lowPassFilterRef.current.frequency.value = lowPassFreq
      lowPassFilterRef.current.Q.value = lowPassQ
    }
  }, [lowPassFreq, lowPassQ])

  useEffect(() => {
    if (highPassFilterRef.current) {
      highPassFilterRef.current.frequency.value = highPassFreq
      highPassFilterRef.current.Q.value = highPassQ
    }
  }, [highPassFreq, highPassQ])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Visualization
  const startVisualization = () => {
    if (!canvasRef.current || !analyserRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const analyser = analyserRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw)

      analyser.getByteTimeDomainData(dataArray)

      ctx.fillStyle = "rgb(20, 20, 30)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.lineWidth = 2
      ctx.strokeStyle = isPlaying ? "rgb(0, 255, 0)" : "rgb(100, 100, 100)"
      ctx.beginPath()

      const sliceWidth = canvas.width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0
        const y = (v * canvas.height) / 2

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }

        x += sliceWidth
      }

      ctx.lineTo(canvas.width, canvas.height / 2)
      ctx.stroke()
    }

    draw()
  }

  return (
    <div className="w-full max-w-3xl bg-gray-800 rounded-lg p-6 shadow-xl">
      <div className="flex flex-col space-y-6">
        {/* Waveform Visualization */}
        <div className="w-full h-40 bg-gray-900 rounded-lg overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full" width={600} height={160} />
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Oscillator Controls */}
          <div className="bg-gray-700 p-4 rounded-lg">
            <h2 className="text-xl font-bold mb-4 flex items-center">
              <Waveform className="mr-2" /> Oscillator
            </h2>

            <div className="space-y-4">
              <div className="flex space-x-2">
                <Toggle
                  pressed={waveform === "square"}
                  onPressedChange={() => setWaveform("square")}
                  className="flex-1"
                >
                  Square
                </Toggle>
                <Toggle
                  pressed={waveform === "triangle"}
                  onPressedChange={() => setWaveform("triangle")}
                  className="flex-1"
                >
                  Triangle
                </Toggle>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>Frequency: {frequency} Hz</span>
                </div>
                <Slider
                  min={20}
                  max={2000}
                  step={1}
                  value={[frequency]}
                  onValueChange={(value) => setFrequency(value[0])}
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="flex items-center">
                    <Volume2 className="mr-1 h-4 w-4" /> Volume
                  </span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[volume]} onValueChange={(value) => setVolume(value[0])} />
              </div>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="bg-gray-700 p-4 rounded-lg">
            <h2 className="text-xl font-bold mb-4">Filters</h2>

            <Tabs value={activeFilter} onValueChange={setActiveFilter}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="lowpass" className="flex-1">
                  Low Pass
                </TabsTrigger>
                <TabsTrigger value="highpass" className="flex-1">
                  High Pass
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lowpass" className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span>Cutoff: {lowPassFreq} Hz</span>
                  </div>
                  <Slider
                    min={20}
                    max={22000}
                    step={1}
                    value={[lowPassFreq]}
                    onValueChange={(value) => setLowPassFreq(value[0])}
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>Resonance: {lowPassQ.toFixed(1)}</span>
                  </div>
                  <Slider
                    min={0.1}
                    max={20}
                    step={0.1}
                    value={[lowPassQ]}
                    onValueChange={(value) => setLowPassQ(value[0])}
                  />
                </div>
              </TabsContent>

              <TabsContent value="highpass" className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span>Cutoff: {highPassFreq} Hz</span>
                  </div>
                  <Slider
                    min={20}
                    max={22000}
                    step={1}
                    value={[highPassFreq]}
                    onValueChange={(value) => setHighPassFreq(value[0])}
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>Resonance: {highPassQ.toFixed(1)}</span>
                  </div>
                  <Slider
                    min={0.1}
                    max={20}
                    step={0.1}
                    value={[highPassQ]}
                    onValueChange={(value) => setHighPassQ(value[0])}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Play/Stop Button */}
        <Button
          onClick={togglePlay}
          size="lg"
          className={`w-full ${isPlaying ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`}
        >
          {isPlaying ? (
            <>
              <Pause className="mr-2" /> Stop
            </>
          ) : (
            <>
              <Play className="mr-2" /> Play
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

