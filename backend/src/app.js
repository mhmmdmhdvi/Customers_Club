const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { sessionCorsOptions } = require("./config/auth");
const healthRoutes=require("./routes/health.routes");
const app=express();
const authRoutes=require("./routes/auth.routes");

app.use(helmet());
app.use(cors(sessionCorsOptions));
app.use(express.json());
app.use("/health", healthRoutes);
app.use("/auth", authRoutes);

module.exports=app;
