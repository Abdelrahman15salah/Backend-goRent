import mongoose from "mongoose";
import User from "../../DB/Models/user.model.js";
import { logAdminAction } from "../Admin/adminLog.controller.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";

export const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.role) {
      if (req.query.role === "admin") {
        filter.role = { $in: ["admin", "superadmin"] };
      } else {
        filter.role = req.query.role;
      }
    }

    if (req.query.isbanned !== undefined) {
      filter.isbanned = req.query.isbanned === "true";
    }

    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const [users, totalItems] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "المعرف الخاص بالمستخدم غير صالح." });
      return next(new Error("المعرف الخاص بالمستخدم غير صالح.", { cause: 400 }));
    }
    const isSelf = id.toString() === req.user.id.toString();
    const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

    if (!isSelf && !isAdmin) {
      // return res.status(403).json({ message: "ليس لديك الصلاحية لإجراء هذا التعديل." });
      return next(new Error("ليس لديك الصلاحية لإجراء هذا التعديل.", { cause: 403 }));
    }

    const user = await User.findById(id).select("-password");

    if (!user) {
      // return res.status(404).json({ message: "عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة." });
      return next(new Error("عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.", { cause: 404 }));
    }

    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // return res.status(400).json({ message: "هذا البريد الإلكتروني مسجل مسبقاً، يمكنك تسجيل الدخول مباشرة." });
      return next(new Error("هذا البريد الإلكتروني مسجل مسبقاً، يمكنك تسجيل الدخول مباشرة.", { cause: 400 }));
    }

    let profileImage = "";
    const uploadedFile = req.files?.[0];

    if (uploadedFile) {
      try {
        profileImage = await uploadToCloudinary(uploadedFile, "gorent/users");
      } catch (err) {
        // console.log("Failed to upload profile image:", err);
        return res.status(500).json({
          message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى لاحقاً.",
          error: err.message || "Cloudinary upload failed",
          http_code: err.http_code || null,
        });
      }
    }

    const user = new User({ name, email, password, role, phone, profileImage });
    await user.save();

    return res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى لاحقاً.", error: error.message });
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "المعرف الخاص بالمستخدم غير صالح." });
      return next(new Error("المعرف الخاص بالمستخدم غير صالح.", { cause: 400 }));
    }
    const isSelf = id.toString() === req.user.id.toString();
    const isSuperAdmin = req.user.role === "superadmin";
    const isAdmin = req.user.role === "admin";

    if (!isSelf && !isAdmin && !isSuperAdmin) {
      // return res.status(403).json({ message: "ليس لديك الصلاحية لإجراء هذا التعديل." });
      return next(new Error("ليس لديك الصلاحية لإجراء هذا التعديل.", { cause: 403 }));
    }

    const user = await User.findById(id);

    if (!user) {
      // return res.status(404).json({ message: "عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة." });
      return next(new Error("عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.", { cause: 404 }));
    }

    const updatableFields = ["name", "phone"];

    if (isSuperAdmin) {
      updatableFields.push("role");
    }

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    const uploadedFile = req.files?.[0];
    if (uploadedFile) {
      try {
        user.profileImage = await uploadToCloudinary(
          uploadedFile,
          "gorent/users",
        );
      } catch (err) {
        console.error("Failed to upload profile image:", err);
        return res.status(500).json({
          message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى لاحقاً.",
          error: err.message || "Cloudinary upload failed",
          http_code: err.http_code || null,
        });
      }
    }

    await user.save();

    return res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    next(error);
  }
};


export const changePassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return next(new Error("يرجى تعبئة جميع الحقول.", { cause: 400 }));
    }

    if (newPassword.length < 8) {
      return next(new Error("يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.", { cause: 400 }));
    }

    if (newPassword === currentPassword) {
      return next(new Error("كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية.", { cause: 400 }));
    }

    if (newPassword !== confirmPassword) {
      return next(new Error("كلمة المرور الجديدة وتأكيدها غير متطابقين.", { cause: 400 }));
    }

    // Authorization
    const isSelf = id.toString() === req.user.id.toString();
    if (!isSelf) {
      return next(new Error("ليس لديك الصلاحية لإجراء هذا التعديل.", { cause: 403 }));
    }

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return next(new Error("عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.", { cause: 404 }));
    }

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return next(new Error("كلمة المرور الحالية غير صحيحة.", { cause: 400 }));
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};


export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "Invalid user id" });
      return next(new Error("Invalid user id", { cause: 400 }));
    }

    const user = await User.findById(id);

    if (!user) {
      // return res.status(404).json({ message: "User not found" });
      return next(new Error("User not found", { cause: 404 }));
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({
      message: "User deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const banUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new Error("Invalid user id", { cause: 400 }));
    }

    const user = await User.findById(id);

    if (!user) {
      return next(new Error("User not found", { cause: 404 }));
    }

    user.isbanned = true;
    await user.save();

    await logAdminAction({
      adminId: req.user.id,
      action: "BAN_USER",
      targetId: id,
      targetType: "USER",
    });

    return res.status(200).json({
      message: "User banned successfully",
      user,
    });
  } catch (error) {
    // return res.status(500).json({
    //   message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى لاحقاً.",
    //   error: error.message,
    // });
    return next(error);
  }
};

export const unbanUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // return res.status(400).json({ message: "Invalid user id" });
      return next(new Error("Invalid user id", { cause: 400 }));
    }

    const user = await User.findById(id);

    if (!user) {
      // return res.status(404).json({ message: "User not found" });
      return next(new Error("User not found", { cause: 404 }));
    }

    user.isbanned = false;
    await user.save();

    await logAdminAction({
      adminId: req.user.id,
      action: "UNBAN_USER",
      targetId: id,
      targetType: "USER",
    });

    return res.status(200).json({
      message: "User unbanned successfully",
      user,
    });
  } catch (error) {
    return next(error);
  }
};

export const getAdmins = async (req, res, next) => {
  try {
    const admins = await User.find({ role: "admin" }).select("-password").sort({ createdAt: -1 });
    return res.status(200).json({ admins });
  } catch (error) {
    return next(error);
  }
};

export const promoteToAdmin = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return next(new Error("Email is required", { cause: 400 }));
    }
    const user = await User.findOne({ email });
    if (!user) {
      return next(new Error("User not found", { cause: 404 }));
    }
    if (user.role === "admin" || user.role === "superadmin") {
      return next(new Error("User is already an admin or superadmin", { cause: 400 }));
    }
    user.role = "admin";
    await user.save();
    return res.status(200).json({ message: "User promoted to admin successfully", user });
  } catch (error) {
    return next(error);
  }
};

export const demoteToTenant = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new Error("Invalid user id", { cause: 400 }));
    }
    const user = await User.findById(id);
    if (!user) {
      return next(new Error("User not found", { cause: 404 }));
    }
    if (user.role !== "admin") {
      return next(new Error("User is not an admin", { cause: 400 }));
    }
    user.role = "tenant";
    await user.save();
    return res.status(200).json({ message: "Admin demoted to tenant successfully", user });
  } catch (error) {
    return next(error);
  }
};
