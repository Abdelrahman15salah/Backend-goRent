export const validateCreateDispute = (req, res, next) => {
    const {propertyId, subject, description} = req.body;

    if(!propertyId){return next(new Error("مطلوب معرف العقار."))}
    if(!subject || !subject.trim()){return next(new Error("عنوان النزاع/التقرير مطلوب."))}
    if(subject.trim().length > 150){return next(new Error("عنوان التقرير طويل جداً، يجب ألا يتجاوز 150 حرف."))}
    if(!description || !description.trim()){return next(new Error("وصف المشكلة مطلوب."))}

    next()
};