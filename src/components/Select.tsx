import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  autoFocusOnMount?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

interface PopupPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const POPUP_MAX_HEIGHT = 280;

export function Select({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Selecione uma opção",
  required = false,
  disabled = false,
  className = "",
  autoFocusOnMount = false,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const [typeahead, setTypeahead] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const typeaheadTimerRef = useRef<number | null>(null);
  const listboxId = `${id}-listbox`;
  const labelId = `${id}-label`;
  const generatedOptionPrefix = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);

  const firstEnabledIndex = () =>
    options.findIndex((option) => !option.disabled);

  const nextEnabledIndex = (start: number, direction: 1 | -1) => {
    if (options.length === 0) return -1;
    let index = start;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index]?.disabled) return index;
    }
    return -1;
  };

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const maxHeight = Math.min(
      POPUP_MAX_HEIGHT,
      Math.max(120, window.innerHeight - 24),
    );
    const opensAbove =
      rect.bottom + maxHeight > window.innerHeight - 12 &&
      rect.top >= maxHeight + 12;
    setPosition({
      top: opensAbove
        ? Math.max(12, rect.top - maxHeight)
        : Math.min(rect.bottom, window.innerHeight - 12),
      left: Math.max(
        12,
        Math.min(rect.left, window.innerWidth - rect.width - 12),
      ),
      width: rect.width,
      maxHeight,
    });
  }, []);

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : firstEnabledIndex(),
    );
    setOpen(true);
  };

  const closeMenu = (restoreFocus = true) => {
    setOpen(false);
    setPosition(null);
    setTypeahead("");
    if (restoreFocus)
      window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const chooseOption = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    closeMenu();
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onViewportChange = () => updatePosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (autoFocusOnMount) triggerRef.current?.focus();
  }, [autoFocusOnMount]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        closeMenu(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current !== null)
        window.clearTimeout(typeaheadTimerRef.current);
    },
    [],
  );

  const handleTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && !open) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openMenu();
      else
        setActiveIndex((current) =>
          nextEnabledIndex(current < 0 ? -1 : current, 1),
        );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openMenu();
      else
        setActiveIndex((current) =>
          nextEnabledIndex(current < 0 ? 0 : current, -1),
        );
      return;
    }
    if (!open) {
      if (event.key.length === 1 && event.key.trim()) {
        const match = options.find(
          (option) =>
            !option.disabled &&
            option.label
              .toLocaleLowerCase("pt-BR")
              .startsWith(event.key.toLocaleLowerCase("pt-BR")),
        );
        if (match) {
          event.preventDefault();
          onChange(match.value);
        }
      }
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(firstEnabledIndex());
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      let lastEnabled = -1;
      for (let index = options.length - 1; index >= 0; index -= 1) {
        if (!options[index]?.disabled) {
          lastEnabled = index;
          break;
        }
      }
      setActiveIndex(lastEnabled);
      return;
    }
    if (event.key === "Tab") {
      closeMenu(false);
      return;
    }
    if (event.key.length === 1 && event.key.trim()) {
      const nextTypeahead = `${typeahead}${event.key.toLocaleLowerCase("pt-BR")}`;
      const match = options.findIndex(
        (option) =>
          !option.disabled &&
          option.label.toLocaleLowerCase("pt-BR").startsWith(nextTypeahead),
      );
      if (match >= 0) setActiveIndex(match);
      setTypeahead(nextTypeahead);
      if (typeaheadTimerRef.current !== null)
        window.clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current = window.setTimeout(
        () => setTypeahead(""),
        700,
      );
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) chooseOption(option);
    }
  };

  const selectedOption =
    selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const optionId = (index: number) =>
    `${generatedOptionPrefix}-option-${index}`;

  return (
    <div className={`select-field${className ? ` ${className}` : ""}`}>
      <label id={labelId} className="select-label" htmlFor={id}>
        {label}
        {required && <strong aria-hidden="true"> *</strong>}
      </label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`select-trigger${open ? " is-open" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-activedescendant={
          open && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        aria-required={required || undefined}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={!selectedOption ? "is-placeholder" : undefined}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popupRef}
            id={listboxId}
            className="select-popover"
            role="listbox"
            aria-labelledby={labelId}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={optionId(index)}
                className={`select-option${index === activeIndex ? " is-highlighted" : ""}${option.value === value ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                tabIndex={-1}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <Check size={16} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
