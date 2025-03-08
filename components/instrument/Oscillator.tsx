import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Knob } from "@/components/ui/knob";
import type { Oscillator as OscillatorType } from "@/lib/types";
import Sampler from "./Sampler";

interface OscillatorProps {
  instrumentId: string;
  oscillator: OscillatorType;
  label?: string;
  prefix?: string;
  onChangeParameter: (field: string, value: number | string) => void;
  onLoadSample?: (file: File) => Promise<void>;
}

export default function Oscillator({
  instrumentId,
  oscillator,
  label = "Oscillator",
  prefix = "",
  onChangeParameter,
  onLoadSample,
}: OscillatorProps) {
  const handleChange = (field: string, value: any) => {
    onChangeParameter(`${prefix}oscillator.${field}`, value);
  };

  const handleTypeChange = (value: string) => {
    handleChange("type", value);
    // Initialize sample data when switching to sampler
    if (value === "sampler" && !oscillator.sample) {
      const defaultSample = {
        buffer: null,
        fileName: "",
        startPoint: 0,
        endPoint: 1,
        gain: 1,
        loopType: "oneshot" as const,
      };
      handleChange("sample", defaultSample);
    }
  };

  const handleSampleUpdate = (updates: Record<string, any>) => {
    const currentSample = oscillator.sample || {};
    const updatedSample = { ...currentSample, ...updates };
    handleChange("sample", updatedSample);
  };

  return (
    <div className="space-y-4">
      <div>
        <Select value={oscillator.type} onValueChange={handleTypeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sine">Sine</SelectItem>
            <SelectItem value="square">Square</SelectItem>
            <SelectItem value="sawtooth">Sawtooth</SelectItem>
            <SelectItem value="triangle">Triangle</SelectItem>
            <SelectItem value="sampler">Sampler</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {oscillator.type === "sampler" ? (
        <Sampler
          instrumentId={instrumentId}
          sample={oscillator.sample}
          onLoadSample={onLoadSample ?? (() => Promise.resolve())}
          onUpdateSample={handleSampleUpdate}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-center mb-2">Detune</label>
            <Knob
              value={oscillator.detune}
              min={-100}
              max={100}
              step={1}
              size={60}
              onChange={(value) => handleChange("detune", value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
