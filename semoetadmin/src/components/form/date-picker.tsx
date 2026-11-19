"use client";

import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import { useEffect, useRef } from "react";
import { CalenderIcon } from "../../icons";
import { fieldLabelClass, inputClass } from "@/lib/ui";
import { cn } from "@/utils";
import Label from "./Label";
import type { Instance as FlatpickrInstance } from "flatpickr/dist/types/instance";

type Hook = flatpickr.Options.Hook;
type DateOption = flatpickr.Options.DateOption;

type PropsType = {
  id?: string;
  mode?: "single" | "multiple" | "range" | "time";
  value?: string;
  defaultDate?: DateOption;
  onChange?: Hook | Hook[];
  onChangeValue?: (dateStr: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export default function DatePicker({
  id,
  mode = "single",
  value,
  defaultDate,
  onChange,
  onChangeValue,
  label,
  placeholder = "YYYY-MM-DD",
  disabled,
  required,
  className,
}: PropsType) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<FlatpickrInstance | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;

    const fp = flatpickr(inputRef.current, {
      mode,
      static: false,
      monthSelectorType: "static",
      dateFormat: "Y-m-d",
      defaultDate: value ?? defaultDate,
      allowInput: true,
      clickOpens: true,
      onChange: (selectedDates, dateStr, instance) => {
        if (onChange) {
          if (Array.isArray(onChange)) {
            onChange.forEach((fn) => fn(selectedDates, dateStr, instance));
          } else {
            onChange(selectedDates, dateStr, instance);
          }
        }
        onChangeValue?.(dateStr);
      },
    });

    fpRef.current = Array.isArray(fp) ? fp[0] : fp;

    if (fpRef.current?.calendarContainer) {
      fpRef.current.calendarContainer.style.zIndex = "100000";
    }

    return () => {
      fpRef.current?.destroy();
      fpRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (fpRef.current && value !== undefined) {
      const currentVal = fpRef.current.input.value;
      if (currentVal !== value) {
        fpRef.current.setDate(value || "", false);
      }
    }
  }, [value]);

  const handleManualInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChangeValue?.(val);
    if (fpRef.current && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      fpRef.current.setDate(val, false);
    }
  };

  const handleToggleCalendar = () => {
    if (!disabled && fpRef.current) {
      fpRef.current.toggle();
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <Label htmlFor={id} className={cn("mb-0", fieldLabelClass)}>
          {label}
        </Label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={handleManualInput}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={cn(inputClass, "pe-10")}
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={handleToggleCalendar}
          disabled={disabled}
          aria-label="Buka kalender"
          className="absolute inset-y-0 end-0 flex items-center pe-3 text-coffee-muted transition-colors hover:text-coffee-brown focus:outline-none dark:hover:text-coffee-caramel"
        >
          <CalenderIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}
