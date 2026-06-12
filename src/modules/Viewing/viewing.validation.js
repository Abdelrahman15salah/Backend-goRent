import AppError from "../../utils/AppError.js";

export const validateCreateViewing = (req, res, next) => {
  const { propertyId, scheduledAt } = req.body;

  if (!propertyId) {
    return next(new AppError("propertyId is required", 400));
  }

  if (!scheduledAt) {
    return next(new AppError("scheduledAt is required", 400));
  }

  const date = new Date(scheduledAt);

  if (isNaN(date)) {
    return next(new AppError("Invalid date", 400));
  }

  if (date < new Date()) {
    return next(new AppError("scheduledAt cannot be in the past", 400));
  }

  next();
};
