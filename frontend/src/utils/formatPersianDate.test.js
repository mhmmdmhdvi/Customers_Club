import { expect, it } from "vitest";
import { formatPersianJoinDate } from "./formatPersianDate";

it("formats a membership date with the Persian calendar", () => {
    expect(
        formatPersianJoinDate("2026-09-16T08:00:00.000Z"),
    ).toBe("۲۵ شهریور ۱۴۰۵");
});