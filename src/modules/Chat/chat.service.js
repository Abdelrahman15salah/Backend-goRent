import ChatThread from "../../DB/Models/chatThread.model.js";
import Message from "../../DB/Models/message.model.js";
import Notification from "../../DB/Models/notification.model.js";
import {
  getOtherParticipantId,
  isThreadParticipant,
} from "./chat.utils.js";

const MESSAGE_POPULATE = {
  path: "senderId",
  select: "name email profileImage",
};

export const getThreadForUser = async (threadId, userId) => {
  const thread = await ChatThread.findById(threadId);

  if (!thread) {
    const error = new Error("لم نتمكن من العثور على المحادثة.");
    error.cause = 404;
    throw error;
  }

  if (!isThreadParticipant(thread, userId)) {
    const error = new Error("ليس لديك الصلاحية لإجراء هذا التعديل.");
    error.cause = 403;
    throw error;
  }

  return thread;
};

export const createChatMessage = async ({
  threadId,
  senderId,
  text,
  attachmentUrl = null,
}) => {
  const thread = await getThreadForUser(threadId, senderId);

  const message = await Message.create({
    threadId,
    senderId,
    text,
    attachmentUrl,
    status: "SENT",
  });

  thread.lastMessageAt = new Date();
  await thread.save();

  const recipientId = getOtherParticipantId(thread, senderId);

  await Notification.create({
    userId: recipientId,
    type: "NEW_MESSAGE",
    refId: message._id,
  });

  return Message.findById(message._id).populate(MESSAGE_POPULATE);
};

export const markMessagesDelivered = async (messageIds, userId) => {
  if (!messageIds?.length) {
    return [];
  }

  const messages = await Message.find({
    _id: { $in: messageIds },
    senderId: { $ne: userId },
    status: "SENT",
  });

  const deliverableIds = [];

  for (const message of messages) {
    const thread = await ChatThread.findById(message.threadId);

    if (thread && isThreadParticipant(thread, userId)) {
      deliverableIds.push(message._id);
    }
  }

  if (!deliverableIds.length) {
    return [];
  }

  await Message.updateMany(
    { _id: { $in: deliverableIds } },
    { status: "DELIVERED", deliveredAt: new Date() },
  );

  return Message.find({ _id: { $in: deliverableIds } }).select(
    "_id threadId senderId status deliveredAt",
  );
};

export const markThreadMessagesSeen = async (threadId, userId) => {
  await getThreadForUser(threadId, userId);

  const seenAt = new Date();

  const result = await Message.updateMany(
    {
      threadId,
      senderId: { $ne: userId },
      status: { $in: ["SENT", "DELIVERED"] },
    },
    { status: "SEEN", seenAt },
  );

  return {
    threadId,
    seenAt,
    modifiedCount: result.modifiedCount,
  };
};
