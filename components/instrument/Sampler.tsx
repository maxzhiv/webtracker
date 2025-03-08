import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Knob } from "@/components/ui/knob";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SampleData, LoopType } from "@/lib/types";
import { useAudioEngine } from "@/lib/audio-engine";

interface SamplerProps {
  instrumentId: string;
  sample: SampleData | undefined;
  onLoadSample: (file: File) => Promise<void>;
  onUpdateSample: (updates: Partial<SampleData>) => void;
}

export default function Sampler({
  instrumentId,
  sample,
  onLoadSample,
  onUpdateSample,
}: SamplerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState<"start" | "end" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const audioEngine = useAudioEngine();

  // Listen for sample loaded events
  useEffect(() => {
    const handleSampleLoaded = ({
      instrumentId: loadedId,
      buffer: loadedBuffer,
    }: {
      instrumentId: string;
      buffer?: AudioBuffer;
    }) => {
      console.log("[Sampler] Sample loaded:", {
        instrumentId,
        loadedId,
        buffer: loadedBuffer,
      });
      if (loadedId === instrumentId) {
        console.log("[Sampler] Sample loaded for instrument:", instrumentId);
        setIsLoading(false);
      }
    };

    audioEngine.on("sampleLoaded", handleSampleLoaded);
    return () => {
      audioEngine.off("sampleLoaded", handleSampleLoaded);
      setIsLoading(false);
    };
  }, [audioEngine, instrumentId]);

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      try {
        await onLoadSample(file);
      } catch (error) {
        console.error("[Sampler] Error loading sample:", error);
        setIsLoading(false);
      }
    }
  };

  // Draw waveform when sample changes
  useEffect(() => {
    console.log("[Sampler] Sample changed:", { sample, isLoading });
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#020817";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Get sample data
    let audioBuffer = sample?.buffer;
    if (!audioBuffer && sample) {
      // Try to get buffer from AudioEngine
      audioBuffer = audioEngine.getSampleBufferForInstrument(instrumentId);
    }

    if (!audioBuffer) {
      // Draw placeholder state
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, canvas.height / 3, canvas.width, canvas.height / 3);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        isLoading ? "Loading sample..." : "No sample loaded",
        canvas.width / 2,
        canvas.height / 2
      );
      return;
    }

    try {
      // Draw waveform
      const data = audioBuffer.getChannelData(0);
      const step = Math.ceil(data.length / canvas.width);
      const amp = canvas.height / 2;
      console.log("[Sampler] Drawing waveform", {
        channels: audioBuffer.numberOfChannels,
        length: data.length,
        step,
        amp,
      });

      ctx.beginPath();
      ctx.strokeStyle = "#94a3b8";
      ctx.moveTo(0, amp);

      for (let i = 0; i < canvas.width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
          const datum = data[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        ctx.lineTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
        // console.log(
        //   "[Sampler] Line to:",
        //   i,
        //   step,
        //   (1 + min) * amp,
        //   (1 + max) * amp
        // );
      }

      ctx.stroke();

      // Draw start and end points if sample data exists
      if (sample) {
        const startX = Math.floor(canvas.width * sample.startPoint);
        const endX = Math.floor(canvas.width * sample.endPoint);

        ctx.fillStyle = "#0ea5e9";
        ctx.fillRect(startX - 2, 0, 4, canvas.height);
        ctx.fillRect(endX - 2, 0, 4, canvas.height);
      }
    } catch (error) {
      console.error("[Sampler] Error drawing waveform:", error);
      // Draw error state
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Error loading sample", canvas.width / 2, canvas.height / 2);
    }
  }, [sample, instrumentId, audioEngine, isLoading]);

  // Handle mouse interactions for start/end points
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !sample) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;

    // Check if clicking near start or end point
    const startX = sample.startPoint;
    const endX = sample.endPoint;
    const threshold = 0.02;

    if (Math.abs(x - startX) < threshold) {
      setIsDragging("start");
    } else if (Math.abs(x - endX) < threshold) {
      setIsDragging("end");
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current || !sample) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    if (isDragging === "start" && x < sample.endPoint) {
      onUpdateSample({ startPoint: x });
    } else if (isDragging === "end" && x > sample.startPoint) {
      onUpdateSample({ endPoint: x });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          className="hidden"
          id="sample-upload"
        />
        <label htmlFor="sample-upload">
          <Button variant="outline" asChild>
            <span>Load Sample</span>
          </Button>
        </label>
        {sample?.fileName && (
          <span className="text-sm text-gray-400">{sample.fileName}</span>
        )}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={100}
          className="w-full bg-gray-950 rounded"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-center mb-2">Gain</label>
          <Knob
            value={sample?.gain ?? 1}
            min={0}
            max={1}
            step={0.01}
            size={60}
            onChange={(value) => onUpdateSample({ gain: value })}
          />
        </div>
        <div>
          <label className="block text-center mb-2">Loop</label>
          <Select
            value={sample?.loopType ?? "oneshot"}
            onValueChange={(value) =>
              onUpdateSample({ loopType: value as LoopType })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oneshot">One Shot</SelectItem>
              <SelectItem value="forward">Forward</SelectItem>
              <SelectItem value="pingpong">Ping Pong</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
