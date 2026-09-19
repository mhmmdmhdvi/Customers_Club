const express = require("express");

const {
    createContactMessageController,
} = require(
    "../controllers/contact-message.controller.factory",
);

function createContactMessageRoutes({
    contactMessageService,
}) {
    const router = express.Router();

    const controller =
        createContactMessageController({
            contactMessageService,
        });

    router.post(
        "/messages",
        controller.create,
    );

    return router;
}

module.exports = {
    createContactMessageRoutes,
};