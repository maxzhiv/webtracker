import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Knob } from "@/components/ui/knob";
import Envelope from "./Envelope";
import type { Instrument } from "@/lib/types";

interface FilterProps {
  instrument: Instrument;
  onChangeParameter: (field: string, value: any) => void;
}

export default function Filter({ instrument, onChangeParameter }: FilterProps) {
  // Helper function to safely get numeric values for Knob components
  const getKnobValue = (value: any, defaultValue: number) => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  // Convert frequency to logarithmic scale for knob (0-1)
  const freqToKnob = (freq: number) => {
    const minFreq = Math.log(20);
    const maxFreq = Math.log(20000);
    return (Math.log(freq) - minFreq) / (maxFreq - minFreq);
  };

  // Convert knob value (0-1) back to frequency
  const knobToFreq = (knob: number) => {
    const minFreq = Math.log(20);
    const maxFreq = Math.log(20000);
    return Math.round(Math.exp(knob * (maxFreq - minFreq) + minFreq));
  };

  return (
    <div className="space-y-6">
      <div>
        <Select
          value={instrument.filter.type}
          onValueChange={(value) => onChangeParameter("filter.type", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lowpass">LP12</SelectItem>
            <SelectItem value="highpass">HP12</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Knob
            value={freqToKnob(getKnobValue(instrument.filter.frequency, 1000))}
            min={0}
            max={1}
            step={0.001}
            size={120}
            onChange={(value) =>
              onChangeParameter("filter.frequency", knobToFreq(value))
            }
          />
          <label className="block text-center">
            {Math.round(instrument.filter.frequency)} Hz
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-center">RES</label>
            <Knob
              value={getKnobValue(instrument.filter.resonance, 1)}
              min={0.1}
              max={20}
              step={0.1}
              size={60}
              onChange={(value) => onChangeParameter("filter.resonance", value)}
            />
          </div>
          <div>
            <label className="block text-center">MOD</label>
            <Knob
              value={getKnobValue(instrument.filter.envelopeAmount, 0)}
              min={-1}
              max={1}
              step={0.01}
              size={60}
              onChange={(value) =>
                onChangeParameter("filter.envelopeAmount", value)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
