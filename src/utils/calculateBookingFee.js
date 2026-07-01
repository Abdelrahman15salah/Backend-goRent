// const NIGHTS_PER_MONTH = 30;

// export const LISTING_FEE_EGP = 100;


// const calculateTotalStayValue = (nights, { pricePerDay, pricePerMonth }) => {
//     const dailyRate = pricePerDay ?? pricePerMonth / NIGHTS_PER_MONTH

//     if (nights < NIGHTS_PER_MONTH) {
//         return nights * dailyRate
//     }

//     const fullMonths = Math.floor(nights / NIGHTS_PER_MONTH)
//     const remainingDays = nights % NIGHTS_PER_MONTH

//     return fullMonths * pricePerMonth + remainingDays * dailyRate
// }

// export const calculateBookingFeeEGP = (startDate, endDate, property) => {
//     const start = new Date(startDate)
//     const end = new Date(endDate)
//     const oneDayMs = 24 * 60 * 60 * 1000

//     const nights = Math.round((end - start) / oneDayMs)
//     if (nights <= 0) {
//         throw new Error("endDate must be after startDate")
//     }

//     const totalStayValue = calculateTotalStayValue(nights, property)
//     const fee = totalStayValue * 0.10

//     return Math.round(fee * 100) / 100
// }




const NIGHTS_PER_MONTH = 30;

export const LISTING_FEE_EGP = 100;


const calculateTotalStayValue = (nights, { pricePerDay, pricePerMonth }) => {
    // حماية من القيم الفارغة أو الـ undefined
    const safePricePerMonth = pricePerMonth || 0;
    const dailyRate = pricePerDay ?? (safePricePerMonth / NIGHTS_PER_MONTH);

    if (nights < NIGHTS_PER_MONTH) {
        return nights * dailyRate;
    }

    const fullMonths = Math.floor(nights / NIGHTS_PER_MONTH);
    const remainingDays = nights % NIGHTS_PER_MONTH;

    return fullMonths * safePricePerMonth + remainingDays * dailyRate;
}

export const calculateBookingFeeEGP = (startDate, endDate, property) => {
    // 1. التأكد من وجود بيانات الأسعار
    if (!property || (!property.pricePerMonth && !property.pricePerDay)) {
        throw new Error("بيانات أسعار العقار مفقودة");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const oneDayMs = 24 * 60 * 60 * 1000;

    const nights = Math.round((end - start) / oneDayMs);

    if (nights <= 0) {
        throw new Error("endDate must be after startDate");
    }

    const totalStayValue = calculateTotalStayValue(nights, property);
    const fee = totalStayValue * 0.10;
    const finalAmount = totalStayValue + fee;

    const finalFee = Math.round(finalAmount * 100) / 100;

    // 2. Paymob بترفض أي مبلغ أقل من أو يساوي صفر
    if (finalFee <= 0) {
        throw new Error("مبلغ الحجز المحسوب يساوي صفر، لا يمكن إتمام الدفع");
    }

    return finalFee;
}