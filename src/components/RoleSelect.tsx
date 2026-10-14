import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Role } from "../auth/types";
import { USER_ROLE_LABELS } from "../auth/user-management-permissions";
import "./role-select.css";

export function RoleSelect({
  labelId,
  options,
  value,
  onChange,
}: {
  labelId: string;
  options: readonly Role[];
  value: Role;
  onChange: (value: Role) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const listboxId = `${id}-listbox`;
  const selectedIndex = Math.max(0, options.indexOf(value));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(index: number) {
    const next = options[index];
    if (!next) return;
    onChange(next);
    setActive(index);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        setActive(selectedIndex);
        setOpen(true);
      } else {
        setActive((index) => (index + direction + options.length) % options.length);
      }
    } else if (open && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else {
        setActive(selectedIndex);
        setOpen(true);
      }
    }
  }

  return (
    <div className="av-role-select" ref={rootRef}>
      <button
        type="button"
        className={`av-role-select-trigger${open ? " is-expanded" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        aria-labelledby={labelId}
        onClick={() => {
          setActive(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
      >
        <span>{USER_ROLE_LABELS[value]}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <div className="av-role-select-menu" id={listboxId} role="listbox" aria-labelledby={labelId}>
          {options.map((option, index) => (
            <button
              key={option}
              id={`${id}-option-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={value === option}
              className={`av-role-select-option${active === index ? " is-active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{USER_ROLE_LABELS[option]}</span>
              {value === option && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
