import { useEffect } from "react";
import { UserRound } from "lucide-react";
import dashboardBanner from "../assets/images/dashboard-tehran-banner.jpg";
import { useAuth } from "../auth/AuthContext";
import { SiteHeader } from "../components/layout/SiteHeader";
import { formatPersianJoinDate } from "../utils/formatPersianDate";

export function DashboardPage({
    onRequireLogin = () => { },
    onLoggedOut = () => { },
}) {
    const { session, authStatus } = useAuth();

    useEffect(() => {
        if (
            authStatus === "unauthenticated" ||
            authStatus === "error"
        ) {
            onRequireLogin();
        }
    }, [authStatus, onRequireLogin]);

    if (authStatus === "restoring") {
        return (
            <main
                dir="rtl"
                className="min-h-screen bg-surface px-4 pt-28"
            >
                <p
                    role="status"
                    className="text-sm text-muted-foreground"
                >
                    در حال بررسی وضعیت ورود...
                </p>
            </main>
        );
    }

    if (
        authStatus !== "authenticated" ||
        !session
    ) {
        return null;
    }

    const rows = [
        {
            label: "نام",
            value: session.user.firstName,
        },
        {
            label: "نام خانوادگی",
            value: session.user.lastName,
        },
        {
            label: "شماره موبایل",
            value: (
                <span
                    dir="ltr"
                    className="inline-block font-medium"
                >
                    {session.user.phone}
                </span>
            ),
        },
        {
            label: "وضعیت عضویت",
            value: (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 font-bold text-emerald-700">
                    <span
                        aria-hidden="true"
                        className="size-2 rounded-full bg-emerald-500"
                    />
                    عضو فعال
                </span>
            ),
        },
        {
            label: "تاریخ عضویت",
            value: formatPersianJoinDate(
                session.user.createdAt,
            ),
        },
    ];

    return (
        <div
            dir="rtl"
            className="min-h-screen bg-[#f5f9ff] text-foreground"
        >
            <SiteHeader
                solid
                onLoggedOut={onLoggedOut}
            />

            <main className="page-container pt-28 pb-16 sm:pt-32">
                <section
                    aria-label="معرفی داشبورد"
                    className="relative min-h-56 overflow-hidden rounded-3xl border border-[#dbe7f5] bg-white shadow-refined sm:min-h-64"
                >
                    <img
                        src={dashboardBanner}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-center"
                    />

                    <div
                        aria-hidden="true"
                        className="absolute inset-y-0 right-0 w-[38%] bg-gradient-to-l from-white/90 via-white/65 to-transparent"
                    />

                    <div className="relative z-10 flex min-h-56 items-center px-7 py-8 sm:min-h-64 sm:px-12">
                        <div className="mr-0 ml-auto max-w-sm text-right">
                            <div className="font-mirza text-5xl font-semibold text-[#3786df] sm:text-6xl">
                                مگاتایت
                            </div>

                            <p className="mt-5 text-base font-semibold leading-8 text-[#40577c] sm:text-lg sm:leading-9">
                                بیش از یک خرید،
                                <br />
                                یک همراهی پایدار...
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mx-auto mt-8 max-w-4xl rounded-3xl border border-[#dfe8f4] bg-white p-5 shadow-[0_18px_50px_-28px_rgba(48,92,145,0.28)] sm:mt-10 sm:p-8">
                    <div className="flex items-start gap-4">
                        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                            <UserRound
                                className="size-6"
                                aria-hidden="true"
                            />
                        </div>

                        <div>
                            <h1 className="text-xl font-extrabold text-[#17233f] sm:text-2xl">
                                اطلاعات عضویت
                            </h1>

                            <p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-base">
                                اطلاعات ثبت شده شما در باشگاه مشتریان مگاتایت
                            </p>
                        </div>
                    </div>

                    <div className="mt-7 overflow-hidden rounded-2xl border border-[#dce6f2]">
                        <table className="w-full border-collapse text-sm sm:text-base">
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={row.label}
                                        className="border-b border-[#e3eaf3] last:border-b-0 even:bg-[#fbfdff]"
                                    >
                                        <th
                                            scope="row"
                                            className="w-[46%] bg-[#f6f9fd] px-4 py-4 text-right font-semibold text-[#33415f] sm:w-[42%] sm:px-7 sm:py-5"
                                        >
                                            {row.label}
                                        </th>

                                        <td className="px-4 py-4 text-left font-medium text-[#17233f] sm:px-7 sm:py-5">
                                            {row.value}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
}