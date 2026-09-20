import {
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import {
    describe,
    expect,
    it,
} from "vitest";

import {
    ToastProvider,
} from "./ToastProvider";

import {
    useToast,
} from "./ToastContext";

function TestConsumer() {
    const toast = useToast();

    return (
        <div>
            <button
                type="button"
                onClick={() =>
                    toast.success("عملیات موفق بود.")
                }
            >
                success
            </button>

            <button
                type="button"
                onClick={() =>
                    toast.error("عملیات ناموفق بود.")
                }
            >
                error
            </button>

            <button
                type="button"
                onClick={() =>
                    toast.warning("هشدار آزمایشی")
                }
            >
                warning
            </button>
        </div>
    );
}

describe("ToastProvider", () => {
    it("shows success notifications as status messages", () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "success",
            }),
        );

        expect(
            screen.getByRole("status"),
        ).toHaveTextContent(
            "عملیات موفق بود.",
        );
    });

    it("shows error notifications as alerts", () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "error",
            }),
        );

        expect(
            screen.getByRole("alert"),
        ).toHaveTextContent(
            "عملیات ناموفق بود.",
        );
    });

    it("shows warning notifications as status messages", () => {
        render(
            <ToastProvider>
                <TestConsumer />
            </ToastProvider>,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "warning",
            }),
        );

        expect(
            screen.getByRole("status"),
        ).toHaveTextContent(
            "هشدار آزمایشی",
        );
    });
});