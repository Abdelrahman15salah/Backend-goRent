import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
    {
        // LISTING_FEE -> owner pays to publish a property (fixed 100 EGP)
        // BOOKING_FEE -> tenant pays to confirm a booking (10% of total stay value)
        type: {
            type: String,
            enum: ["LISTING_FEE", "BOOKING_FEE"],
            required: true,
        },
        // Only set for BOOKING_FEE payments.
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
        },
        // Only set for LISTING_FEE payments.
        propertyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            default: null,
        },
        // Whoever is actually paying — the owner for LISTING_FEE, the tenant
        // for BOOKING_FEE.
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        // No default anymore — amount now depends on `type` and, for
        // BOOKING_FEE, on the booking duration. It must always be computed
        // explicitly by the controller (via calculateBookingFeeEGP for
        // BOOKING_FEE, or the fixed 100 for LISTING_FEE) and passed in.
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "EGP",
        },
        provider: {
            type: String,
            default: "paymob",
        },
        merchantOrderId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        paymobOrderId: {
            type: String,
            default: null,
            trim: true,
        },
        paymobTransactionId: {
            type: String,
            default: null,
            trim: true,
        },
        status: {
            type: String,
            enum: ["pending", "success", "failed", "refunded"],
            default: "pending",
        },
        webhookPayload: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        refundedAt: {
            type: Date,
            default: null,
        },
        refundedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        refundReason: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    },
);

// Enforce that the right parent reference is present for each payment type
// — a BOOKING_FEE payment with no bookingId (or vice versa) is invalid data.
paymentSchema.pre("save", function () {
    if (this.type === "LISTING_FEE" && !this.propertyId) {
        throw new Error("مطلوب معرف العقار لإتمام عملية الدفع.");
    }
    if (this.type === "BOOKING_FEE" && !this.bookingId) {
        throw new Error("مطلوب معرف الحجز لإتمام عملية الدفع.");
    }
});

paymentSchema.index({ bookingId: 1 });
paymentSchema.index({ propertyId: 1 });
paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ paymobOrderId: 1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;