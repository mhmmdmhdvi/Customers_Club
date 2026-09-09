const express = require("express");
const authController = require("../controllers/auth.controller");
const router = express.Router();

router.post("/request-code", authController.requestCode);
router.post("/verify-code", authController.verifyCode);
router.post("/register", authController.register);

module.exports = router;
