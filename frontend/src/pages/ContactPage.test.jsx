import {
    render,
    screen,
    within,
} from "@testing-library/react";
import {
    describe,
    expect,
    it,
} from "vitest";

import { ContactPage } from "./ContactPage";

describe("ContactPage", () => {
    it("renders the approved contact page", () => {
        render(<ContactPage />);

        const main = screen.getByRole("main");

        expect(
            within(main).getByRole("heading", {
                name: "تماس با ما",
            }),
        ).toBeInTheDocument();

        expect(
            within(main).getByText(
                "راه‌های ارتباطی با ما",
            ),
        ).toBeInTheDocument();

        expect(
            within(main).getByText(
                "ارسال پیام به ما",
            ),
        ).toBeInTheDocument();

        expect(
            within(main).getByLabelText(
                /نام و نام خانوادگی/,
            ),
        ).toBeInTheDocument();

        expect(
            within(main).getByLabelText(
                /شماره موبایل/,
            ),
        ).toBeInTheDocument();

        expect(
            within(main).getByLabelText(
                "ایمیل",
            ),
        ).toBeInTheDocument();

        expect(
            within(main).getByLabelText(
                /موضوع/,
            ),
        ).toBeInTheDocument();

        expect(
            within(main).getByLabelText(
                /پیام شما/,
            ),
        ).toBeInTheDocument();

        expect(
            within(main).queryByText(
                "همراه ما در شبکه‌های اجتماعی",
            ),
        ).not.toBeInTheDocument();

        expect(
            within(main).queryByText(
                "موقعیت ما روی نقشه",
            ),
        ).not.toBeInTheDocument();
    });

    it("marks required fields and limits the message to 250 characters", () => {
        render(<ContactPage />);

        const main = screen.getByRole("main");

        const nameInput =
            within(main).getByLabelText(
                /نام و نام خانوادگی/,
            );

        const phoneInput =
            within(main).getByLabelText(
                /شماره موبایل/,
            );

        const emailInput =
            within(main).getByLabelText(
                "ایمیل",
            );

        const subjectInput =
            within(main).getByLabelText(
                /موضوع/,
            );

        const messageInput =
            within(main).getByLabelText(
                /پیام شما/,
            );

        expect(nameInput).toBeRequired();
        expect(phoneInput).toBeRequired();
        expect(subjectInput).toBeRequired();
        expect(messageInput).toBeRequired();

        expect(emailInput).not.toBeRequired();

        expect(messageInput).toHaveAttribute(
            "maxlength",
            "250",
        );

        expect(
            within(main).getAllByText("*"),
        ).toHaveLength(4);
    });
});