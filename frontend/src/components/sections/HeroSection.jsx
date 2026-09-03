import { ArrowLeft } from "lucide-react";

import detailAdhesive from "../../assets/images/detail-adhesive.jpg";
import heroSlab from "../../assets/images/hero-slab.jpg";

const statistics = [
    {
        value: "۱۲۰۰+",
        label: "عضو حرفه‌ای",
    },
    {
        value: "۴۵",
        label: "رویداد برگزارشده",
    },
    {
        value: "۲۳",
        label: "شهر فعال",
    },
];

const audiences = [
    "پیمانکاران ساختمانی",
    "نصابان اسلب و سرامیک",
    "کاشی‌کاران",
    "مجریان پروژه",
    "فروشندگان مصالح",
];

export function HeroSection() {
    return (
        <section
            id="hero"
            aria-labelledby="hero-heading"
            className="relative overflow-hidden bg-background pt-28 sm:pt-32"
        >
            <div
                className="blueprint-grid pointer-events-none absolute inset-0 opacity-60"
                aria-hidden="true"
            />

            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-background to-transparent"
                aria-hidden="true"
            />

            <div className="page-container relative">
                <div className="grid items-end gap-12 lg:grid-cols-12 lg:gap-10">
                    <div className="lg:col-span-6 lg:pb-16">
                        <span
                            className="eyebrow"
                            data-reveal
                        >
                            جامعه تخصصی صنعت ساختمان
                        </span>

                        <h1
                            id="hero-heading"
                            className="reveal mt-7 text-4xl leading-[1.25] font-black text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.22]"
                            data-reveal
                            style={{ transitionDelay: "60ms" }}
                        >
                            باشگاه مشتریان؛
                            <br />
                            جایی برای{" "}
                            <span className="relative inline-block">
                                حرفه‌ای‌ها

                                <span
                                    className="absolute inset-x-0 -bottom-1 h-[6px] bg-primary/70"
                                    aria-hidden="true"
                                />
                            </span>
                        </h1>

                        <p
                            className="reveal mt-7 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9"
                            data-reveal
                            style={{ transitionDelay: "120ms" }}
                        >
                            باشگاه مشتریان ما، جامعه‌ای تخصصی برای پیمانکاران،
                            نصابان و فعالان حرفه‌ای صنعت ساختمان است؛ جایی برای
                            یادگیری، ارتباط، تجربه فرصت‌های جدید و بهره‌مندی از
                            مزایای ویژه.
                        </p>

                        <div
                            className="reveal mt-10 flex flex-col gap-3 sm:flex-row"
                            data-reveal
                            style={{ transitionDelay: "180ms" }}
                        >
                            <a
                                href="#join"
                                className="group inline-flex items-center justify-center gap-2 bg-ink px-8 py-4 text-sm font-bold text-ink-foreground transition-colors duration-300 hover:bg-foreground"
                            >
                                عضویت در باشگاه

                                <ArrowLeft
                                    className="size-4 transition-transform duration-300 group-hover:-translate-x-1"
                                    aria-hidden="true"
                                />
                            </a>

                            <a
                                href="#events"
                                className="inline-flex items-center justify-center border border-border-strong px-8 py-4 text-sm font-bold text-foreground transition-colors duration-300 hover:border-ink hover:bg-surface"
                            >
                                مشاهده رویدادها
                            </a>
                        </div>

                        <dl
                            className="reveal mt-14 grid max-w-lg grid-cols-3 border-t border-border"
                            data-reveal
                            style={{ transitionDelay: "240ms" }}
                        >                            {statistics.map((statistic) => (
                            <div
                                key={statistic.label}
                                className="border-l border-border py-6 pl-4 last:border-l-0"
                            >
                                <dt className="text-2xl font-black text-foreground sm:text-3xl">
                                    {statistic.value}
                                </dt>

                                <dd className="mt-1 text-xs font-medium text-muted-foreground">
                                    {statistic.label}
                                </dd>
                            </div>
                        ))}
                        </dl>
                    </div>

                    <div className="lg:col-span-6">
                        <div className="relative">
                            <div
                                className="reveal relative aspect-[4/3] overflow-hidden bg-surface"
                                data-reveal
                            >                                <img
                                    src={heroSlab}
                                    alt="نصب اسلب بزرگ‌فرمت توسط نصابان حرفه‌ای در یک پروژه ساختمانی"
                                    width="1600"
                                    height="1200"
                                    className="size-full object-cover"
                                />

                                <div
                                    className="absolute inset-0 ring-1 ring-inset ring-ink/10"
                                    aria-hidden="true"
                                />
                            </div>

                            <div
                                className="reveal absolute -bottom-10 left-4 hidden w-40 overflow-hidden border-4 border-background bg-surface shadow-lift sm:block lg:left-0 lg:w-52"
                                data-reveal
                                style={{ transitionDelay: "200ms" }}
                            >                                <img
                                    src={detailAdhesive}
                                    alt="کشیدن چسب ساختمانی با ماله دندانه‌دار"
                                    width="1200"
                                    height="1504"
                                    loading="lazy"
                                    className="aspect-[4/5] w-full object-cover"
                                />
                            </div>

                            <div
                                className="reveal absolute -top-4 right-4 bg-ink px-5 py-4 text-ink-foreground shadow-lift lg:-right-8"
                                data-reveal
                                style={{ transitionDelay: "260ms" }}
                            >
                                <p className="text-[11px] font-medium tracking-widest text-ink-muted">
                                    عضویت رایگان
                                </p>

                                <p className="mt-1 text-sm font-bold">
                                    ویژه فعالان صنعت ساختمان
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-24 flex flex-wrap items-center gap-x-10 gap-y-4 border-t border-border py-7 text-xs font-semibold tracking-wide text-muted-foreground sm:mt-28">
                    <span className="text-foreground">
                        اعضای باشگاه:
                    </span>

                    {audiences.map((audience, index) => (
                        <span
                            key={audience}
                            className="contents"
                        >
                            <span>{audience}</span>

                            {index < audiences.length - 1 ? (
                                <span
                                    className="hidden sm:inline"
                                    aria-hidden="true"
                                >
                                    ·
                                </span>
                            ) : null}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}