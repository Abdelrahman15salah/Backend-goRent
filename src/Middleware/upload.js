import multer from 'multer'
// نظبط الاستوردج في الميموري مش لوكال
const storage = multer.memoryStorage()
// واضحه مش محتاجه كومنت
const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 }
})
//الميديل وير بتاع السنجل ابلود زيكم يا شوية سناجل
const uploadSingle = upload.single('image')
// الميديل وير بتاع الملتيبل ابلود
const uploadArray = upload.array('images', 10)
// دي اكسبورت عشان لو مش عارفين
export { uploadSingle, uploadArray };