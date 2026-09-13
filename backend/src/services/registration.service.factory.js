const crypto = require("node:crypto");
const { createOtpService } = require("./otp.service.factory");
const { normalizePhone, isValidIranianPhone } = require("../utils/phone");
const { RegistrationError } = require("../utils/registration-error");

const VERIFICATION_TTL_MS = 5 * 60 * 1000;
const INVALID_PROOF = "Invalid or expired verification";
const REGISTER_FIELDS = new Set(["verificationToken", "firstName", "lastName"]);
const USER_FIELDS = {
  id: true, phone: true, firstName: true, lastName: true,
  role: true, createdAt: true, updatedAt: true,
};

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeName(value, label) {
  if (typeof value !== "string" || /\p{Cc}/u.test(value)) {
    throw new RegistrationError(`${label} must be a name without control characters`);
  }
  const name = value.normalize("NFC").trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 80) {
    throw new RegistrationError(`${label} must contain 1 to 80 characters`);
  }
  return name;
}

function parseRegistration(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RegistrationError("Registration details are required");
  }
  if (Object.keys(input).some((key) => !REGISTER_FIELDS.has(key))) {
    throw new RegistrationError("Only verificationToken, firstName and lastName are allowed");
  }
  if (typeof input.verificationToken !== "string" || !/^[a-f0-9]{64}$/.test(input.verificationToken)) {
    throw new RegistrationError(INVALID_PROOF);
  }
  return {
    tokenHash: hashToken(input.verificationToken),
    firstName: normalizeName(input.firstName, "First name"),
    lastName: normalizeName(input.lastName, "Last name"),
  };
}

function createRegistrationService(prisma, { otpOptions } = {}) {
  const otpService = createOtpService(prisma, otpOptions);
  async function verifyPhone(rawPhone, rawCode, clientIp) {
    const phone = normalizePhone(rawPhone);
    if (!isValidIranianPhone(phone)) throw new RegistrationError("Invalid phone number");
    if (typeof rawCode !== "string" || !/^\d{6}$/.test(rawCode.trim())) {
      throw new RegistrationError("Code must contain exactly 6 digits");
    }
    const code = rawCode.trim();
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(verificationToken);

    return otpService.verifyOtp(phone, code, clientIp, async (tx, time) => {
      // Proof insertion stays in the OTP-consumption transaction. Rejected guesses
      // are committed by the OTP service without entering this success callback.
      const member = await tx.user.findUnique({ where: { phone }, select: { id: true } });
      const purpose = member ? "LOGIN" : "REGISTER";
      const expiresAt = new Date(time.getTime() + VERIFICATION_TTL_MS);
      await tx.phoneVerification.create({ data: { phone, tokenHash, purpose, expiresAt } });
      return {
        nextStep: purpose,
        authenticated: false,
        verificationToken,
        verificationExpiresAt: expiresAt.toISOString(),
      };
    });
  }

  async function register(input, transaction = null) {
    const { tokenHash, firstName, lastName } = parseRegistration(input);
    try {
      const createMember = async (tx) => {
        const proof = await tx.phoneVerification.findUnique({ where: { tokenHash } });
        if (!proof || proof.purpose !== "REGISTER" || proof.usedAt !== null || proof.expiresAt <= new Date()) {
          throw new RegistrationError(INVALID_PROOF);
        }

        // The phone comes from the server-side proof, never from the request body.
        const claimed = await tx.phoneVerification.updateMany({
          where: { id: proof.id, usedAt: null, expiresAt: { gt: new Date() }, purpose: "REGISTER" },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new RegistrationError(INVALID_PROOF);
        const existing = await tx.user.findUnique({ where: { phone: proof.phone }, select: { id: true } });
        if (existing) throw new RegistrationError("Phone already registered", 409);

        return tx.user.create({
          data: { phone: proof.phone, firstName, lastName, role: "MEMBER" },
          select: USER_FIELDS,
        });
      };
      // Session orchestration supplies its existing transaction so account,
      // proof consumption and session issuance commit or roll back together.
      return await (transaction ? createMember(transaction) : prisma.$transaction(createMember));
    } catch (error) {
      // Unique User.phone also guards separate proofs racing to register one phone.
      if (error?.code === "P2002") throw new RegistrationError("Phone already registered", 409);
      throw error;
    }
  }

  return { verifyPhone, register };
}

module.exports = { createRegistrationService };
