import AppError from "../../utils/AppError.js";

export const validateCreateBooking = (req, res, next) => {
  const { propertyId, startDate, endDate } = req.body;

  if (!propertyId) {
    return next(new AppError("propertyId is required", 400));
  }

  if (!startDate || !endDate) {
    return next(new AppError("startDate and endDate are required", 400));
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start) || isNaN(end)) {
    return next(new AppError("Invalid dates", 400));
  }

  if (start < new Date()) {
    return next(new AppError("startDate cannot be in the past", 400));
  }

  if (start >= end) {
    return next(new AppError("startDate must be before endDate", 400));
  }

  next();
};
