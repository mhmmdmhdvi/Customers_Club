import { useEffect } from "react";

export function useReveal() {
    useEffect(() => {
        const elements = Array.from(
            document.querySelectorAll("[data-reveal]"),
        );

        if (typeof IntersectionObserver === "undefined") {
            elements.forEach((element) => {
                element.setAttribute("data-visible", "true");
            });

            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.setAttribute(
                            "data-visible",
                            "true",
                        );

                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.12,
                rootMargin: "0px 0px -8% 0px",
            },
        );

        elements.forEach((element) => {
            observer.observe(element);
        });

        return () => {
            observer.disconnect();
        };
    }, []);
}