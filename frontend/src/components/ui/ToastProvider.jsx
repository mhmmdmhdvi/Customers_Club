import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    ToastContext,
} from "./ToastContext";

import {
    CircleCheckBig,
    CircleX,
    TriangleAlert,
    X,
} from "lucide-react";

const TOAST_DURATION = 4500;

let nextToastId = 1;

const toastConfig = {
    success: {
        icon: CircleCheckBig,
        className:
            "border-emerald-200 bg-emerald-50 text-emerald-900",
        iconClassName: "text-emerald-600",
    },
    error: {
        icon: CircleX,
        className:
            "border-red-200 bg-red-50 text-red-900",
        iconClassName: "text-red-600",
    },
    warning: {
        icon: TriangleAlert,
        className:
            "border-amber-200 bg-amber-50 text-amber-900",
        iconClassName: "text-amber-600",
    },
};

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timers = useRef(new Map());

    const dismiss = useCallback((id) => {
        const timer = timers.current.get(id);

        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }

        setToasts((current) =>
            current.filter(
                (toast) => toast.id !== id,
            ),
        );
    }, []);

    const showToast = useCallback(
        (type, message) => {
            const id = nextToastId;
            nextToastId += 1;

            setToasts((current) => [
                ...current,
                {
                    id,
                    type,
                    message,
                },
            ]);

            const timer = setTimeout(() => {
                timers.current.delete(id);

                setToasts((current) =>
                    current.filter(
                        (toast) =>
                            toast.id !== id,
                    ),
                );
            }, TOAST_DURATION);

            timers.current.set(id, timer);

            return id;
        },
        [],
    );

    useEffect(() => {
        const activeTimers = timers.current;

        return () => {
            for (const timer of activeTimers.values()) {
                clearTimeout(timer);
            }

            activeTimers.clear();
        };
    }, []);

    const value = useMemo(
        () => ({
            success(message) {
                return showToast(
                    "success",
                    message,
                );
            },

            error(message) {
                return showToast(
                    "error",
                    message,
                );
            },

            warning(message) {
                return showToast(
                    "warning",
                    message,
                );
            },

            dismiss,
        }),
        [
            dismiss,
            showToast,
        ],
    );

    return (
        <ToastContext.Provider value={value}>
            {children}

            <div
                dir="rtl"
                className="pointer-events-none fixed top-5 left-5 z-[100] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-3"
                aria-label="اعلان‌ها"
            >
                {toasts.map((toast) => {
                    const config =
                        toastConfig[toast.type];

                    const Icon = config.icon;

                    return (
                        <div
                            key={toast.id}
                            role={
                                toast.type ===
                                    "error"
                                    ? "alert"
                                    : "status"
                            }
                            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-lg ${config.className}`}
                        >
                            <Icon
                                aria-hidden="true"
                                className={`mt-0.5 size-5 shrink-0 ${config.iconClassName}`}
                            />

                            <p className="min-w-0 flex-1 text-sm font-semibold leading-6">
                                {toast.message}
                            </p>

                            <button
                                type="button"
                                aria-label="بستن اعلان"
                                onClick={() =>
                                    dismiss(
                                        toast.id,
                                    )
                                }
                                className="grid size-7 shrink-0 place-items-center rounded-lg opacity-60 transition hover:bg-black/5 hover:opacity-100"
                            >
                                <X
                                    aria-hidden="true"
                                    className="size-4"
                                />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}