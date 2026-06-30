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
        new Error("targetType must be PROPERTY, OWNER, or TENANT", {
          cause: 400,
        }),
      );
    }

    if (rating === undefined || rating === null) {
      return next(new Error("rating is required", { cause: 400 }));
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return next(
        new Error("rating must be an integer between 1 and 5", { cause: 400 }),
      );
    }

    let property = null;

    if (targetType === "PROPERTY") {
      if (!propertyId) {
        return next(
          new Error("propertyId is required for PROPERTY review", {
            cause: 400,
          }),
        );
      }

      if (!mongoose.Types.ObjectId.isValid(propertyId)) {
        return next(new Error("Invalid propertyId", { cause: 400 }));
      }

      property = await Property.findById(propertyId);

      if (!property) {
        return next(new Error("Property not found", { cause: 404 }));
      }

      if (property.status !== "APPROVED" || !property.listingPaid) {
        return next(
          new Error("Cannot review a non-approved or unpaid property", { cause: 400 }),
        );
      }

      if (property.ownerId.toString() === authorId) {
        return next(
          new Error("You cannot review your own property", { cause: 403 }),
        );
      }

      const existing = await Review.findOne({
        authorId,
        propertyId,
        targetType,
      });

      if (existing) {
        return next(
          new Error("You already reviewed this property", { cause: 409 }),
        );
      }
    }

    if (targetType === "OWNER" || targetType === "TENANT") {
      if (!targetUserId) {
        return next(
          new Error("targetUserId is required for user review", {
            cause: 400,
          }),
        );
      }

      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return next(new Error("Invalid targetUserId", { cause: 400 }));
      }

      if (targetUserId === authorId) {
        return next(new Error("You cannot review yourself", { cause: 403 }));
      }

      const existing = await Review.findOne({
        authorId,
        targetUserId,
        targetType,
      });

      if (existing) {
        return next(
          new Error("You already reviewed this user", { cause: 409 }),
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
          new Error("targetType must be PROPERTY, OWNER, or TENANT", {
            cause: 400,
          }),
        );
      }
      filter.targetType = targetType;
    }

    if (propertyId) {
      if (!mongoose.Types.ObjectId.isValid(propertyId)) {
        return next(new Error("Invalid propertyId", { cause: 400 }));
      }
      filter.propertyId = propertyId;
    }

    if (targetUserId) {
      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return next(new Error("Invalid targetUserId", { cause: 400 }));
      }
      filter.targetUserId = targetUserId;
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
      return next(new Error("Invalid review ID", { cause: 400 }));
    }

    const review = await Review.findById(id);

    if (!review) {
      return next(new Error("Review not found", { cause: 404 }));
    }

    if (review.authorId.toString() !== req.user.id) {
      return next(
        new Error("You are not authorized to edit this review", {
          cause: 403,
        }),
      );
    }

    if (rating !== undefined) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return next(
          new Error("rating must be an integer between 1 and 5", {
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
