import mongoose from "mongoose";
import Property from "../../DB/Models/property.model.js";
import PropertyView from "../../DB/Models/propertyView.model.js";
import Viewing from "../../DB/Models/viewing.model.js";
import Booking from "../../DB/Models/booking.model.js";
import Notification from "../../DB/Models/notification.model.js";
import User from "../../DB/Models/user.model.js";
import { emitToUser } from "../Chat/chat.socket.js";
import { logAdminAction } from "../Admin/adminLog.controller.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";

const parseJsonField = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseBooleanField = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return value === "true" || value === true;
};

const uploadPropertyImages = async (files = []) => {
  const urls = [];

  for (const file of files) {
    urls.push(await uploadToCloudinary(file, "gorent/properties"));
  }

  return urls;
};

const calcPercentChange = (current, previous) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
};

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const countInRange = (items, start, end, predicate = () => true) =>
  items.filter((item) => {
    const createdAt = new Date(item.createdAt);
    return createdAt >= start && createdAt < end && predicate(item);
  }).length;

const sumInRange = (items, start, end, predicate, getValue) =>
  items
    .filter((item) => {
      const createdAt = new Date(item.createdAt);
      return createdAt >= start && createdAt < end && predicate(item);
    })
    .reduce((sum, item) => sum + getValue(item), 0);

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? undefined : parsedValue;
};

const buildPropertyFilter = (query) => {
  const filter = { status: "APPROVED", listingPaid: true };
  const type =
    typeof query.type === "string" ? query.type.toUpperCase() : undefined;
  const minPrice = parseNumber(query.minPrice);
  const maxPrice = parseNumber(query.maxPrice);
  const minSize = parseNumber(query.minSize);
  const maxSize = parseNumber(query.maxSize);
  const bedrooms = parseNumber(query.bedrooms);
  const bathrooms = parseNumber(query.bathrooms);
  const lng = parseNumber(query.lng);
  const lat = parseNumber(query.lat);
  const radius = parseNumber(query.radius);

  if (type) {
    filter.type = type;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.pricePerMonth = {};

    if (minPrice !== undefined) {
      filter.pricePerMonth.$gte = minPrice;
    }

    if (maxPrice !== undefined) {
      filter.pricePerMonth.$lte = maxPrice;
    }
  }

  if (minSize !== undefined || maxSize !== undefined) {
    filter.squareFootage = {};

    if (minSize !== undefined) {
      filter.squareFootage.$gte = minSize;
    }

    if (maxSize !== undefined) {
      filter.squareFootage.$lte = maxSize;
    }
  }

  if (bedrooms !== undefined) {
    filter["specifications.apartment.bedrooms"] = bedrooms;
  }

  if (bathrooms !== undefined) {
    filter["specifications.apartment.bathrooms"] = bathrooms;
  }

  if (lng !== undefined || lat !== undefined || radius !== undefined) {
    if (lng === undefined || lat === undefined || radius === undefined) {
      return {
        error: "lng, lat, and radius are required together for geo search",
      };
    }

    filter.location = {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
        $maxDistance: radius,
      },
    };
  }

  return { filter };
};

export const createProperty = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const {
      type,
      title,
      description,
      pricePerMonth,
      squareFootage,
      location,
      specifications,
      isAvailable,
    } = req.body;

    let imageUrls = [];
    if (req.files?.length) {
      try {
        imageUrls = await uploadPropertyImages(req.files);
      } catch (err) {
        return next(
          new Error(err.message || "Failed to upload property images", {
            cause: 500,
          }),
        );
      }
    }

    const property = await Property.create({
      ownerId,
      type,
      title,
      description,
      pricePerMonth: parseNumber(pricePerMonth),
      squareFootage: parseNumber(squareFootage),
      location: parseJsonField(location),
      specifications: parseJsonField(specifications),
      isAvailable: parseBooleanField(isAvailable) ?? true,
      images: imageUrls,
      status: "PENDING",
    });

    const admins = await User.find({
      role: { $in: ["admin", "superadmin"] },
    }).select("_id");
    for (const admin of admins) {
      const notification = await Notification.create({
        userId: admin._id,
        type: "NEW_LISTING_PENDING",
        refId: property._id,
      });

      emitToUser(admin._id, "notification:new", {
        _id: notification._id,
        title: "New Property Listing",
        message: `A new property "${property.title}" is pending approval.`,
        type: "NEW_LISTING_PENDING",
        date: notification.createdAt,
        isRead: false,
      });
    }

    return res.status(201).json({
      message: "Property created successfully",
      property,
    });
  } catch (error) {
    return next(error);
  }
};

export const getProperties = async (req, res, next) => {
  try {
    const page = Math.max(parseNumber(req.query.page) || 1, 1);
    const limit = Math.max(parseNumber(req.query.limit) || 10, 1);
    const { filter, error } = buildPropertyFilter(req.query);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const query = Property.find(filter).populate(
      "ownerId",
      "name email phone profileImage",
    );

    if (!filter.location) {
      query.sort({ createdAt: -1 });
    }

    const countFilter = { ...filter };
    if (countFilter.location && countFilter.location.$near) {
      countFilter.location = {
        $geoWithin: {
          $centerSphere: [
            filter.location.$near.$geometry.coordinates,
            filter.location.$near.$maxDistance / 6378100,
          ],
        },
      };
    }

    const [properties, totalItems] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit),
      Property.countDocuments(countFilter),
    ]);

    return res.status(200).json({
      properties,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (error) {
    // return res.status(500).json({
    //   message: "Server error",
    //   error: error.message,
    // });
    return next(error);
  }
};

export const getPropertyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "Invalid property id" });

      return next(new Error("Invalid property id", { cause: 400 }));
    }

    const property = await Property.findOne({
      _id: id,
    }).populate("ownerId", "name email phone profileImage");

    if (!property) {
      // return res.status(404).json({ message: "Property not found" });

      return next(new Error("Property not found", { cause: 404 }));
    }

    if (property.status !== "APPROVED" || !property.listingPaid) {
      return next(new Error("Property is not available", { cause: 403 }));
    }

    property.views = (property.views || 0) + 1;
    await property.save();

    await PropertyView.create({
      propertyId: property._id,
      viewedAt: new Date(),
    });

    return res.status(200).json({ property });
  } catch (error) {
    // return res.status(500).json({
    //   message: "Server error",
    //   error: error.message,
    // });
    return next(error);
  }
};

export const updateProperty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "Invalid property id" });

      return next(new Error("Invalid property id", { cause: 400 }));
    }

    const property = await Property.findById(id);

    if (!property) {
      // return res.status(404).json({ message: "Property not found" })
      //

      return next(new Error("Property not found", { cause: 404 }));
    }

    if (property.ownerId.toString() !== userId.toString()) {
      // return res.status(403).json({ message: "Not authorized" });

      return next(new Error("Not authorized", { cause: 403 }));
    }

    const updatableFields = [
      "type",
      "title",
      "description",
      "pricePerMonth",
      "squareFootage",
      "isAvailable",
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "pricePerMonth" || field === "squareFootage") {
          property[field] = parseNumber(req.body[field]);
        } else if (field === "isAvailable") {
          property[field] = parseBooleanField(req.body[field]);
        } else {
          property[field] = req.body[field];
        }
      }
    });

    if (req.body.location !== undefined) {
      property.location = parseJsonField(req.body.location);
    }

    if (req.body.specifications !== undefined) {
      property.specifications = parseJsonField(req.body.specifications);
    }

    if (req.body.existingImages !== undefined || req.files?.length) {
      const existingImages =
        parseJsonField(req.body.existingImages) ?? property.images ?? [];
      let newImages = [];

      if (req.files?.length) {
        try {
          newImages = await uploadPropertyImages(req.files);
        } catch (err) {
          return next(
            new Error(err.message || "Failed to upload property images", {
              cause: 500,
            }),
          );
        }
      }

      property.images = [...existingImages, ...newImages];
    }

    await property.save();

    return res.status(200).json({
      message: "Property updated successfully",
      property,
    });
  } catch (error) {
    // return res.status(500).json({
    //   message: "Server error",
    //   error: error.message,
    // });
    return next(error);
  }
};

export const deleteProperty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "Invalid property id" });
      return next(new Error("Invalid property id", { cause: 400 }));
    }

    const property = await Property.findById(id);

    if (!property) {
      // return res.status(404).json({ message: "Property not found" });
      return next(new Error("Property not found", { cause: 404 }));
    }

    if (property.ownerId.toString() !== userId.toString()) {
      // return res.status(403).json({ message: "Not authorized" });
      return next(new Error("Not authorized", { cause: 403 }));
    }

    await Property.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Property deleted successfully",
    });
  } catch (error) {
    // return res.status(500).json({
    //   message: "Server error",
    //   error: error.message,
    // });
    return next(error);
  }
};

export const approveProperty = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "Invalid property id" });
      return next(new Error("Invalid property id", { cause: 400 }));
    }

    const property = await Property.findById(id);

    if (!property) {
      // return res.status(404).json({ message: "Property not found" });
      return next(new Error("Property not found", { cause: 404 }));
    }

    property.status = "APPROVED";
    property.reviewedBy = req.user.id;
    property.reviewedAt = new Date();

    await property.save();

    const notification = await Notification.create({
      userId: property.ownerId,
      type: "LISTING_APPROVED",
      refId: property._id,
    });

    emitToUser(property.ownerId, "notification:new", {
      _id: notification._id,
      title: "Listing Approved",
      message: `Your property listing "${property.title}" has been approved.`,
      type: "LISTING_APPROVED",
      date: notification.createdAt,
      isRead: false,
    });

    await logAdminAction({
      adminId: req.user.id,
      action: "APPROVE_LISTING",
      targetId: id,
      targetType: "PROPERTY",
    });

    return res.status(200).json({
      message: "Property approved successfully",
      property,
    });
  } catch (error) {
    // return res.status(500).json({
    //   message: "Server error",
    //   error: error.message,
    // });
    return next(error);
  }
};

export const rejectProperty = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "Invalid property id" });
      return next(new Error("Invalid property id", { cause: 400 }));
    }

    const property = await Property.findById(id);

    if (!property) {
      // return res.status(404).json({ message: "Property not found" });
      return next(new Error("Property not found", { cause: 404 }));
    }

    property.status = "REJECTED";
    property.reviewedBy = req.user.id;
    property.reviewedAt = new Date();

    await property.save();

    const notification = await Notification.create({
      userId: property.ownerId,
      type: "LISTING_REJECTED",
      refId: property._id,
    });

    emitToUser(property.ownerId, "notification:new", {
      _id: notification._id,
      title: "Listing Rejected",
      message: `Your property listing "${property.title}" has been rejected.`,
      type: "LISTING_REJECTED",
      date: notification.createdAt,
      isRead: false,
    });

    await logAdminAction({
      adminId: req.user.id,
      action: "REJECT_LISTING",
      targetId: id,
      targetType: "PROPERTY",
    });

    return res.status(200).json({
      message: "Property rejected successfully",
      property,
    });
  } catch (error) {
    // return res.status(500).json({
    //   message: "Server error",
    //   error: error.message,
    // });
    return next(error);
  }
};
export const getPropertbyOwnerId = async (req, res, next) => {
  try {
    console.log("here");

    const ownerId = req.user.id;
    console.log(ownerId);
    console.log("here");

    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return next(new Error("Invalid owner id", { cause: 400 }));
    }
    const properties = await Property.find({ ownerId }).sort({ updatedAt: -1 });

    const propertyIds = properties.map((property) => property._id);
    const viewingCounts = await Viewing.aggregate([
      { $match: { propertyId: { $in: propertyIds } } },
      { $group: { _id: "$propertyId", count: { $sum: 1 } } },
    ]);

    const viewingCountMap = viewingCounts.reduce((map, item) => {
      map[item._id.toString()] = item.count;
      return map;
    }, {});

    const enrichedProperties = properties.map((property) => ({
      ...property.toObject(),
      viewingCount: viewingCountMap[property._id.toString()] || 0,
    }));

    return res.status(200).json({ properties: enrichedProperties });
  } catch (error) {
    return next(error);
  }
};

export const getOwnerDashboard = async (req, res, next) => {
  try {
    const ownerId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return next(new Error("Invalid owner id", { cause: 400 }));
    }

    const properties = await Property.find({ ownerId }).sort({ updatedAt: -1 });
    const propertyIds = properties.map((property) => property._id);

    const [viewings, bookings, viewEvents, viewingCounts] = await Promise.all([
      Viewing.find({ ownerId }),
      Booking.find({
        propertyId: { $in: propertyIds },
        status: { $ne: "CANCELLED" },
      }),
      PropertyView.find({ propertyId: { $in: propertyIds } }),
      Viewing.aggregate([
        { $match: { propertyId: { $in: propertyIds } } },
        { $group: { _id: "$propertyId", count: { $sum: 1 } } },
      ]),
    ]);

    const viewingCountMap = viewingCounts.reduce((map, item) => {
      map[item._id.toString()] = item.count;
      return map;
    }, {});

    const totalViews = properties.reduce(
      (sum, property) => sum + (property.views || 0),
      0,
    );
    const viewingRequests = viewings.filter(
      (viewing) => viewing.status === "PENDING",
    ).length;
    const activeContracts = bookings.filter(
      (booking) => booking.status === "RESERVED",
    ).length;
    const monthlyIncome = bookings
      .filter((booking) => booking.status === "RESERVED")
      .reduce((sum, booking) => sum + booking.amountPaid, 0);

    const now = new Date();
    const last30Start = daysAgo(30);
    const prev30Start = daysAgo(60);

    const viewsLast30 = viewEvents.filter(
      (event) => new Date(event.viewedAt) >= last30Start,
    ).length;
    const viewsPrev30 = viewEvents.filter((event) => {
      const viewedAt = new Date(event.viewedAt);
      return viewedAt >= prev30Start && viewedAt < last30Start;
    }).length;

    const viewingRequestsLast30 = countInRange(
      viewings,
      last30Start,
      now,
      (viewing) => viewing.status === "PENDING",
    );
    const viewingRequestsPrev30 = countInRange(
      viewings,
      prev30Start,
      last30Start,
      (viewing) => viewing.status === "PENDING",
    );

    const contractsLast30 = countInRange(
      bookings,
      last30Start,
      now,
      (booking) => booking.status === "RESERVED",
    );
    const contractsPrev30 = countInRange(
      bookings,
      prev30Start,
      last30Start,
      (booking) => booking.status === "RESERVED",
    );

    const incomeLast30 = sumInRange(
      bookings,
      last30Start,
      now,
      (booking) => booking.status === "RESERVED",
      (booking) => booking.amountPaid,
    );
    const incomePrev30 = sumInRange(
      bookings,
      prev30Start,
      last30Start,
      (booking) => booking.status === "RESERVED",
      (booking) => booking.amountPaid,
    );

    const enrichedProperties = properties.map((property) => ({
      ...property.toObject(),
      viewingCount: viewingCountMap[property._id.toString()] || 0,
    }));

    return res.status(200).json({
      stats: {
        totalViews,
        activeContracts,
        viewingRequests,
        monthlyIncome,
        changes: {
          totalViews: calcPercentChange(viewsLast30, viewsPrev30),
          activeContracts: calcPercentChange(contractsLast30, contractsPrev30),
          viewingRequests: calcPercentChange(
            viewingRequestsLast30,
            viewingRequestsPrev30,
          ),
          monthlyIncome: calcPercentChange(incomeLast30, incomePrev30),
        },
      },
      properties: enrichedProperties,
    });
  } catch (error) {
    return next(error);
  }
};
export const getAdminProperties = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);

    const query = Property.find({}).populate(
      "ownerId",
      "name email phone profileImage",
    );
    query.sort({ createdAt: -1 });
    const [properties, totalItems] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit),
      Property.countDocuments({}),
    ]);

    return res.status(200).json({
      properties,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
};
