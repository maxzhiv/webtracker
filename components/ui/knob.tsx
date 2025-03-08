import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface KnobProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  size?: number;
  onChange?: (value: number) => void;
  className?: string;
  // Number of degrees the knob can turn (default: 270)
  degrees?: number;
  // Show scale markings
  showScale?: boolean;
  // Number of scale markings
  scaleSteps?: number;
}

export function Knob({
  value,
  min = 0,
  max = 100,
  step = 1,
  size = 40,
  onChange,
  className,
  degrees = 270,
  showScale = true,
  scaleSteps = 11,
  ...props
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startX, setStartX] = useState(0);
  const [startValue, setStartValue] = useState(0);

  // Calculate rotation based on value
  const getRotation = (val: number) => {
    const range = max - min;
    const valuePercent = (val - min) / range;
    const startAngle = -(degrees / 2);
    return startAngle + degrees * valuePercent;
  };

  // Handle mouse/touch interactions
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const sensitivity = 0.5; // Adjust this to change drag sensitivity
      const dx = (e.clientX - startX) * sensitivity;
      const dy = (e.clientY - startY) * sensitivity;

      // Use the larger of horizontal or vertical movement
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : -dy;

      const range = max - min;
      const valueChange = (delta / 100) * range;

      let newValue = startValue + valueChange;
      newValue = Math.round(newValue / step) * step;
      newValue = Math.max(min, Math.min(max, newValue));

      onChange?.(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, startX, startY, startValue, min, max, step, onChange]);

  // Generate scale markings
  const scaleMarks = showScale
    ? Array.from({ length: scaleSteps }, (_, i) => {
        const rotation = getRotation(
          min + ((max - min) / (scaleSteps - 1)) * i
        );
        const isMiddle = i === Math.floor(scaleSteps / 2);
        return (
          <div
            key={i}
            className={cn(
              "absolute top-0 left-1/2 -translate-x-1/2 origin-bottom",
              isMiddle ? "h-2 w-0.5 bg-yellow-400" : "h-1 w-0.5 bg-yellow-700"
            )}
            style={{
              transform: `translateX(-50%) rotate(${rotation}deg)`,
              transformOrigin: `50% ${size / 2}px`,
            }}
          />
        );
      })
    : null;

  return (
    <div
      className={cn("relative inline-block select-none touch-none", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      {/* Scale background */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "rgba(0, 0, 0, 0.2)",
        }}
      />

      {/* Scale markings */}
      {scaleMarks}

      {/* Knob handle */}
      <div
        ref={knobRef}
        className="absolute inset-2 rounded-full border-2 border-orange-600 cursor-pointer shadow-lg"
        style={{
          width: size - 16,
          height: size - 16,
          transform: `rotate(${getRotation(value)}deg)`,
        }}
        onMouseDown={(e) => {
          setIsDragging(true);
          setStartX(e.clientX);
          setStartY(e.clientY);
          setStartValue(value);
        }}
      >
        {/* Indicator line */}
        <div
          className="absolute top-2 left-1/2 w-0.5 h-2 bg-orange-400 rounded-full"
          style={{
            transform: "translate(-50%, -100%)",
          }}
        />
      </div>

      {/* Value indicator */}
      <div
        className="absolute inset-0 flex items-center justify-center text-xs font-medium pointer-events-none"
        style={{ color: "rgba(255, 255, 255, 0.8)" }}
      >
        {Math.round(value)}
      </div>
    </div>
  );
}
