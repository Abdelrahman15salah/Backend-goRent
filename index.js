import env from "dotenv";
import express from "express";
import connectDB from "./src/DB/Config.js";
import authRouter from "./src/modules/Auth/auth.route.js";
import cookieParser from "cookie-parser";
import bookingRouter from "./src/modules/Booking/booking.route.js";
import viewingRouter from "./src/modules/Viewing/viewing.route.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
env.config();

const PORT = process.env.PORT || 5000;

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/booking", bookingRouter);
app.use("/viewing", viewingRouter);

app.use(errorHandler);

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
