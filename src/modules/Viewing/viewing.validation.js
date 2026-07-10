export const validateCreateViewing = (req, res, next) => {
    const { propertyId, scheduledAt } = req.body

    if (!propertyId) {
        return res.status(400).json({ message: "يرجى تحديد العقار المطلوب." })
    }

    if (!scheduledAt) {
        return res.status(400).json({ message: "يرجى تحديد موعد المعاينة." })
    }

    const date = new Date(scheduledAt);

    if (isNaN(date)) {
        return res.status(400).json({ message: "التاريخ المدخل غير صحيح." })
    }

    if (date < new Date()) {
        return res.status(400).json({ message: "موعد المعاينة لا يمكن أن يكون في الماضي." })
    }

    next()
}