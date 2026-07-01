import mongoose from "mongoose";
import Payment from "../../DB/Models/payment.model.js";
import Booking from "../../DB/Models/booking.model.js";
import Property from "../../DB/Models/property.model.js";
import User from "../../DB/Models/user.model.js";
import { initiatePayment } from "./paymob.service.js";
import { calculateBookingFeeEGP, LISTING_FEE_EGP } from "../../utils/calculateBookingFee.js";


const buildBillingData = (user) => {
    const nameParts = (user?.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "N/A";
    const lastName = nameParts.slice(1).join(" ") || firstName;

    return {
        first_name: firstName,
        last_name: lastName,
        email: user?.email,
        phone_number: user?.phone || "01000000000",
        country: "EG",
        city: "Cairo",
        state: "NA",
        street: "NA",
        building: "NA",
        floor: "NA",
        apartment: "NA",
    };
};


export const initiateListingFeePayment = async (req, res, next) => {
    try {
        const { propertyId } = req.params;
        const ownerId = req.user.id;

        const property = await Property.findById(propertyId);
        if (!property) {
            return next(new Error("Property not found", { cause: 404 }));
        }

        if (property.ownerId.toString() !== ownerId.toString()) {
            return next(new Error("Not authorized", { cause: 403 }));
        }

        // Don't let an owner pay twice for the same property.
        const existingSuccess = await Payment.findOne({
            propertyId,
            type: "LISTING_FEE",
            status: "success",
        });
        if (existingSuccess) {
            return next(new Error("Listing fee already paid for this property", { cause: 400 }));
        }

        const owner = await User.findById(ownerId);

        // Pre-generate the id so we can use it as Paymob's merchant_order_id
        // before the Payment document actually exists.
        const paymentId = new mongoose.Types.ObjectId();

        const payment = await Payment.create({
            _id: paymentId,
            type: "LISTING_FEE",
            propertyId,
            userId: ownerId,
            amount: LISTING_FEE_EGP,
            merchantOrderId: paymentId.toString(),
            status: "pending",
        });

        try {
            const { paymentUrl, paymentKey, providerOrderId } = await initiatePayment({
                amountEGP: LISTING_FEE_EGP,
                merchantOrderId: payment.merchantOrderId,
                billingData: buildBillingData(owner),
            });

            payment.paymobOrderId = providerOrderId;
            await payment.save();

            return res.status(200).json({
                message: "Listing fee payment initiated",
                paymentUrl,
                paymentKey,
                paymentId: payment._id,
            });
        } catch (paymobError) {
            // The Payment record stays as evidence of the failed attempt instead
            // of being silently lost.
            payment.status = "failed";
            await payment.save();
            return next(paymobError);
        }
    } catch (error) {
        return next(error);
    }
};


export const initiateBookingFeePayment = async (req, res, next) => {
    try {
        const { bookingId } = req.params;
        const tenantId = req.user.id;

        const booking = await Booking.findById(bookingId).populate("propertyId");
        if (!booking) {
            return next(new Error("Booking not found", { cause: 404 }));
        }

        if (booking.tenantId.toString() !== tenantId.toString()) {
            return next(new Error("Not authorized", { cause: 403 }));
        }

        if (booking.status !== "PENDING_PAYMENT") {
            return next(
                new Error(`Booking is not awaiting payment (current status: ${booking.status})`, {
                    cause: 400,
                }),
            );
        }

        const existingSuccess = await Payment.findOne({
            bookingId,
            type: "BOOKING_FEE",
            status: "success",
        });
        if (existingSuccess) {
            return next(new Error("This booking has already been paid for", { cause: 400 }));
        }

        const tenant = await User.findById(tenantId);
        const property = booking.propertyId; // populated above

        const feeEGP = calculateBookingFeeEGP(booking.startDate, booking.endDate, property);

        const paymentId = new mongoose.Types.ObjectId();

        const payment = await Payment.create({
            _id: paymentId,
            type: "BOOKING_FEE",
            bookingId,
            userId: tenantId,
            amount: feeEGP,
            merchantOrderId: paymentId.toString(),
            status: "pending",
        });

        try {
            const { paymentUrl, paymentKey, providerOrderId } = await initiatePayment({
                amountEGP: feeEGP,
                merchantOrderId: payment.merchantOrderId,
                billingData: buildBillingData(tenant),
            });

            payment.paymobOrderId = providerOrderId;
            await payment.save();

            return res.status(200).json({
                message: "Booking fee payment initiated",
                paymentUrl,
                paymentKey,
                paymentId: payment._id,
                amount: feeEGP,
            });
        } catch (paymobError) {
            payment.status = "failed";
            await payment.save();
            return next(paymobError);
        }
    } catch (error) {
        return next(error);
    }
};

export const handleWebhook = async (req, res, next) => {
    try {
        const { obj } = req.body;

        // Ignore non-TRANSACTION webhooks (e.g. TOKEN)
        if (!obj || req.body.type !== "TRANSACTION") {
            return res.status(200).json({ message: "Ignored" });
        }

        const { success, id: transactionId } = obj;
        const merchant_order_id = obj.order?.merchant_order_id;

        if (!merchant_order_id) {
            return res.status(200).json({ message: "No merchant_order_id" });
        }

        // HMAC verification
        const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
        const receivedHmac = req.query.hmac;

        if (hmacSecret && receivedHmac) {
            const crypto = await import("crypto");
            const data = [
                obj.amount_cents,
                obj.created_at,
                obj.currency,
                obj.error_occured,
                obj.has_parent_transaction,
                obj.id,
                obj.integration_id,
                obj.is_3d_secure,
                obj.is_auth,
                obj.is_capture,
                obj.is_refunded,
                obj.is_standalone_payment,
                obj.is_voided,
                obj.order?.id,
                obj.owner,
                obj.pending,
                obj.source_data?.pan,
                obj.source_data?.sub_type,
                obj.source_data?.type,
                obj.success,
            ].join("");

            const expectedHmac = crypto.default
                .createHmac("sha512", hmacSecret)
                .update(data)
                .digest("hex");

            if (expectedHmac !== receivedHmac) {
                return res.status(401).json({ message: "Invalid HMAC" });
            }
        } else if (process.env.NODE_ENV === "production") {
            return res.status(401).json({ message: "Missing HMAC" });
        }

        const payment = await Payment.findOne({ merchantOrderId: merchant_order_id });
        if (!payment) return res.status(200).json({ message: "Payment not found" });

        // Idempotency check
        if (payment.status === "success") {
            return res.status(200).json({ message: "Payment already processed" });
        }

        // Amount and Currency Validation
        if (success) {
            if (obj.amount_cents !== payment.amount * 100 || obj.currency !== "EGP") {
                payment.status = "failed";
                payment.webhookPayload = { ...obj, error_reason: "Amount or Currency Mismatch" };
                await payment.save();
                return res.status(400).json({ message: "Amount or Currency Mismatch" });
            }
        }

        payment.paymobTransactionId = transactionId?.toString();
        payment.webhookPayload = obj;
        payment.status = success ? "success" : "failed";
        await payment.save();

        if (success) {
            if (payment.type === "BOOKING_FEE" && payment.bookingId) {
                const booking = await Booking.findById(payment.bookingId);
                if (booking && booking.status === "PENDING_PAYMENT") {
                    booking.status = "RESERVED";
                    booking.paymentId = payment._id;
                    await booking.save();
                }
            }

            if (payment.type === "LISTING_FEE" && payment.propertyId) {
                await Property.findByIdAndUpdate(payment.propertyId, {
                    listingPaid: true,
                });
            }
        }

        return res.status(200).json({ message: "Webhook processed" });
    } catch (error) {
        return next(error);
    }
};