export const validateCreateThread = (req, res, next) => {
  const { propertyId } = req.body;

  if (!propertyId) {
    return res.status(400).json({ message: "يرجى تحديد العقار المطلوب." });
  }

  next();
};

export const validateSendMessage = (req, res, next) => {
  const text = req.body.text?.trim();

  if (!text && !req.file) {
    return res
      .status(400)
      .json({ message: "يرجى كتابة رسالة أو إرفاق ملف للتمكن من الإرسال." });
  }

  if (text && text.length > 2000) {
    return res
      .status(400)
      .json({ message: "يجب ألا تتجاوز الرسالة 2000 حرف." });
  }

  req.body.text = text || "";
  next();
};
