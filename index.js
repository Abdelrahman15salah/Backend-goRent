import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { Server } from "socket.io";
import connectDB from "./src/DB/Config.js";
import authRouter from "./src/modules/Auth/auth.route.js";
import bookingRouter from "./src/modules/Booking/booking.route.js";
import chatRouter from "./src/modules/Chat/chat.route.js";
import { initChatSocket } from "./src/modules/Chat/chat.socket.js";
import propertyRouter from "./src/modules/Property/property.route.js";
import reviewsRouter from "./src/modules/Reviews/reviews.route.js";
import userRouter from "./src/modules/User/user.route.js";
import paymentRoutes from "./src/modules/Payment/payment.route.js";

import viewingRouter from "./src/modules/Viewing/viewing.route.js";
import notificationRouter from "./src/modules/Notification/notification.route.js";
import contactRouter from "./src/modules/Contact/contact.route.js";
import reportRouter from "./src/modules/Report/report.route.js";
import disputeRouter from "./src/modules/Dispute/dispute.route.js";
import adminLogRouter from "./src/modules/Admin/adminLog.route.js";

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
});

initChatSocket(io);

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/public/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Public API test route is working!",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/properties", propertyRouter);
app.use("/api/bookings", bookingRouter);
app.use("/api/viewing", viewingRouter);
app.use("/api/properties", propertyRouter);
app.use("/api/payment", paymentRoutes);
app.use("/api/reviews", reviewsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/contact", contactRouter);
app.use("/api/disputes", disputeRouter);

app.use("/api/report", reportRouter);
app.use("/api/logs", adminLogRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  const statusCode = err.cause || err.http_code || 500;
  res.status(statusCode).json({ message: err.message });
});

const startServer = async () => {
  await connectDB();

  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
