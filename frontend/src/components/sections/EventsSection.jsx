import { ArrowLeft, MapPin } from "lucide-react";

import eventWorkshop from "../../assets/images/event-workshop.jpg";
import eventConference from "../../assets/images/event-conference.jpg";
import eventTraining from "../../assets/images/event-training.jpg";

const events = [
    {
        image: eventWorkshop,
        alt: "ورکشاپ تخصصی نصب اسلب",
        type: "ورکشاپ",
        title: "ورکشاپ تخصصی نصب اسلب",
        date: "۲۴ مهر ۱۴۰۴",
        city: "تهران",
    },
    {
        image: eventConference,
        alt: "همایش فعالان صنعت ساختمان",
        type: "همایش",
        title: "همایش فعالان صنعت ساختمان",
        date: "۱۲ آبان ۱۴۰۴",
        city: "اصفهان",
    },
    {
        image: eventTraining,
        alt: "دوره آموزشی تکنیک‌های نوین اجرا",
        type: "دوره آموزشی",
        title: "دوره آموزشی تکنیک‌های نوین اجرا",
        date: "۳ آذر ۱۴۰۴",
        city: "مشهد",
    },
];

export function EventsSection() {
    return (
        <section
            id="events"
            aria-label="رویدادهای باشگاه"
            className="border-t border-border bg-background py-24 sm:py-32"
        >
            <div className="page-container">

                {/* Section header */}
                <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
                    <div>
                        <span
                            className="eyebrow reveal"
                            data-reveal
                        >
                            تقویم باشگاه
                        </span>

                        <h2
                            className="reveal mt-6 text-3xl font-black text-foreground sm:text-4xl"
                            data-reveal
                            style={{ transitionDelay: "60ms" }}
                        >
                            رویدادهای باشگاه
                        </h2>
                    </div>

                    <a
                        href="#join"
                        className="reveal group hidden items-center gap-2 text-sm font-bold text-foreground sm:inline-flex"
                        data-reveal
                        style={{ transitionDelay: "120ms" }}
                    >
                        مشاهده همه رویدادها

                        <ArrowLeft
                            className="size-4 text-primary transition-transform duration-300 group-hover:-translate-x-1"
                            aria-hidden="true"
                        />
                    </a>
                </div>

                <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
                    {events.map((event, index) => (
                        <article
                            key={event.title}
                            data-reveal
                            style={{
                                transitionDelay: `${index * 80}ms`,
                            }}
                            className="reveal group flex flex-col bg-background transition-colors duration-300 hover:bg-surface"
                        >
                            <div className="relative aspect-[4/3] overflow-hidden">
                                <img
                                    src={event.image}
                                    alt={event.alt}
                                    width="1200"
                                    height="900"
                                    loading="lazy"
                                    className="size-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                                />

                                <span className="absolute right-0 top-0 bg-ink px-4 py-2 text-[11px] font-bold text-ink-foreground">
                                    {event.type}
                                </span>
                            </div>

                            <div className="flex flex-1 flex-col p-7">
                                <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
                                    <span className="tabular-nums">
                                        {event.date}
                                    </span>

                                    <span className="inline-flex items-center gap-1.5">
                                        <MapPin
                                            className="size-3.5 text-primary"
                                            aria-hidden="true"
                                        />

                                        {event.city}
                                    </span>
                                </div>

                                <h3 className="mt-4 text-lg font-extrabold leading-8 text-foreground">
                                    {event.title}
                                </h3>

                                <a
                                    href="#join"
                                    className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-bold text-foreground"
                                >
                                    مشاهده جزئیات

                                    <ArrowLeft
                                        className="size-4 text-primary transition-transform duration-300 group-hover:-translate-x-1"
                                        aria-hidden="true"
                                    />
                                </a>
                            </div>
                        </article>
                    ))}
                </div>
                
                <div className="mt-10 sm:hidden">
                    <a
                        href="#join"
                        className="inline-flex w-full items-center justify-center border border-border-strong px-6 py-4 text-sm font-bold text-foreground"
                    >
                        مشاهده همه رویدادها
                    </a>
                </div>
            </div>
        </section>
    );
}