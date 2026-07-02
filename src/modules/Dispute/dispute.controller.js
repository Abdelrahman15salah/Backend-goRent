import mongoose from "mongoose";
import Property from "../../DB/Models/property.model.js";
import { logAdminAction } from "../Admin/adminLog.controller.js";
import Dispute from "../../DB/Models/dispute.model.js";
import Booking from "../../DB/Models/booking.model.js";

// 1. Create a new Dispute with verification logic
export const createDispute = async (req, res, next) => {
    try {
        const { propertyId, subject, description } = req.body;
        const tenantId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(propertyId)) {
            return next(new Error("معرف العقار غير صالح.", { cause: 404 }));
        }

        const property = await Property.findById(propertyId);
        if (!property) {
            return next(
                new Error("لم نتمكن من العثور على هذا العقار.", { cause: 404 })
            );
        }

        if (propertyId.toString() === tenantId.toString()) {
            return next(
                new Error("لا يمكنك الإبلاغ عن عقارك الخاص.", { cause: 409 })
            );
        }

        // Check if the user is the owner or a tenant with a valid booking
        const isOwner = property.ownerId.toString() === tenantId.toString();
        const bookingQuery = { propertyId, status: "RESERVED" };
        if (!isOwner) {
            bookingQuery.tenantId = tenantId;
        }

        const validBooking = await Booking.findOne(bookingQuery);
        if (!validBooking) {
            return next(
                new Error("لا يمكنك الإبلاغ عن هذا العقار إلا إذا كان لديك حجز مؤكد له.", { cause: 403 })
            );
        }

        const dispute = await Dispute.create({
            propertyId,
            tenantId,
            ownerId: property.ownerId,
            subject,
            description,
        });

        return res
            .status(201)
            .json({ message: "dispute created successfully", dispute });
    } catch (error) {
        return next(error);
    }
};

// 2. Check Eligibility Endpoint for Frontend UI
export const checkEligibility = async (req, res, next) => {
    try {
        const { propertyId } = req.params;
        const userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(propertyId)) {
            return res.status(400).json({ eligible: false });
        }

        const property = await Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({ eligible: false });
        }

        const isOwner = property.ownerId.toString() === userId.toString();
        const bookingQuery = { propertyId, status: "RESERVED" };
        if (!isOwner) {
            bookingQuery.tenantId = userId;
        }

        const validBooking = await Booking.findOne(bookingQuery);

        return res.status(200).json({ eligible: !!validBooking });
    } catch (error) {
        return next(error);
    }
};

// 3. Get All Disputes (Admin view with pagination and filters)
export const getDisputes = async (req, res, next) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
        const skip = (page - 1) * limit;
        const allowedStatuses = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"];
        const filter = {};

        if (req.query.status) {
            if (!allowedStatuses.includes(req.query.status)) {
                return next(new Error("invalid status", { cause: 400 }));
            }
            filter.status = req.query.status;
        }

        if (req.query.search) {
            filter.$or = [
                { subject: { $regex: req.query.search, $options: "i" } },
                { description: { $regex: req.query.search, $options: "i" } },
            ];
        }

        const [disputes, totalItems] = await Promise.all([
            Dispute.find(filter)
                .populate("propertyId", "title")
                .populate("tenantId", "name email")
                .populate("ownerId", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Dispute.countDocuments(filter),
        ]);

        return res.status(200).json({
            disputes,
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

// 4. Get My Disputes (For Owners/Tenants)
export const getMyDisputes = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const disputes = await Dispute.find({
            $or: [{ tenantId: userId }, { ownerId: userId }],
        })
            .populate("propertyId", "title")
            .populate("tenantId", "name email")
            .populate("ownerId", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({ disputes });
    } catch (error) {
        return next(error);
    }
};

// 5. Get Single Dispute By ID
export const getDisputeById = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new Error("invalid dispute id", { cause: 400 }));
        }
        const dispute = await Dispute.findById(id)
            .populate("propertyId", "title")
            .populate("tenantId", "name email")
            .populate("ownerId", "name email");

        if (!dispute) {
            return next(new Error("dispute not found", { cause: 404 }));
        }
        return res.status(200).json({ dispute });
    } catch (error) {
        return next(error);
    }
};

// 6. Admin: Mark Dispute In Review
export const markDisputeInReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new Error("invalid dispute id", { cause: 400 }));
        }

        const dispute = await Dispute.findById(id);

        if (!dispute) {
            return next(new Error("dispute not found", { cause: 404 }));
        }

        if (dispute.status !== "OPEN") {
            return next(new Error("only an open dispute can be marked as in review"));
        }

        dispute.status = "IN_REVIEW";
        await dispute.save();

        logAdminAction({
            adminId: req.user.id,
            action: "marked dispute in review",
            targetId: dispute.propertyId,
            targetType: "property",
        });

        return res
            .status(200)
            .json({ message: "dispute marked as in review", dispute });
    } catch (error) {
        return next(error);
    }
};

// 7. Admin: Resolve Dispute
export const resolveDispute = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new Error("invalid dispute id", { cause: 400 }));
        }

        const dispute = await Dispute.findById(id);

        if (!dispute) {
            return next(new Error("dispute not found", { cause: 404 }));
        }

        if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") {
            return next(new Error("dispute is already closed"));
        }

        dispute.status = "RESOLVED";
        await dispute.save();

        logAdminAction({
            adminId: req.user.id,
            action: "resolved dispute",
            targetId: dispute.propertyId,
            targetType: "property",
        });

        return res
            .status(200)
            .json({ message: "dispute resolved successfully", dispute });
    } catch (error) {
        return next(error);
    }
};

// 8. Admin: Reject Dispute
export const rejectDispute = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new Error("invalid dispute id", { cause: 400 }));
        }

        const dispute = await Dispute.findById(id);

        if (!dispute) {
            return next(new Error("dispute not found", { cause: 404 }));
        }

        if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") {
            return next(new Error("dispute is already closed"));
        }

        dispute.status = "REJECTED";
        await dispute.save();

        logAdminAction({
            adminId: req.user.id,
            action: "rejected dispute",
            targetId: dispute.propertyId,
            targetType: "property",
        });

        return res
            .status(200)
            .json({ message: "dispute rejected successfully", dispute });
    } catch (error) {
        return next(error);
    }
};

// 9. Delete Dispute (Admin or the Reporter themselves)
export const deleteDispute = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new Error("invalid dispute id", { cause: 400 }));
        }
        const dispute = await Dispute.findById(id);

        if (!dispute) {
            return next(new Error("dispute not found", { cause: 404 }));
        }

        const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";
        const isReporter = dispute.tenantId.toString() === req.user.id.toString();

        if (!isAdmin && !isReporter) {
            return next(new Error("Not authorized", { cause: 403 }));
        }
        if (!isAdmin && dispute.status !== "OPEN") {
            return next(
                new Error("cannot delete a dispute that is already being processed")
            );
        }

        logAdminAction({
            adminId: req.user.id,
            action: "deleted dispute",
            targetId: dispute.propertyId,
            targetType: "property",
        });

        await Dispute.findByIdAndDelete(id);

        return res.status(200).json({ message: "dispute deleted successfully" });
    } catch (error) {
        return next(error);
    }
};