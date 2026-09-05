import {
    Award,
    CalendarDays,
    GraduationCap,
    HardHat,
    Sparkles,
    Users,
} from "lucide-react";

const benefits = [
    {
        icon: CalendarDays,
        title: "رویدادهای تخصصی",
        description:
            "شرکت در رویدادها، ورکشاپ‌ها و برنامه‌های تخصصی صنعت ساختمان.",
    },
    {
        icon: GraduationCap,
        title: "آموزش و یادگیری",
        description:
            "دسترسی به آموزش‌ها و تجربه‌های تخصصی برای ارتقای مهارت‌های حرفه‌ای.",
    },
    {
        icon: Users,
        title: "ارتباط با متخصصان",
        description:
            "فرصتی برای شبکه‌سازی و ارتباط با دیگر فعالان حرفه‌ای صنعت.",
    },
    {
        icon: Award,
        title: "مزایای ویژه",
        description:
            "دسترسی به فرصت‌ها، خدمات و مزایای اختصاصی اعضای باشگاه.",
    },
    {
        icon: Sparkles,
        title: "اطلاع از محصولات جدید",
        description:
            "اولین نفر باشید که با محصولات و تکنولوژی‌های جدید آشنا می‌شوید.",
    },
    {
        icon: HardHat,
        title: "جامعه حرفه‌ای",
        description:
            "عضویت در جامعه‌ای از متخصصان، پیمانکاران و نصابان حرفه‌ای.",
    },
];

export function BenefitsSection() {
    return (
        <section
            id="benefits"
            aria-label="مزایای باشگاه"
            className="border-t border-border bg-surface py-24 sm:py-32"    
        >
            <div className="page-container">
                <div className="grid gap-12 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <span
                            className="eyebrow reveal"
                            data-reveal
                        >
                            مزایای باشگاه
                        </span>

                        <h2
                            className="reveal mt-6 text-3xl font-black text-foreground sm:text-4xl"
                            data-reveal
                            style={{ transitionDelay: "60ms" }}
                        >
                            امکاناتی برای رشد حرفه‌ای اعضای باشگاه
                        </h2>

                        <p
                            className="reveal mt-6 leading-8 text-muted-foreground"
                            data-reveal
                            style={{ transitionDelay: "120ms" }}
                        >
                            باشگاه مشتریان بستری برای ارتباط،
                            یادگیری و تجربه‌های ارزشمند میان
                            فعالان صنعت ساختمان است.
                        </p>
                    </div>

                    <div className="lg:col-span-7">
                        <div className="grid border-t border-border sm:grid-cols-2">
                            {benefits.map((benefit, index) => {
                                const Icon = benefit.icon;

                                return (
                                    <article
                                        key={benefit.title}
                                        data-reveal
                                        style={{
                                            transitionDelay: `${index * 60}ms`,
                                        }}
                                        className="reveal group relative border-b border-border p-7 transition-colors duration-300 hover:bg-background sm:p-8 sm:[&:nth-child(odd)]:border-l sm:[&:nth-child(odd)]:border-border"
                                    >
                                        <span
                                            className="absolute right-0 top-0 h-px w-0 bg-primary transition-all duration-500 group-hover:w-full"
                                            aria-hidden="true"
                                        />

                                        <div className="flex items-start gap-4">
                                            <Icon
                                                className="mt-0.5 size-6 shrink-0 text-primary"
                                                strokeWidth={1.5}
                                            />

                                            <div>
                                                <h3 className="text-base font-extrabold text-foreground">
                                                    {benefit.title}
                                                </h3>

                                                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                                                    {benefit.description}
                                                </p>
                                            </div>
                                        </div>

                                        <span className="absolute bottom-6 left-7 text-xs font-bold tabular-nums text-border-strong">
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}