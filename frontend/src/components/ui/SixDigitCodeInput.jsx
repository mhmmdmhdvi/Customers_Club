import {
    useRef,
} from "react";

export function SixDigitCodeInput({
    value,
    onChange,
    ariaLabel,
    disabled = false,
}) {
    const inputRefs = useRef([]);

    const digits = Array.from(
        { length: 6 },
        (_, index) => value[index] ?? "",
    );

    function focusInput(index) {
        inputRefs.current[index]?.focus();
    }

    function handleChange(index, event) {
        const rawValue = event.target.value;

        if (
            rawValue !== "" &&
            !/^\d+$/.test(rawValue)
        ) {
            return;
        }

        const nextDigit =
            rawValue.slice(-1);

        const nextDigits = [...digits];

        nextDigits[index] = nextDigit;

        onChange(
            nextDigits.join(""),
        );

        if (
            nextDigit &&
            index < 5
        ) {
            focusInput(index + 1);
        }
    }

    function handleKeyDown(index, event) {
        if (
            event.key === "Backspace" &&
            digits[index] === "" &&
            index > 0
        ) {
            focusInput(index - 1);
        }
    }

    function handlePaste(event) {
        const pastedValue =
            event.clipboardData
                .getData("text")
                .replace(/\D/g, "")
                .slice(0, 6);

        if (!pastedValue) {
            return;
        }

        event.preventDefault();

        onChange(pastedValue);

        focusInput(
            Math.min(
                pastedValue.length,
                6,
            ) - 1,
        );
    }

    return (
        <div
            dir="ltr"
            className="flex justify-center gap-2 sm:gap-3"
        >
            {digits.map((digit, index) => (
                <input
                    key={index}
                    ref={(element) => {
                        inputRefs.current[index] =
                            element;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    disabled={disabled}
                    autoComplete={
                        index === 0
                            ? "one-time-code"
                            : "off"
                    }
                    aria-label={`${ariaLabel} ${index + 1}`}
                    onChange={(event) =>
                        handleChange(
                            index,
                            event,
                        )
                    }
                    onKeyDown={(event) =>
                        handleKeyDown(
                            index,
                            event,
                        )
                    }
                    onPaste={handlePaste}
                    className="size-11 rounded-lg border border-border-strong bg-background text-center text-lg font-bold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 sm:size-12"
                />
            ))}
        </div>
    );
}