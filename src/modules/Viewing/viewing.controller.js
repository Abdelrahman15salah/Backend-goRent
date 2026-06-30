import Viewing from "../../DB/Models/viewing.model.js"
import Notification from "../../DB/Models/notification.model.js";
import Property from "../../DB/Models/property.model.js"
import { emitToUser } from "../Chat/chat.socket.js";

// POST /viewing
export const createViewing = async (req, res) => {
    try {
        const { propertyId, scheduledAt, notes } = req.body
        const tenantId = req.user.id


        const property = await Property.findById(propertyId)
        if (!property) {
            return res.status(404).json({ message: "Property not found" })
        }


        if (property.status !== "APPROVED" || !property.listingPaid) {
            return res.status(400).json({ message: "Property is not available" })
        }


        if (property.ownerId.toString() === tenantId.toString()) {
            return res.status(400).json({ message: "You cannot request a viewing for your own property" })
        }


        const existing = await Viewing.findOne({
            propertyId,
            tenantId,
            status: "PENDING"
        })
        if (existing) {
            return res.status(400).json({ message: "You already have a pending viewing for this property" })
        }

        const viewing = await Viewing.create({
            propertyId,
            tenantId,
            ownerId: property.ownerId,
            scheduledAt,
            notes,
            status: "PENDING"
        })

        const notification = await Notification.create({
            userId: property.ownerId,
            type: "VIEWING_REQUEST",
            refId: viewing._id,
        });

        emitToUser(property.ownerId, "notification:new", {
            _id: notification._id,
            title: "New Viewing Request",
            message: `A tenant has requested a viewing for your property.`,
            type: "VIEWING_REQUEST",
            date: notification.createdAt,
            isRead: false
        });

        return res.status(201).json({
            message: "Viewing request created successfully",
            viewing
        })

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message })
    }
}

// PATCH /viewing/:id/accept
export const acceptViewing = async (req, res) => {
    try {
        const { id } = req.params
        const ownerId = req.user.id

        const viewing = await Viewing.findById(id)
        if (!viewing) {
            return res.status(404).json({ message: "Viewing not found" })
        }


        if (viewing.ownerId.toString() !== ownerId.toString()) {
            return res.status(403).json({ message: "Not authorized" })
        }


        if (viewing.status !== "PENDING") {
            return res.status(400).json({ message: "Viewing is not pending" })
        }

        viewing.status = "ACCEPTED"
        await viewing.save()

        const notification = await Notification.create({
            userId: viewing.tenantId,
            type: "VIEWING_ACCEPTED",
            refId: viewing._id,
        });

        emitToUser(viewing.tenantId, "notification:new", {
            _id: notification._id,
            title: "Viewing Accepted",
            message: `Your viewing request has been accepted.`,
            type: "VIEWING_ACCEPTED",
            date: notification.createdAt,
            isRead: false
        });

        return res.status(200).json({ message: "Viewing accepted", viewing })

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message })
    }
}

// PATCH /viewing/:id/reject
export const rejectViewing = async (req, res) => {
    try {
        const { id } = req.params
        const ownerId = req.user.id

        const viewing = await Viewing.findById(id)
        if (!viewing) {
            return res.status(404).json({ message: "Viewing not found" })
        }

        if (viewing.ownerId.toString() !== ownerId.toString()) {
            return res.status(403).json({ message: "Not authorized" })
        }

        if (viewing.status !== "PENDING") {
            return res.status(400).json({ message: "Viewing is not pending" })
        }

        viewing.status = "REJECTED"
        await viewing.save()

        return res.status(200).json({ message: "Viewing rejected", viewing })

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message })
    }
}

// PATCH /viewing/:id/complete
export const completeViewing = async (req, res) => {
    try {
        const { id } = req.params
        const ownerId = req.user.id

        const viewing = await Viewing.findById(id)
        if (!viewing) {
            return res.status(404).json({ message: "Viewing not found" })
        }

        if (viewing.ownerId.toString() !== ownerId.toString()) {
            return res.status(403).json({ message: "Not authorized" })
        }


        if (viewing.status !== "ACCEPTED") {
            return res.status(400).json({ message: "Viewing must be accepted first" })
        }

        viewing.status = "COMPLETED"
        await viewing.save()

        return res.status(200).json({ message: "Viewing completed", viewing })

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message })
    }
}

// GET /viewing/tenant
export const getTenantViewings = async (req, res) => {
    try {
        const tenantId = req.user.id

        const viewings = await Viewing.find({ tenantId })
            .populate("propertyId", "title location pricePerMonth")
            .sort({ scheduledAt: 1 })

        return res.status(200).json({ viewings })

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message })
    }
}

// GET /viewing/owner
export const getOwnerViewings = async (req, res) => {
    try {
        const ownerId = req.user.id

        const viewings = await Viewing.find({ ownerId })
            .populate("propertyId", "title location")
            .populate("tenantId", "name email phone")
            .sort({ scheduledAt: 1 })

        return res.status(200).json({ viewings })

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message })
    }
}