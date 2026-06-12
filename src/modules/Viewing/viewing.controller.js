import Viewing from "../../DB/Models/viewing.model.js";
import Property from "../../DB/Models/property.model.js";
import AppError from "../../utils/AppError.js";

// POST /viewing
export const createViewing = async (req, res) => {
  const { propertyId, scheduledAt, notes } = req.body;
  const tenantId = req.user.id;

  const property = await Property.findById(propertyId);
  if (!property) {
    throw new AppError("Property not found", 404);
  }

  if (property.status !== "APPROVED") {
    throw new AppError("Property is not available", 400);
  }

  if (property.ownerId.toString() === tenantId.toString()) {
    throw new AppError(
      "You cannot request a viewing for your own property",
      400,
    );
  }

  const existing = await Viewing.findOne({
    propertyId,
    tenantId,
    status: "PENDING",
  });
  if (existing) {
    throw new AppError(
      "You already have a pending viewing for this property",
      400,
    );
  }

  const viewing = await Viewing.create({
    propertyId,
    tenantId,
    ownerId: property.ownerId,
    scheduledAt,
    notes,
    status: "PENDING",
  });

  return res.status(201).json({
    message: "Viewing request created successfully",
    viewing,
  });
};

// PATCH /viewing/:id/accept
export const acceptViewing = async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;

  const viewing = await Viewing.findById(id);
  if (!viewing) {
    throw new AppError("Viewing not found", 404);
  }

  if (viewing.ownerId.toString() !== ownerId.toString()) {
    throw new AppError("Not authorized", 403);
  }

  if (viewing.status !== "PENDING") {
    throw new AppError("Viewing is not pending", 400);
  }

  viewing.status = "ACCEPTED";
  await viewing.save();

  return res.status(200).json({ message: "Viewing accepted", viewing });
};

// PATCH /viewing/:id/reject
export const rejectViewing = async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;

  const viewing = await Viewing.findById(id);
  if (!viewing) {
    throw new AppError("Viewing not found", 404);
  }

  if (viewing.ownerId.toString() !== ownerId.toString()) {
    throw new AppError("Not authorized", 403);
  }

  if (viewing.status !== "PENDING") {
    throw new AppError("Viewing is not pending", 400);
  }

  viewing.status = "REJECTED";
  await viewing.save();

  return res.status(200).json({ message: "Viewing rejected", viewing });
};

// PATCH /viewing/:id/complete
export const completeViewing = async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;

  const viewing = await Viewing.findById(id);
  if (!viewing) {
    throw new AppError("Viewing not found", 404);
  }

  if (viewing.ownerId.toString() !== ownerId.toString()) {
    throw new AppError("Not authorized", 403);
  }

  if (viewing.status !== "ACCEPTED") {
    throw new AppError("Viewing must be accepted first", 400);
  }

  viewing.status = "COMPLETED";
  await viewing.save();

  return res.status(200).json({ message: "Viewing completed", viewing });
};

// GET /viewing/tenant
export const getTenantViewings = async (req, res) => {
  const tenantId = req.user.id;

  const viewings = await Viewing.find({ tenantId })
    .populate("propertyId", "title location pricePerMonth")
    .sort({ scheduledAt: 1 });

  return res.status(200).json({ viewings });
};

// GET /viewing/owner
export const getOwnerViewings = async (req, res) => {
  const ownerId = req.user.id;

  const viewings = await Viewing.find({ ownerId })
    .populate("propertyId", "title location")
    .populate("tenantId", "name email phone")
    .sort({ scheduledAt: 1 });

  return res.status(200).json({ viewings });
};
