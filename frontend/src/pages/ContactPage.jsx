import {
    Clock3,
    Mail,
    MapPin,
    MessageSquareText,
    Phone,
    Send,
    UserRound,
} from "lucide-react";

import dashboardBanner from "../assets/images/dashboard-tehran-banner.jpg";
import { SiteHeader } from "../components/layout/SiteHeader";

const contactItems = [
    {
        icon: Phone,
        title: "تماس تلفنی",
        value: "شماره تماس شرکت",
        detail: "شنبه تا پنجشنبه، ۸ تا ۱۸",
    },
    {
        icon: Mail,
        title: "ایمیل",
        value: "ایمیل پشتیبانی",
        detail: "پاسخ‌گویی در سریع‌ترین زمان",
    },
    {
        icon: MapPin,
        title: "آدرس دفتر مرکزی",
        value: "آدرس دفتر مرکزی مگاتایت",
        detail: "اطلاعات دقیق آدرس اینجا نمایش داده می‌شود",
    },
    {
        icon: Clock3,
        title: "ساعات کاری",
        value: "شنبه تا پنجشنبه",
        detail: "ساعت ۸:۰۰ تا ۱۸:۰۰",
    },
];

export function ContactPage() {
    return (
        <div
            dir="rtl"
            className="min-h-screen bg-[#f5f9ff] text-foreground"
        >
            <SiteHeader solid />

            <main className="page-container pt-28 pb-16 sm:pt-32">
                <section
                    aria-label="معرفی صفحه تماس"
                    className="relative min-h-64 overflow-hidden rounded-3xl border border-[#dbe7f5] bg-white shadow-refined sm:min-h-72"
                >
                    <img
                        src={dashboardBanner}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-center"
                    />

                    <div
                        aria-hidden="true"
                        className="absolute inset-y-0 right-0 w-[62%] bg-gradient-to-l from-white/95 via-white/80 to-transparent"
                    />

                    <div className="relative z-10 flex min-h-64 items-center px-7 py-10 sm:min-h-72 sm:px-12">
                        <div className="max-w-lg">
                            <p className="text-sm font-bold text-[#3b86df]">
                                همیشه در کنار شما
                            </p>

                            <h1 className="mt-3 text-3xl font-black text-[#17233f] sm:text-5xl">
                                تماس با ما
                            </h1>

                            <p className="mt-5 max-w-md text-sm leading-8 text-[#60708c] sm:text-base">
                                ما اینجا هستیم تا به سوالات شما پاسخ دهیم،
                                شنونده پیشنهادات شما باشیم و همراه شما بمانیم.
                            </p>
                        </div>
                    </div>
                </section>

                <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                    <section className="rounded-3xl border border-[#dfe8f4] bg-white p-5 shadow-[0_18px_50px_-28px_rgba(48,92,145,0.25)] sm:p-7">
                        <div>
                            <h2 className="text-xl font-extrabold text-[#17233f]">
                                راه‌های ارتباطی با ما
                            </h2>

                            <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                از طریق راه‌های زیر می‌توانید با ما در ارتباط باشید.
                            </p>
                        </div>

                        <div className="mt-6 space-y-3">
                            {contactItems.map((item) => {
                                const Icon = item.icon;

                                return (
                                    <article
                                        key={item.title}
                                        className="flex items-start gap-4 rounded-2xl border border-[#e1e9f3] bg-[#fbfdff] p-4"
                                    >
                                        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                                            <Icon
                                                className="size-5"
                                                aria-hidden="true"
                                            />
                                        </div>

                                        <div className="min-w-0">
                                            <h3 className="text-sm font-extrabold text-[#24324b]">
                                                {item.title}
                                            </h3>

                                            <p className="mt-2 text-sm font-semibold text-[#17233f]">
                                                {item.value}
                                            </p>

                                            <p className="mt-1 text-xs leading-6 text-muted-foreground">
                                                {item.detail}
                                            </p>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-[#dfe8f4] bg-white p-5 shadow-[0_18px_50px_-28px_rgba(48,92,145,0.25)] sm:p-7">
                        <div className="flex items-start gap-4">
                            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                                <MessageSquareText
                                    className="size-5"
                                    aria-hidden="true"
                                />
                            </div>

                            <div>
                                <h2 className="text-xl font-extrabold text-[#17233f]">
                                    ارسال پیام به ما
                                </h2>

                                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                    سوال، پیشنهاد یا موضوعی دارید؟ اطلاعات خود را وارد کنید.
                                </p>
                            </div>
                        </div>

                        <form className="mt-7 space-y-5">
                            <div>
                                <label
                                    htmlFor="contact-name"
                                    className="mb-2 block text-sm font-bold text-[#33415f]"
                                >
                                    نام و نام خانوادگی{" "}
                                    <span
                                        aria-hidden="true"
                                        className="text-red-500"
                                    >
                                        *
                                    </span>
                                </label>

                                <div className="relative">
                                    <UserRound
                                        aria-hidden="true"
                                        className="absolute top-1/2 right-4 size-5 -translate-y-1/2 text-[#93a4ba]"
                                    />

                                    <input
                                        id="contact-name"
                                        type="text"
                                        required
                                        className="w-full rounded-xl border border-[#d9e3ef] bg-[#fbfdff] py-3.5 pr-12 pl-4 text-sm text-[#17233f] outline-none transition focus:border-[#3b86df] focus:ring-2 focus:ring-[#3b86df]/15"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="contact-phone"
                                    className="mb-2 block text-sm font-bold text-[#33415f]"
                                >
                                    شماره موبایل{" "}
                                    <span
                                        aria-hidden="true"
                                        className="text-red-500"
                                    >
                                        *
                                    </span>
                                </label>

                                <div className="relative">
                                    <Phone
                                        aria-hidden="true"
                                        className="absolute top-1/2 right-4 size-5 -translate-y-1/2 text-[#93a4ba]"
                                    />

                                    <input
                                        id="contact-phone"
                                        type="tel"
                                        inputMode="tel"
                                        dir="ltr"
                                        required
                                        className="w-full rounded-xl border border-[#d9e3ef] bg-[#fbfdff] py-3.5 pr-12 pl-4 text-left text-sm text-[#17233f] outline-none transition focus:border-[#3b86df] focus:ring-2 focus:ring-[#3b86df]/15"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="contact-email"
                                    className="mb-2 block text-sm font-bold text-[#33415f]"
                                >
                                    ایمیل
                                </label>

                                <div className="relative">
                                    <Mail
                                        aria-hidden="true"
                                        className="absolute top-1/2 right-4 size-5 -translate-y-1/2 text-[#93a4ba]"
                                    />

                                    <input
                                        id="contact-email"
                                        type="email"
                                        dir="ltr"
                                        className="w-full rounded-xl border border-[#d9e3ef] bg-[#fbfdff] py-3.5 pr-12 pl-4 text-left text-sm text-[#17233f] outline-none transition focus:border-[#3b86df] focus:ring-2 focus:ring-[#3b86df]/15"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="contact-subject"
                                    className="mb-2 block text-sm font-bold text-[#33415f]"
                                >
                                    موضوع{" "}
                                    <span
                                        aria-hidden="true"
                                        className="text-red-500"
                                    >
                                        *
                                    </span>
                                </label>

                                <select
                                    id="contact-subject"
                                    required
                                    defaultValue=""
                                    className="w-full rounded-xl border border-[#d9e3ef] bg-[#fbfdff] px-4 py-3.5 text-sm text-[#17233f] outline-none transition focus:border-[#3b86df] focus:ring-2 focus:ring-[#3b86df]/15"
                                >
                                    <option value="" disabled>
                                        لطفاً موضوع را انتخاب کنید
                                    </option>
                                    <option value="support">
                                        پشتیبانی
                                    </option>
                                    <option value="suggestion">
                                        پیشنهاد
                                    </option>
                                    <option value="complaint">
                                        انتقاد
                                    </option>
                                    <option value="other">
                                        سایر
                                    </option>
                                </select>
                            </div>

                            <div>
                                <label
                                    htmlFor="contact-message"
                                    className="mb-2 block text-sm font-bold text-[#33415f]"
                                >
                                    پیام شما{" "}
                                    <span
                                        aria-hidden="true"
                                        className="text-red-500"
                                    >
                                        *
                                    </span>
                                </label>

                                <textarea
                                    id="contact-message"
                                    rows={6}
                                    required
                                    maxLength={250}
                                    className="w-full resize-none rounded-xl border border-[#d9e3ef] bg-[#fbfdff] px-4 py-3.5 text-sm leading-7 text-[#17233f] outline-none transition focus:border-[#3b86df] focus:ring-2 focus:ring-[#3b86df]/15"
                                />
                            </div>

                            <button
                                type="button"
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2f7ee6] px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(47,126,230,0.75)] transition hover:bg-[#236fda]"
                            >
                                <Send
                                    className="size-4.5"
                                    aria-hidden="true"
                                />
                                ارسال پیام
                            </button>
                        </form>
                    </section>
                </div>
            </main>
        </div>
    );
}