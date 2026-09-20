import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { ToastProvider } from "../components/ui/ToastProvider";
import { ContactPage } from "./ContactPage";

afterEach(() => {
    vi.unstubAllGlobals();
});

function renderContactPage() {
    return render(
        <ToastProvider>
            <ContactPage />
        </ToastProvider>,
    );
}

describe("ContactPage", () => {
    it("renders the approved contact page", () => {
        renderContactPage();

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
        renderContactPage();

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

    it("submits the contact form to the contact message API", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 201,
            json: async () => ({
                message: "Contact message received",
            }),
        });

        vi.stubGlobal("fetch", fetchMock);

        renderContactPage();

        fireEvent.change(
            screen.getByLabelText(
                /نام و نام خانوادگی/,
            ),
            {
                target: {
                    value: " خسرو وفایی ",
                },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/شماره موبایل/),
            {
                target: {
                    value: "09121234567",
                },
            },
        );

        fireEvent.change(
            screen.getByLabelText("ایمیل"),
            {
                target: {
                    value: "TEST@EXAMPLE.COM",
                },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/موضوع/),
            {
                target: {
                    value: "support",
                },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/پیام شما/),
            {
                target: {
                    value: " لطفاً با من تماس بگیرید. ",
                },
            },
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "ارسال پیام",
            }),
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "http://localhost:3000/contact/messages",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: "خسرو وفایی",
                    phone: "09121234567",
                    email: "test@example.com",
                    subject: "SUPPORT",
                    message:
                        "لطفاً با من تماس بگیرید.",
                }),
            },
        );
        expect(
            await screen.findByRole("status"),
        ).toHaveTextContent(
            "پیام شما با موفقیت ارسال شد.",
        );

        expect(
            screen.getByLabelText(
                /نام و نام خانوادگی/,
            ),
        ).toHaveValue("");

        expect(
            screen.getByLabelText(/شماره موبایل/),
        ).toHaveValue("");

        expect(
            screen.getByLabelText("ایمیل"),
        ).toHaveValue("");

        expect(
            screen.getByLabelText(/موضوع/),
        ).toHaveValue("");

        expect(
            screen.getByLabelText(/پیام شما/),
        ).toHaveValue("");
    });

    it("shows a warning toast when contact submissions are rate limited", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({
                message: "Too many contact messages",
            }),
        });

        vi.stubGlobal("fetch", fetchMock);

        renderContactPage();

        fireEvent.change(
            screen.getByLabelText(/نام و نام خانوادگی/),
            {
                target: { value: "خسرو وفایی" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/شماره موبایل/),
            {
                target: { value: "09121234567" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/موضوع/),
            {
                target: { value: "support" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/پیام شما/),
            {
                target: { value: "پیام آزمایشی" },
            },
        );

        fireEvent.submit(
            screen.getByLabelText(/پیام شما/)
                .closest("form"),
        );

        expect(
            await screen.findByRole("status"),
        ).toHaveTextContent(
            "تعداد پیام‌های ارسالی زیاد است. لطفاً کمی بعد دوباره تلاش کنید.",
        );

        expect(
            screen.getByLabelText(/نام و نام خانوادگی/),
        ).toHaveValue("خسرو وفایی");

        expect(
            screen.getByLabelText(/پیام شما/),
        ).toHaveValue("پیام آزمایشی");
    });

    it("shows an error toast when sending the contact message fails", async () => {
        const fetchMock = vi.fn().mockRejectedValue(
            new Error("network unavailable"),
        );

        vi.stubGlobal("fetch", fetchMock);

        renderContactPage();

        fireEvent.change(
            screen.getByLabelText(/نام و نام خانوادگی/),
            {
                target: { value: "خسرو وفایی" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/شماره موبایل/),
            {
                target: { value: "09121234567" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/موضوع/),
            {
                target: { value: "support" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/پیام شما/),
            {
                target: { value: "پیام آزمایشی" },
            },
        );

        fireEvent.submit(
            screen.getByLabelText(/پیام شما/)
                .closest("form"),
        );

        expect(
            await screen.findByRole("alert"),
        ).toHaveTextContent(
            "ارسال پیام انجام نشد. لطفاً دوباره تلاش کنید.",
        );

        expect(
            screen.getByLabelText(/پیام شما/),
        ).toHaveValue("پیام آزمایشی");
    });

    it("prevents duplicate submissions while a request is pending", async () => {
        let resolveRequest;

        const fetchMock = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveRequest = resolve;
                }),
        );

        vi.stubGlobal("fetch", fetchMock);

        renderContactPage();

        fireEvent.change(
            screen.getByLabelText(/نام و نام خانوادگی/),
            {
                target: { value: "خسرو وفایی" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/شماره موبایل/),
            {
                target: { value: "09121234567" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/موضوع/),
            {
                target: { value: "support" },
            },
        );

        fireEvent.change(
            screen.getByLabelText(/پیام شما/),
            {
                target: { value: "پیام آزمایشی" },
            },
        );

        const submitButton = screen.getByRole(
            "button",
            {
                name: "ارسال پیام",
            },
        );

        fireEvent.click(submitButton);
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        expect(submitButton).toBeDisabled();

        resolveRequest({
            ok: true,
            status: 201,
            json: async () => ({
                message: "Contact message received",
            }),
        });

        await waitFor(() => {
            expect(submitButton).not.toBeDisabled();
        });
    });
});