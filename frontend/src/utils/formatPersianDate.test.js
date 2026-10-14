import { expect, it } from "vitest";
import { formatPersianJoinDate, formatPersianBirthday } from "./formatPersianDate";

it("marks missing legacy birthdays without inventing a date", () => {
    expect(formatPersianBirthday({ birthYear: null, birthMonth: null, birthDay: null })).toBe("ثبت نشده");
    expect(formatPersianBirthday({})).toBe("ثبت نشده");
});

it("formats a membership date with the Persian calendar", () => {
    expect(
        formatPersianJoinDate("2026-09-16T08:00:00.000Z"),
    ).toBe("۲۵ شهریور ۱۴۰۵");
});
