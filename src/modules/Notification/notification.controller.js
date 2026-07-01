import Notification from "../../DB/Models/notification.model.js";

export const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;

    const notifications = await Notification.find({ userId, isArchived: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const unreadCount = await Notification.countDocuments({ userId, isRead: false, isArchived: false });

    return res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return next(new Error("الإشعار غير موجود.", { cause: 404 }));
    }

    return res.status(200).json({ notification });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );

    return res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
};
