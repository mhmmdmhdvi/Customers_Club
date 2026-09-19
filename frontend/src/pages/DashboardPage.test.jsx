import {
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import {
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { AuthContext } from "../auth/AuthContext";
import { DashboardPage } from "./DashboardPage";

const memberSession = {
    user: {
        id: 7,
        phone: "09123456789",
        firstName: "سارا",
        lastName: "احمدی",
        role: "MEMBER",
        createdAt: "2026-09-16T08:00:00.000Z",
    },
    accessToken: "test.access.token",
    tokenType: "Bearer",
    accessExpiresAt: "2026-09-16T10:15:00.000Z",
};

function renderDashboard(
    authValue,
    onRequireLogin = vi.fn(),
) {
    return {
        onRequireLogin,
        ...render(
            <AuthContext.Provider value={authValue}>
                <DashboardPage
                    onRequireLogin={onRequireLogin}
                />
            </AuthContext.Provider>,
        ),
    };
}

describe("DashboardPage", () => {
    it("renders the five requested membership fields", () => {
        renderDashboard({
            session: memberSession,
            authStatus: "authenticated",
            establishSession: vi.fn(),
            clearSession: vi.fn(),
        });

        expect(
            screen.getByRole("heading", {
                name: "اطلاعات عضویت",
            }),
        ).toBeInTheDocument();

        expect(screen.getByText("نام")).toBeInTheDocument();
        expect(screen.getByText("سارا")).toBeInTheDocument();

        expect(
            screen.getByText("نام خانوادگی"),
        ).toBeInTheDocument();
        expect(screen.getByText("احمدی")).toBeInTheDocument();

        expect(
            screen.getByText("شماره موبایل"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("09123456789"),
        ).toBeInTheDocument();

        expect(
            screen.getByText("وضعیت عضویت"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("عضو فعال"),
        ).toBeInTheDocument();

        expect(
            screen.getByText("تاریخ عضویت"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("۲۵ شهریور ۱۴۰۵"),
        ).toBeInTheDocument();

        expect(
            screen.queryByText(
                "2026-09-16T08:00:00.000Z",
            ),
        ).not.toBeInTheDocument();
    });

    it("renders the approved dashboard hero and membership card", () => {
        renderDashboard({
            session: memberSession,
            authStatus: "authenticated",
            establishSession: vi.fn(),
            clearSession: vi.fn(),
        });

        const hero = screen.getByRole("region", {
            name: "معرفی داشبورد",
        });

        expect(
            within(hero).getByText("مگاتایت"),
        ).toBeInTheDocument();

        expect(hero).toHaveTextContent(
            "بیش از یک خرید،",
        );

        expect(hero).toHaveTextContent(
            "یک همراهی پایدار...",
        );

        expect(
            screen.getByText(
                "اطلاعات ثبت شده شما در باشگاه مشتریان مگاتایت",
            ),
        ).toBeInTheDocument();

        expect(
            screen.queryByText("امتیاز خرید"),
        ).not.toBeInTheDocument();

        expect(
            screen.queryByText("تعداد خرید"),
        ).not.toBeInTheDocument();

        expect(
            screen.queryByText("تاریخچه خریدها"),
        ).not.toBeInTheDocument();

        expect(
            screen.queryByText("استفاده از امتیازات"),
        ).not.toBeInTheDocument();

        expect(
            screen.queryByText(
                "دسترسی به پیشنهاد های ویژه",
            ),
        ).not.toBeInTheDocument();
    });

    it("does not reveal member information while authentication is restoring", () => {
        const { onRequireLogin } = renderDashboard({
            session: null,
            authStatus: "restoring",
            establishSession: vi.fn(),
            clearSession: vi.fn(),
        });

        expect(
            screen.getByRole("status"),
        ).toHaveTextContent(
            "در حال بررسی وضعیت ورود...",
        );

        expect(
            screen.queryByText("09123456789"),
        ).not.toBeInTheDocument();

        expect(onRequireLogin).not.toHaveBeenCalled();
    });

    it("requests login after restoration resolves unauthenticated", async () => {
        const { onRequireLogin } = renderDashboard({
            session: null,
            authStatus: "unauthenticated",
            establishSession: vi.fn(),
            clearSession: vi.fn(),
        });

        await waitFor(() => {
            expect(onRequireLogin).toHaveBeenCalledTimes(1);
        });

        expect(
            screen.queryByText("09123456789"),
        ).not.toBeInTheDocument();
    });

    it("requests login when restoration ends in an ambiguous error", async () => {
        const { onRequireLogin } = renderDashboard({
            session: null,
            authStatus: "error",
            establishSession: vi.fn(),
            clearSession: vi.fn(),
        });

        await waitFor(() => {
            expect(onRequireLogin).toHaveBeenCalledTimes(1);
        });

        expect(
            screen.queryByText("09123456789"),
        ).not.toBeInTheDocument();
    });
});