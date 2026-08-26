"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FormSelectOption = { value: string; label: string };

/**
 * shadcn Select in a form-friendly wrapper: works uncontrolled inside server-
 * action <form>s (Base UI renders a hidden input for `name`) and controlled
 * via value/onValueChange in client components.
 */
export function FormSelect({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder,
  className,
  size,
  disabled,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  disabled?: boolean;
}) {
  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      // items lets SelectValue render the option LABEL (not the raw value)
      // before the popup has ever been opened.
      items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
      onValueChange={(v) => {
        if (v != null) onValueChange?.(v as string);
      }}
    >
      <SelectTrigger id={id} className={cn("w-full", className)} size={size}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
