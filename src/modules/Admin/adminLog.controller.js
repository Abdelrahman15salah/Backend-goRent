import AdminLog from "../../DB/Models/adminLog.model.js";
import Property from "../../DB/Models/property.model.js";
import User from "../../DB/Models/user.model.js";

export const logAdminAction = async ({
  adminId,
  action,
  targetId,
  targetType,
  notes,
}) => {
  try {
    const log = await AdminLog.create({
      adminId,
      action,
      targetId,
      targetType,
      notes,
    });
    return log;
  } catch (error) {
    console.error("Error logging admin action:", error);
    return null;
  }
};

export const getLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const logs = await AdminLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalItems = await AdminLog.countDocuments();
    const totalPages = Math.ceil(totalItems / limit);

    const formattedLogs = await Promise.all(logs.map(async (log) => {
      let targetName = "—";
      try {
        if (log.targetType === "PROPERTY") {
           const prop = await Property.findById(log.targetId).select("title").lean();
           if (prop) targetName = prop.title;
        } else if (log.targetType === "USER") {
           const user = await User.findById(log.targetId).select("name").lean();
           if (user) targetName = user.name;
        } else if (log.targetType === "BOOKING") {
           targetName = `رقم الحجز: ${log.targetId}`;
        }
      } catch (err) {
        console.error("Error fetching target details:", err);
      }

      return {
        _id: log._id,
        adminId: log.adminId,
        action: log.action,
        details: log.notes ? `${targetName} (${log.notes})` : targetName,
        createdAt: log.createdAt
      };
    }));

    res.status(200).json({
      logs: formattedLogs,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages
      }
    });
  } catch (error) {
    console.error("Error fetching admin logs:", error);
    res.status(500).json({ message: "حدث خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً." });
  }
};
