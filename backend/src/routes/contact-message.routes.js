const express = require("express");

const contactMessageController = require(
    "../controllers/contact-message.controller",
);

const router = express.Router();

router.post(
    "/messages",
    contactMessageController.create,
);

module.exports = router;