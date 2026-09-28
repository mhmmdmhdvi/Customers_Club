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

import DateObject from "react-date-object";
import jalali from "react-date-object/calendars/jalali";
import persianFa from "react-date-object/locales/persian_fa";
import {
    BirthdayDatePicker,
    getBirthdayParts,
} from "./BirthdayDatePicker";

describe("BirthdayDatePicker", () => {
    it("renders the birthday label and a non-typing date picker trigger", () => {
        render(
            <BirthdayDatePicker
                value={null}
                onChange={vi.fn()}
            />,
        );

        expect(
            screen.getByText("تاریخ تولد"),
        ).toBeInTheDocument();

        expect(
            screen.getByRole("button", {
                name: /انتخاب تاریخ تولد/,
            }),
        ).toBeInTheDocument();
    });

    it("opens the calendar when the birthday trigger is clicked", () => {
        render(
            <BirthdayDatePicker
                value={null}
                onChange={vi.fn()}
            />,
        );

        expect(
            document.querySelector(".rmdp-calendar"),
        ).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: /انتخاب تاریخ تولد/,
            }),
        );

        expect(
            document.querySelector(".rmdp-calendar"),
        ).toBeInTheDocument();
    });

    it("shows a calendar icon inside the birthday trigger", () => {
        render(
            <BirthdayDatePicker
                value={null}
                onChange={vi.fn()}
            />,
        );

        const trigger = screen.getByRole("button", {
            name: /انتخاب تاریخ تولد/,
        });

        expect(
            trigger.querySelector("svg"),
        ).toBeInTheDocument();
    });

    it("renders the birthday trigger as a full-width field", () => {
        render(
            <BirthdayDatePicker
                value={null}
                onChange={vi.fn()}
            />,
        );

        const trigger = screen.getByRole("button", {
            name: /انتخاب تاریخ تولد/,
        });

        expect(trigger).toHaveClass("w-full");
    });

    it("converts a selected Jalali date to integer birthday fields", () => {
        const selectedDate = new DateObject({
            calendar: jalali,
            year: 1375,
            month: 7,
            day: 12,
        });

        expect(
            getBirthdayParts(selectedDate),
        ).toEqual({
            birthYear: 1375,
            birthMonth: 7,
            birthDay: 12,
        });
    });

    it("passes the selected Jalali date to the parent as integer birthday fields", () => {
        const onChange = vi.fn();

        const selectedDate = new DateObject({
            calendar: jalali,
            year: 1375,
            month: 7,
            day: 12,
        });

        render(
            <BirthdayDatePicker
                value={{
                    birthYear: 1375,
                    birthMonth: 7,
                    birthDay: 12,
                }}
                onChange={onChange}
            />
        );

        fireEvent.click(
            screen.getByRole("button"),
        );

        const selectedDay = document.querySelector(
            ".rmdp-day.rmdp-selected",
        );

        expect(selectedDay).toBeInTheDocument();

        fireEvent.click(selectedDay);

        expect(onChange).toHaveBeenCalled();

        expect(
            onChange.mock.calls.at(-1)[0],
        ).toEqual({
            birthYear: 1375,
            birthMonth: 7,
            birthDay: 12,
        });
    });

    it("matches the registration input field styling", () => {
        render(
            <BirthdayDatePicker
                value={null}
                onChange={vi.fn()}
            />,
        );

        const trigger = screen.getByRole("button", {
            name: /انتخاب تاریخ تولد/,
        });

        expect(trigger).toHaveClass(
            "rounded-lg",
            "border",
            "border-border-strong",
            "bg-background",
            "px-4",
            "py-3",
        );
    });

    it("shows the selected Jalali birthday in the trigger", () => {
        render(
            <BirthdayDatePicker
                value={{
                    birthYear: 1375,
                    birthMonth: 7,
                    birthDay: 12,
                }}
                onChange={vi.fn()}
            />,
        );

        expect(
            screen.getByRole("button"),
        ).toHaveTextContent("۱۳۷۵/۷/۱۲");

        expect(
            screen.queryByText("انتخاب تاریخ تولد"),
        ).not.toBeInTheDocument();
    });

    it("disables future dates", () => {
        const tomorrow = new DateObject({
            date: new Date(Date.now() + 24 * 60 * 60 * 1000),
            calendar: jalali,
            locale: persianFa,
        });

        render(
            <BirthdayDatePicker
                value={null}
                onChange={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: /انتخاب تاریخ تولد/,
            }),
        );

        const tomorrowDay = screen.getByText(
            tomorrow.format("D"),
        );

        expect(
            tomorrowDay.closest(".rmdp-day"),
        ).toHaveClass("rmdp-disabled");
    });

    it("disables today because birthday must be in the past", () => {
        const today = new DateObject({
            date: new Date(),
            calendar: jalali,
            locale: persianFa,
        });

        render(
            <BirthdayDatePicker
                value={null}
                onChange={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: /انتخاب تاریخ تولد/,
            }),
        );

        const todayDay = screen.getByText(
            today.format("D"),
        );

        expect(
            todayDay.closest(".rmdp-day"),
        ).toHaveClass("rmdp-disabled");
    });

    it("makes the date-picker container full width", () => {
        render(
            <BirthdayDatePicker
                value={null}
                onChange={vi.fn()}
            />,
        );

        const trigger = screen.getByRole("button", {
            name: /انتخاب تاریخ تولد/,
        });

        const container = trigger.closest(".rmdp-container");

        expect(container).toBeInTheDocument();
        expect(container).toHaveClass("w-full");
    });
});