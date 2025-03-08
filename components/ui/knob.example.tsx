"use client";

import { useState } from "react";
import { Knob } from "./knob";

export function KnobExample() {
  const [value1, setValue1] = useState(50);
  const [value2, setValue2] = useState(75);
  const [value3, setValue3] = useState(25);

  return (
    <div className="flex gap-8 items-center p-8">
      {/* Basic knob */}
      <div className="flex flex-col items-center gap-2">
        <Knob value={value1} onChange={setValue1} />
        <span className="text-sm">Basic</span>
      </div>

      {/* Large knob with custom range */}
      <div className="flex flex-col items-center gap-2">
        <Knob
          value={value2}
          onChange={setValue2}
          min={20}
          max={20000}
          step={1}
          size={60}
          scaleSteps={15}
        />
        <span className="text-sm">Frequency</span>
      </div>

      {/* Small knob with custom degrees */}
      <div className="flex flex-col items-center gap-2">
        <Knob
          value={value3}
          onChange={setValue3}
          min={0}
          max={100}
          size={32}
          degrees={180}
          scaleSteps={7}
        />
        <span className="text-sm">Pan</span>
      </div>
    </div>
  );
}
