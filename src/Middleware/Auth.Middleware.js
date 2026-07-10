import jwt from "jsonwebtoken";

export const verifyRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      console.log("error from middleware");

      return res
        .status(401)
        .json({ message: "عذراً، يجب تسجيل الدخول أولاً للوصول إلى هذه الصفحة." });
    }

    if (
      requiredRole.includes(req.user.role) ||
      req.user.role === "superadmin"
    ) {
      return next();
    } else {
      return res
        .status(403)
        .json({ message: `user role ${req.user.role} is not authorized` });
    }
  };
};

export const verifyAuth = (req, res, next) => {
  const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "عذراً، يجب تسجيل الدخول للقيام بهذا الإجراء.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      message: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى.",
    });
  }
};

export const optionalAuth = (req, res, next) => {
  const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
    // Token is invalid, but we don't block the request
  }

  next();
};
