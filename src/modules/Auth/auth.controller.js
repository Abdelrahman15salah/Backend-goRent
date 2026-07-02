import User from "../../DB/Models/user.model.js";
import JWT from "jsonwebtoken";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import OTP from "../../DB/Models/OTP.model.js";
import { sendEmail } from "../../utils/email.js";
import crypto from "crypto";

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000,
  path: "/",
};
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(new Error("يرجى إدخال البريد الإلكتروني وكلمة المرور للمتابعة.", { cause: 400 }));
    }
    const user = await User.findOne({ email });
    if (!user) {
      return next(new Error("عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.", { cause: 404 }));
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return next(new Error("بيانات الدخول غير صحيحة، يرجى المحاولة مرة أخرى.", { cause: 400 }));
    }
    const token = JWT.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );
    res.cookie("token", token, cookieOptions);

    res.status(200).json({ message: "Login successful", user });
  } catch (error) {
    return next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return next(
        new Error("يرجى إدخال جميع البيانات المطلوبة (الاسم، البريد، كلمة المرور).", { cause: 400 }),
      );
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new Error("هذا البريد الإلكتروني مسجل مسبقاً، يمكنك تسجيل الدخول مباشرة.", { cause: 400 }));
    }

    let profileImage = "";
    const uploadedFile = req.files?.[0];

    if (uploadedFile) {
      try {
        profileImage = await uploadToCloudinary(uploadedFile, "gorent/users");
      } catch (err) {
        console.error("Failed to upload profile image:", err);
        return res.status(500).json({
          message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى لاحقاً.",
          error: err.message || "Cloudinary upload failed",
          http_code: err.http_code || null,
        });
      }
    }

    const user = new User({ name, email, password, role, profileImage });
    await user.save();
    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res) => {
  try {
    res.clearCookie("token", cookieOptions);
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    // return res.status(500).json({
    //   message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى لاحقاً.",
    //   error: error.message,
    // });
    return next(error);
  }
};
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      // return res.status(404).json({
      //   message: "عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.",
      // });
      return next(new Error("عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.", { cause: 404 }));
    }

return res.status(200).json({ message: "Login successful", user });
  } catch (error) {
    // return res.status(500).json({
    //   message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى لاحقاً.",
    //   error: error.message,
    // });
    return next(error);
  }
};
const getSocketToken = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return next(new Error("عذراً، يجب تسجيل الدخول للقيام بهذا الإجراء.", { cause: 401 }));
    }

    return res.status(200).json({ token });
  } catch (error) {
    return next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return next(new Error("يرجى إدخال البريد الإلكتروني.", { cause: 400 }));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(new Error("عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.", { cause: 404 }));
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await OTP.deleteMany({ email }); // Remove existing OTPs for the user
    const newOtp = new OTP({ email, otp });
    await newOtp.save();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2563eb;">GoRent — Password Reset Request</h2>
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>You requested a password reset. Please use the verification code below to proceed.</p>
        <h1 style="background: #f3f4f6; padding: 15px; border-radius: 5px; text-align: center; letter-spacing: 5px; color: #1f2937;">${otp}</h1>
        <p style="color: #6b7280; font-size: 14px;">This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af;">This is an automated message from GoRent.</p>
      </div>
    `;

    await sendEmail({
      to: email,
      subject: "Password Reset Verification Code — GoRent",
      html,
    });

    return res.status(200).json({ message: "Verification code sent to email" });
  } catch (error) {
    return next(error);
  }
};

const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return next(new Error("يرجى إدخال البريد الإلكتروني ورمز التحقق.", { cause: 400 }));
    }

    const validOtp = await OTP.findOne({ email, otp });
    if (!validOtp) {
      return next(new Error("رمز التحقق غير صحيح أو منتهي الصلاحية، يرجى طلب رمز جديد.", { cause: 400 }));
    }

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return next(new Error("يرجى تعبئة جميع الحقول المطلوبة لتغيير كلمة المرور.", { cause: 400 }));
    }

    const validOtp = await OTP.findOne({ email, otp });
    if (!validOtp) {
      return next(new Error("رمز التحقق غير صحيح أو منتهي الصلاحية، يرجى طلب رمز جديد.", { cause: 400 }));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(new Error("عذراً، لم نتمكن من العثور على حسابك. يرجى التأكد من البيانات المدخلة.", { cause: 404 }));
    }

    user.password = newPassword;
    await user.save();

    await OTP.deleteMany({ email });

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    return next(error);
  }
};

export { login, register, logout, getCurrentUser, getSocketToken, forgotPassword, verifyOTP, resetPassword };
