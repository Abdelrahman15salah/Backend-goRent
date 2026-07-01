export const validateCreateBooking = (req, res, next) => {
    const { propertyId, startDate, endDate } = req.body


    if (!propertyId) {
        return res.status(400).json({ message: "يرجى تحديد العقار المطلوب." })
    }


    if (!startDate || !endDate) {
        return res.status(400).json({ message: "يرجى تحديد تاريخ البداية وتاريخ النهاية." })
    }


    const start = new Date(startDate)
    const end = new Date(endDate)

    if (isNaN(start) || isNaN(end)) {
        return res.status(400).json({ message: "التواريخ المدخلة غير صحيحة." })
    }


    if (start < new Date()) {
        return res.status(400).json({ message: "تاريخ البداية لا يمكن أن يكون في الماضي." })
    }


    if (start >= end) {
        return res.status(400).json({ message: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية." })
    }

    next()
}