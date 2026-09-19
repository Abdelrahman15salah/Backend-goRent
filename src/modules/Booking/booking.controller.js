import Booking from "../../DB/Models/booking.model.js";
import Notification from "../../DB/Models/notification.model.js";
import Property from "../../DB/Models/property.model.js";
import User from "../../DB/Models/user.model.js";
import Review from "../../DB/Models/review.model.js";
import Payment from "../../DB/Models/payment.model.js";
import { emitToUser } from "../Chat/chat.socket.js";

export const createBooking = async (req, res, next) => {
  try {
    const { propertyId, startDate, endDate } = req.body;
    const tenantId = req.user.id;

    if (!propertyId || !startDate || !endDate) {
      return next(
        new Error("يرجى تحديد العقار وتاريخ البداية والنهاية للحجز.", { cause: 400 }),
      );
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return next(new Error("تاريخ النهاية يجب أن يكون بعد تاريخ البداية.", { cause: 400 }));
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    if (new Date(startDate) < startOfToday) {
      return next(new Error("تاريخ البداية لا يمكن أن يكون في الماضي.", { cause: 400 }));
    }

    const tenant = await User.findById(tenantId);

    if (!tenant) {
      return next(new Error("عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.", { cause: 404 }));
    }

    if (tenant.isbanned) {
      return next(new Error("تم حظر حسابك، يرجى التواصل مع الدعم الفني.", { cause: 403 }));
    }

    const property = await Property.findById(propertyId);

    if (!property) {
      return next(new Error("لم نتمكن من العثور على هذا العقار.", { cause: 404 }));
    }

    if (property.status !== "APPROVED") {
      return next(
        new Error("عذراً، هذا العقار غير متاح للحجز.", { cause: 400 }),
      );
    }

    if (property.ownerId.toString() === tenantId.toString()) {
      return next(new Error("لا يمكنك حجز عقار تملكه بالفعل.", { cause: 400 }));
    }

    const conflict = await Booking.findOne({
      propertyId,
      status: { $nin: ["CANCELLED", "REJECTED"] },
      startDate: { $lt: new Date(endDate) },
      endDate: { $gt: new Date(startDate) },
    });

    if (conflict) {
      return next(
        new Error("عذراً، العقار محجوز بالفعل في هذه التواريخ.", { cause: 400 }),
      );
    }

    const booking = await Booking.create({
      propertyId,
      tenantId,
      startDate,
      endDate,
    });

    const notification = await Notification.create({
      userId: property.ownerId,
      type: "BOOKING_REQUEST",
      refId: booking._id,
    });

    emitToUser(property.ownerId, "notification:new", {
      _id: notification._id,
      title: "New Booking Request",
      message: `A tenant has booked your property.`,
      type: "BOOKING_REQUEST",
      date: notification.createdAt,
      isRead: false
    });

    return res.status(201).json({
      message: "Booking request created successfully",
      booking,
    });
  } catch (error) {
    return next(error);
  }
};

export const acceptBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    const booking = await Booking.findById(id).populate("propertyId", "ownerId");

    if (!booking) {
      return next(new Error("لم نتمكن من العثور على هذا الحجز.", { cause: 404 }));
    }

    if (booking.propertyId.ownerId.toString() !== ownerId.toString()) {
      return next(new Error("ليس لديك الصلاحية لإجراء هذا التعديل.", { cause: 403 }));
    }

    if (booking.status !== "PENDING_OWNER_APPROVAL") {
      return next(
        new Error(`Booking cannot be accepted from status ${booking.status}`, {
          cause: 400,
        }),
      );
    }

    booking.ownerAccepted = true;
    booking.status = "PENDING_PAYMENT";
    await booking.save();

    return res.status(200).json({
      message: "Booking accepted — awaiting tenant payment",
      booking,
    });
  } catch (error) {
    return next(error);
  }
};

export const rejectBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    const booking = await Booking.findById(id).populate("propertyId", "ownerId");

    if (!booking) {
      return next(new Error("لم نتمكن من العثور على هذا الحجز.", { cause: 404 }));
    }

    if (booking.propertyId.ownerId.toString() !== ownerId.toString()) {
      return next(new Error("ليس لديك الصلاحية لإجراء هذا التعديل.", { cause: 403 }));
    }

    if (booking.status !== "PENDING_OWNER_APPROVAL") {
      return next(
        new Error(`Booking cannot be rejected from status ${booking.status}`, {
          cause: 400,
        }),
      );
    }

    booking.status = "REJECTED";
    await booking.save();

    return res.status(200).json({
      message: "Booking rejected",
      booking,
    });
  } catch (error) {
    return next(error);
  }
};

export const cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.id;

    const booking = await Booking.findById(id);

    if (!booking) {
      return next(new Error("لم نتمكن من العثور على هذا الحجز.", { cause: 404 }));
    }

    if (booking.tenantId.toString() !== tenantId.toString()) {
      return next(new Error("ليس لديك الصلاحية لإجراء هذا التعديل.", { cause: 403 }));
    }

    if (booking.status === "CANCELLED") {
      return next(new Error("تم إلغاء هذا الحجز مسبقاً.", { cause: 400 }));
    }

    booking.status = "CANCELLED";
    await booking.save();

    const user = await User.findById(tenantId);

    user.cancellationCount += 1;

    if (user.cancellationCount >= 3) {
      user.isbanned = true;
    }

    await user.save();

    return res.status(200).json({
      message: "Booking cancelled successfully",
      booking,
    });
  } catch (error) {
    return next(error);
  }
};

export const getTenantBookings = async (req, res, next) => {
  try {
    const tenantId = req.user.id;

    const bookings = await Booking.find({ tenantId })
      .populate("propertyId", "title pricePerMonth pricePerDay location")
      .sort({ createdAt: -1 });

    return res.status(200).json({ bookings });
  } catch (error) {
    return next(error);
  }
};

export const getOwnerBookings = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const year = Number(req.query.year);
    const month = Number(req.query.month);

    const properties = await Property.find({ ownerId }).select("_id title");
    const propertyIds = properties.map((property) => property._id);

    if (!propertyIds.length) {
      return res.status(200).json({ bookings: [] });
    }

    const filter = {
      propertyId: { $in: propertyIds },
      status: { $nin: ["CANCELLED", "REJECTED"] },
    };

    if (!Number.isNaN(year) && !Number.isNaN(month)) {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      filter.startDate = { $lte: endOfMonth };
      filter.endDate = { $gte: startOfMonth };
    }

    const bookings = await Booking.find(filter)
      .populate("propertyId", "title")
      .populate("tenantId", "name email")
      .sort({ startDate: 1 });

    return res.status(200).json({ bookings });
  } catch (error) {
    return next(error);
  }
};

export const getPropertyBookings = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const requesterId = req.user.id;

    const property = await Property.findById(propertyId);

    if (!property) {
      return next(new Error("لم نتمكن من العثور على هذا العقار.", { cause: 404 }));
    }

    const isOwner = property.ownerId.toString() === requesterId.toString();
    const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

    if (!isOwner && !isAdmin) {
      return next(new Error("ليس لديك الصلاحية لإجراء هذا التعديل.", { cause: 403 }));
    }

    const bookings = await Booking.find({ propertyId })
      .populate("tenantId", "name email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({ bookings });
  } catch (error) {
    return next(error);
  }
};

export const getOwnerAnalytics = async (req, res, next) => {
  try {
    const ownerId = req.user.id;

    const properties = await Property.find({ ownerId }).select("_id title views");
    const propertyIds = properties.map((p) => p._id);

    if (!propertyIds.length) {
      return res.status(200).json({
        statusBreakdown: { PENDING_OWNER_APPROVAL: 0, PENDING_PAYMENT: 0, RESERVED: 0, REJECTED: 0, CANCELLED: 0 },
        monthlyTrend: [],
        perProperty: [],
        totals: { total: 0, reserved: 0, acceptanceRate: 0, cancellationRate: 0 },
        upcomingBookings: [],
        revenueByProperty: [],
        ratingsOverview: [],
      });
    }

    const allBookings = await Booking.find({ propertyId: { $in: propertyIds } })
      .populate("propertyId", "title")
      .populate("tenantId", "name email")
      .lean();

    // ── Status breakdown ──────────────────────────────────────────────────────
    const statusBreakdown = {
      PENDING_OWNER_APPROVAL: 0,
      PENDING_PAYMENT: 0,
      RESERVED: 0,
      REJECTED: 0,
      CANCELLED: 0,
    };
    for (const b of allBookings) {
      if (statusBreakdown[b.status] !== undefined) statusBreakdown[b.status]++;
    }

    // ── Monthly trend — last 6 months ─────────────────────────────────────────
    const now = new Date();
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = d.toLocaleDateString("ar-EG", { month: "short", year: "2-digit" });

      const monthBookings = allBookings.filter((b) => {
        const c = new Date(b.createdAt);
        return c >= start && c <= end;
      });

      monthlyTrend.push({
        label,
        total: monthBookings.length,
        reserved: monthBookings.filter((b) => b.status === "RESERVED").length,
        cancelled: monthBookings.filter((b) => b.status === "CANCELLED").length,
      });
    }

    // ── Per-property breakdown ────────────────────────────────────────────────
    const propertyMap = {};
    for (const p of properties) {
      propertyMap[p._id.toString()] = {
        title: p.title,
        total: 0,
        reserved: 0,
        rejected: 0,
        cancelled: 0,
        pending: 0,
      };
    }
    for (const b of allBookings) {
      const pid = b.propertyId?._id?.toString() || b.propertyId?.toString();
      if (!pid || !propertyMap[pid]) continue;
      propertyMap[pid].total++;
      if (b.status === "RESERVED") propertyMap[pid].reserved++;
      else if (b.status === "REJECTED") propertyMap[pid].rejected++;
      else if (b.status === "CANCELLED") propertyMap[pid].cancelled++;
      else if (b.status === "PENDING_OWNER_APPROVAL" || b.status === "PENDING_PAYMENT") propertyMap[pid].pending++;
    }
    const perProperty = Object.values(propertyMap).sort((a, b) => b.total - a.total);

    // ── Summary totals ────────────────────────────────────────────────────────
    const total = allBookings.length;
    const reserved = statusBreakdown.RESERVED;
    const rejected = statusBreakdown.REJECTED;
    const cancelled = statusBreakdown.CANCELLED;
    const decidedCount = reserved + rejected;
    const acceptanceRate = decidedCount > 0 ? Math.round((reserved / decidedCount) * 100) : 0;
    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

    // ── Upcoming bookings (next 5 RESERVED) ───────────────────────────────────
    const reservedBookingIds = allBookings
      .filter((b) => b.status === "RESERVED")
      .map((b) => b._id);

    const upcomingBookings = allBookings
      .filter((b) => b.status === "RESERVED" && new Date(b.startDate) >= now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 5)
      .map((b) => ({
        bookingId: b._id,
        propertyTitle: b.propertyId?.title || "—",
        tenantName: b.tenantId?.name || "—",
        tenantEmail: b.tenantId?.email || "—",
        startDate: b.startDate,
        endDate: b.endDate,
      }));

    // ── Revenue by property (from successful BOOKING_FEE payments) ────────────
    const bookingIdToPropertyId = {};
    for (const b of allBookings) {
      const pid = b.propertyId?._id?.toString() || b.propertyId?.toString();
      if (pid) bookingIdToPropertyId[b._id.toString()] = pid;
    }

    const bookingFeePayments = await Payment.find({
      type: "BOOKING_FEE",
      status: "success",
      bookingId: { $in: reservedBookingIds },
    }).lean();

    const revenueMap = {};
    for (const p of properties) {
      revenueMap[p._id.toString()] = { title: p.title, revenue: 0, bookingCount: 0 };
    }
    for (const payment of bookingFeePayments) {
      const pid = bookingIdToPropertyId[payment.bookingId?.toString()];
      if (pid && revenueMap[pid]) {
        revenueMap[pid].revenue += payment.amount;
        revenueMap[pid].bookingCount += 1;
      }
    }
    const revenueByProperty = Object.values(revenueMap)
      .sort((a, b) => b.revenue - a.revenue)
      .filter((item) => item.bookingCount > 0 || item.revenue > 0);

    // ── Ratings overview (avg rating per property from reviews) ───────────────
    const ratingsRaw = await Review.aggregate([
      { $match: { propertyId: { $in: propertyIds }, targetType: "PROPERTY" } },
      {
        $group: {
          _id: "$propertyId",
          avgRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    const ratingMap = {};
    for (const r of ratingsRaw) {
      ratingMap[r._id.toString()] = {
        avgRating: Math.round(r.avgRating * 10) / 10,
        reviewCount: r.reviewCount,
      };
    }
    const ratingsOverview = properties.map((p) => ({
      propertyId: p._id,
      title: p.title,
      views: p.views || 0,
      avgRating: ratingMap[p._id.toString()]?.avgRating ?? null,
      reviewCount: ratingMap[p._id.toString()]?.reviewCount ?? 0,
    })).sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));

    return res.status(200).json({
      statusBreakdown,
      monthlyTrend,
      perProperty,
      totals: { total, reserved, acceptanceRate, cancellationRate },
      upcomingBookings,
      revenueByProperty,
      ratingsOverview,
    });
  } catch (error) {
    return next(error);
  }
};

