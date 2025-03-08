import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectValue,
  SelectItem,
  SelectTrigger,
  SelectContent,
} from "@/components/ui/select";
import { Knob } from "@/components/ui/knob";
import { PARAMETER_IDS } from "@/lib/types";
import type { LFO as LFOType, LFO2 as LFO2Type } from "@/lib/types";

interface LFOProps {
  lfo: LFOType | LFO2Type;
  index: 1 | 2; // LFO1 or LFO2
  onChangeParameter: (field: string, value: any) => void;
}

export default function LFO({ lfo, index, onChangeParameter }: LFOProps) {
  const prefix = `lfo${index}`;

  // Get available modulation targets based on LFO index
  const getModulationTargets = () => {
    const targets = [
      { id: PARAMETER_IDS.OSCILLATOR_DETUNE, label: "Oscillator Detune" },
      { id: PARAMETER_IDS.FILTER_FREQUENCY, label: "Filter Frequency" },
      { id: PARAMETER_IDS.FILTER_RESONANCE, label: "Filter Resonance" },
      { id: PARAMETER_IDS.VOLUME, label: "Volume" },
      { id: PARAMETER_IDS.PAN, label: "Pan" },
    ];

    // Add LFO1 modulation targets for LFO2
    if (index === 2) {
      targets.push(
        { id: "lfo1_frequency" as const, label: "LFO1 Frequency" },
        { id: "lfo1_depth" as const, label: "LFO1 Depth" }
      );
    }

    return targets;
  };

  return (
    <Card>
      {/* Waveform Selection */}
      <div className="space-y-2">
        <Select
          value={lfo.waveform}
          onValueChange={(value) =>
            onChangeParameter(`${prefix}.waveform`, value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sine">Sine</SelectItem>
            <SelectItem value="square">Square</SelectItem>
            <SelectItem value="sawtooth">Sawtooth</SelectItem>
            <SelectItem value="triangle">Triangle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Frequency Knob */}
      <div className="flex flex-col items-center">
        <label className="text-sm text-muted-foreground">Frequency</label>
        <Knob
          value={lfo.frequency}
          min={0.1}
          max={20}
          step={0.1}
          onChange={(value) => onChangeParameter(`${prefix}.frequency`, value)}
        />
        <span className="text-xs text-muted-foreground mt-1">
          {lfo.frequency.toFixed(1)} Hz
        </span>
      </div>

      {/* Depth Knob */}
      <div className="flex flex-col items-center">
        <label className="text-sm text-muted-foreground">Depth</label>
        <Knob
          value={lfo.depth}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => onChangeParameter(`${prefix}.depth`, value)}
        />
        <span className="text-xs text-muted-foreground mt-1">
          {Math.round(lfo.depth * 100)}%
        </span>
      </div>

      {/* Modulation Target */}
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Target</label>
        <Select
          value={String(lfo.target)}
          onValueChange={(value) =>
            onChangeParameter(
              `${prefix}.target`,
              // Convert numeric strings back to numbers
              /^\d+$/.test(value) ? parseInt(value) : value
            )
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Target" />
          </SelectTrigger>
          <SelectContent>
            {getModulationTargets().map((target) => (
              <SelectItem key={target.id} value={String(target.id)}>
                {target.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}
