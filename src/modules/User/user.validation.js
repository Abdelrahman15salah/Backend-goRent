export const validateCreateUser = (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "يرجى إدخال جميع البيانات المطلوبة (الاسم، البريد، كلمة المرور)." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "صيغة البريد الإلكتروني غير صحيحة." });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل." });
  }

  next();
};

export const validateUpdateUser = (req, res, next) => {
  const { name, phone, role } = req.body;
  const hasBodyUpdate =
    name !== undefined || phone !== undefined || role !== undefined;
  const hasFileUpdate = req.files && req.files.length > 0;

  if (!hasBodyUpdate && !hasFileUpdate) {
    return res.status(400).json({ message: "لم تقم بإجراء أي تغييرات لتحديثها." });
  }

  const allowedRoles = ["tenant", "owner", "admin", "superadmin"];
  if (role !== undefined && !allowedRoles.includes(role)) {
    return res.status(400).json({ message: "صلاحية المستخدم غير صالحة." });
  }

  next();
};
