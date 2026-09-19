const contactMessageService = require(
    "../services/contact-message.service",
);

const {
    createContactMessageController,
} = require(
    "./contact-message.controller.factory",
);

module.exports =
    createContactMessageController({
        contactMessageService,
    });