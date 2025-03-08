import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Knob } from "@/components/ui/knob";
import type { Envelope as EnvelopeType } from "@/lib/types";

interface EnvelopeProps {
  envelope: EnvelopeType;
  label?: string;
  prefix?: string;
  onChangeParameter: (field: string, value: any) => void;
}

export default function Envelope({
  envelope,
  label = "Envelope",
  prefix = "",
  onChangeParameter,
}: EnvelopeProps) {
  // Helper function to safely get numeric values for Knob components
  const getKnobValue = (value: any, defaultValue: number) => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  const fieldPrefix = prefix ? `${prefix}.` : "";

  return (
    <div className="space-y-4">
      <div>
        <Select
          value={envelope.type}
          onValueChange={(value) =>
            onChangeParameter(`${fieldPrefix}type`, value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ad">AD</SelectItem>
            <SelectItem value="ar">AR</SelectItem>
            <SelectItem value="adsr">ADSR</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-0">
        <div className="flex items-center">
          <label className="mr-2">ATK</label>
          <Knob
            value={getKnobValue(envelope.attack, 0.01)}
            min={0.001}
            max={2}
            step={0.001}
            size={50}
            onChange={(value) =>
              onChangeParameter(`${fieldPrefix}attack`, value)
            }
          />
        </div>
        {(envelope.type === "ad" || envelope.type === "adsr") && (
          <div className="flex items-center">
            <label className="mr-2">DEC</label>
            <Knob
              value={getKnobValue(envelope.decay, 0.1)}
              min={0.001}
              max={2}
              step={0.001}
              size={50}
              onChange={(value) =>
                onChangeParameter(`${fieldPrefix}decay`, value)
              }
            />
          </div>
        )}
        {envelope.type === "adsr" && (
          <div className="flex items-center">
            <label className="mr-2">SUS</label>
            <Knob
              value={getKnobValue(envelope.sustain, 0)}
              min={0}
              max={1}
              step={0.01}
              size={50}
              onChange={(value) =>
                onChangeParameter(`${fieldPrefix}sustain`, value)
              }
            />
          </div>
        )}
        {(envelope.type === "ar" || envelope.type === "adsr") && (
          <div className="flex items-center">
            <label className="mr-2">REL</label>
            <Knob
              value={getKnobValue(envelope.release, 0.1)}
              min={0.001}
              max={5}
              step={0.001}
              size={50}
              onChange={(value) =>
                onChangeParameter(`${fieldPrefix}release`, value)
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
