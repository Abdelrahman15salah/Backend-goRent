import User from "../../DB/Models/user.model.js";
import JWT from "jsonwebtoken";
import AppError from "../../utils/AppError.js";

const login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError("Email and password are required", 400));
  }

  const user = await User.findOne({ email });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    return next(new AppError("Invalid credentials", 400));
  }

  const token = JWT.sign(
    { id: user._id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    },
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  res.status(200).json({ message: "Login successful", user, token });
};

const register = async (req, res, next) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return next(new AppError("Name, email and password are required", 400));
  }

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    return next(new AppError("User already exists", 400));
  }

  const user = new User({ name, email, password, role });
  await user.save();

  res.status(201).json({ message: "User registered successfully", user });
};

export { login, register };
