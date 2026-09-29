import {
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    SixDigitCodeInput,
} from "./SixDigitCodeInput";

describe("SixDigitCodeInput", () => {
    it("renders six one-digit numeric inputs", () => {
        render(
            <SixDigitCodeInput
                value=""
                onChange={vi.fn()}
                ariaLabel="کد تأیید"
            />,
        );

        const inputs =
            screen.getAllByRole("textbox");

        expect(inputs).toHaveLength(6);

        inputs.forEach((input) => {
            expect(input).toHaveAttribute(
                "inputmode",
                "numeric",
            );

            expect(input).toHaveAttribute(
                "maxlength",
                "1",
            );
        });
    });

    it("accepts only digits and moves focus forward", () => {
        const onChange = vi.fn();

        render(
            <SixDigitCodeInput
                value=""
                onChange={onChange}
                ariaLabel="کد تأیید"
            />,
        );

        const inputs =
            screen.getAllByRole("textbox");

        fireEvent.change(inputs[0], {
            target: {
                value: "7",
            },
        });

        expect(onChange).toHaveBeenCalledWith(
            "7",
        );

        expect(inputs[1]).toHaveFocus();

        fireEvent.change(inputs[1], {
            target: {
                value: "x",
            },
        });

        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("moves focus backward on Backspace from an empty box", () => {
        render(
            <SixDigitCodeInput
                value="7"
                onChange={vi.fn()}
                ariaLabel="کد تأیید"
            />,
        );

        const inputs =
            screen.getAllByRole("textbox");

        inputs[1].focus();

        fireEvent.keyDown(inputs[1], {
            key: "Backspace",
        });

        expect(inputs[0]).toHaveFocus();
    });

    it("fills all boxes when a six-digit code is pasted", () => {
        const onChange = vi.fn();

        render(
            <SixDigitCodeInput
                value=""
                onChange={onChange}
                ariaLabel="کد تأیید"
            />,
        );

        const inputs =
            screen.getAllByRole("textbox");

        fireEvent.paste(inputs[0], {
            clipboardData: {
                getData: () => "123456",
            },
        });

        expect(onChange).toHaveBeenCalledWith(
            "123456",
        );
    });
});