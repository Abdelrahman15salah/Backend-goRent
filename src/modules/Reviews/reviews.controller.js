import Review from "../../DB/Models/review.model.js";
import Notification from "../../DB/Models/notification.model.js";
import Property from "../../DB/Models/property.model.js";
import mongoose from "mongoose";
import { emitToUser } from "../Chat/chat.socket.js";

const createReview = async (req, res, next) => {
  try {
    const { targetType, propertyId, targetUserId, rating, comment } = req.body;

    const authorId = req.user.id;

    const allowedTypes = ["PROPERTY", "OWNER", "TENANT"];

    if (!targetType || !allowedTypes.includes(targetType)) {
      return next(
        new Error("النوع المستهدف غير صالح.", {
          cause: 400,
        }),
      );
    }

    if (rating === undefined || rating === null) {
      return next(new Error("يرجى إعطاء تقييم أولاً.", { cause: 400 }));
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return next(
        new Error("التقييم يجب أن يكون بين 1 و 5 نجوم.", { cause: 400 }),
      );
    }

    let property = null;

    if (targetType === "PROPERTY") {
      if (!propertyId) {
        return next(
          new Error("مطلوب تحديد العقار لإضافة التقييم.", {
            cause: 400,
          }),
        );
      }

      if (!mongoose.Types.ObjectId.isValid(propertyId)) {
        return next(new Error("معرف العقار للتقييم غير صالح.", { cause: 400 }));
      }

      property = await Property.findById(propertyId);

      if (!property) {
        return next(new Error("لم نتمكن من العثور على هذا العقار.", { cause: 404 }));
      }

      if (property.status !== "APPROVED") {
        return next(
          new Error("لا يمكن تقييم عقار غير معتمد.", { cause: 400 }),
        );
      }

      if (property.ownerId.toString() === authorId) {
        return next(
          new Error("لا يمكنك تقييم عقارك الخاص.", { cause: 403 }),
        );
      }

      const existing = await Review.findOne({
        authorId,
        propertyId,
        targetType,
      });

      if (existing) {
        return next(
          new Error("لقد قمت بتقييم هذا العقار مسبقاً.", { cause: 409 }),
        );
      }
    }

    if (targetType === "OWNER" || targetType === "TENANT") {
      if (!targetUserId) {
        return next(
          new Error("يرجى تحديد المستخدم للتقييم.", {
            cause: 400,
          }),
        );
      }

      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return next(new Error("معرف المستخدم للتقييم غير صالح.", { cause: 400 }));
      }

      if (targetUserId === authorId) {
        return next(new Error("لا يمكنك تقييم نفسك.", { cause: 403 }));
      }

      const existing = await Review.findOne({
        authorId,
        targetUserId,
        targetType,
      });

      if (existing) {
        return next(
          new Error("لقد قمت بتقييم هذا المستخدم مسبقاً.", { cause: 409 }),
        );
      }
    }

    const review = new Review({
      authorId,
      targetType,
      propertyId: targetType === "PROPERTY" ? propertyId : null,
      targetUserId:
        targetType === "OWNER" || targetType === "TENANT" ? targetUserId : null,
      rating,
      comment: comment || "",
    });

    await review.save();

    let notificationRecipientId = null;
    let notificationMessage = "";

    if (targetType === "PROPERTY" && property) {
      notificationRecipientId = property.ownerId;
      notificationMessage = `Someone left a new review on your property.`;
    } else if (targetType === "OWNER" || targetType === "TENANT") {
      notificationRecipientId = targetUserId;
      notificationMessage = `Someone left a new review on your profile.`;
    }

    if (notificationRecipientId) {
      const notification = await Notification.create({
        userId: notificationRecipientId,
        type: "NEW_REVIEW",
        refId: review._id,
      });

      emitToUser(notificationRecipientId, "notification:new", {
        _id: notification._id,
        title: "New Review",
        message: notificationMessage,
        type: "NEW_REVIEW",
        date: notification.createdAt,
        isRead: false
      });
    }

    return res.status(201).json({
      message: "Review created successfully",
      review,
    });
  } catch (error) {
    next(error);
  }
};

const getReviews = async (req, res, next) => {
  try {
    const { targetType, propertyId, targetUserId } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const filter = {};

    if (targetType) {
      const allowedTypes = ["PROPERTY", "OWNER", "TENANT"];
      if (!allowedTypes.includes(targetType)) {
        return next(
          new Error("النوع المستهدف غير صالح.", {
            cause: 400,
          }),
        );
      }
      filter.targetType = targetType;
    }

    if (propertyId) {
      if (!mongoose.Types.ObjectId.isValid(propertyId)) {
        return next(new Error("معرف العقار للتقييم غير صالح.", { cause: 400 }));
      }
      filter.propertyId = propertyId;
    }

    if (targetUserId) {
      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return next(new Error("معرف المستخدم للتقييم غير صالح.", { cause: 400 }));
      }
      filter.targetUserId = targetUserId;
    }

    if (req.query.search) {
      filter.comment = { $regex: req.query.search, $options: "i" };
    }

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("authorId", "name profileImage")
        .populate("propertyId", "title images")
        .populate("targetUserId", "name profileImage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    return res.status(200).json({
      message: "Reviews fetched successfully",
      reviews,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new Error("Invalid review ID", { cause: 400 }));
    }

    const review = await Review.findById(id);

    if (!review) {
      return next(new Error("Review not found", { cause: 404 }));
    }

    if (review.authorId.toString() !== req.user.id && req.user.role !== "superadmin") {
      return next(
        new Error("You are not authorized to delete this review", {
          cause: 403,
        }),
      );
    }

    await Review.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Review deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new Error("معرف التقييم غير صالح.", { cause: 400 }));
    }

    const review = await Review.findById(id);

    if (!review) {
      return next(new Error("التقييم غير موجود.", { cause: 404 }));
    }

    if (review.authorId.toString() !== req.user.id) {
      return next(
        new Error("ليس لديك الصلاحية لتعديل هذا التقييم.", {
          cause: 403,
        }),
      );
    }

    if (rating !== undefined) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return next(
          new Error("التقييم يجب أن يكون بين 1 و 5 نجوم.", {
            cause: 400,
          }),
        );
      }

      review.rating = rating;
    }

    if (comment !== undefined) {
      review.comment = comment.trim();
    }

    await review.save();

    return res.status(200).json({
      message: "Review updated successfully",
      review,
    });
  } catch (error) {
    next(error);
  }
};

export { createReview, getReviews, deleteReview, updateReview };
