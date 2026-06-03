import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import bcrypt from "bcryptjs";

const AuthService = {
  register: async (userData) => {
    const { name, email, password, role } = userData;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("User already exists");
    }
    const user = new User({ name, email, password, role });
    await user.save();
    return user;
  },
  login: async (email, password) => {


    const JWT_SECRET = process.env.JWT_SECRET;

    const user = await User.findOne({ email });
    if (!user) {
      throw new Error("Invalid email or password");
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      throw new Error("Invalid email or password");
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "1d",
    });

    
    return {
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },
};

export default AuthService;