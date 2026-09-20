const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { sessionCorsOptions } = require("./config/auth");
const healthRoutes = require("./routes/health.routes");
const app = express();
const authRoutes = require("./routes/auth.routes");
const contactMessageRoutes = require(
    "./routes/contact-message.routes",
);
const adminRoutes = require(
    "./routes/admin.routes",
);
const {
    requestIdMiddleware,
} = require(
    "./middleware/request-id",
);

app.use(requestIdMiddleware);
app.use(helmet());
app.use(cors(sessionCorsOptions));
app.use(express.json());
app.use(helmet());
app.use(cors(sessionCorsOptions));
app.use(express.json());
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/contact", contactMessageRoutes);
app.use("/admin", adminRoutes);

module.exports = app;
