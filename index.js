import env from "dotenv";
import express from "express";
import connectDB from "./src/DB/Config.js";
import authRouter from "./src/modules/Auth/auth.route.js";
import cookieParser from "cookie-parser";
import propertyRouter from "./src/modules/property/property.router.js";
env.config();

const PORT = process.env.PORT || 5000;

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/property",propertyRouter)

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
