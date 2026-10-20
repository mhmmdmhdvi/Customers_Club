import DateObject from "react-date-object";
import jalali from "react-date-object/calendars/jalali";
import gregorian from "react-date-object/calendars/gregorian";

export function getLatestBirthday(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
    const value = type => Number(parts.find(part => part.type === type).value);
    return new DateObject({ calendar: gregorian, year: value("year"), month: value("month"), day: value("day") }).subtract(1, "day").convert(jalali);
}

export function getBirthdayParts(date) {
    if (!date) return null;
    return {
        birthYear: date.year,
        birthMonth: date.month.number,
        birthDay: date.day,
    };
}
