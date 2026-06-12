import Booking from "../../DB/Models/booking.model.js";
import Property from "../../DB/Models/property.model.js";
import User from "../../DB/Models/user.model.js";
import AppError from "../../utils/AppError.js";

export const createBooking = async (req, res) => {
  const { propertyId, startDate, endDate } = req.body;
  const tenantId = req.user.id;

  const property = await Property.findById(propertyId);

  if (!property) {
    throw new AppError("Property not found", 404);
  }

  if (property.status !== "APPROVED") {
    throw new AppError("Property is not available for booking", 400);
  }

  const conflict = await Booking.findOne({
    propertyId,
    status: { $ne: "CANCELLED" },
    startDate: { $lt: new Date(endDate) },
    endDate: { $gt: new Date(startDate) },
  });

  if (conflict) {
    throw new AppError("Property is already booked for these dates", 400);
  }

  const amountPaid = property.pricePerMonth;

  const booking = await Booking.create({
    propertyId,
    tenantId,
    startDate,
    endDate,
    amountPaid,
    stripePaymentIntentId: `MOCK_${Date.now()}`,
    status: "PENDING_PAYMENT",
  });

  return res.status(201).json({
    message: "Booking created successfully",
    booking,
  });
};
export const cancelBooking = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.id;

  const booking = await Booking.findById(id);

  if (!booking) {
    throw new AppError("Booking not found", 404);
  }

  if (booking.tenantId.toString() !== tenantId.toString()) {
    throw new AppError("Not authorized", 403);
  }

  if (booking.status === "CANCELLED") {
    throw new AppError("Booking already cancelled", 400);
  }

  booking.status = "CANCELLED";
  await booking.save();

  const user = await User.findById(tenantId);

  user.cancellationCount += 1;

  if (user.cancellationCount >= 3) {
    user.isBanned = true;
  }

  await user.save();

  return res.status(200).json({
    message: "Booking cancelled successfully",
    booking,
  });
};
export const getTenantBookings = async (req, res) => {
  const tenantId = req.user.id;

  const bookings = await Booking.find({ tenantId })
    .populate("propertyId", "title pricePerMonth location")
    .sort({ createdAt: -1 });

  return res.status(200).json({ bookings });
};
export const getPropertyBookings = async (req, res) => {
  const { propertyId } = req.params;

  const bookings = await Booking.find({ propertyId })
    .populate("tenantId", "name email phone")
    .sort({ createdAt: -1 });

  return res.status(200).json({ bookings });
};
