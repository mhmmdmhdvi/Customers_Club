"use strict";
const { isIP } = require("node:net");
const { unavailable } = require("./otp-error");
function normalizeIp(value) {
  if (typeof value !== "string" || value.length > 64 || value.includes("%")) throw unavailable();
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) throw unavailable();
  // WHATWG URL canonicalization also converts the dotted tail of IPv4-mapped IPv6.
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const halves = canonical.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...left, ...Array(8-left.length-right.length).fill("0"), ...right] : left;
  const words = groups.map((v) => parseInt(v,16));
  if (words.length !== 8) throw unavailable();
  if (words.slice(0,5).every((v) => v === 0) && words[5] === 65535) {
    return [words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join(".");
  }
  return words.map((v) => v.toString(16)).join(":");
}
module.exports = { normalizeIp };
