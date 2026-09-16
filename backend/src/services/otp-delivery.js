"use strict";

const { unavailable } = require("../utils/otp-error");

const FARAZSMS_PATTERN_URL =
    "https://api.iranpayamak.com/ws/v1/sms/pattern";

function getSender(env = process.env, fetchImpl = globalThis.fetch) {
    const apiKey = env.FARAZSMS_API_KEY;
    const lineNumber = env.FARAZSMS_LINE_NUMBER;
    const patternCode = env.FARAZSMS_PATTERN_CODE;

    const hasValidConfig =
        typeof apiKey === "string" &&
        apiKey.trim() !== "" &&
        typeof lineNumber === "string" &&
        lineNumber.trim() !== "" &&
        typeof patternCode === "string" &&
        patternCode.trim() !== "" &&
        typeof fetchImpl === "function";

    if (!hasValidConfig) {
        throw unavailable();
    }

    return async function sendOtp({ phone, code, signal }) {
        let response;

        try {

            response = await fetchImpl(FARAZSMS_PATTERN_URL, {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Api-Key": apiKey.trim(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    code: patternCode.trim(),
                    attributes: {
                        code,
                    },
                    recipient: phone,
                    line_number: lineNumber.trim(),
                    number_format: "english",
                }),
                signal,
            });

        } catch {
            throw unavailable();
        }

        if (response.status === 201) {
            return;
        }

        if (response.status === 200) {
            let payload;

            try {
                payload = await response.json();
            } catch {
                throw unavailable();
            }

            if (payload?.status === "success") {
                return;
            }
        }

        throw unavailable();
    };
}

module.exports = { getSender };