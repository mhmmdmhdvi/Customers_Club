const config = require("./config/env");
const prisma = require("./config/database");
const app = require("./app");

async function startServer() {
  try {
    await prisma.$connect();

    console.log("Database connected");

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

startServer();
