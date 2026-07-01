import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import ChatThread from "../../DB/Models/chatThread.model.js";
import Message from "../../DB/Models/message.model.js";
import {
  createChatMessage,
  getThreadForUser,
  markMessagesDelivered,
  markThreadMessagesSeen,
} from "./chat.service.js";
import { getOtherParticipantId, parseTokenFromHandshake } from "./chat.utils.js";
import Notification from "../../DB/Models/notification.model.js";

let ioInstance = null;

export const emitToUser = (userId, event, payload) => {
  if (!ioInstance) {
    return;
  }

  ioInstance.to(`user:${userId.toString()}`).emit(event, payload);
};

const emitMessageDelivered = (messages) => {
  const groupedBySender = new Map();

  for (const message of messages) {
    const senderId = message.senderId.toString();
    const existing = groupedBySender.get(senderId) || [];
    existing.push({
      messageId: message._id.toString(),
      threadId: message.threadId.toString(),
      status: message.status,
      deliveredAt: message.deliveredAt,
    });
    groupedBySender.set(senderId, existing);
  }

  for (const [senderId, payload] of groupedBySender.entries()) {
    emitToUser(senderId, "message:delivered", { messages: payload });
  }
};

const deliverPendingMessagesForUser = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const threads = await ChatThread.find({
    $or: [{ tenantId: userObjectId }, { ownerId: userObjectId }],
  }).select("_id");

  const threadIds = threads.map((thread) => thread._id);

  if (!threadIds.length) {
    return;
  }

  const pendingMessages = await Message.find({
    threadId: { $in: threadIds },
    senderId: { $ne: userObjectId },
    status: "SENT",
  }).select("_id");

  const pendingIds = pendingMessages.map((message) => message._id.toString());

  if (!pendingIds.length) {
    return;
  }

  const delivered = await markMessagesDelivered(pendingIds, userId);

  if (!delivered.length) {
    return;
  }

  emitMessageDelivered(delivered);

  for (const message of delivered) {
    ioInstance.to(`thread:${message.threadId.toString()}`).emit("message:status", {
      threadId: message.threadId.toString(),
      messageId: message._id.toString(),
      status: "DELIVERED",
      deliveredAt: message.deliveredAt,
    });
  }
};

export const emitMessagesSeen = (threadId, seenBy, seenAt) => {
  if (!ioInstance) {
    return;
  }

  const payload = { threadId, seenAt, seenBy };
  ioInstance.to(`thread:${threadId}`).emit("messages:seen", payload);

  ChatThread.findById(threadId).then((thread) => {
    if (!thread) {
      return;
    }

    const senderId = getOtherParticipantId(thread, seenBy);
    emitToUser(senderId, "messages:seen", payload);
  });
};

export const emitNewMessage = async (message, thread) => {
  if (!ioInstance || !message) {
    return;
  }

  const payload = { message, threadId: thread._id.toString() };

  ioInstance
    .to(`thread:${thread._id.toString()}`)
    .emit("message:new", payload);

  const recipientId = getOtherParticipantId(
    thread,
    message.senderId._id || message.senderId,
  );
  emitToUser(recipientId, "message:new", payload);

  const recipientRoom = ioInstance.sockets.adapter.rooms.get(
    `user:${recipientId.toString()}`,
  );

  const notification = await Notification.create({
    userId: recipientId,
    type: "NEW_MESSAGE",
    refId: message._id,
  });

  emitToUser(recipientId, "notification:new", {
    _id: notification._id,
    title: "New Message",
    message: `You have received a new message.`,
    type: "NEW_MESSAGE",
    date: notification.createdAt,
    isRead: false
  });

  if (recipientRoom?.size) {
    const delivered = await markMessagesDelivered(
      [message._id.toString()],
      recipientId.toString(),
    );

    if (delivered.length) {
      emitMessageDelivered(delivered);

      ioInstance
        .to(`thread:${thread._id.toString()}`)
        .emit("message:status", {
          threadId: thread._id.toString(),
          messageId: message._id.toString(),
          status: "DELIVERED",
          deliveredAt: delivered[0].deliveredAt,
        });
    }
  }
};

export const initChatSocket = (io) => {
  ioInstance = io;

  io.use((socket, next) => {
    try {
      const token = parseTokenFromHandshake(socket.handshake);

      if (!token) {
        return next(new Error("يرجى تسجيل الدخول للمتابعة."));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!["tenant", "owner", "admin", "superadmin"].includes(decoded.role)) {
        return next(new Error("عذراً، ليس لديك الصلاحيات الكافية لهذا الإجراء."));
      }

      socket.user = decoded;
      next();
    } catch {
      next(new Error("انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى."));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id.toString();
    socket.join(`user:${userId}`);

    deliverPendingMessagesForUser(userId).catch(() => {});

    socket.emit("chat:connected", { userId });

    socket.on("thread:join", async ({ threadId }, callback) => {
      try {
        await getThreadForUser(threadId, userId);
        socket.join(`thread:${threadId}`);

        const response = { threadId, joined: true };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("thread:joined", response);
        }
      } catch (error) {
        const response = { message: error.message };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("chat:error", response);
        }
      }
    });

    socket.on("thread:leave", ({ threadId }) => {
      socket.leave(`thread:${threadId}`);
    });

    socket.on("message:send", async ({ threadId, text, attachmentUrl }, callback) => {
      try {
        const trimmedText = text?.trim() || "";

        if (!trimmedText && !attachmentUrl) {
          throw new Error("يرجى كتابة رسالة أو إرفاق ملف للتمكن من الإرسال.");
        }

        if (trimmedText.length > 2000) {
          throw new Error("يجب ألا تتجاوز الرسالة 2000 حرف.");
        }

        const message = await createChatMessage({
          threadId,
          senderId: userId,
          text: trimmedText,
          attachmentUrl: attachmentUrl || null,
        });

        const thread = await ChatThread.findById(threadId);
        await emitNewMessage(message, thread);

        const response = { message };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("message:sent", response);
        }
      } catch (error) {
        const response = { message: error.message };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("chat:error", response);
        }
      }
    });

    socket.on("thread:seen", async ({ threadId }, callback) => {
      try {
        const { seenAt, modifiedCount } = await markThreadMessagesSeen(
          threadId,
          userId,
        );

        if (modifiedCount > 0) {
          emitMessagesSeen(threadId, userId, seenAt);
        }

        const response = { threadId, seenAt, modifiedCount };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("thread:seen", response);
        }
      } catch (error) {
        const response = { message: error.message };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("chat:error", response);
        }
      }
    });

    socket.on("typing:start", ({ threadId }) => {
      socket.to(`thread:${threadId}`).emit("typing:start", {
        threadId,
        userId,
      });
    });

    socket.on("typing:stop", ({ threadId }) => {
      socket.to(`thread:${threadId}`).emit("typing:stop", {
        threadId,
        userId,
      });
    });
  });
};
