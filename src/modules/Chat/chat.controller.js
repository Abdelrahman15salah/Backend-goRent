import mongoose from "mongoose";
import ChatThread from "../../DB/Models/chatThread.model.js";
import Message from "../../DB/Models/message.model.js";
import Property from "../../DB/Models/property.model.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import {
  createChatMessage,
  getThreadForUser,
  markThreadMessagesSeen,
} from "./chat.service.js";
import { emitMessagesSeen, emitNewMessage } from "./chat.socket.js";

export const createOrGetThread = async (req, res, next) => {
  try {
    const { propertyId } = req.body;
    const tenantId = req.user.id;

    if (req.user.role !== "tenant") {
      return next(
        new Error("يمكن للمستأجرين فقط بدء محادثة حول العقار.", {
          cause: 403,
        }),
      );
    }

    const property = await Property.findById(propertyId).select(
      "ownerId title status",
    );

    if (!property) {
      return next(new Error("لم نتمكن من العثور على هذا العقار.", { cause: 404 }));
    }

    if (property.status !== "APPROVED") {
      return next(
        new Error("لا يمكن بدء محادثة لعقار غير مقبول بعد.", {
          cause: 400,
        }),
      );
    }

    if (property.ownerId.toString() === tenantId.toString()) {
      return next(
        new Error("لا يمكنك بدء محادثة مع نفسك.", { cause: 400 }),
      );
    }

    let thread = await ChatThread.findOne({
      tenantId,
      ownerId: property.ownerId,
      propertyId,
    })
      .populate("tenantId", "name email profileImage")
      .populate("ownerId", "name email profileImage")
      .populate("propertyId", "title images");

    if (!thread) {
      thread = await ChatThread.create({
        tenantId,
        ownerId: property.ownerId,
        propertyId,
      });

      thread = await ChatThread.findById(thread._id)
        .populate("tenantId", "name email profileImage")
        .populate("ownerId", "name email profileImage")
        .populate("propertyId", "title images");
    }

    return res.status(200).json({
      message: "Chat thread ready",
      thread,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyThreads = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // console.log(userId);

    const threads = await ChatThread.find({
      $or: [{ tenantId: userId }, { ownerId: userId }],
    })
      .populate("tenantId", "name email profileImage")
      .populate("ownerId", "name email profileImage")
      .populate("propertyId", "title images")
      .sort({ lastMessageAt: -1 });

    const threadIds = threads.map((thread) => thread._id);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const unreadCounts = await Message.aggregate([
      {
        $match: {
          threadId: { $in: threadIds },
          senderId: { $ne: userObjectId },
          status: { $ne: "SEEN" },
        },
      },
      { $group: { _id: "$threadId", count: { $sum: 1 } } },
    ]);

    const unreadMap = Object.fromEntries(
      unreadCounts.map(({ _id, count }) => [_id.toString(), count]),
    );

    const threadsWithUnread = threads.map((thread) => ({
      ...thread.toObject(),
      unreadCount: unreadMap[thread._id.toString()] || 0,
    }));

    return res.status(200).json({ threads: threadsWithUnread });
  } catch (error) {
    next(error);
  }
};

export const getThreadMessages = async (req, res, next) => {
  try {
    const { threadId } = req.params;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = (page - 1) * limit;

    await getThreadForUser(threadId, req.user.id);

    const [messages, total] = await Promise.all([
      Message.find({ threadId })
        .populate("senderId", "name email profileImage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ threadId }),
    ]);

    return res.status(200).json({
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { threadId } = req.params;
    const { text } = req.body;
    const senderId = req.user.id;

    let attachmentUrl = null;

    if (req.file) {
      attachmentUrl = await uploadToCloudinary(req.file, "chat-attachments");
    }

    const message = await createChatMessage({
      threadId,
      senderId,
      text,
      attachmentUrl,
    });

    const thread = await ChatThread.findById(threadId);
    await emitNewMessage(message, thread);

    return res.status(201).json({
      message: "Message sent successfully",
      data: message,
    });
  } catch (error) {
    next(error);
  }
};

export const markThreadAsRead = async (req, res, next) => {
  try {
    const { threadId } = req.params;
    const userId = req.user.id;

    const { modifiedCount, seenAt } = await markThreadMessagesSeen(
      threadId,
      userId,
    );

    if (modifiedCount > 0) {
      emitMessagesSeen(threadId, userId, seenAt);
    }

    return res.status(200).json({
      message: "Messages marked as seen",
      modifiedCount,
      seenAt,
    });
  } catch (error) {
    next(error);
  }
};
