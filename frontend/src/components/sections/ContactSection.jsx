const contactItems = [
    {
        title: "تلفن",
        value: "۰۲۱-۱۲۳۴۵۶۷۸",
    },
    {
        title: "ایمیل",
        value: "info@example.com",
    },
    {
        title: "آدرس",
        value: "تهران، ایران",
    },
];

export function ContactSection() {
    return (
        <section
            id="contact"
            aria-label="تماس با ما"
            className="border-t border-border bg-surface py-32 sm:py-44"
        >
            <div className="page-container">

                <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">

                    <div className="lg:col-span-5">
                        <span
                            className="eyebrow reveal"
                            data-reveal
                        >
                            تماس با ما
                        </span>

                        <h2
                            className="reveal mt-6 text-3xl font-black leading-[1.35] text-foreground sm:text-4xl"
                            data-reveal
                            style={{
                                transitionDelay: "60ms",
                            }}
                        >
                            در ارتباط باشید
                        </h2>

                        <p
                            className="reveal mt-6 text-base leading-8 text-muted-foreground"
                            data-reveal
                            style={{
                                transitionDelay: "120ms",
                            }}
                        >
                            برای دریافت اطلاعات بیشتر،
                            همکاری و ارتباط با تیم باشگاه
                            مشتریان با ما در تماس باشید.
                        </p>
                    </div>


                    <div className="lg:col-span-7">

                        <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">

                            {contactItems.map((item, index) => (
                                <article
                                    key={item.title}
                                    data-reveal
                                    style={{
                                        transitionDelay: `${index * 80}ms`,
                                    }}
                                    className="reveal bg-background py-7 sm:px-6"
                                >
                                    <h3 className="text-sm font-extrabold text-foreground">
                                        {item.title}
                                    </h3>

                                    <p className="mt-3 text-base font-semibold text-foreground">
                                        {item.value}
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