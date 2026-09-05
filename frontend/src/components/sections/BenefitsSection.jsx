const benefits = [
    {
        number: "01",
        title: "آموزش تخصصی",
        description:
            "یادگیری تکنیک‌های حرفه‌ای نصب و استفاده صحیح از محصولات.",
    },
    {
        number: "02",
        title: "ارتباط حرفه‌ای",
        description:
            "ساخت شبکه‌ای از متخصصان و فعالان صنعت ساختمان.",
    },
    {
        number: "03",
        title: "مزایای ویژه",
        description:
            "دسترسی به پیشنهادها و فرصت‌های اختصاصی.",
    },
    {
        number: "04",
        title: "پشتیبانی فنی",
        description:
            "دریافت راهنمایی تخصصی برای پروژه‌های مختلف.",
    },
];

export function BenefitsSection() {
    return (
        <section
            id="benefits"
            aria-label="مزایای باشگاه"
            className="bg-background py-24 sm:py-32"
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
                        <div
                            className="reveal grid border-t border-border sm:grid-cols-2"
                            data-reveal
                            style={{ transitionDelay: "180ms" }}
                        >
                            {benefits.map((benefit) => (
                                <article
                                    key={benefit.number}
                                    className="border-b border-border py-8 sm:px-6"
                                >
                                    <span className="text-sm font-bold text-primary">
                                        {benefit.number}
                                    </span>

                                    <h3 className="mt-4 text-xl font-bold text-foreground">
                                        {benefit.title}
                                    </h3>

                                    <p className="mt-3 text-sm leading-7 text-muted-foreground">
                                        {benefit.description}
                                    </p>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}