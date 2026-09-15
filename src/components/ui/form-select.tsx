"use client";
import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { useMessages } from "@/components/locale-provider";

type OptionProps = {
  value?: string | number;
  disabled?: boolean;
  children?: React.ReactNode;
};
/** Declarative option data; the visible options are Base UI SelectItems. */
export function SelectOption(_: OptionProps) {
  return null;
}
function optionsFrom(
  children: React.ReactNode,
): { value: string; label: React.ReactNode; disabled?: boolean }[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement<OptionProps>(child)) return [];
    if (child.type === React.Fragment) return optionsFrom(child.props.children);
    if (child.type !== SelectOption) return [];
    return [
      {
        value: String(child.props.value ?? child.props.children ?? ""),
        label: child.props.children ?? String(child.props.value ?? ""),
        disabled: child.props.disabled,
      },
    ];
  });
}
type Props = {
  children: React.ReactNode;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
} & (
  | {
      multiple?: false;
      value?: string;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
    }
  | {
      multiple: true;
      value?: string[];
      defaultValue?: string[];
      onValueChange?: (value: string[]) => void;
    }
);
/** Shared form composition for single and multiple Base UI shadcn selects. */
export function FormSelect({ children, className, id, ...props }: Props) {
  const en = useMessages();
  const options = optionsFrom(children);
  const content = (
    <>
      <SelectTrigger
        id={id}
        className={className}
        aria-label={props["aria-label"]}
        aria-describedby={props["aria-describedby"]}
        aria-invalid={props["aria-invalid"]}
      >
        <SelectValue placeholder={en.common.select}>
          {(value) =>
            Array.isArray(value)
              ? value.length
                ? value
                    .map((v) => options.find((o) => o.value === v)?.label ?? v)
                    .reduce<React.ReactNode[]>(
                      (labels, label, index) => [
                        ...labels,
                        ...(index ? [", "] : []),
                        label,
                      ],
                      [],
                    )
                : en.common.select
              : (options.find((o) => o.value === value)?.label ??
                en.common.select)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
        {!options.length && (
          <div className="select-empty">{en.common.noResults}</div>
        )}
      </SelectContent>
    </>
  );
  const common = {
    name: props.name,
    required: props.required,
    disabled: props.disabled,
    items: options,
  };
  return props.multiple ? (
    <Select
      {...common}
      multiple
      value={props.value}
      defaultValue={props.defaultValue ?? []}
      onValueChange={(value) => props.onValueChange?.(value)}
    >
      {content}
    </Select>
  ) : (
    <Select
      {...common}
      value={props.value}
      defaultValue={props.defaultValue ?? options[0]?.value ?? null}
      onValueChange={(value) => props.onValueChange?.(value ?? "")}
    >
      {content}
    </Select>
  );
}
