import Contact from "../../DB/Models/contact.model.js";
import {
  sendContactConfirmationEmail,
  sendAdminContactNotificationEmail,
} from "../../utils/email.js";

export const submitContact = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return next(
        new Error("يرجى تعبئة جميع حقول التواصل.", {
          cause: 400,
        }),
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new Error("البريد الإلكتروني المدخل غير صالح.", { cause: 400 }));
    }

    if (message.trim().length < 10) {
      return next(
        new Error("الرسالة يجب أن تتكون من 10 أحرف على الأقل.", {
          cause: 400,
        }),
      );
    }

    const contact = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
      userId: req.user?.id || null,
    });

    const emailPromises = [];

    emailPromises.push(
      sendContactConfirmationEmail({ name, email, subject }).catch((err) =>
        console.error(
          "[Contact] Failed to send confirmation email:",
          err.message,
        ),
      ),
    );

    if (process.env.ADMIN_EMAIL) {
      emailPromises.push(
        sendAdminContactNotificationEmail({
          name,
          email,
          subject,
          message,
        }).catch((err) =>
          console.error(
            "[Contact] Failed to send admin notification email:",
            err.message,
          ),
        ),
      );
    }

    Promise.all(emailPromises);

    return res.status(201).json({
      message: "Your message has been received. We'll get back to you shortly!",
      contactId: contact._id,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllContacts = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const { status } = req.query;

    const filter = {};
    if (status && ["UNREAD", "READ", "REPLIED"].includes(status)) {
      filter.status = status;
    }

    const [contacts, total, unreadCount] = await Promise.all([
      Contact.find(filter)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Contact.countDocuments(filter),
      Contact.countDocuments({ status: "UNREAD" }),
    ]);

    return res.status(200).json({
      contacts,
      unreadCount,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateContactStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["UNREAD", "READ", "REPLIED"];
    if (!status || !allowedStatuses.includes(status)) {
      return next(
        new Error("status must be one of: UNREAD, READ, REPLIED", {
          cause: 400,
        }),
      );
    }

    const contact = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );

    if (!contact) {
      return next(new Error("الرسالة غير موجودة.", { cause: 404 }));
    }

    return res.status(200).json({ message: "Status updated", contact });
  } catch (error) {
    next(error);
  }
};

export const deleteContact = async (req, res, next) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findByIdAndDelete(id);

    if (!contact) {
      return next(new Error("الرسالة غير موجودة.", { cause: 404 }));
    }

    return res
      .status(200)
      .json({ message: "Contact message deleted successfully" });
  } catch (error) {
    next(error);
  }
};
