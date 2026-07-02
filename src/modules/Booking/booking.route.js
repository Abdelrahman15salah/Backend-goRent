import express from "express"
import { verifyRole, verifyAuth } from "../../Middleware/Auth.Middleware.js"
import { validateCreateBooking } from "./booking.validation.js"
import { createBooking, cancelBooking, getTenantBookings, getOwnerBookings, getPropertyBookings, acceptBooking, rejectBooking, getOwnerAnalytics } from "./booking.controller.js"

const router = express.Router()

router.post("/", verifyAuth, verifyRole(["tenant" ,"admin"]), validateCreateBooking, createBooking)
router.patch("/:id/cancel", verifyAuth, verifyRole(["tenant"]), cancelBooking)
router.get("/tenant", verifyAuth, verifyRole(["tenant"]), getTenantBookings)
router.get("/owner", verifyAuth, verifyRole(["owner"]), getOwnerBookings)
router.get("/owner/analytics", verifyAuth, verifyRole(["owner"]), getOwnerAnalytics)
router.get("/property/:propertyId", verifyAuth, verifyRole(["owner", "admin"]), getPropertyBookings)

router.patch("/:id/accept", verifyAuth, verifyRole(["owner"]), acceptBooking)
router.patch("/:id/reject", verifyAuth, verifyRole(["owner"]), rejectBooking)

export default router