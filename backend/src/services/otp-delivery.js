"use strict";
const { unavailable } = require("../utils/otp-error");
// Real SMS integration is a separate release task. Do not pretend a logged code
// was delivered. Tests inject a sender in their own process; runtime fails closed.
function getSender() { throw unavailable(); }
module.exports = { getSender };
