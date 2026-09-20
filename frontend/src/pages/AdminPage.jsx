import {
    Activity,
    LayoutDashboard,
    MessageSquareText,
    ShieldCheck,
    UserPlus,
    UsersRound,
} from "lucide-react";
import {
    useEffect,
    useState,
} from "react";
import { AdminActivitySection } from "./admin/AdminActivitySection";
import { AdminMessagesSection } from "./admin/AdminMessagesSection";
import { useAuth } from "../auth/AuthContext";
import { AdminUsersSection } from "./admin/AdminUsersSection";
import { AdminSecuritySection } from "./admin/AdminSecuritySection";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ??
    "http://localhost:3000";

const adminNavigation = [
    {
        label: "نمای کلی",
        href: "/admin",
        icon: LayoutDashboard,
    },
    {
        label: "کاربران",
        href: "/admin/users",
        icon: UsersRound,
    },
    {
        label: "پیام‌ها",
        href: "/admin/messages",
        icon: MessageSquareText,
    },
    {
        label: "فعالیت‌ها",
        href: "/admin/activity",
        icon: Activity,
    },
    {
        label: "امنیت و مانیتورینگ",
        href: "/admin/security",
        icon: ShieldCheck,
    },
];

function formatNumber(value) {
    return new Intl.NumberFormat(
        "fa-IR",
    ).format(value);
}

export function AdminPage({
    pathname = "/admin",
    onRequireLogin = () => { },
    onRequireMemberArea = () => { },
}) {
    const {
        session,
        authStatus,
    } = useAuth();

    const [overview, setOverview] =
        useState(null);

    const [
        overviewStatus,
        setOverviewStatus,
    ] = useState("loading");

    useEffect(() => {
        if (
            authStatus ===
            "unauthenticated" ||
            authStatus === "error"
        ) {
            onRequireLogin();
            return;
        }

        if (
            authStatus ===
            "authenticated" &&
            session?.user?.role !== "ADMIN"
        ) {
            onRequireMemberArea();
        }
    }, [
        authStatus,
        session,
        onRequireLogin,
        onRequireMemberArea,
    ]);

    useEffect(() => {
        const isOverviewPage =
            pathname === "/admin" ||
            pathname === "/admin/";

        if (
            !isOverviewPage ||
            authStatus !==
            "authenticated" ||
            session?.user?.role !== "ADMIN"
        ) {
            return;
        }

        let isCurrent = true;

        fetch(
            `${API_BASE_URL}/admin/overview`,
            {
                headers: {
                    Authorization:
                        `Bearer ${session.accessToken}`,
                },
            },
        )
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(
                        "Overview request failed",
                    );
                }

                return response.json();
            })
            .then((result) => {
                if (!isCurrent) {
                    return;
                }

                setOverview(result);
                setOverviewStatus(
                    "success",
                );
            })
            .catch(() => {
                if (!isCurrent) {
                    return;
                }

                setOverview(null);
                setOverviewStatus(
                    "error",
                );
            });

        return () => {
            isCurrent = false;
        };
    }, [
        pathname,
        authStatus,
        session,
    ]);

    if (authStatus === "restoring") {
        return (
            <main
                dir="rtl"
                className="min-h-screen bg-[#f5f7fb] p-6"
            >
                <p
                    role="status"
                    className="text-sm text-slate-500"
                >
                    در حال بررسی دسترسی مدیریت...
                </p>
            </main>
        );
    }

    if (
        authStatus !== "authenticated" ||
        !session ||
        session.user.role !== "ADMIN"
    ) {
        return null;
    }

    const isOverviewPage =
        pathname === "/admin" ||
        pathname === "/admin/";

    const isUsersPage =
        pathname === "/admin/users" ||
        pathname === "/admin/users/";

    const isMessagesPage =
        pathname === "/admin/messages" ||
        pathname === "/admin/messages/";

    const isActivityPage =
        pathname === "/admin/activity" ||
        pathname === "/admin/activity/";

    const isSecurityPage =
        pathname === "/admin/security" ||
        pathname === "/admin/security/";

    const metrics =
        overviewStatus === "success" &&
            overview
            ? [
                {
                    label: "کل اعضا",
                    value:
                        overview.members
                            .total,
                    description:
                        "اعضای فعال باشگاه",
                    icon: UsersRound,
                },
                {
                    label:
                        "اعضای جدید در ۷ روز",
                    value:
                        overview.members
                            .newLast7Days,
                    description:
                        "ثبت‌نام‌های هفته اخیر",
                    icon: UserPlus,
                },
                {
                    label:
                        "پیام‌های دریافتی",
                    value:
                        overview.messages
                            .total,
                    description: `${formatNumber(
                        overview.messages
                            .new,
                    )} پیام جدید`,
                    icon: MessageSquareText,
                },
                {
                    label:
                        "نشست‌های فعال",
                    value:
                        overview.sessions
                            .active,
                    description:
                        "نشست‌های ورود معتبر",
                    icon: ShieldCheck,
                },
            ]
            : [];

    return (
        <div
            dir="rtl"
            className="min-h-screen bg-[#f5f7fb] text-slate-900"
        >
            <aside className="fixed inset-y-0 right-0 hidden w-64 border-l border-slate-200 bg-white lg:block">
                <div className="border-b border-slate-200 px-6 py-6">
                    <p className="text-xs font-bold text-blue-600">
                        مگاتایت
                    </p>

                    <h2 className="mt-1 text-lg font-black text-slate-900">
                        پنل مدیریت
                    </h2>
                </div>

                <nav
                    aria-label="ناوبری مدیریت"
                    className="space-y-1 p-4"
                >
                    {adminNavigation.map(
                        (item) => {
                            const Icon =
                                item.icon;

                            const isActive =
                                pathname ===
                                item.href ||
                                pathname ===
                                `${item.href}/`;

                            return (
                                <a
                                    key={
                                        item.href
                                    }
                                    href={
                                        item.href
                                    }
                                    aria-current={
                                        isActive
                                            ? "page"
                                            : undefined
                                    }
                                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${isActive
                                        ? "bg-blue-50 text-blue-700"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                        }`}
                                >
                                    <Icon
                                        className="size-5"
                                        aria-hidden="true"
                                    />

                                    {
                                        item.label
                                    }
                                </a>
                            );
                        },
                    )}
                </nav>
            </aside>

            <div className="lg:mr-64">
                <header className="border-b border-slate-200 bg-white">
                    <div className="flex min-h-20 items-center justify-between px-5 sm:px-8">
                        <div>
                            <p className="text-xs font-bold text-slate-400">
                                پنل مدیریت باشگاه مشتریان
                            </p>

                            <h1 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">
                                مرکز مدیریت
                            </h1>
                        </div>

                        <div className="text-left">
                            <p className="text-sm font-bold text-slate-800">
                                {
                                    session.user
                                        .firstName
                                }{" "}
                                {
                                    session.user
                                        .lastName
                                }
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                                مدیر سیستم
                            </p>
                        </div>
                    </div>
                </header>

                <nav
                    aria-label="ناوبری مدیریت موبایل"
                    className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden"
                >
                    <div className="flex gap-2 overflow-x-auto">
                        {adminNavigation.map((item) => {
                            const Icon = item.icon;

                            const isActive =
                                pathname === item.href ||
                                pathname ===
                                `${item.href}/`;

                            return (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    aria-current={
                                        isActive
                                            ? "page"
                                            : undefined
                                    }
                                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${isActive
                                        ? "bg-blue-50 text-blue-700"
                                        : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                        }`}
                                >
                                    <Icon
                                        className="size-4"
                                        aria-hidden="true"
                                    />

                                    <span>
                                        {item.label}
                                    </span>
                                </a>
                            );
                        })}
                    </div>
                </nav>

                <main className="px-5 py-6 sm:px-8 sm:py-8">
                    {isOverviewPage ? (
                        <section
                            aria-labelledby="admin-overview-heading"
                            className="mx-auto max-w-7xl"
                        >
                            <div className="mb-6">
                                <h2
                                    id="admin-overview-heading"
                                    className="text-xl font-black text-slate-900"
                                >
                                    نمای کلی
                                </h2>

                                <p className="mt-2 text-sm leading-7 text-slate-500">
                                    وضعیت کلی باشگاه مشتریان در یک نگاه
                                </p>
                            </div>

                            {overviewStatus ===
                                "loading" ? (
                                <div
                                    role="status"
                                    aria-label="در حال دریافت اطلاعات"
                                    className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                                >
                                    {[
                                        1,
                                        2,
                                        3,
                                        4,
                                    ].map(
                                        (
                                            item,
                                        ) => (
                                            <div
                                                key={
                                                    item
                                                }
                                                className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
                                            >
                                                <div className="h-4 w-24 rounded bg-slate-100" />
                                                <div className="mt-5 h-8 w-16 rounded bg-slate-100" />
                                                <div className="mt-4 h-3 w-32 rounded bg-slate-100" />
                                            </div>
                                        ),
                                    )}
                                </div>
                            ) : null}

                            {overviewStatus ===
                                "error" ? (
                                <div
                                    role="alert"
                                    className="rounded-2xl border border-red-200 bg-white p-5"
                                >
                                    <p className="font-bold text-red-700">
                                        دریافت اطلاعات نمای کلی ناموفق بود.
                                    </p>

                                    <p className="mt-2 text-sm text-slate-500">
                                        لطفاً اتصال سرور را بررسی کرده و صفحه را دوباره باز کنید.
                                    </p>
                                </div>
                            ) : null}

                            {overviewStatus ===
                                "success" ? (
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    {metrics.map(
                                        (
                                            metric,
                                        ) => {
                                            const Icon =
                                                metric.icon;

                                            return (
                                                <article
                                                    key={
                                                        metric.label
                                                    }
                                                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_-24px_rgba(15,23,42,0.35)]"
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-500">
                                                                {
                                                                    metric.label
                                                                }
                                                            </p>

                                                            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
                                                                {formatNumber(
                                                                    metric.value,
                                                                )}
                                                            </p>
                                                        </div>

                                                        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                                                            <Icon
                                                                className="size-5"
                                                                aria-hidden="true"
                                                            />
                                                        </div>
                                                    </div>

                                                    <p className="mt-4 border-t border-slate-100 pt-4 text-xs font-medium text-slate-400">
                                                        {
                                                            metric.description
                                                        }
                                                    </p>
                                                </article>
                                            );
                                        },
                                    )}
                                </div>
                            ) : null}
                        </section>
                    ) : null}

                    {isUsersPage ? (
                        <AdminUsersSection
                            accessToken={
                                session.accessToken
                            }
                        />
                    ) : null}

                    {isMessagesPage ? (
                        <AdminMessagesSection
                            accessToken={
                                session.accessToken
                            }
                        />
                    ) : null}

                    {isActivityPage ? (
                        <AdminActivitySection
                            accessToken={
                                session.accessToken
                            }
                        />
                    ) : null}

                    {isSecurityPage ? (
                        <AdminSecuritySection
                            accessToken={
                                session.accessToken
                            }
                        />
                    ) : null}
                </main>
            </div>
        </div>
    );
}