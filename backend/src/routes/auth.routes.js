const express = require("express");
const authController = require("../controllers/auth.controller");
const router = express.Router();

router.post("/request-code", authController.requestCode);

module.exports = router;
